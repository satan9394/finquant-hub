/* ============================================================
 * Discussion — 多 Agent 讨论页
 * ============================================================ */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Layout, List, Button, Modal, Input, Select, InputNumber, Typography, message, Empty, Tag, Alert,
} from 'antd';
import { PlusOutlined, PlayCircleOutlined } from '@ant-design/icons';
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useDiscussionStore } from '../store/discussionStore';
import { useModelStore } from '../store/modelStore';
import InvestmentCommittee from '../components/InvestmentCommittee';
import ModelTelemetryBadge, { type LLMExecutionMetrics } from '../components/ModelTelemetryBadge';
import LoadFailureAlert, { LoadStateView, readStateOf } from '../components/LoadFailureAlert';
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
  // VS29：`roomDetail` **属于哪个房间**。右栏只渲染"属于当前房间"的详情 ⇒
  // "切房间失败时右栏显示上一条内容"（串台）在结构上不可能发生，而不是靠记得加守卫。
  const [roomDetailId, setRoomDetailId] = useState<number | null>(null);
  // VS29：详情读取的三态（loadingDetail 在途 / detailFailed+detailError 失败 / roomDetail 成功）。
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailError, setDetailError] = useState('');
  // VS32：`detailFailed`/`detailError` **属于哪个房间** —— 与 `roomDetailId` 同构。
  // 修前错误态是**全局**的：42 详情失败后切到 43，43 在途时右栏仍然渲染 42 的错误原文
  // （评估者实测 P10-OBSERVED：loading=false error=true staleErrorText=true）。
  // 这是 VS29"不串台"漏掉的一维：它作用域了**内容**(roomDetailId)与**加载态**，没作用域**错误原文**。
  // 这里同样是"在结构上不可能发生"而不是"记得在切房间时清一下"：清一下会连**自己**的错误一起清掉。
  const [detailErrorId, setDetailErrorId] = useState<number | null>(null);
  // VS29：详情请求序号，丢弃过期响应（切房间/重试可能晚于前一次请求返回）。
  const detailRequestRef = useRef(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [totalRounds, setTotalRounds] = useState(3);
  const [creating, setCreating] = useState(false);
  const [streamingByAgent, setStreamingByAgent] = useState<DiscussionStreamingByAgent>({});
  const [latestMetrics, setLatestMetrics] = useState<LLMExecutionMetrics | null>(null);
  const [metricsRoomId, setMetricsRoomId] = useState<number | null>(null);

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
  // VS29：抽成可重复调用的 loadRoomDetail —— 详情错误态上的"重试"必须**真的**重新发起这条请求。
  // 三件事一次做对（VS32 补第四件）：
  //   ①**切房间即作废旧内容**（清空 roomDetail/roomDetailId）：右栏不得在"上一条讨论"的内容上
  //     显示新房间的标题（串台）；修前 roomDetail 只在 `!currentRoomId` 时清空，切房间失败就串台。
  //   ②失败必须**原位说出来**（detailFailed/detailError ⇒ 错误态 + 重试），修前只弹一次 toast，
  //     且 `loadingDetail || !roomDetail` 会**永久停在 Spin**（既不是加载、也没有失败提示）。
  //   ③**仅成功才清失败态**：重试发起时不清 detailFailed（与 Chat/Discussion 列表、Dashboard 同口径）。
  // VS32：①~③ 之外补第四件——**错误原文也按房间作用域**（`detailErrorId`，见下方 `scopedDetailFailed`）。
  //   ①~③ 作用域了"内容"与"加载态"，但错误态仍是全局的 ⇒ 42 失败后切 43、43 在途时，
  //   右栏的 `readStateOf` 把 42 的失败当成当前事实，于是显示 42 的错误原文（串台）。
  //   注意别修反：不能靠"切房间时清 detailFailed"——那会在重试（同一房间）或"新房间自己失败"时
  //   把**当前房间自己**的错误一起清掉，等于"错误永不显示"。作用域只是让它**只属于发起它的房间**。
  const loadRoomDetail = useCallback(async (roomId: number) => {
    const requestId = ++detailRequestRef.current;
    setStreamingByAgent({});
    setRoomDetail(null);
    setRoomDetailId(null);
    try {
      const res = await apiClient.get(`/discussion/rooms/${roomId}`);
      // 过期响应直接丢弃：不得让先发的慢请求覆盖后发的重试结果。
      if (detailRequestRef.current !== requestId) return;
      const room = res.data?.room as DiscussionRoom | undefined;
      // 成功响应里没有房间对象 ⇒ 仍然是"没能读到详情"，不是"这个房间是空的"。
      if (!room) { setDetailFailed(true); setDetailError(''); setDetailErrorId(roomId); return; }
      setRoomDetail(room);
      setRoomDetailId(roomId);
      setDetailFailed(false);
      setDetailError('');
      setDetailErrorId(null);
      setMessages(roomId, res.data.messages || []);
    } catch (error: unknown) {
      if (detailRequestRef.current !== requestId) return;
      setDetailFailed(true);
      setDetailError(error instanceof Error ? error.message : '');
      // VS32：错误原文是**这个房间**的 ⇒ 只有当前房间仍是它时，右栏才允许显示。
      setDetailErrorId(roomId);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!currentRoomId) {
      // 作废在途请求：房间已取消选择，迟到的响应不得再写回右栏。
      detailRequestRef.current += 1;
      setRoomDetail(null);
      setRoomDetailId(null);
      setDetailFailed(false);
      setDetailError('');
      setDetailErrorId(null);
      return;
    }
    void loadRoomDetail(currentRoomId);
  }, [currentRoomId, loadRoomDetail]);

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
    setLatestMetrics(null);
    setMetricsRoomId(currentRoomId);

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
        if (event === 'llm_metrics') {
          setLatestMetrics(data as LLMExecutionMetrics);
          setMetricsRoomId(currentRoomId);
          return;
        }
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
  // VS29：右栏只认"属于当前房间"的详情。`roomDetailId` 与 `currentRoomId` 不一致时一律当作没有内容，
  // 于是"切房间失败还显示上一条内容"（串台）在结构上不可能发生。
  const scopedDetail = roomDetail && roomDetailId === currentRoomId ? roomDetail : null;
  // VS32：错误态同样只认"属于当前房间"。`detailErrorId` 与 `currentRoomId` 不一致 ⇒ 这份错误原文
  // 属于上一个房间，一律当作没有错误（切房间在途时不得显示上一个房间的错误原文）。
  // 注意**不是**把错误一律清掉：当前房间自己失败时 `detailErrorId === currentRoomId`，
  // 错误原文照常显示（并照常在"仅成功才清失败态"的口径下于重试期间保持显示）。
  const scopedDetailFailed = detailFailed && detailErrorId === currentRoomId;
  const detailState = readStateOf({
    failed: scopedDetailFailed,
    resolved: scopedDetail !== null,
    // error 只在 failed 为真时被 readStateOf 读取（优先级 1），而 failed 已按房间作用域 ⇒ 不会串台。
    error: detailError,
    count: scopedDetail ? 1 : 0,
  });

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
            只有请求成功且为空时，才轮到"暂无讨论"——空态只代表"确实没有数据"。
            VS29：三态由 LoadStateView 一个 switch 渲染（互斥由结构保证），在途不再伪装成"暂无讨论"；
            失败后本地新建的房间仍照常可见。 */}
        <div style={{ padding: 12 }}>
        <LoadStateView
          state={readStateOf({ failed: roomsFailed, resolved: roomsResolved, error: roomsError, count: rooms.length })}
          failureMessage={t('discussion.listFailed')}
          onRetry={() => void loadRooms()}
          loadingText={t('discussion.listLoading')}
          emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('discussion.empty')} />}
          retainedCount={rooms.length}
          showContentOnError
        >
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
        />
        </LoadStateView>
        </div>
      </Sider>

      {/* 内容区 */}
      <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'auto', padding: 16 }}>
        {!currentRoomId ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--fq-text-tertiary)' }}>
            <Title level={4} type="secondary">{t('discussion.selectRoom')}</Title>
          </div>
        ) : (
          /* VS29：详情三态由 LoadStateView 一个 switch 渲染。
             - 在途 ⇒ 加载态（`announceLoading` 开启：这是本页的主内容区，且 `Discussion.test.tsx`
               用 `getByRole('status')` 唯一命中它）；
             - 失败 ⇒ 原位错误态 + 真会重新发起请求的重试（修前只弹一次 toast 且会永久停在 Spin）；
             - 成功 ⇒ 属于**当前房间**的详情（scopedDetail；不 showContentOnError ⇒ 失败时绝不显示上一条）。 */
          <LoadStateView
            state={detailState}
            failureMessage={t('discussion.detailFailed')}
            onRetry={() => { if (currentRoomId) void loadRoomDetail(currentRoomId); }}
            loadingText={t('discussion.loading')}
            announceLoading
          >
          {scopedDetail ? (
          <>
            {/* 启动/停止按钮 */}
            {scopedDetail.current_phase !== 'done' && (
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
                <div style={{ marginTop: 8 }}>
                  <ModelTelemetryBadge metrics={metricsRoomId === currentRoomId ? latestMetrics : null} />
                </div>
              </div>
            )}

            <InvestmentCommittee
              topic={scopedDetail.topic}
              phase={scopedDetail.current_phase === 'done' ? 'completed' : scopedDetail.current_phase === 'failed' ? 'partial' : isStreaming ? 'in-session' : 'awaiting-confirmation'}
              members={scopedDetail.participants.map((participant) => {
                const streaming = streamingByAgent[participant.role_key];
                return {
                  key: participant.role_key,
                  name: participant.name,
                  role: participant.role_key,
                  avatar: participant.avatar,
                  status: streaming?.status ?? (scopedDetail.current_phase === 'done' ? 'completed' : 'waiting'),
                  summary: currentMessages.slice().reverse().find((message) => message.agent_name === participant.role_key)?.content,
                  streaming,
                };
              })}
            />
          </>
          ) : null}
          </LoadStateView>
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
