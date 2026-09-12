/* ============================================================
 * Discussion — 多 Agent 讨论页
 * ============================================================ */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Layout, List, Button, Modal, Input, Select, InputNumber, Typography, message, Empty, Tag, Spin, Alert,
} from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useDiscussionStore } from '../store/discussionStore';
import { useModelStore } from '../store/modelStore';
import InvestmentCommittee from '../components/InvestmentCommittee';
import LoadFailureAlert from '../components/LoadFailureAlert';
import type { DiscussionRoom, AgentPreset, Message } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import {
  interruptDiscussionStream,
  reduceDiscussionStream,
  type DiscussionStreamData,
  type DiscussionStreamingByAgent,
} from '../features/discussionStream';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;
const { TextArea } = Input;

export default function Discussion({ initialTopic }: { initialTopic?: string } = {}) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const starterTopic = initialTopic?.trim() || searchParams.get('topic')?.trim();
  // VS16：首页"最近讨论"深链 ?room=<id>。仅接受十进制正整数；
  // 缺省 / 'abc' / '0' / '-1' / '1.5' / '42x' 一律视为"无深链请求"（不选中、不为它发请求）。
  const roomParam = searchParams.get('room')?.trim() ?? '';
  const requestedRoomId = /^\d+$/.test(roomParam) && Number(roomParam) > 0 ? Number(roomParam) : null;
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
  const [streamingByAgent, setStreamingByAgent] = useState<DiscussionStreamingByAgent>({});

  const abortRef = useRef<AbortController | null>(null);
  // VS16：深链只应用一次。缺了它，`rooms` 一变（例如新建讨论走 addRoom 产生新数组）就会出现
  // "抢回焦点"：用户手选了 room 43，却被他从 URL 点进来的旧 room 42 拽回去。
  const appliedRoomRef = useRef<number | null>(null);
  // VS19：与 Chat 同构——"列表已成功返回"与"列表请求失败"必须分开，
  // 否则会把系统故障错误归因成"这条讨论不存在"。
  const [roomsResolved, setRoomsResolved] = useState(false);
  const [roomsFailed, setRoomsFailed] = useState(false);
  // VS22：失败的具体原因。左栏错误态要把底层错误原样带出，而不是只说"失败了"。
  const [roomsError, setRoomsError] = useState('');
  // VS22：列表请求的序号，用于丢弃过期响应（重试可能晚于前一次请求返回）。
  const roomsRequestRef = useRef(0);
  // VS19：深链落空提示的一次性守卫（记住"已提示过的 id"），防止列表每次变化都重复打扰。
  const notifiedRoomRef = useRef<number | null>(null);
  // VS25：角色下拉的**全部**选项都来自 GET /agents。修前这条请求 `.catch(() => {})` 静默吞错，
  // 于是"下拉是空的"与"请求失败了"在界面上长得一模一样，用户被 "请至少选择 3 个角色" 挡回来时
  // 只会以为自己选得不够 —— 一个按提示也做不成的死胡同。
  // 现在与左栏列表同构：**成功**（resolved）与**失败**（failed）分开，失败必须说出来且可重试。
  const [agentsResolved, setAgentsResolved] = useState(false);
  const [agentsFailed, setAgentsFailed] = useState(false);
  // 失败的具体原因（把底层错误原样带出，不吞掉）。
  const [agentsError, setAgentsError] = useState('');
  // 请求序号：重试可能晚于前一次请求返回，过期响应必须丢弃。
  const agentsRequestRef = useRef(0);

  // 加载房间列表 + 角色
  // VS22：与 Chat 同构——房间列表的读取抽成可重复调用的 loadRooms，左栏错误态上的"重试"才会
  // **真的**重新发起这条请求。失败态与"确实没有讨论"由此彻底分开。
  const loadRooms = useCallback(async () => {
    const requestId = ++roomsRequestRef.current;
    try {
      const res = await apiClient.get('/discussion/rooms');
      // 过期响应直接丢弃：不得让先发的慢请求覆盖后发的重试结果。
      if (roomsRequestRef.current !== requestId) return;
      setRooms(res.data.items ?? []);
      setRoomsResolved(true);
      setRoomsFailed(false);
      setRoomsError('');
    } catch (error: unknown) {
      if (roomsRequestRef.current !== requestId) return;
      // 列表不可得 → 深链回落，保持既有选择。
      // 刻意**不**在重试发起时清掉失败态：那样重试期间会闪回"暂无讨论"，正是本卡要消灭的假象。
      setRoomsFailed(true);
      setRoomsError(error instanceof Error ? error.message : '');
    }
  }, [setRooms]);

  useEffect(() => { void loadRooms(); }, [loadRooms]);

  // VS25：角色列表读取抽成可重复调用的 loadAgents —— 错误态上的"重试"因此**真的**会重新发起该请求。
  // 刻意**不**在重试发起时清掉失败态：否则重试期间下拉会闪回"空且无解释"的样子，正是本卡要消灭的假象。
  const loadAgents = useCallback(async () => {
    const requestId = ++agentsRequestRef.current;
    try {
      const res = await apiClient.get('/agents');
      // 过期响应直接丢弃：不得让先发的慢请求覆盖后发的重试结果。
      if (agentsRequestRef.current !== requestId) return;
      setAgents(res.data.items ?? []);
      setAgentsResolved(true);
      setAgentsFailed(false);
      setAgentsError('');
    } catch (error: unknown) {
      if (agentsRequestRef.current !== requestId) return;
      setAgentsFailed(true);
      setAgentsError(error instanceof Error ? error.message : '');
    }
  }, []);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  // VS25：请求**成功**但可用角色本身不足 3 个 —— 这不是故障，所以不给"重试"，
  // 但必须如实说明（"当前仅 N 个角色可用"），不能让用户对着一个做不到的提示反复试。
  const rolesInsufficient = agentsResolved && !agentsFailed && agents.length < 3;
  const rolesInsufficientText = agents.length === 0
    ? t('discussion.rolesNone')
    : t('discussion.rolesInsufficient', { count: agents.length });

  // VS16：?room=<id> —— 仅当该 id 出现在**当前用户自己的房间列表**里才选中（后端 /discussion/rooms 已按 user_id 过滤）。
  // 非法 / 不存在 / 非本人 → 不选中、不为它发任何请求，页面留在该功能区默认视图。
  // VS19：回落不再静默（体感等同 R3 修复前的"点了落到空白界面"），改为一次性 message.warning；
  // 同时严格区分"列表不含该 id"（→ 已不存在）与"列表请求自身失败"（→ 读取失败，不得说成不存在）。
  useEffect(() => {
    if (requestedRoomId === null || appliedRoomRef.current === requestedRoomId) return;
    const notifyOnce = (key: string) => {
      if (notifiedRoomRef.current === requestedRoomId) return;
      notifiedRoomRef.current = requestedRoomId;
      message.warning(t(key));
    };
    if (!roomsResolved) {
      if (roomsFailed) notifyOnce('discussion.deepLinkUnavailable');
      return;
    }
    if (!rooms.some((room) => room.id === requestedRoomId)) { notifyOnce('discussion.deepLinkMissing'); return; }
    appliedRoomRef.current = requestedRoomId;
    setCurrentRoomId(requestedRoomId);
  }, [requestedRoomId, rooms, roomsResolved, roomsFailed, setCurrentRoomId, t]);

  useEffect(() => {
    if (!starterTopic || agents.length < 3) return;
    setTopic(starterTopic);
    setSelectedRoles(agents.slice(0, 4).map((agent) => agent.role_key));
    setCreateOpen(true);
  }, [agents, starterTopic]);

  // 加载房间详情
  useEffect(() => {
    if (!currentRoomId) { setRoomDetail(null); return; }
    setStreamingByAgent({});
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
    // VS25：角色不够时**不得**一律甩"请至少选择 3 个角色"——那是把系统故障说成用户没选够。
    // 三种成因各说各的：读取失败（→ 去重试）、可用角色本身不足（→ 如实说只有几个）、确实没选够。
    if (selectedRoles.length < 3) {
      message.warning(
        agentsFailed
          ? t('discussion.rolesUnavailableHint')
          : rolesInsufficient
            ? rolesInsufficientText
            : t('discussion.rolesRequired'),
      );
      return;
    }
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
    setStreamingByAgent({});

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

      let streamSnapshot: DiscussionStreamingByAgent = {};
      await readSSE<DiscussionStreamData>(response.body, ({ event, data }) => {
        streamSnapshot = reduceDiscussionStream(streamSnapshot, event, data);
        setStreamingByAgent(streamSnapshot);

        if (event === 'error') {
          const errorText = data.error ?? data.message ?? t('discussion.requestFailed');
          setRoomDetail((prev) => prev ? { ...prev, current_phase: 'failed' } : prev);
          message.error(errorText);
          return;
        }
        if (event === 'agent_end' && data.agent && data.message_id !== undefined) {
          const completed = streamSnapshot[data.agent];
          if (completed?.content) {
            const msg: Message = {
              id: data.message_id,
              conversation_id: currentRoomId,
              role: 'agent',
              agent_name: data.agent,
              content: completed.content,
              round_number: completed.round,
              token_count: data.token_count ?? null,
              created_at: new Date().toISOString(),
            };
            addMessage(currentRoomId, msg);
          }
          return;
        }
        if (event === 'summary' && data.content) {
          const summary = data.content;
          setRoomDetail((prev) => prev ? { ...prev, summary, current_phase: 'done' } : prev);
          return;
        }
        if (event === 'done' && data.room_id !== undefined) {
          setRoomDetail((prev) => prev ? { ...prev, current_phase: 'done' } : prev);
          setIsStreaming(false);
        }
      }, t('discussion.streamMissing'));
    } catch (err: any) {
      setStreamingByAgent((prev) => interruptDiscussionStream(prev));
      if (err.name !== 'AbortError') {
        setRoomDetail((prev) => prev ? { ...prev, current_phase: 'failed' } : prev);
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
    setStreamingByAgent((prev) => interruptDiscussionStream(prev));
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
          {/* VS25：角色列表读取失败 ⇒ 这里（不需要任何点击就看得见）先说清"是读取失败"，而不是
              让人打开对话框对着一个空下拉猜。对话框里另有一份同样形态的错误态，因为 antd 的
              遮罩会挡住这里，"重试"必须在那边的原位也能点到。 */}
          {agentsFailed ? (
            <div style={{ marginTop: 12 }}>
              <LoadFailureAlert
                message={t('discussion.rolesLoadFailed')}
                error={agentsError}
                onRetry={() => void loadAgents()}
              />
            </div>
          ) : null}
        </div>
        {/* VS22：列表请求失败 ⇒ 原位给出与首页、Chat 左栏同款的错误态（失败文案 + 具体错误 + 可点重试）。
            只有请求成功且为空时，才轮到 List 的"暂无讨论"——空态只代表"确实没有数据"。 */}
        {roomsFailed ? (
          <div style={{ padding: 12 }}>
            <LoadFailureAlert message={t('discussion.listFailed')} error={roomsError} onRetry={() => void loadRooms()} />
          </div>
        ) : null}
        {/* "读取失败且本地没有任何房间"时整块不渲染列表，避免它顺手写出"暂无讨论"；
            但失败之后本地新建的房间是**真实存在**的，必须照常可见。 */}
        {roomsFailed && rooms.length === 0 ? null : (
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
        )}
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
              members={roomDetail.participants.map((participant) => {
                const streaming = streamingByAgent[participant.role_key];
                return {
                  key: participant.role_key,
                  name: participant.name,
                  role: participant.role_key,
                  avatar: participant.avatar,
                  status: streaming?.status ?? (roomDetail.current_phase === 'done' ? 'completed' : 'waiting'),
                  summary: currentMessages.slice().reverse().find((message) => message.agent_name === participant.role_key)?.content,
                  streaming,
                };
              })}
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
            {/* VS25：下拉选项全部来自 GET /agents —— 它失败时**原位**（就在下拉上方）给出
                失败文案 + 具体原因 + 可点重试；重试真的重新发起，成功后本块消失、下拉恢复可选。 */}
            {agentsFailed ? (
              <div style={{ marginTop: 8 }}>
                <LoadFailureAlert
                  message={t('discussion.rolesLoadFailed')}
                  error={agentsError}
                  onRetry={() => void loadAgents()}
                />
              </div>
            ) : null}
            {/* VS25：成功但角色本身不足 3 个 —— 不是故障，如实说明，不给"重试"（重试也变不出角色）。 */}
            {rolesInsufficient ? (
              <Alert
                style={{ marginTop: 8 }}
                type="warning"
                showIcon
                message={rolesInsufficientText}
              />
            ) : null}
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
