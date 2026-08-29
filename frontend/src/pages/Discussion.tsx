/* ============================================================
 * Discussion — 多 Agent 讨论页
 * ============================================================ */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Layout, List, Button, Modal, Input, Select, InputNumber, Typography, message, Empty, Tag, Spin,
} from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useDiscussionStore } from '../store/discussionStore';
import { useModelStore } from '../store/modelStore';
import InvestmentCommittee from '../components/InvestmentCommittee';
import type { DiscussionRoom, AgentPreset, Message } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

type DiscussionStreamData = {
  error?: string;
  message?: string;
  agent?: string;
  name?: string;
  round?: number;
  delta?: string;
  message_id?: number;
  token_count?: number | null;
  content?: string;
  room_id?: number;
};

export default function Discussion({ initialTopic }: { initialTopic?: string } = {}) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const starterTopic = initialTopic?.trim() || searchParams.get('topic')?.trim();
  const requestedRoomId = Number(searchParams.get('room'));
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
    apiClient.get('/discussion/rooms').then((res) => setRooms(res.data.items ?? [])).catch(() => {});
    apiClient.get('/agents').then((res) => setAgents(res.data.items ?? [])).catch(() => {});
  }, [setRooms]);

  useEffect(() => {
    if (Number.isInteger(requestedRoomId) && rooms.some((room) => room.id === requestedRoomId)) {
      setCurrentRoomId(requestedRoomId);
    }
  }, [requestedRoomId, rooms, setCurrentRoomId]);

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
      .catch(() => message.error(t('discussion.loadFailed')))
      .finally(() => setLoadingDetail(false));
  }, [currentRoomId, setMessages]);

  // 创建房间
  const handleCreate = async () => {
    if (!topic.trim()) { message.warning(t('discussion.topicRequired')); return; }
    if (selectedRoles.length < 3) { message.warning(t('discussion.rolesRequired')); return; }
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
      message.success(t('discussion.created'));
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
      message.warning(t('discussion.alreadyDone'));
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
        const errData = await response.json().catch(() => ({ detail: t('discussion.requestFailed') }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      let accumulatedContent = '';
      await readSSE<DiscussionStreamData>(response.body, ({ event, data }) => {
        if (event === 'agent_start') accumulatedContent = '';
        if (event === 'error') {
          const errorText = data.error ?? data.message ?? t('discussion.requestFailed');
          setRoomDetail((prev) => prev ? { ...prev, current_phase: 'failed' } : prev);
          message.error(errorText);
          return;
        }
        if (data.agent && data.name && data.round !== undefined) {
          accumulatedContent = '';
          return;
        }
        if (data.delta !== undefined) {
          accumulatedContent += data.delta;
          return;
        }
        if (data.agent && data.message_id !== undefined) {
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
          accumulatedContent = '';
          return;
        }
        if (data.content && data.delta === undefined) {
          const summary = data.content;
          setRoomDetail((prev) => prev ? { ...prev, summary, current_phase: 'done' } : prev);
          return;
        }
        if (data.room_id !== undefined) {
          setRoomDetail((prev) => prev ? { ...prev, current_phase: 'done' } : prev);
          setIsStreaming(false);
        }
      }, t('discussion.streamMissing'));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || t('discussion.startFailed'));
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
    <Layout style={{ minHeight: 'calc(100dvh - 56px)', background: 'var(--fq-surface-1)' }}>
      {/* 左栏：房间列表 */}
      <Sider width={260} style={{ background: 'var(--fq-bg-subtle)', borderRight: '1px solid var(--fq-border)', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--fq-border)' }}>
          <Button aria-label={t('discussion.create')} type="primary" block icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('discussion.create')}
          </Button>
        </div>
        <List
          size="small"
          dataSource={rooms}
          renderItem={(room) => (
            <List.Item
              style={{
                cursor: 'pointer',
                background: room.id === currentRoomId ? 'var(--fq-ai-soft)' : undefined,
                padding: '8px 16px',
              }}
              onClick={() => setCurrentRoomId(room.id)}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {room.topic}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fq-text-tertiary)' }}>
                  {t('discussion.participantsLine', { names: room.participants.map((p) => p.name).join(t('discussion.separator')), rounds: room.total_rounds })}
                </div>
                <Tag color={room.current_phase === 'done' ? 'green' : room.current_phase === 'failed' ? 'red' : 'blue'} style={{ marginTop: 4 }}>
                  {room.current_phase === 'done' ? t('discussion.status.done') : room.current_phase === 'failed' ? t('discussion.status.failed') : t('discussion.status.running')}
                </Tag>
              </div>
            </List.Item>
          )}
          locale={{ emptyText: <Empty description={t('discussion.empty')} /> }}
        />
      </Sider>

      {/* 内容区 */}
      <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 16 }}>
        {!currentRoomId ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--fq-text-tertiary)' }}>
            <Title level={4} type="secondary">{t('discussion.selectRoom')}</Title>
          </div>
        ) : loadingDetail || !roomDetail ? (
          <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
            <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>{t('discussion.loading')}</Text>
          </div>
        ) : (
          <>
            {/* 启动/停止按钮 */}
            {roomDetail?.current_phase !== 'done' && (
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {t('discussion.quota')}
                </Text>
                {isStreaming ? (
                  <Button danger onClick={handleStop}>{t('discussion.stop')}</Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} size="large">
                    {t('discussion.start')}
                  </Button>
                )}
              </div>
            )}

            <InvestmentCommittee
              topic={roomDetail.topic}
              phase={roomDetail.current_phase === 'done' ? 'completed' : roomDetail.current_phase === 'failed' ? 'partial' : isStreaming ? 'in-session' : 'awaiting-confirmation'}
              members={roomDetail.participants.map((participant) => ({
                key: participant.role_key,
                name: participant.name,
                role: participant.role_key,
                avatar: participant.avatar,
                status: isStreaming ? 'running' : roomDetail.current_phase === 'done' ? 'completed' : 'waiting',
                summary: currentMessages.slice().reverse().find((message) => message.agent_name === participant.name)?.content,
              }))}
            />
          </>
        )}

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fq-text-tertiary)', marginTop: 16 }}>
          {t('discussion.disclaimer')}
        </div>
      </Content>

      {/* 创建对话框 */}
      <Modal
        title={t('discussion.modal.title')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        okText={t('discussion.modal.create')}
        cancelText={t('discussion.modal.cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text type="secondary">{t('discussion.modal.note')}</Text>
          <div>
            <Text strong>{t('discussion.modal.topic')}</Text>
            <TextArea
              aria-label={t('discussion.modal.topic')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t('discussion.modal.topicPlaceholder')}
              rows={2}
            />
          </div>
          <div>
            <Text strong>{t('discussion.modal.roles')}</Text>
            <Select
              aria-label={t('discussion.modal.roles')}
              mode="multiple"
              value={selectedRoles}
              onChange={setSelectedRoles}
              style={{ width: '100%', marginTop: 4 }}
              placeholder={t('discussion.modal.rolesPlaceholder')}
              options={agents.map((a) => ({ label: a.name, value: a.role_key }))}
            />
          </div>
          <div>
            <Text strong>{t('discussion.modal.rounds')}</Text>
            <InputNumber
              aria-label={t('discussion.modal.rounds')}
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
