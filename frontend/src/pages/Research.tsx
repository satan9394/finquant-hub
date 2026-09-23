/* ============================================================
 * Research — 深度研究页（/research）
 * 功能：ticker 输入 + 4-agent 进度动画 + 富文本 Markdown 报告输出（SSE）
 * ============================================================ */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Card, Collapse, Col, Descriptions, Empty, Input, List, Popconfirm, Row, Space, Spin, Tag, Typography, Button, message,
} from 'antd';
import {
  PlayCircleOutlined, ReloadOutlined, DownloadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { AgentStatus, ResearchAgent } from '../types';
import type { ResearchReportDetail, ResearchReportEvent } from '../types/research';
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useModelStore } from '../store/modelStore';
import ResultLayer from '../components/ResultLayer';
import AgentStatusCard from '../components/AgentStatusCard';
import ResearchArtifact from '../components/ResearchArtifact';
import type { EvidenceRecord } from '../components/EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';
import ResearchPlan, { type AgentRunStep } from '../components/ResearchPlan';
import {
  describeDegradedReasons,
  reasonCodes as asReasonCodes,
} from '../features/degradedReasons';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== Agent 定义 ====================
const AGENT_KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor', 'report_lead'];

const AGENT_LABELS: Record<string, { nameKey: string; roleKey: string }> = {
  business_analyst: { nameKey: 'deep.agent.business.name', roleKey: 'deep.agent.business.role' },
  financial_analyst: { nameKey: 'deep.agent.financial.name', roleKey: 'deep.agent.financial.role' },
  industry_researcher: { nameKey: 'deep.agent.industry.name', roleKey: 'deep.agent.industry.role' },
  risk_assessor: { nameKey: 'deep.agent.risk.name', roleKey: 'deep.agent.risk.role' },
  report_lead: { nameKey: 'deep.agent.editor.name', roleKey: 'deep.agent.editor.role' },
};

type StoredReport = {
  id: number; ticker: string; company_name?: string; model_id?: number | null;
  status: 'running' | 'completed' | 'failed'; created_at: string; updated_at?: string | null;
};

/**
 * VS20：落库的单个 Agent 结局。`status` 是**结构化主判据**；
 * `content` 里的 `【分析失败】` 前缀只是历史兜底（主编失败时 content 为空串，哨兵必然落空）。
 */
export type StoredAgentResult = {
  content?: string;
  name?: string;
  status?: string;
  error?: string;
  degraded_reasons?: string[];
};

type StoredReportDetail = ResearchReportDetail & {
  agent_results?: Record<string, StoredAgentResult>;
};

type HistoryGroup = {
  ticker: string; company_name?: string; run_count: number; completed_count: number;
  failed_count: number; latest_at: string; latest_report_id?: number | null; runs: StoredReport[];
};

type ResearchStreamData = {
  agent?: string;
  role_key?: string;
  report_id?: number;
  name?: string;
  report?: Record<string, unknown>;
  // G-03: done_payload 顶层携带 quality（audited/degraded），不在 report 内部。
  quality?: string;
  // VS27: 整轮截止信号。顶层与 report 内部同值（后端同一份 dict），两处都读以防形态差异。
  truncated_by_deadline?: boolean;
  // VS20: Agent 结局的结构化状态；done 事件携带的正是落库的那份（实时/回放同源）。
  agent_results?: Record<string, StoredAgentResult>;
  degraded_reasons?: string[];
  error?: string;
  message?: string;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * VS13：计算某次 agent 级 SSE 事件对 Agent 卡片状态的影响（纯函数，便于单测）。
 *
 * 仅处理 `agent_started` / `agent_completed` / `agent_failed` 三种事件；`role_key`
 * 不在 `AGENT_KEYS` 中时**原样返回**（返回同一引用 → React 跳过重渲染，语义与改动前
 * 的 `if (idx >= 0)` 守卫等价）。
 *
 * 之所以抽出来：这三种状态迁移在改动前**没有测试覆盖**（switch 内联在流回调里），
 * 而 `agent_failed` 缺分支正是由此逃逸的。项目内既有同类先例见 `swarm.test.ts` 的
 * `applySwarmEvent`。
 */
export function applyAgentEvent(
  agents: ResearchAgent[],
  event: 'agent_started' | 'agent_completed' | 'agent_failed',
  agentKey: string | undefined,
  failMessage?: string,
): ResearchAgent[] {
  const idx = AGENT_KEYS.indexOf(agentKey ?? '');
  if (idx < 0) return agents;
  const status: AgentStatus =
    event === 'agent_started' ? 'running' : event === 'agent_completed' ? 'completed' : 'failed';
  return agents.map((agent, i) =>
    i === idx
      ? { ...agent, status, ...(event === 'agent_failed' && failMessage ? { progress: failMessage } : {}) }
      : agent
  );
}

/**
 * G-03: 从 done 事件解析报告质量。
 * 后端 done_payload 把 quality 放在**顶层**（与 report 平级）；历史/落库形态则可能在
 * report 内部。两处都认，避免实时路径读空导致"生成不完整"警示不显示。
 */
export function resolveReportQuality(data: { quality?: unknown; report?: Record<string, unknown> | null }): 'audited' | 'degraded' {
  const raw = data.quality ?? data.report?.quality;
  return raw === 'degraded' ? 'degraded' : 'audited';
}

/**
 * VS27：整轮截止信号的**唯一读取点**（实时 done 与历史回放共用）。
 *
 * 后端 `research_orch.run_research` 把 `truncated_by_deadline` 同时写进
 * `done_payload`（顶层）与 `report_data` 内部（随报告落库）；落库形态在回放时
 * 是 `report_data.truncated_by_deadline`。两处都读、同源同口径：
 * **只有显式 `true` 才算截断**（缺字段 = 未截断/历史报告，不得误报）。
 */
export function resolveTruncatedByDeadline(
  data: { truncated_by_deadline?: unknown; report?: Record<string, unknown> | null } | null | undefined,
): boolean {
  return (data?.truncated_by_deadline ?? data?.report?.truncated_by_deadline) === true;
}

// ==================== VS20：Agent 结局的结构化判据 ====================

/** 历史兜底哨兵：仅用于**没有**结构化状态的旧报告（不得作为主判据）。 */
const FAILURE_SENTINEL = '【分析失败】';
const AGENT_FAILED = 'failed';
const AGENT_DEGRADED = 'degraded';
const AGENT_COMPLETED = 'completed';

/** 单个 Agent 在回放时的结局。 */
export type AgentReplayOutcome = {
  /** 卡片状态；'unknown' = 无任何证据（既无结构化状态、也无事件/哨兵），不得当成"完成"。 */
  status: 'completed' | 'failed' | 'unknown';
  /** 产出仍在，但过程有残缺（工具失败 / 循环耗尽 / 截断 / 主编无法解析）。 */
  degraded: boolean;
  /** 自由文本原因摘要（如 error 文本、哨兵后的文本）；未记录时为 undefined。 */
  reason?: string;
  /** 结构化原因码（后端 agent_reasons / degraded_reasons）。 */
  degradedReasons?: string[];
};

/**
 * VS20：把原因文本压成**一行可读摘要**。
 * 异常堆栈（Traceback / File "..." 行）不得直接塞给用户，故丢弃这些行并截断。
 */
export function summarizeReason(raw: unknown, maxLength = 120): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const readable = lines.find((line) => !/^Traceback\b/.test(line) && !/^File\s+"/.test(line));
  if (!readable) return undefined;
  const compact = readable.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact;
}

/** 结局 → 展示用原因；返回 undefined 表示**确实没有记录**（界面须显示"原因未记录"）。 */
export function describeOutcomeReason(outcome: AgentReplayOutcome, t: Translate): string | undefined {
  if (outcome.reason) return outcome.reason;
  return describeDegradedReasons(outcome.degradedReasons ?? [], t);
}

type AgentEventSignal = { failed?: string; degradedReasons?: string[] };

/** 从落库事件中提取每个 Agent 的失败/降级信号（历史报告的兜底来源）。 */
function collectAgentEventSignals(events?: ResearchReportEvent[] | null): Record<string, AgentEventSignal> {
  const signals: Record<string, AgentEventSignal> = {};
  for (const event of events ?? []) {
    const payload = event?.payload ?? undefined;
    const key = payload?.role_key ?? payload?.agent ?? event?.agent_role_key ?? undefined;
    if (typeof key !== 'string' || !key) continue;
    const signal = (signals[key] ??= {});
    if (event?.event_type === 'agent_failed' && signal.failed === undefined) {
      // 失败是终态：同一 key 之后即便还有 agent_completed（旧实现会多发一条），也不得翻回完成。
      signal.failed = summarizeReason(payload?.error ?? payload?.message) ?? '';
    } else if (event?.event_type === 'agent_completed') {
      const reasons = asReasonCodes(payload?.degraded_reasons);
      if (reasons.length) signal.degradedReasons = reasons;
    }
  }
  return signals;
}

function buildOutcome(
  status: AgentReplayOutcome['status'],
  degraded: boolean,
  reason?: string,
  degradedReasons?: string[],
): AgentReplayOutcome {
  const outcome: AgentReplayOutcome = { status, degraded };
  if (reason) outcome.reason = reason;
  if (degradedReasons?.length) outcome.degradedReasons = degradedReasons;
  return outcome;
}

function deriveAgentOutcome(result: StoredAgentResult | undefined, signal: AgentEventSignal | undefined): AgentReplayOutcome {
  const structured = typeof result?.status === 'string' ? result.status : undefined;

  // ① 结构化状态是**主判据**：即便 content 仍带历史哨兵，也以它为准
  //    （否则"两个条件或起来"会让哨兵继续当主判据）。
  if (structured === AGENT_FAILED) {
    return buildOutcome('failed', false, summarizeReason(result?.error) ?? signal?.failed);
  }
  if (structured === AGENT_DEGRADED) {
    const codes = asReasonCodes(result?.degraded_reasons);
    return buildOutcome(
      'completed',
      true,
      summarizeReason(result?.error),
      codes.length ? codes : signal?.degradedReasons,
    );
  }
  if (structured === AGENT_COMPLETED) {
    return buildOutcome('completed', false);
  }

  // ② 无结构化状态（本次改动前落库的历史报告）→ 事件 → 内容哨兵，逐级兜底。
  if (signal?.failed !== undefined) {
    return buildOutcome('failed', false, signal.failed || undefined);
  }
  if (signal?.degradedReasons?.length) {
    return buildOutcome('completed', true, undefined, signal.degradedReasons);
  }
  const content = result?.content;
  if (typeof content === 'string' && content.startsWith(FAILURE_SENTINEL)) {
    return buildOutcome('failed', false, summarizeReason(content.slice(FAILURE_SENTINEL.length)));
  }
  if (typeof content === 'string' && content.trim()) {
    return buildOutcome('completed', false);
  }

  // ③ 无任何证据：不得默认成"完成"（错误场景 2）。
  return buildOutcome('unknown', false);
}

/** 回放判据入口：结构化优先，事件/哨兵仅作历史兜底。 */
export function deriveAgentOutcomes(
  results?: Record<string, StoredAgentResult> | null,
  events?: ResearchReportEvent[] | null,
): Record<string, AgentReplayOutcome> {
  const signals = collectAgentEventSignals(events);
  const outcomes: Record<string, AgentReplayOutcome> = {};
  for (const key of AGENT_KEYS) {
    outcomes[key] = deriveAgentOutcome(results?.[key], signals[key]);
  }
  return outcomes;
}

/** 界面上的"环节异常/降级"提示条目。 */
export type AgentNotice = {
  key: string;
  kind: 'failed' | 'degraded' | 'unknown';
  reason?: string;
};

function outcomeToNotice(key: string, outcome: AgentReplayOutcome, t: Translate): AgentNotice | null {
  if (outcome.status === 'completed' && !outcome.degraded) return null;
  const kind: AgentNotice['kind'] =
    outcome.status === 'failed' ? 'failed' : outcome.status === 'unknown' ? 'unknown' : 'degraded';
  return { key, kind, reason: describeOutcomeReason(outcome, t) };
}

/**
 * VS20：由结构化结局生成提示列表——**实时 done 路径与回放路径共用同一函数**，
 * 两者读的是同一份 agent_results，因此口径天然一致。
 */
export function noticesFromOutcomes(
  outcomes: Record<string, AgentReplayOutcome>,
  t: Translate,
): AgentNotice[] {
  return AGENT_KEYS
    .map((key) => outcomeToNotice(key, outcomes[key], t))
    .filter((notice): notice is AgentNotice => notice !== null);
}

/** 实时路径：把单条 SSE 事件累积成提示（失败是终态，不被后续事件覆盖）。 */
function upsertNotice(
  notices: AgentNotice[],
  key: string | undefined,
  kind: AgentNotice['kind'],
  reason?: string,
): AgentNotice[] {
  if (!key || !AGENT_KEYS.includes(key)) return notices;
  const existing = notices.find((notice) => notice.key === key);
  if (existing?.kind === 'failed') return notices;
  const next: AgentNotice = { key, kind, ...(reason ? { reason } : {}) };
  return existing ? notices.map((notice) => (notice.key === key ? next : notice)) : [...notices, next];
}

export function reportToMarkdown(report: Record<string, unknown>, t: Translate): string {
  // G-03: 主编降级沿用原有文案（零回归）；任一环节失败的降级（quality）用通用文案，
  // 避免把"agent 环节失败"误述成"主编审计未完成"。
  const leadDegraded = report.lead_review_status === 'degraded';
  const qualityDegraded = report.quality === 'degraded';
  const degradedPrefix = leadDegraded
    ? `**${t('deep.report.degradedNotice')}**\n\n---\n\n`
    : qualityDegraded
      ? `**${t('deep.report.qualityDegraded')}**\n\n---\n\n`
      : '';
  if (Array.isArray(report.chapters)) {
    return degradedPrefix + report.chapters
      .filter((chapter): chapter is { title: string; content: string } => (
        typeof chapter === 'object' && chapter !== null
        && typeof (chapter as { title?: unknown }).title === 'string'
        && typeof (chapter as { content?: unknown }).content === 'string'
      ))
      .map((chapter) => `## ${chapter.title}\n${chapter.content}`)
      .join('\n\n');
  }
  const sections: [string, string][] = [
    [t('deep.section.executive'), 'executive_summary'], [t('deep.section.business'), 'business_model_analysis'],
    [t('deep.section.financial'), 'financial_analysis'], [t('deep.section.industry'), 'industry_analysis'],
    [t('deep.section.risk'), 'risk_analysis'], [t('deep.section.technical'), 'technical_analysis'], [t('deep.section.verdict'), 'verdict'],
  ];
  const body = sections
    .map(([title, key]) => report[key] ? `## ${title}\n${String(report[key])}` : '')
    .filter(Boolean)
    .join('\n\n');
  return degradedPrefix + body;
}

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*.*?\*\*)/).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  );
}

// ==================== 简单 Markdown 渲染 ====================
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements = lines.map((line, i) => {
    // 标题
    if (line.startsWith('### ')) return <h4 className="research-report-prose__heading research-report-prose__heading--minor" key={i}>{line.slice(4)}</h4>;
    if (line.startsWith('## ')) return <h3 className="research-report-prose__heading research-report-prose__heading--section" key={i}>{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h2 className="research-report-prose__heading research-report-prose__heading--chapter" key={i}>{line.slice(2)}</h2>;
    // 列表
    if (line.startsWith('- ')) return <div className="research-report-prose__list-item" key={i}>• {renderInlineMarkdown(line.slice(2))}</div>;
    if (/^\d+\.\s/.test(line)) return <div className="research-report-prose__list-item" key={i}>{renderInlineMarkdown(line)}</div>;
    // 分隔线
    if (line.startsWith('---')) return <hr className="research-report-prose__divider" key={i} />;
    // 空行
    if (!line.trim()) return <div className="research-report-prose__gap" key={i} />;
    // 普通段落
    return <Paragraph className="research-report-prose__paragraph" key={i}>{renderInlineMarkdown(line)}</Paragraph>;
  });
  return <div className="research-report-prose">{elements}</div>;
}

function splitReportLayers(content: string): { summary: string; evidence: string } {
  const blocks = content.split(/(?=^##\s)/m).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) return { summary: '', evidence: '' };
  const summaryBlocks = blocks.filter((block) => /^##\s+(执行摘要|综合结论|风险提示|Executive Summary|Verdict|Risk Notes)/i.test(block));
  const selectedSummary = summaryBlocks.length ? summaryBlocks : blocks.slice(0, 1);
  return {
    summary: selectedSummary.join('\n\n'),
    evidence: blocks.filter((block) => !selectedSummary.includes(block)).join('\n\n'),
  };
}

// ==================== 页面组件 ====================
export default function Research({ initialTicker }: { initialTicker?: string } = {}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReportId = Number(searchParams.get('report'));
  const currentModelId = useModelStore((state) => state.currentModelId);
  const [ticker, setTicker] = useState(initialTicker?.trim() || searchParams.get('symbol') || '');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<ResearchAgent[]>([]);
  const [reportContent, setReportContent] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [done, setDone] = useState(false);
  // G-03: 报告质量（audited/degraded）——任一环节失败时屏上诚实提示"内容可能不完整"。
  const [reportQuality, setReportQuality] = useState<'audited' | 'degraded' | null>(null);
  // VS27: 整轮是否因超过总时长上限提前结束（实时 done 与回放读同一字段，见 resolveTruncatedByDeadline）。
  const [truncatedByDeadline, setTruncatedByDeadline] = useState(false);
  // VS20: "哪个 Agent 失败/被降级、为什么"——实时与回放共用同一批提示条目。
  const [agentNotices, setAgentNotices] = useState<AgentNotice[]>([]);
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await apiClient.get('/research/history');
      setHistory(response.data.items ?? []);
    } catch (error: any) {
      message.error(error.message || t('deep.history.loadFailed'));
    } finally {
      setHistoryLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // 初始化 agent 状态
  const resetAgents = useCallback(() => {
    setAgents(AGENT_KEYS.map((key) => ({
      name: t(AGENT_LABELS[key]?.nameKey ?? key),
      role: t(AGENT_LABELS[key]?.roleKey ?? key),
      status: 'pending' as AgentStatus,
    })));
  }, [t]);

  const openStoredReport = useCallback(async (id: number) => {
    try {
      const response = await apiClient.get(`/research/${id}`);
      const report = response.data as StoredReportDetail;
      setSelectedReportId(id);
      setTicker(report.ticker);
      setReportTitle(t('deep.report.title', { name: (report.report_data.company_name as string | undefined) ?? report.company_name ?? report.ticker }));
      setReportContent(reportToMarkdown(report.report_data, t));
      setReportQuality(report.report_data.quality === 'degraded' ? 'degraded' : 'audited');
      // VS27: 回放同样要看得见"本轮提前结束"——读的是同一份落库 report_data。
      setTruncatedByDeadline(resolveTruncatedByDeadline(report.report_data));
      setDone(report.status === 'completed');
      // VS20: 回放判据改为**读结构化信号**（agent_results[key].status / error /
      // degraded_reasons），事件与 `【分析失败】` 哨兵仅作历史报告兜底——
      // 主编失败时 content 是空串，哨兵必然落空，重开会误显示"完成"。
      const outcomes = deriveAgentOutcomes(report.agent_results, report.events);
      setAgents(AGENT_KEYS.map((key) => {
        const outcome = outcomes[key];
        const reason = outcome.status === 'failed' ? describeOutcomeReason(outcome, t) : undefined;
        return {
          name: t(AGENT_LABELS[key]?.nameKey ?? key),
          role: t(AGENT_LABELS[key]?.roleKey ?? key),
          // 无证据（unknown）不得默认成"完成"，落到 pending（未运行/未知）。
          status: (outcome.status === 'failed' ? 'failed' : outcome.status === 'completed' ? 'completed' : 'pending') as AgentStatus,
          ...(reason ? { progress: reason } : {}),
        };
      }));
      setAgentNotices(noticesFromOutcomes(outcomes, t));
    } catch (error: any) {
      message.error(error.message || t('deep.report.loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (Number.isInteger(requestedReportId) && requestedReportId > 0) void openStoredReport(requestedReportId);
  }, [openStoredReport, requestedReportId]);

  const downloadReport = useCallback(async (format: 'html' | 'md' | 'pdf' | 'docx') => {
    if (!selectedReportId) return;
    try {
      const response = await apiClient.get(`/research/${selectedReportId}/export`, {
        params: { format }, responseType: 'blob',
      });
      const disposition = response.headers['content-disposition'] as string | undefined;
      const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
        ?? `research-report.${format}`;
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      message.error(error.message || t('deep.export.failed'));
    }
  }, [selectedReportId, t]);

  const saveAsThesis = useCallback(async () => {
    if (!selectedReportId) return;
    try {
      const response = await apiClient.post(`/thesis/from-report/${selectedReportId}`);
      message.success(t('deep.thesis.saved', { id: response.data.id }));
      navigate(`/research?mode=thesis&id=${response.data.id}`);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : t('deep.thesis.failed'));
    }
  }, [navigate, selectedReportId, t]);

  // 开始研究
  const handleStart = useCallback(async () => {
    const code = ticker.trim();
    if (!code) { message.warning(t('deep.ticker.required')); return; }

    setRunning(true);
    setDone(false);
    setReportContent('');
    setReportTitle('');
    setReportQuality(null);
    setSelectedReportId(null);
    setAgentNotices([]);
    setTruncatedByDeadline(false);
    resetAgents();

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: code, model_id: currentModelId ?? undefined }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: t('deep.request.default') }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      let accContent = '';
      let streamCompleted = false;

      await readSSE<ResearchStreamData>(response.body, ({ event, data }) => {
        // Research orchestration emits `agent`; older discussion endpoints
        // used `role_key`. Accept both so progress is never stranded.
        const agentKey = data.agent ?? data.role_key;
        switch (event) {
          case 'report_started': {
            setSelectedReportId(data.report_id ?? null);
            void loadHistory();
            break;
          }
          case 'agent_started': {
            setAgents((prev) => applyAgentEvent(prev, 'agent_started', agentKey));
            break;
          }
          case 'agent_completed': {
            setAgents((prev) => applyAgentEvent(prev, 'agent_completed', agentKey));
            // VS20: 工具异常/循环耗尽导致的降级原因随该事件下发（此前只喂给模型，
            // 界面只知道报告级"可能不完整"，不知道是哪个 Agent、为什么）。
            // 只有**确有降级原因**时才登记——正常完成的事件不得生成"原因未记录"条目。
            const degradedReasons = data.degraded_reasons ?? [];
            if (degradedReasons.length) {
              const degradedReason = describeOutcomeReason({ status: 'completed', degraded: true, degradedReasons }, t);
              setAgentNotices((prev) => upsertNotice(prev, agentKey, 'degraded', degradedReason));
            }
            break;
          }
          // VS13: 后端在"单个 Agent 失败但整轮继续"时发的是非致命的 agent_failed
          // （agent LLMError / node_failed 两条路径都用它）。此前无此分支 ⇒ 该卡片被
          // agent_started 置为 running 后再无人终结，会一直转圈（下方流未完成兜底只在
          // 流未正常结束时生效，正常 done 覆盖不到）。此处镜像 error 分支的按 Agent 处理，
          // 但**不**弹全局 message.error——它不代表整轮失败，报告仍会完成并显示降级横幅。
          case 'agent_failed': {
            const failMessage = data.error ?? data.message ?? t('deep.request.failed');
            setAgents((prev) => applyAgentEvent(prev, 'agent_failed', agentKey, failMessage));
            // VS20: 失败原因（可读摘要）进入提示列表，与回放侧同一展示。
            setAgentNotices((prev) => upsertNotice(prev, agentKey, 'failed', summarizeReason(failMessage)));
            break;
          }
          case 'report_progress': {
            setReportContent(t('deep.progress.integrating', { name: data.name ?? t('deep.progress.processing') }));
            break;
          }
          case 'done': {
            // G-03: quality 由后端 done_payload 顶层携带（不在 report 内），
            // 同时兼容历史/落库形态的 report.quality，避免实时路径读空导致警示不显示。
            const quality = resolveReportQuality(data);
            const report: Record<string, unknown> = { ...(data.report ?? {}), quality };
            setReportTitle(t('deep.report.title', { name: String(report.company_name ?? code) }));
            accContent = reportToMarkdown(report, t);
            setReportContent(accContent || t('deep.report.empty'));
            setReportQuality(quality);
            // VS27: 整轮截止触发时，用户必须**在屏上**看到"提前结束了"，而不是以为还在跑/卡死。
            // 读的是后端 done 载荷里与落库同一份的信号。
            setTruncatedByDeadline(resolveTruncatedByDeadline(data));
            setDone(true);
            // VS20: ①实时最终态与回放同源——done 携带的 agent_results 就是落库内容，
            // 用它重算提示列表，保证重开这份报告看到的东西与此刻一致。
            // 无 agent_results（如历史/其他管线）时保留事件累积出来的提示，不清空。
            if (data.agent_results && Object.keys(data.agent_results).length > 0) {
              setAgentNotices(noticesFromOutcomes(deriveAgentOutcomes(data.agent_results, null), t));
            }
            streamCompleted = true;
            setRunning(false);
            void loadHistory();
            break;
          }
          case 'error': {
            const errorMessage = data.error ?? data.message ?? t('deep.request.failed');
            const idx = AGENT_KEYS.indexOf(agentKey ?? '');
            if (idx >= 0) setAgents((prev) => prev.map((agent, i) => i === idx ? { ...agent, status: 'failed' as AgentStatus, progress: errorMessage } : agent));
            else message.error(errorMessage);
            break;
          }
        }
      }, t('deep.stream.missing'));
      if (!streamCompleted && !abortRef.current.signal.aborted) {
        setAgents((prev) => prev.map((agent) => agent.status === 'running'
          ? { ...agent, status: 'failed' as AgentStatus, progress: t('deep.stream.interruptedStage') }
          : agent));
        setReportContent((current) => current || t('deep.stream.interruptedContent'));
        message.error(t('deep.stream.interruptedError'));
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || t('deep.request.failed'));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [ticker, currentModelId, loadHistory, resetAgents, t]);

  // 停止
  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const reportLayers = splitReportLayers(reportContent);
  const planSteps: AgentRunStep[] = AGENT_KEYS.map((key, index) => ({
    title: t(AGENT_LABELS[key]?.nameKey ?? key),
    status: agents[index]?.status === 'running'
      ? 'process'
      : agents[index]?.status === 'completed'
        ? 'finish'
        : agents[index]?.status === 'failed'
          ? 'error'
          : 'wait',
  }));
  const completedSteps = agents.filter((agent) => agent.status === 'completed').length;
  const activeAgent = agents.find((agent) => agent.status === 'running');
  const planProgress = running || done || agents.length
    ? Math.round(((completedSteps + (activeAgent ? 0.5 : 0)) / AGENT_KEYS.length) * 100)
    : null;
  const planActivity = activeAgent?.name
    ? t('deep.plan.activityRunning', { name: activeAgent.name })
    : done
      ? t('deep.plan.activityCompleted')
      : t('deep.plan.activityIdle');

  // ==================== 渲染 ====================
  return (
    <div className="research-report-page">
      <Title className="research-report-page__title" level={4}>{t('deep.page.title')}</Title>
      <Text className="research-report-page__subtitle" type="secondary">
        {t('deep.page.subtitle')}
      </Text>

      {/* 输入区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          type="warning"
          showIcon
          message={t('deep.page.quota')}
          style={{ marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            aria-label={t('deep.page.placeholder')}
            placeholder={t('deep.page.placeholder')}
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onPressEnter={!running ? handleStart : undefined}
            style={{ width: 240 }}
            disabled={running}
            allowClear
          />
          {running ? (
            <Button danger onClick={handleStop}>{t('deep.page.stop')}</Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!ticker.trim()}>
              {t('deep.page.start')}
            </Button>
          )}
        </div>
      </Card>

      <ResearchPlan
        title={t('deep.plan.title')}
        progress={planProgress}
        steps={planSteps}
        sources={null}
        activity={planActivity}
      />

      {/* Agent 进度 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {AGENT_KEYS.map((key, i) => {
          const agent = agents[i];
          const info = AGENT_LABELS[key];
          const status = agent?.status === 'running' ? 'running' : agent?.status === 'completed' ? 'completed' : agent?.status === 'failed' ? 'failed' : 'waiting';
          return (
            <Col xs={12} sm={6} key={key}>
              <AgentStatusCard
                name={t(info?.nameKey ?? key)}
                role={t(info?.roleKey ?? key)}
                status={status}
                stage={agent?.progress}
              />
            </Col>
          );
        })}
      </Row>

      {/* 报告输出 */}
      {(running || done || reportContent) ? (
        <div className="research-report-layout">
          <div className="research-report-layout__content">
          {/* G-03: 报告诚实质量提示——任一环节失败的降级报告在屏上明示，不让用户误以为完整。 */}
          {done && reportQuality === 'degraded' ? (
            <Alert
              type="warning"
              message={t('deep.report.qualityDegraded')}
              role="status"
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {/* VS27: 整轮截止（"等太久"）的可见回执——这是本信号的**消费方**。
              不加这条，`truncated_by_deadline` 就只是"字段存在"（VS-23 反面教材：
              chat 的同名字段在 frontend 全库零消费方）。 */}
          {done && truncatedByDeadline ? (
            <Alert
              type="warning"
              message={t('deep.report.truncatedByDeadline')}
              role="status"
              data-testid="research-truncated-by-deadline"
              style={{ marginBottom: 12 }}
            />
          ) : null}
          {/* VS20: "哪个 Agent 失败/被降级 + 原因摘要"。实时与回放同源；原因确未记录时
              如实显示"原因未记录"，不用"可能不完整"含糊过去，也不编造原因。 */}
          {agentNotices.length > 0 ? (
            <Alert
              type="warning"
              role="status"
              message={t('deep.agent.noticeTitle')}
              style={{ marginBottom: 12 }}
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {agentNotices.map((notice) => (
                    <li key={notice.key}>
                      {t(`deep.agent.notice.${notice.kind}`, {
                        name: t(AGENT_LABELS[notice.key]?.nameKey ?? notice.key),
                        reason: notice.reason ?? t('deep.agent.reasonUnrecorded'),
                      })}
                    </li>
                  ))}
                </ul>
              }
            />
          ) : null}
          <ResultLayer
            layer="summary"
            title={t('deep.summary.title')}
            description={t('deep.summary.description')}
            actions={selectedReportId && done ? (
              <Space size={4} wrap>
                <Popconfirm
                  title={t('deep.thesis.confirmTitle')}
                  description={t('deep.thesis.confirmDescription')}
                  okText={t('deep.thesis.confirm')}
                  cancelText={t('deep.thesis.cancel')}
                  onConfirm={() => void saveAsThesis()}
                >
                  <Button size="small" icon={<FileTextOutlined />}>{t('deep.thesis.create')}</Button>
                </Popconfirm>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => void downloadReport('html')}>HTML</Button>
                <Button size="small" onClick={() => void downloadReport('md')}>MD</Button>
                <Button size="small" onClick={() => void downloadReport('pdf')}>PDF</Button>
                <Button size="small" onClick={() => void downloadReport('docx')}>Word</Button>
              </Space>
            ) : undefined}
          >
            <ResearchArtifact
              type="Research Report"
              state={done ? 'ready' : running ? 'streaming' : 'draft'}
              title={reportTitle || t('deep.artifact.runningTitle')}
              summary={t('deep.artifact.summary')}
              evidence={[{ kind: 'MODEL_OUTPUT', quality: done ? 'PARTIAL' : 'UNKNOWN', title: reportTitle || t('deep.artifact.evidenceTitle'), detail: t('deep.artifact.evidenceDetail'), source: null, asOf: null } satisfies EvidenceRecord]}
            >
              {reportLayers.summary ? <MarkdownContent content={reportLayers.summary} /> : <div style={{ textAlign: 'center', padding: 40 }}><Spin /><div style={{ marginTop: 12 }}>{t('deep.artifact.waiting')}</div></div>}
            </ResearchArtifact>
          </ResultLayer>

          <ResultLayer layer="evidence" title={t('deep.evidence.title')}>
            <Card size="small">
              {reportLayers.evidence ? <MarkdownContent content={reportLayers.evidence} /> : <Empty description={t('deep.evidence.empty')} />}
            </Card>
          </ResultLayer>

          <ResultLayer layer="method">
            <Card size="small">
              <Descriptions column={{ xs: 1, md: 3 }} size="small">
                <Descriptions.Item label={t('deep.method.ticker')}>{ticker || t('deep.common.unknown')}</Descriptions.Item>
                <Descriptions.Item label={t('deep.method.version')}>{selectedReportId ? `#${selectedReportId}` : t('deep.method.unsaved')}</Descriptions.Item>
                <Descriptions.Item label={t('deep.method.model')}>{currentModelId ? `#${currentModelId}` : t('deep.method.defaultModel')}</Descriptions.Item>
                <Descriptions.Item label={t('deep.method.roles')}>{t('deep.method.completedCount', { completed: agents.filter((agent) => agent.status === 'completed').length, total: AGENT_KEYS.length })}</Descriptions.Item>
                <Descriptions.Item label={t('deep.method.contentType')}>MODEL_OUTPUT</Descriptions.Item>
                <Descriptions.Item label={t('deep.method.status')}>{done ? t('deep.status.completed') : running ? t('deep.status.running') : t('deep.status.incomplete')}</Descriptions.Item>
              </Descriptions>
              <Alert type="warning" showIcon message={t('deep.method.warning')} />
            </Card>
          </ResultLayer>
          </div>
          <aside className="research-report-rail" aria-label={t('deep.rail.aria')}>
            <span className="research-report-rail__eyebrow">{t('deep.reportReading')}</span>
            <h2>{t('deep.rail.title')}</h2>
            <ol>
              <li><strong>{t('deep.rail.summaryLabel')}</strong><span>{t('deep.rail.summaryDescription')}</span></li>
              <li><strong>{t('deep.rail.evidenceLabel')}</strong><span>{t('deep.rail.evidenceDescription')}</span></li>
              <li><strong>{t('deep.rail.methodLabel')}</strong><span>{t('deep.rail.methodDescription')}</span></li>
            </ol>
            <p>{t('deep.rail.note')}</p>
          </aside>
        </div>
      ) : (
        <Card size="small" style={{ minHeight: 200 }}>
          <Empty description={t('deep.empty')} />
        </Card>
      )}

      <Card
        size="small"
        title={t('deep.history.title')}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={historyLoading} onClick={() => void loadHistory()}>{t('deep.history.refresh')}</Button>}
        style={{ marginTop: 16 }}
      >
        <Collapse
          items={history.map((group) => ({
            key: group.ticker,
            label: <span>{group.company_name || group.ticker} <Text type="secondary">{group.ticker}</Text> <Tag color="blue">{t('deep.history.versionCount', { count: group.run_count })}</Tag></span>,
            extra: <Text type="secondary">{t('deep.history.latest', { time: group.latest_at })}</Text>,
            children: (
              <List
                size="small"
                dataSource={group.runs}
                renderItem={(item, index) => (
                  <List.Item actions={[<Button key="open" type="link" onClick={() => void openStoredReport(item.id)}>{t('deep.history.open')}</Button>]}>
                    <List.Item.Meta
                      title={t('deep.history.version', { version: group.run_count - index })}
                      description={`${item.created_at} · ${item.status === 'completed' ? t('deep.status.completed') : item.status === 'running' ? t('deep.status.running') : t('deep.status.failed')}${item.model_id ? ` · ${t('deep.history.model', { id: item.model_id })}` : ''}`}
                    />
                    {selectedReportId === item.id && <Tag color="blue">{t('deep.history.current')}</Tag>}
                  </List.Item>
                )}
              />
            ),
          }))}
        />
        {!historyLoading && history.length === 0 && <Empty description={t('deep.history.empty')} />}
      </Card>

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fq-text-tertiary)', marginTop: 24 }}>
        {t('deep.disclaimer')}
      </div>
    </div>
  );
}
