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
import { readSSE } from '../services/sse';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';
import ChatMessageBubble from '../components/ChatMessageBubble';
import { parseBacktestRequest } from '../features/backtest/request';
import type { Session, Message, AgentPreset } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

type ChatStreamData = {
  error?: string;
  message?: string;
  delta?: string;
  message_id?: number;
  token_count?: number | null;
};

export function ChatStarterDraft({
  value,
  onChange,
  onCreate,
}: {
  value: string;
  onChange: (value: string) => void;
  onCreate: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <Title level={4}>{t('chat.starter.title')}</Title>
      <TextArea aria-label={t('chat.starter.inputLabel')} value={value} onChange={(event) => onChange(event.target.value)} rows={4} />
      <Button type="primary" icon={<PlusOutlined />} onClick={onCreate} style={{ marginTop: 12 }}>
        {t('chat.starter.create')}
      </Button>
      <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        {t('chat.starter.note')}
      </Text>
    </div>
  );
}

export default function Chat({ initialPrompt }: { initialPrompt?: string } = {}) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const starterPrompt = initialPrompt?.trim() || searchParams.get('prompt')?.trim();
  // VS16：首页"最近会话"深链 ?session=<id>。仅接受十进制正整数；
  // 缺省 / 'abc' / '0' / '-1' / '1.5' / '5x' 一律视为"无深链请求"（不选中、不为它发请求）。
  const sessionParam = searchParams.get('session')?.trim() ?? '';
  const requestedSessionId = /^\d+$/.test(sessionParam) && Number(sessionParam) > 0 ? Number(sessionParam) : null;
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
  // VS16：会话列表是否已成功返回。深链只有在"拿到当前用户自己的会话列表"之后才允许生效，
  // 否则无法区分"id 不存在/非本人"与"列表还没回来"。
  const [sessionsResolved, setSessionsResolved] = useState(false);
  const appliedSessionRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 加载会话列表 + 角色列表
  useEffect(() => {
    let cancelled = false;
    apiClient.get('/chat/sessions')
      .then((res) => { if (!cancelled) { setSessions(res.data.items); setSessionsResolved(true); } })
      .catch(() => { /* 列表不可得 → 深链回落，保持既有选择，不臆造会话 */ });
    apiClient.get('/agents').then((res) => {
      setAgents(res.data.items);
      if (res.data.items.length > 0) setSelectedRole(res.data.items[0].role_key);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [setSessions]);

  useEffect(() => {
    if (starterPrompt) setInputValue(starterPrompt);
  }, [starterPrompt]);

  // VS16：?session=<id> —— 会话列表返回后，仅当该 id 出现在**当前用户自己的会话列表**里才选中它
  // （后端 /chat/sessions 已按 user_id 过滤）。非法 / 不存在 / 已删除 / 非本人 → 优雅回落：
  // 不改变既有选择、不为该 id 发任何请求，页面留在该功能区默认视图。
  // appliedSessionRef 保证只应用一次：用户随后在左栏点其它会话不会被强行拉回深链的那一条。
  useEffect(() => {
    if (requestedSessionId === null || !sessionsResolved) return;
    if (appliedSessionRef.current === requestedSessionId) return;
    appliedSessionRef.current = requestedSessionId;
    if (sessions.some((session) => session.id === requestedSessionId)) setCurrentSessionId(requestedSessionId);
  }, [requestedSessionId, sessions, sessionsResolved, setCurrentSessionId]);

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
      message.success(t('chat.role.changed'));
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleRunBacktest = () => {
    if (!currentSessionId) return;
    const description = inputValue.trim();
    if (!description) {
      message.warning(t('chat.backtest.descriptionRequired'));
      return;
    }

    const { ticker } = parseBacktestRequest(description);
    if (!ticker) {
      message.warning(t('chat.backtest.tickerRequired'));
      return;
    }

    navigate('/strategy-lab/ma-crossover?symbol=' + encodeURIComponent(ticker));
    message.info(t('chat.backtest.redirected'));
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
        const errData = await response.json().catch(() => ({ detail: t('chat.requestFailed') }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      let accumulatedContent = '';
      await readSSE<ChatStreamData>(response.body, ({ event, data }) => {
        if (event === 'error') {
          message.error(data.error ?? data.message ?? t('chat.sendFailed'));
          return;
        }
        if (data.delta !== undefined) {
          accumulatedContent += data.delta;
          setStreamingContent(accumulatedContent);
        }
        if (data.message_id !== undefined) {
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
      }, t('chat.streamMissing'));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || t('chat.sendFailed'));
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
    <Layout style={{ minHeight: 'calc(100dvh - 56px)', background: 'var(--fq-surface-1)' }}>
      {/* 左栏：会话列表 */}
      <Sider width={260} style={{ background: 'var(--fq-bg-subtle)', borderRight: '1px solid var(--fq-border)', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--fq-border)' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={handleNewSession}>
            {t('chat.newSession')}
          </Button>
        </div>
        <List
          size="small"
          dataSource={sessions}
          renderItem={(session) => (
            <List.Item
              style={{
                cursor: 'pointer',
                background: session.id === currentSessionId ? 'var(--fq-ai-soft)' : undefined,
                padding: '8px 16px',
              }}
              onClick={() => setCurrentSessionId(session.id)}
              actions={[
                <Popconfirm title={t('chat.deleteConfirm')} onConfirm={() => handleDeleteSession(session.id)}>
                  <DeleteOutlined style={{ color: 'var(--fq-system-error)', fontSize: 12 }} />
                </Popconfirm>
              ]}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session.title || t('chat.sessionTitle', { id: session.id })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fq-text-tertiary)' }}>
                  {session.last_message?.slice(0, 30) || t('chat.messageCount', { count: session.message_count || 0 })}
                </div>
              </div>
            </List.Item>
          )}
          locale={{ emptyText: <Empty description={t('chat.empty')} /> }}
        />
      </Sider>

      {/* 右栏：消息流 */}
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        {currentSessionId && (
          <div style={{
            padding: '8px 16px', borderBottom: '1px solid var(--fq-border)',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <Select
              aria-label={t('chat.role.placeholder')}
              value={selectedRole}
              onChange={handleChangeRole}
              style={{ width: 160 }}
              placeholder={t('chat.role.placeholder')}
              options={agents.map((a) => ({ label: a.name, value: a.role_key }))}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SwapOutlined /> {t('chat.role.hint')}
            </Text>
          </div>
        )}

        {/* 消息区 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 0' }}>
          {!currentSessionId ? (
            starterPrompt ? (
              <ChatStarterDraft value={inputValue} onChange={setInputValue} onCreate={handleNewSession} />
            ) : (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--fq-text-tertiary)' }}>
                <Title level={4} type="secondary">{t('chat.selectSession')}</Title>
              </div>
            )
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
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--fq-border)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                aria-label={t('chat.inputPlaceholder')}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) { e.preventDefault(); handleSendMessage(); }
                }}
                placeholder={t('chat.inputPlaceholder')}
                rows={2}
                disabled={isStreaming}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {isStreaming ? (
                  <Button danger onClick={handleStop}>{t('chat.stop')}</Button>
                ) : (
                  <>
                    <Button
                      disabled={!inputValue.trim()}
                      onClick={handleRunBacktest}
                    >{t('chat.runBacktest')}</Button>
                    <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage}>
                      {t('chat.send')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              {t('chat.quota')}
            </Text>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fq-text-tertiary)', marginTop: 8 }}>
              {t('chat.disclaimer')}
            </div>
          </div>
        )}
      </Content>
    </Layout>
  );
}
