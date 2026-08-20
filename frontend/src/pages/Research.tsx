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

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// ==================== Agent 定义 ====================
const AGENT_KEYS = ['business_analyst', 'financial_analyst', 'industry_researcher', 'risk_assessor', 'report_lead'];

const AGENT_LABELS: Record<string, { name: string; role: string; icon: string }> = {
  business_analyst: { name: '商业模式', role: '业务、护城河与竞争力', icon: '🏢' },
  financial_analyst: { name: '财务分析', role: '估值与财务健康度', icon: '📊' },
  industry_researcher: { name: '行业研究', role: '产业链与行业周期', icon: '🔬' },
  risk_assessor: { name: '风险评估', role: '独立识别投资风险', icon: '🛡️' },
  report_lead: { name: '投研主编', role: '综合评审与 13 章定稿', icon: '🧠' },
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
  error?: string;
  message?: string;
};

function reportToMarkdown(report: Record<string, unknown>): string {
  if (Array.isArray(report.chapters)) {
    return report.chapters
      .filter((chapter): chapter is { title: string; content: string } => (
        typeof chapter === 'object' && chapter !== null
        && typeof (chapter as { title?: unknown }).title === 'string'
        && typeof (chapter as { content?: unknown }).content === 'string'
      ))
      .map((chapter) => `## ${chapter.title}\n${chapter.content}`)
      .join('\n\n');
  }
  const sections: [string, string][] = [
    ['执行摘要', 'executive_summary'], ['商业模式', 'business_model_analysis'],
    ['财务分析', 'financial_analysis'], ['行业分析', 'industry_analysis'],
    ['风险提示', 'risk_analysis'], ['技术分析说明', 'technical_analysis'], ['综合结论', 'verdict'],
  ];
  return sections
    .map(([title, key]) => report[key] ? `## ${title}\n${String(report[key])}` : '')
    .filter(Boolean)
    .join('\n\n');
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
  const summaryBlocks = blocks.filter((block) => /^##\s+(执行摘要|综合结论|风险提示)/.test(block));
  const selectedSummary = summaryBlocks.length ? summaryBlocks : blocks.slice(0, 1);
  return {
    summary: selectedSummary.join('\n\n'),
    evidence: blocks.filter((block) => !selectedSummary.includes(block)).join('\n\n'),
  };
}

// ==================== 页面组件 ====================
export default function Research() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedReportId = Number(searchParams.get('report'));
  const currentModelId = useModelStore((state) => state.currentModelId);
  const [ticker, setTicker] = useState(searchParams.get('symbol') ?? '');
  const [running, setRunning] = useState(false);
  const [agents, setAgents] = useState<ResearchAgent[]>([]);
  const [reportContent, setReportContent] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [done, setDone] = useState(false);
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
      message.error(error.message || '加载研究历史失败');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // 初始化 agent 状态
  const resetAgents = useCallback(() => {
    setAgents(AGENT_KEYS.map((key) => ({
      name: AGENT_LABELS[key]?.name ?? key,
      role: AGENT_LABELS[key]?.role ?? '',
      status: 'pending' as AgentStatus,
    })));
  }, []);

  const openStoredReport = useCallback(async (id: number) => {
    try {
      const response = await apiClient.get(`/research/${id}`);
      const report = response.data as StoredReportDetail;
      const resultMap = report.agent_results ?? {};
      setSelectedReportId(id);
      setTicker(report.ticker);
      setReportTitle(`${(report.report_data.company_name as string | undefined) ?? report.company_name ?? report.ticker} 研究报告`);
      setReportContent(reportToMarkdown(report.report_data));
      setDone(report.status === 'completed');
      setAgents(AGENT_KEYS.map((key) => ({
        name: AGENT_LABELS[key]?.name ?? key,
        role: AGENT_LABELS[key]?.role ?? '',
        status: resultMap[key]?.content?.startsWith('【分析失败】') ? 'failed' as AgentStatus : 'completed' as AgentStatus,
      })));
    } catch (error: any) {
      message.error(error.message || '加载研究报告失败');
    }
  }, []);

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
      message.error(error.message || '导出失败，请稍后重试');
    }
  }, [selectedReportId]);

  const saveAsThesis = useCallback(async () => {
    if (!selectedReportId) return;
    try {
      const response = await apiClient.post(`/thesis/from-report/${selectedReportId}`);
      message.success(`已存为投资论文 #${response.data.id}`);
      navigate(`/thesis?id=${response.data.id}`);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '存为投资论文失败');
    }
  }, [navigate, selectedReportId]);

  // 开始研究
  const handleStart = useCallback(async () => {
    const code = ticker.trim();
    if (!code) { message.warning('请输入股票代码'); return; }

    setRunning(true);
    setDone(false);
    setReportContent('');
    setReportTitle('');
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
        const errData = await response.json().catch(() => ({ detail: '请求失败' }));
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
            setReportContent(`正在整合报告：${data.name ?? '处理中'}`);
            break;
          }
          case 'done': {
            const report = data.report ?? {};
            setReportTitle(`${report.company_name ?? code} 研究报告`);
            accContent = reportToMarkdown(report);
            setReportContent(accContent || '报告生成完成，但没有可展示的正文。');
            setDone(true);
            streamCompleted = true;
            setRunning(false);
            void loadHistory();
            break;
          }
          case 'error': {
            const errorMessage = data.error ?? data.message ?? '研究请求失败';
            const idx = AGENT_KEYS.indexOf(agentKey ?? '');
            if (idx >= 0) setAgents((prev) => prev.map((agent, i) => i === idx ? { ...agent, status: 'failed' as AgentStatus, progress: errorMessage } : agent));
            else message.error(errorMessage);
            break;
          }
        }
      }, '研究服务未返回事件流');
      if (!streamCompleted && !abortRef.current.signal.aborted) {
        setAgents((prev) => prev.map((agent) => agent.status === 'running'
          ? { ...agent, status: 'failed' as AgentStatus, progress: '研究流意外中断' }
          : agent));
        setReportContent((current) => current || '研究服务在生成报告前中断，请重试。');
        message.error('研究服务在生成报告前中断');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        message.error(err.message || '研究请求失败');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [ticker, currentModelId, loadHistory, resetAgents]);

  // 停止
  const handleStop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const reportLayers = splitReportLayers(reportContent);

  // ==================== 渲染 ====================
  return (
    <div className="research-report-page">
      <Title className="research-report-page__title" level={4}>深度研究</Title>
      <Text className="research-report-page__subtitle" type="secondary">
        输入股票代码，由多智能体协同完成基本面、技术面综合分析并生成报告
      </Text>

      {/* 输入区 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          type="warning"
          showIcon
          message="模型额度：开始后将调用多个研究角色并整合报告，消耗相对较高；打开或预填本页不会运行。"
          style={{ marginBottom: 12 }}
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            placeholder="输入股票代码，如 600519"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onPressEnter={!running ? handleStart : undefined}
            style={{ width: 240 }}
            disabled={running}
            allowClear
          />
          {running ? (
            <Button danger onClick={handleStop}>停止</Button>
          ) : (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!ticker.trim()}>
              开始研究
            </Button>
          )}
        </div>
      </Card>

      {/* Agent 进度 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {AGENT_KEYS.map((key, i) => {
          const agent = agents[i];
          const info = AGENT_LABELS[key];
          const status = agent?.status === 'running' ? 'running' : agent?.status === 'completed' ? 'completed' : agent?.status === 'failed' ? 'failed' : 'waiting';
          return (
            <Col xs={12} sm={6} key={key}>
              <AgentStatusCard name={info?.name ?? key} role={info?.role} avatar={info?.icon} status={status} stage={agent?.progress} />
            </Col>
          );
        })}
      </Row>

      {/* 报告输出 */}
      {(running || done || reportContent) ? (
        <div className="research-report-layout">
          <div className="research-report-layout__content">
          <ResultLayer
            layer="summary"
            title="深度研究摘要"
            description="优先展示执行摘要、风险提示和综合结论。"
            actions={selectedReportId && done ? (
              <Space size={4} wrap>
                <Popconfirm
                  title="从这份报告创建投资论文？"
                  description="将保存报告核心结论，并生成价格、持仓、基本面和报告变化验证条件；创建后仍可编辑。"
                  okText="创建并查看"
                  cancelText="取消"
                  onConfirm={() => void saveAsThesis()}
                >
                  <Button size="small" icon={<FileTextOutlined />}>创建论文与验证条件</Button>
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
              title={reportTitle || '研究报告中...'}
              summary="模型整理的研究摘要；请沿证据和方法继续核验，不把模型输出当作事实。"
              evidence={[{ kind: 'MODEL_OUTPUT', quality: done ? 'PARTIAL' : 'UNKNOWN', title: reportTitle || '研究报告', detail: '报告由多角色研究流生成；来源与质量应按正文逐条核验。', source: null, asOf: null } satisfies EvidenceRecord]}
            >
              {reportLayers.summary ? <MarkdownContent content={reportLayers.summary} /> : <div style={{ textAlign: 'center', padding: 40 }}><Spin /><div style={{ marginTop: 12 }}>等待智能体返回摘要...</div></div>}
            </ResearchArtifact>
          </ResultLayer>

          <ResultLayer layer="evidence" title="报告证据与分析正文">
            <Card size="small">
              {reportLayers.evidence ? <MarkdownContent content={reportLayers.evidence} /> : <Empty description="报告尚未返回独立证据章节" />}
            </Card>
          </ResultLayer>

          <ResultLayer layer="method">
            <Card size="small">
              <Descriptions column={{ xs: 1, md: 3 }} size="small">
                <Descriptions.Item label="标的">{ticker || '未知'}</Descriptions.Item>
                <Descriptions.Item label="报告版本">{selectedReportId ? `#${selectedReportId}` : '尚未保存'}</Descriptions.Item>
                <Descriptions.Item label="模型">{currentModelId ? `#${currentModelId}` : '当前默认模型'}</Descriptions.Item>
                <Descriptions.Item label="参与角色">{agents.filter((agent) => agent.status === 'completed').length}/{AGENT_KEYS.length} 完成</Descriptions.Item>
                <Descriptions.Item label="内容类型">MODEL_OUTPUT</Descriptions.Item>
                <Descriptions.Item label="状态">{done ? '已完成' : running ? '生成中' : '未完成'}</Descriptions.Item>
              </Descriptions>
              <Alert type="warning" showIcon message="报告中的事实、来源和截止时间需按正文逐条核对；MODEL_OUTPUT 不能替代原始数据证据。" />
            </Card>
          </ResultLayer>
          </div>
          <aside className="research-report-rail" aria-label="报告阅读导航">
            <span className="research-report-rail__eyebrow">REPORT READING</span>
            <h2>先结论，后证据</h2>
            <ol>
              <li><strong>01 摘要</strong><span>执行摘要、综合结论与风险提示。</span></li>
              <li><strong>02 证据</strong><span>逐段展开分析、数据和来源线索。</span></li>
              <li><strong>03 方法</strong><span>确认版本、模型、角色与待核验项。</span></li>
            </ol>
            <p>数值、来源和不确定状态会保留在正文中，不用视觉美化掩盖数据边界。</p>
          </aside>
        </div>
      ) : (
        <Card size="small" style={{ minHeight: 200 }}>
          <Empty description={'输入股票代码并点击「开始研究」以生成深度分析报告'} />
        </Card>
      )}

      <Card
        size="small"
        title="研究历史与数据记录"
        extra={<Button size="small" icon={<ReloadOutlined />} loading={historyLoading} onClick={() => void loadHistory()}>刷新</Button>}
        style={{ marginTop: 16 }}
      >
        <Collapse
          items={history.map((group) => ({
            key: group.ticker,
            label: <span>{group.company_name || group.ticker} <Text type="secondary">{group.ticker}</Text> <Tag color="blue">{group.run_count} 个版本</Tag></span>,
            extra: <Text type="secondary">最近：{group.latest_at}</Text>,
            children: (
              <List
                size="small"
                dataSource={group.runs}
                renderItem={(item, index) => (
                  <List.Item actions={[<Button key="open" type="link" onClick={() => void openStoredReport(item.id)}>查看此版本</Button>]}>
                    <List.Item.Meta
                      title={`版本 ${group.run_count - index}`}
                      description={`${item.created_at} · ${item.status === 'completed' ? '已完成' : item.status === 'running' ? '进行中' : '失败'}${item.model_id ? ` · 模型 #${item.model_id}` : ''}`}
                    />
                    {selectedReportId === item.id && <Tag color="blue">当前查看</Tag>}
                  </List.Item>
                )}
              />
            ),
          }))}
        />
        {!historyLoading && history.length === 0 && <Empty description="暂无已保存的研究记录" />}
      </Card>

      {/* 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
