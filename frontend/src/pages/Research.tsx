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
import apiClient from '../services/api';
import { readSSE } from '../services/sse';
import { useModelStore } from '../store/modelStore';
import ResultLayer from '../components/ResultLayer';
import AgentStatusCard from '../components/AgentStatusCard';
import ResearchArtifact from '../components/ResearchArtifact';
import type { EvidenceRecord } from '../components/EvidenceDrawer';
import { useLanguage } from '../i18n/LanguageContext';
import ResearchPlan, { type AgentRunStep } from '../components/ResearchPlan';

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

type StoredReportDetail = StoredReport & {
  report_data: Record<string, unknown>;
  agent_results?: Record<string, { content?: string }>;
  events?: { event_type: string; created_at: string }[];
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
  error?: string;
  message?: string;
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * G-03: 从 done 事件解析报告质量。
 * 后端 done_payload 把 quality 放在**顶层**（与 report 平级）；历史/落库形态则可能在
 * report 内部。两处都认，避免实时路径读空导致"生成不完整"警示不显示。
 */
export function resolveReportQuality(data: { quality?: unknown; report?: Record<string, unknown> | null }): 'audited' | 'degraded' {
  const raw = data.quality ?? data.report?.quality;
  return raw === 'degraded' ? 'degraded' : 'audited';
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
      const resultMap = report.agent_results ?? {};
      setSelectedReportId(id);
      setTicker(report.ticker);
      setReportTitle(t('deep.report.title', { name: (report.report_data.company_name as string | undefined) ?? report.company_name ?? report.ticker }));
      setReportContent(reportToMarkdown(report.report_data, t));
      setReportQuality(report.report_data.quality === 'degraded' ? 'degraded' : 'audited');
      setDone(report.status === 'completed');
      setAgents(AGENT_KEYS.map((key) => ({
        name: t(AGENT_LABELS[key]?.nameKey ?? key),
        role: t(AGENT_LABELS[key]?.roleKey ?? key),
        status: resultMap[key]?.content?.startsWith('【分析失败】') ? 'failed' as AgentStatus : 'completed' as AgentStatus,
      })));
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
            const idx = AGENT_KEYS.indexOf(agentKey ?? '');
            if (idx >= 0) {
              setAgents((prev) => prev.map((a, i) =>
                i === idx ? { ...a, status: 'running' as AgentStatus } : a
              ));
            }
            break;
          }
          case 'agent_completed': {
            const idx2 = AGENT_KEYS.indexOf(agentKey ?? '');
            if (idx2 >= 0) {
              setAgents((prev) => prev.map((a, i) =>
                i === idx2 ? { ...a, status: 'completed' as AgentStatus } : a
              ));
            }
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
            setDone(true);
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
