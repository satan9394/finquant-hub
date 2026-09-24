/* ============================================================
 * Chat — 单 Agent 对话页
 * ============================================================ */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Layout, List, Input, Button, Select, Typography, Popconfirm, message, Empty,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SendOutlined, SwapOutlined,
} from '@ant-design/icons';
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useChatStore } from '../store/chatStore';
import { useModelStore } from '../store/modelStore';
import ChatMessageBubble from '../components/ChatMessageBubble';
import ContextBudgetBar, { DEFAULT_CONTEXT_LIMIT } from '../components/ContextBudgetBar';
import ModelTelemetryBadge, { type LLMExecutionMetrics } from '../components/ModelTelemetryBadge';
// VS34：`LoadFailureAlert`（错误态）与 `LoadStateView`（三态唯一渲染出口）都复用 VS29 的唯一实现处，
// 本页不另造三态判定。
import LoadFailureAlert, { LoadStateView, readStateOf } from '../components/LoadFailureAlert';
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
  truncated_by_deadline?: boolean;
  model?: string;
  ttft_ms?: number | null;
  speed_tps?: number | null;
  prompt_tokens?: number;
  cached_tokens?: number;
  cache_hit_rate?: number | null;
  completion_tokens?: number;
  reasoning_tokens?: number;
  context_used?: number;
  role_key?: string;
};

/**
 * VS28：整轮截止信号的**唯一读取点**。
 *
 * 后端把"提前结束"写在两处（正文前缀 + `done.truncated_by_deadline`），落库的
 * 助手消息则由 `GET /chat/sessions/{id}/messages` 用同一常量回填该字段。
 * 实时与回放都走这里：**只有显式 `true` 才算截断**（缺字段 = 未截断/历史数据，
 * 不得误报）。这与 VS27 研究侧 `resolveTruncatedByDeadline` 同口径。
 */
export function resolveTruncatedByDeadline(value: unknown): boolean {
  return value === true;
}

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
  const [latestMetrics, setLatestMetrics] = useState<LLMExecutionMetrics | null>(null);
  const [metricsSessionId, setMetricsSessionId] = useState<number | null>(null);
  // VS34（吞错点 A）：角色列表读取失败必须可归因、可重试 —— 与 VS25 在 Discussion.tsx 建立的
  // `loadAgents` 完全同构（成功/失败分开、请求序号丢弃过期响应、**仅成功才清失败态**）。
  const [agentsFailed, setAgentsFailed] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const agentsRequestRef = useRef(0);
  // VS34（吞错点 B）：消息记录读取的三态。`messagesLoadedId` / `messagesErrorId` 是**作用域**——
  // 只有"属于当前会话"的成功与失败才算数，否则切会话时会把上一个会话的失败原文/空态串到新会话上
  // （VS29 的串台教训 + VS32 的"错误原文也要按实体作用域"）。
  const [messagesLoadedId, setMessagesLoadedId] = useState<number | null>(null);
  const [messagesFailed, setMessagesFailed] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [messagesErrorId, setMessagesErrorId] = useState<number | null>(null);
  const messagesRequestRef = useRef(0);
  // VS16：会话列表是否已成功返回。深链只有在"拿到当前用户自己的会话列表"之后才允许生效，
  // 否则无法区分"id 不存在/非本人"与"列表还没回来"。
  const [sessionsResolved, setSessionsResolved] = useState(false);
  // VS19：列表请求"自身失败"是与"列表不含该 id"不同的失败，必须分开归因。
  const [sessionsFailed, setSessionsFailed] = useState(false);
  // VS22：失败的具体原因。左栏错误态要把底层错误原样带出，而不是只说"失败了"。
  const [sessionsError, setSessionsError] = useState('');
  // VS22：列表请求的序号，用于丢弃过期响应（重试可能晚于前一次请求返回）。
  const sessionsRequestRef = useRef(0);
  const appliedSessionRef = useRef<number | null>(null);
  // VS19：深链落空提示的一次性守卫，与 appliedSessionRef 同构（记住"已提示过的 id"）。
  // 没有它，列表每次变化都会再提示一次 → 重演 R3 式的"反复打扰"。
  const notifiedSessionRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 加载会话列表 + 角色列表
  // VS22：会话列表的读取抽成可重复调用的 loadSessions —— 左栏错误态上的"重试"必须**真的**重新发起
  // 这条请求（而不是只把提示关掉）。失败态与"确实没有会话"由此彻底分开：只有请求成功且列表为空，
  // 才轮到左栏的"暂无会话"。
  const loadSessions = useCallback(async () => {
    const requestId = ++sessionsRequestRef.current;
    try {
      const res = await apiClient.get('/chat/sessions');
      // 过期响应直接丢弃：不得让先发的慢请求覆盖后发的重试结果。
      if (sessionsRequestRef.current !== requestId) return;
      setSessions(res.data.items);
      setSessionsResolved(true);
      setSessionsFailed(false);
      setSessionsError('');
    } catch (error: unknown) {
      if (sessionsRequestRef.current !== requestId) return;
      // 列表不可得 → 深链回落，保持既有选择，不臆造会话。
      // 刻意**不**在重试发起时清掉失败态：那样重试期间会闪回"暂无会话"，正是本卡要消灭的假象。
      setSessionsFailed(true);
      setSessionsError(error instanceof Error ? error.message : '');
    }
  }, [setSessions]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  // VS34（吞错点 A）：角色列表读取抽成可重复调用的 `loadAgents`——错误态上的"重试"因此**真的**
  // 会重新发起这条请求。修前这里是 `apiClient.get('/agents').then(...).catch(() => {})`：
  // 失败被静默吞掉，下拉永远是空的，用户无从知道"读不到"与"确实没有角色"的区别，也无处可重试。
  // 刻意**不**在重试发起时清掉失败态：否则重试期间错误态会消失、下拉闪回"空且无解释"的样子。
  const loadAgents = useCallback(async () => {
    const requestId = ++agentsRequestRef.current;
    try {
      const res = await apiClient.get('/agents');
      // 过期响应直接丢弃：不得让先发的慢请求覆盖后发的重试结果。
      if (agentsRequestRef.current !== requestId) return;
      const items = (res.data.items ?? []) as AgentPreset[];
      setAgents(items);
      // 只在用户还没选过角色时补默认值：重试不得把用户已经选好的角色改回去。
      if (items.length > 0) setSelectedRole((prev) => prev ?? items[0].role_key);
      setAgentsFailed(false);
      setAgentsError('');
    } catch (error: unknown) {
      if (agentsRequestRef.current !== requestId) return;
      setAgentsFailed(true);
      setAgentsError(error instanceof Error ? error.message : '');
    }
  }, []);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  useEffect(() => {
    if (starterPrompt) setInputValue(starterPrompt);
  }, [starterPrompt]);

  // VS16：?session=<id> —— 会话列表返回后，仅当该 id 出现在**当前用户自己的会话列表**里才选中它
  // （后端 /chat/sessions 已按 user_id 过滤）。非法 / 不存在 / 已删除 / 非本人 → 优雅回落：
  // 不改变既有选择、不为该 id 发任何请求，页面留在该功能区默认视图。
  // appliedSessionRef 保证只应用一次：用户随后在左栏点其它会话不会被强行拉回深链的那一条。
  // VS19：回落不再静默（否则体感等同 R3 修复前的"点了落到空白界面"），改为一次性 message.warning。
  // 两种失败严格区分，不得混为一谈：
  //   ① 列表已成功返回但不含该 id → "已不存在"（数据确实没有）；
  //   ② 列表请求自身失败       → "列表读取失败"（系统故障，绝不能说成数据不存在）。
  // 结构与本页 Discussion 的 ?room= 完全同构：只有**真正选中**才写 appliedSessionRef；
  // 落空（含 ① 与 ②）由 notifiedSessionRef 单独记账，保证同一个 id 只提示一次。
  useEffect(() => {
    if (requestedSessionId === null || appliedSessionRef.current === requestedSessionId) return;
    const notifyOnce = (key: string) => {
      if (notifiedSessionRef.current === requestedSessionId) return;
      notifiedSessionRef.current = requestedSessionId;
      message.warning(t(key));
    };
    if (!sessionsResolved) {
      if (sessionsFailed) notifyOnce('chat.deepLinkUnavailable');
      return;
    }
    if (!sessions.some((session) => session.id === requestedSessionId)) { notifyOnce('chat.deepLinkMissing'); return; }
    appliedSessionRef.current = requestedSessionId;
    setCurrentSessionId(requestedSessionId);
  }, [requestedSessionId, sessions, sessionsResolved, sessionsFailed, setCurrentSessionId, t]);

  // 加载当前会话消息
  // VS34（吞错点 B）：抽成可重复调用的 `loadMessages`——错误态上的"重试"必须**真的**重新发起。
  // 修前是 `.then(...).catch(() => {})`：失败被吞掉后消息区**什么都不渲染**，等价于告诉用户
  // "这个会话没有消息"（VS-19/VS-22 反复确立的底线：失败不得伪装成空），且没有重试入口。
  // ①成功与失败分开记；②请求序号丢弃过期响应；③**仅成功才清失败态**（重试期间失败态保持，
  // 不闪回空态/加载态——与左栏列表、Discussion 详情、Dashboard 同口径）。
  const loadMessages = useCallback(async (sessionId: number) => {
    const requestId = ++messagesRequestRef.current;
    try {
      const res = await apiClient.get(`/chat/sessions/${sessionId}/messages`);
      if (messagesRequestRef.current !== requestId) return;
      setMessages(sessionId, res.data.items);
      setMessagesLoadedId(sessionId);
      setMessagesFailed(false);
      setMessagesError('');
      setMessagesErrorId(null);
    } catch (error: unknown) {
      if (messagesRequestRef.current !== requestId) return;
      setMessagesFailed(true);
      setMessagesError(error instanceof Error ? error.message : '');
      // 这份错误原文属于**这个会话**：只有当前会话仍是它时，消息区才允许显示。
      setMessagesErrorId(sessionId);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!currentSessionId) {
      // 作废在途请求：会话已取消选择，迟到的响应不得再写回消息区。
      messagesRequestRef.current += 1;
      setMessagesLoadedId(null);
      setMessagesFailed(false);
      setMessagesError('');
      setMessagesErrorId(null);
      return;
    }
    void loadMessages(currentSessionId);
  }, [currentSessionId, loadMessages]);

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
    setLatestMetrics(null);
    setMetricsSessionId(currentSessionId);

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
        if (event === 'llm_metrics') {
          setLatestMetrics(data as LLMExecutionMetrics);
          setMetricsSessionId(currentSessionId);
          return;
        }
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
            // VS28：正文里已经带了后端前置的提示；这里再把机器可读信号挂到消息上，
            // 由 ChatMessageBubble 渲染成**持久**提示条（不是一闪而过的 toast）。
            truncated_by_deadline: resolveTruncatedByDeadline(data.truncated_by_deadline),
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

  // VS34：消息区的三态，**按当前会话作用域**——切会话时上一个会话的"成功/失败"一律不算数，
  // 否则新会话在途的那一刻会拿旧会话的结论冒充事实（既可能显示上一条的失败原文，也可能显示"空"）。
  const scopedMessagesFailed = messagesFailed && messagesErrorId === currentSessionId;
  const scopedMessagesResolved = currentSessionId !== null && messagesLoadedId === currentSessionId;
  // "手上有内容"包括本地已知存在的记录（乐观写回的提问、正在流式生成的气泡）：
  // 读取失败**不得**顺手把它们藏掉。优先级仍由 readStateOf 唯一决定，本页不自行编排三态。
  const visibleMessageCount = currentMessages.length + (isStreaming ? 1 : 0);
  const messagesState = readStateOf({
    failed: scopedMessagesFailed,
    resolved: scopedMessagesResolved,
    error: messagesError,
    count: visibleMessageCount,
  });

  return (
    <Layout style={{ minHeight: 'calc(100dvh - 56px)', background: 'var(--fq-surface-1)' }}>
      {/* 左栏：会话列表 */}
      <Sider width={260} style={{ background: 'var(--fq-bg-subtle)', borderRight: '1px solid var(--fq-border)', overflow: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--fq-border)' }}>
          <Button type="primary" block icon={<PlusOutlined />} onClick={handleNewSession}>
            {t('chat.newSession')}
          </Button>
          {/* VS34（吞错点 A）：角色列表读取失败 ⇒ 这里（不需要任何点击就看得见）先说清"是读取失败"。
              角色既有**消费方之一**就在这个按钮上：`handleNewSession` 把 `selectedRole` 当
              `role_preset` 提交，读不到时它只能是 undefined —— 用户会在毫不知情的情况下建出一个
              "角色没选上"的会话。修前这条读取 `.catch(() => {})`，界面上"读不到"与"确实没有角色"
              完全一样，且没有任何重试入口。 */}
          {agentsFailed ? (
            <div style={{ marginTop: 12 }}>
              <LoadFailureAlert
                message={t('chat.rolesLoadFailed')}
                error={agentsError}
                onRetry={() => void loadAgents()}
              />
            </div>
          ) : null}
        </div>
        {/* VS22：列表请求失败 ⇒ 原位给出与首页同款的错误态（失败文案 + 具体错误 + 可点重试）。
            只有请求成功且为空时，才轮到"暂无会话"——空态只代表"确实没有数据"。
            VS29：三态（加载中 / 空 / 失败）改由 LoadStateView **一个 switch** 渲染 ⇒ 互斥由结构保证，
            在途期间不可能再顺手写出"暂无会话"；失败后本地新建的会话仍照常可见（不藏真实记录）。 */}
        <LoadStateView
          state={readStateOf({ failed: sessionsFailed, resolved: sessionsResolved, error: sessionsError, count: sessions.length })}
          failureMessage={t('chat.listFailed')}
          onRetry={() => void loadSessions()}
          loadingText={t('chat.listLoading')}
          emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('chat.empty')} />}
          retainedCount={sessions.length}
          showContentOnError
        >
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
        />
        </LoadStateView>
      </Sider>

      {/* 右栏：消息流 */}
      <Content style={{ display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        {currentSessionId && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--fq-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
            {/* VS34（吞错点 A）：角色下拉的**全部**选项都来自 GET /agents。失败时下拉是空的，
                与"确实没有角色"长得一模一样 —— 必须在**这个下拉的正下方**原位说出来，
                否则用户对着一个空下拉只会以为没有角色可选，也没有任何重试入口。
                与左栏那一份是**两个独立消费方**（这里=会话内切角色，左栏=新建会话的 role_preset）；
                antd 在本页没有任何遮罩会挡住其中一个，故两处都常驻、各自可点。
                形态复用 VS29 的 `LoadFailureAlert`（族内唯一错误态实现处），不另造判定。 */}
            {agentsFailed ? (
              <div style={{ marginTop: 8 }}>
                <LoadFailureAlert
                  message={t('chat.rolesLoadFailed')}
                  error={agentsError}
                  onRetry={() => void loadAgents()}
                />
              </div>
            ) : null}
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
          ) : (
            /* VS34（吞错点 B）：消息区三态改由 LoadStateView **一个 switch** 渲染（复用 VS29 的
               唯一三态实现处，不另造判定）：读取失败 ⇒ 原位给出失败文案 + 底层原因 + 可点重试，
               绝不退化成"这个会话没有消息"。`showContentOnError` + `retainedCount` 保证失败态
               不会顺手藏掉本地已知存在的记录（乐观写回的提问 / 正在流式生成的气泡）。 */
            <LoadStateView
              state={messagesState}
              failureMessage={t('chat.messagesFailed')}
              onRetry={() => void loadMessages(currentSessionId)}
              loadingText={t('chat.messagesLoading')}
              emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('chat.messagesEmpty')} />}
              retainedCount={visibleMessageCount}
              showContentOnError
            >
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
            </LoadStateView>
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
            <ModelTelemetryBadge metrics={metricsSessionId === currentSessionId ? latestMetrics : null} />
            <ContextBudgetBar value={inputValue} contextLimit={DEFAULT_CONTEXT_LIMIT} />
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
