/* ============================================================
 * Discussion — 多 Agent 讨论页
 * ============================================================ */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Layout, List, Button, Modal, Input, Select, InputNumber, Typography, message, Empty, Tag, Spin,
} from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { useDiscussionStore } from '../store/discussionStore';
import { useModelStore } from '../store/modelStore';
import DiscussionTimeline from '../components/DiscussionTimeline';
import type { DiscussionRoom, AgentPreset, Message } from '../types';
import { useSearchParams } from 'react-router-dom';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

export default function Discussion() {
  const [searchParams] = useSearchParams();
  const starterTopic = searchParams.get('topic')?.trim();
  const {
    rooms, currentRoomId, messages, streamingContent, isStreaming,
    setRooms, addRoom, setCurrentRoomId, setMessages, addMessage, setIsStreaming,
  } = useDiscussionStore();
  const currentModelId = useModelStore((s) => s.currentModelId);

  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [roomDetail, setRoomDetail] = useState<DiscussionRoom | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [totalRounds, setTotalRounds] = useState(3);
  const [creating, setCreating] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // 加载房间列表 + 角色
  useEffect(() => {
    apiClient.get('/discussion/rooms').then((res) => setRooms(res.data.items)).catch(() => {});
    apiClient.get('/agents').then((res) => setAgents(res.data.items)).catch(() => {});
  }, [setRooms]);

  useEffect(() => {
    if (!starterTopic || agents.length < 3) return;
    setTopic(starterTopic);
    setSelectedRoles(agents.slice(0, 4).map((agent) => agent.role_key));
    setCreateOpen(true);
  }, [agents, starterTopic]);

  // 加载房间详情
  useEffect(() => {
    if (!currentRoomId) { setRoomDetail(null); return; }
    setLoadingDetail(true);
    apiClient.get(`/discussion/rooms/${currentRoomId}`)
      .then((res) => {
        setRoomDetail(res.data.room);
        setMessages(currentRoomId, res.data.messages || []);
      })
      .catch(() => message.error('加载讨论详情失败'))
      .finally(() => setLoadingDetail(false));
  }, [currentRoomId, setMessages]);

  // 创建房间
  const handleCreate = async () => {
    if (!topic.trim()) { message.warning('请输入讨论主题'); return; }
    if (selectedRoles.length < 3) { message.warning('至少选择 3 个角色'); return; }
    setCreating(true);
    try {
      const res = await apiClient.post('/discussion/rooms', {
        topic: topic.trim(),
        role_keys: selectedRoles,
        total_rounds: totalRounds,
        model_id: currentModelId,
      });
      addRoom(res.data);
      setCurrentRoomId(res.data.id);
      setCreateOpen(false);
      setTopic('');
      setSelectedRoles([]);
      message.success('讨论房间已创建');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  // 启动讨论 (SSE)
  const handleStart = async () => {
    if (!currentRoomId) return;
    if (roomDetail?.current_phase === 'done') {
      message.warning('讨论已完成');
      return;
    }

    setIsStreaming(true);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`/api/discussion/rooms/${currentRoomId}/start`, {
        method: 'POST',
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
      let currentAgent = '';
      let accumulatedContent = '';
      let currentEvent = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7).trim();
            if (currentEvent === 'agent_start') {
              currentAgent = '';
              accumulatedContent = '';
            }
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const data = JSON.parse(jsonStr);

              if (currentEvent === 'error') {
                message.error(data.error ?? data.message ?? '讨论请求失败');
                currentEvent = 'message';
                continue;
              }

              if (data.agent && data.name && data.round !== undefined) {
                // agent_start: set current agent
                currentAgent = data.agent;
                accumulatedContent = '';
                continue;
              }

              if (data.delta !== undefined) {
                accumulatedContent += data.delta;
                continue;
              }

              if (data.agent && data.message_id !== undefined) {
                // agent_end: save message
                if (accumulatedContent) {
                  const msg: Message = {
                    id: data.message_id,
                    conversation_id: currentRoomId,
                    role: 'agent',
                    agent_name: data.agent,
                    content: accumulatedContent,
                    round_number: 0,
                    token_count: data.token_count ?? null,
                    created_at: new Date().toISOString(),
                  };
                  addMessage(currentRoomId, msg);
                }
                currentAgent = '';
                accumulatedContent = '';
                currentEvent = 'message';
                continue;
              }

              if (data.content && !data.delta) {
                // summary event
                setRoomDetail((prev) => prev ? { ...prev, summary: data.content, current_phase: 'done' } : prev);
                continue;
              }

              if (data.room_id !== undefined) {
                // done event
                setRoomDetail((prev) => prev ? { ...prev, current_phase: 'done' } : prev);
                setIsStreaming(false);
                currentEvent = 'message';
                continue;
              }
              currentEvent = 'message';
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || '启动讨论失败');
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  // 停止讨论
  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const currentMessages = currentRoomId ? (messages[currentRoomId] || []) : [];

  return (
    <Layout style={{ height: 'calc(100vh - 56px)', background: '#fff' }}>
      {/* 左栏：房间列表 */}
      <Sider width={260} style={{ background: '#fafafa', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建讨论
          </Button>
        </div>
        <List
          size="small"
          dataSource={rooms}
          renderItem={(room) => (
            <List.Item
              style={{
                cursor: 'pointer',
                background: room.id === currentRoomId ? '#e6f7ff' : undefined,
                padding: '8px 16px',
              }}
              onClick={() => setCurrentRoomId(room.id)}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {room.topic}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {room.participants.map((p) => p.name).join('、')} · Round {room.total_rounds}
                </div>
                <Tag color={room.current_phase === 'done' ? 'green' : 'blue'} style={{ marginTop: 4 }}>
                  {room.current_phase === 'done' ? '已完成' : '进行中'}
                </Tag>
              </div>
            </List.Item>
          )}
          locale={{ emptyText: <Empty description="暂无讨论" /> }}
        />
      </Sider>

      {/* 内容区 */}
      <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 16 }}>
        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : !currentRoomId ? (
          <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>
            <Title level={4} type="secondary">请选择或创建一个讨论房间</Title>
          </div>
        ) : (
          <>
            {/* 启动/停止按钮 */}
            {roomDetail?.current_phase !== 'done' && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                {isStreaming ? (
                  <Button danger onClick={handleStop}>停止讨论</Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} size="large">
                    开始讨论
                  </Button>
                )}
              </div>
            )}

            {/* 时间线 */}
            <DiscussionTimeline
              room={roomDetail}
              messages={currentMessages}
              currentAgent={isStreaming ? 'current' : undefined}
            />
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 16 }}>
          此内容由 AI 生成，不构成投资建议
        </div>
      </Content>

      {/* 创建对话框 */}
      <Modal
        title="创建讨论房间"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <Text strong>讨论主题</Text>
            <TextArea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入讨论主题，如：贵州茅台当前是否值得买入"
              rows={2}
            />
          </div>
          <div>
            <Text strong>参与角色（至少 3 个）</Text>
            <Select
              mode="multiple"
              value={selectedRoles}
              onChange={setSelectedRoles}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择角色"
              options={agents.map((a) => ({ label: a.name, value: a.role_key }))}
            />
          </div>
          <div>
            <Text strong>讨论轮次</Text>
            <InputNumber
              value={totalRounds}
              onChange={(v) => setTotalRounds(v || 3)}
              min={1}
              max={5}
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
