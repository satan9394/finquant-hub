/* ============================================================
 * Chat — 单 Agent 对话页
 * ============================================================ */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Layout, List, Input, Button, Select, Typography, Popconfirm, message, Empty, Spin,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SendOutlined, SwapOutlined,
} from '@ant-design/icons';
import apiClient from '../services/api';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';
import ChatMessageBubble from '../components/ChatMessageBubble';
import type { Session, Message, AgentPreset } from '../types';
import { useSearchParams } from 'react-router-dom';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

export default function Chat() {
  const [searchParams] = useSearchParams();
  const starterPrompt = searchParams.get('prompt')?.trim();
  const {
    sessions, currentSessionId, messages, streamingContent, isStreaming,
    setSessions, addSession, removeSession, setCurrentSessionId,
    setMessages, addMessage, setStreamingContent, appendStreamingContent, setIsStreaming,
  } = useChatStore();
  const currentModelId = useModelStore((s) => s.currentModelId);

  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | undefined>();
  const [inputValue, setInputValue] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 加载会话列表 + 角色列表
  useEffect(() => {
    apiClient.get('/chat/sessions').then((res) => setSessions(res.data.items)).catch(() => {});
    apiClient.get('/agents').then((res) => {
      setAgents(res.data.items);
      if (res.data.items.length > 0) setSelectedRole(res.data.items[0].role_key);
    }).catch(() => {});
  }, [setSessions]);

  useEffect(() => {
    if (starterPrompt) setInputValue(starterPrompt);
  }, [starterPrompt]);

  // 加载当前会话消息
  useEffect(() => {
    if (!currentSessionId) return;
    setLoadingMessages(true);
    apiClient.get(`/chat/sessions/${currentSessionId}/messages`)
      .then((res) => setMessages(currentSessionId, res.data.items))
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, [currentSessionId, setMessages]);

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, currentSessionId]);

  // 创建新会话
  const handleNewSession = async () => {
    try {
      const res = await apiClient.post('/chat/sessions', {
        role_preset: selectedRole,
        model_id: currentModelId,
      });
      addSession(res.data);
      setCurrentSessionId(res.data.id);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 删除会话
  const handleDeleteSession = async (id: number) => {
    try {
      await apiClient.delete(`/chat/sessions/${id}`);
      removeSession(id);
      if (currentSessionId === id) setCurrentSessionId(null);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 切换角色
  const handleChangeRole = async (roleKey: string) => {
    setSelectedRole(roleKey);
    if (!currentSessionId) return;
    try {
      await apiClient.put(`/chat/sessions/${currentSessionId}`, { role_preset: roleKey });
      message.success('角色已切换');
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // SSE 流式发送消息
  const handleSendMessage = async () => {
    const content = inputValue.trim();
    if (!content || !currentSessionId) return;

    setInputValue('');
    setIsStreaming(true);
    setStreamingContent('');

    // 添加用户消息到本地
    const tempUserMsg: Message = {
      id: Date.now(),
      conversation_id: currentSessionId,
      role: 'user',
      agent_name: null,
      content,
      round_number: 0,
      token_count: null,
      created_at: new Date().toISOString(),
    };
    addMessage(currentSessionId, tempUserMsg);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`/api/chat/sessions/${currentSessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: '请求失败' }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      const processLine = (line: string) => {
        if (line.startsWith('event: ')) {
          // event lines are followed by data lines
          return;
        }
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            if (data.delta !== undefined) {
              accumulatedContent += data.delta;
              setStreamingContent(accumulatedContent);
            }
            if (data.message_id !== undefined) {
              // done event
              const assistantMsg: Message = {
                id: data.message_id,
                conversation_id: currentSessionId,
                role: 'assistant',
                agent_name: null,
                content: accumulatedContent,
                round_number: 0,
                token_count: data.token_count ?? null,
                created_at: new Date().toISOString(),
              };
              addMessage(currentSessionId, assistantMsg);
              setStreamingContent('');
              setIsStreaming(false);
            }
          } catch { /* ignore parse errors for partial data */ }
        }
        if (line.startsWith('event: error')) {
          // next line is data
          return;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          processLine(line.trim());
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        processLine(buffer.trim());
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || '发送失败');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  // 停止生成
  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const currentMessages = currentSessionId ? (messages[currentSessionId] || []) : [];

  return (
    <Layout style={{ height: 'calc(100vh - 56px)', background: '#fff' }}>
      {/* 左栏：会话列表 */}
      <Sider width={260} style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={handleNewSession}>
            新建会话
          </Button>
        </div>
        <List
          size="small"
          dataSource={sessions}
          renderItem={(session) => (
            <List.Item
              style={{
                cursor: 'pointer',
                background: session.id === currentSessionId ? '#e6f7ff' : undefined,
                padding: '8px 16px',
              }}
              onClick={() => setCurrentSessionId(session.id)}
              actions={[
                <Popconfirm title="确认删除？" onConfirm={() => handleDeleteSession(session.id)}>
                  <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
                </Popconfirm>
              ]}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session.title || `会话 #${session.id}`}
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  {session.last_message?.slice(0, 30) || `${session.message_count || 0} 条消息`}
                </div>
              </div>
            </List.Item>
          )}
          locale={{ emptyText: <Empty description="暂无会话" /> }}
        />
      </Sider>

      {/* 右栏：消息流 */}
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        {currentSessionId && (
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <Select
              value={selectedRole}
              onChange={handleChangeRole}
              style={{ width: 160 }}
              placeholder="选择角色"
              options={agents.map((a) => ({ label: a.name, value: a.role_key }))}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SwapOutlined /> 切换角色后下条回复生效
            </Text>
          </div>
        )}

        {/* 消息区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
          {!currentSessionId ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>
              <Title level={4} type="secondary">请选择或创建一个会话</Title>
            </div>
          ) : loadingMessages ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
          ) : (
            <>
              {currentMessages.map((msg) => (
                <ChatMessageBubble key={msg.id} message={msg} />
              ))}
              {isStreaming && (
                <ChatMessageBubble
                  message={{
                    id: 0,
                    conversation_id: currentSessionId,
                    role: 'assistant',
                    agent_name: null,
                    content: '',
                    round_number: 0,
                    token_count: null,
                    created_at: new Date().toISOString(),
                  }}
                  isStreaming
                  streamingContent={streamingContent}
                />
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 底部输入 */}
        {currentSessionId && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                }}
                placeholder="输入消息... (Shift+Enter 换行)"
                rows={2}
                disabled={isStreaming}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {isStreaming ? (
                  <Button danger onClick={handleStop}>停止</Button>
                ) : (
                  <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage}>
                    发送
                  </Button>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 8 }}>
              此内容由 AI 生成，不构成投资建议
            </div>
          </div>
        )}
      </Content>
    </Layout>
  );
}
