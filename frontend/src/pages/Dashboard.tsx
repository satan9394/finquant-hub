/* ============================================================
 * Dashboard — 系统总览页
 * ============================================================ */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, Card, Row, Col, Empty, Statistic, List, Typography, Input, Button, message, Modal, Space, Tag, Progress } from 'antd';
import {
  RobotOutlined, MessageOutlined, TeamOutlined, CommentOutlined,
  PlusOutlined, ReloadOutlined, RiseOutlined, FallOutlined, SearchOutlined, FundOutlined,
  ExperimentOutlined, UploadOutlined, WalletOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { fetchKLine, fetchQuote, searchStocks } from '../services/stockApi';
import { useModelStore } from '../store/modelStore';
import StockChart from '../components/StockChart';
import ChinaMap from '../components/ChinaMap';
import CountUp from '../components/CountUp';
import ScrollingTable from '../components/ScrollingTable';
import MarketMoversPanel from '../components/MarketMoversPanel';
import { fetchPortfolioSummary } from '../services/analysisApi';
import {
  PRODUCT_PROGRESS_EVENT, readProductProgress, setProductHelpDismissed,
} from '../features/productProgress';
import type { DashboardStats, RealTimeQuote, SearchResult, PortfolioSummary } from '../types';

const { Text, Title } = Typography;

// ---------- 自选股本地存储 ----------
const WATCHLIST_KEY = 'finquant_watchlist';

interface WatchItem {
  code: string;
  name: string;
}

interface WatchlistImportResult {
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  items: WatchItem[];
  failures: Array<{ input: string; reason: string }>;
}

interface DecisionEvidenceRef {
  evidence_id: string;
  kind: string;
  data_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR';
  source?: string | null;
  as_of?: string | null;
  retrieved_at: string;
}

export interface DecisionInboxItem {
  id: string;
  kind: 'thesis_claim_change' | 'thesis_version_review' | 'scheduled_research_failure';
  priority: 'high' | 'medium' | 'low';
  why_now: string;
  occurred_at?: string | null;
  object_ref: { type: string; id: number; title: string; ticker?: string; status?: string; path: string };
  evidence_refs: DecisionEvidenceRef[];
  quality_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR';
  next_action: { kind: 'navigate'; label: string; path: string };
}

const inboxQualityColor = { OK: 'green', PARTIAL: 'orange', UNKNOWN: 'default', UPSTREAM_ERROR: 'red' } as const;
const inboxPriorityLabel = { high: '高优先级', medium: '中优先级', low: '低优先级' } as const;

export function DecisionInboxPanel({
  items, loading, error, onRetry, onNavigate,
}: {
  items: DecisionInboxItem[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onNavigate: (path: string) => void;
}) {
  return (
    <section aria-labelledby="decision-inbox-title" style={{ marginBottom: 16 }}>
      <Card title={<span id="decision-inbox-title">今日决策收件箱</span>} loading={loading}>
        {error ? (
          <Alert type="error" showIcon message="决策收件箱加载失败" description={error} action={<Button onClick={onRetry}>重试</Button>} />
        ) : (
          <List
            dataSource={items}
            locale={{ emptyText: <Empty description="今天没有需要复核的用户对象变化" /> }}
            renderItem={(item) => (
              <List.Item>
                <Row gutter={[12, 12]} style={{ width: '100%' }} align="middle">
                  <Col xs={24} md={18}>
                    <Space direction="vertical" size={5} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'orange' : 'default'}>{inboxPriorityLabel[item.priority]}</Tag>
                        <Tag color={inboxQualityColor[item.quality_status]}>{item.quality_status}</Tag>
                        <Text strong>{item.object_ref.title}</Text>
                        {item.object_ref.ticker ? <Tag>{item.object_ref.ticker}</Tag> : null}
                      </Space>
                      <Text>{item.why_now}</Text>
                      <Text type="secondary">时间：{item.occurred_at || 'UNKNOWN'}</Text>
                      {item.evidence_refs.length ? item.evidence_refs.map((ref) => (
                        <Text type="secondary" key={ref.evidence_id}>
                          证据 {ref.evidence_id} · {ref.source || 'UNKNOWN'} · {ref.as_of || ref.retrieved_at} · {ref.data_status}
                        </Text>
                      )) : <Text type="secondary">canonical evidence：UNKNOWN</Text>}
                    </Space>
                  </Col>
                  <Col xs={24} md={6}>
                    <Button block type="primary" onClick={() => onNavigate(item.next_action.path)}>{item.next_action.label}</Button>
                  </Col>
                </Row>
              </List.Item>
            )}
          />
        )}
      </Card>
    </section>
  );
}

export function LocalCapabilityBanner({
  capabilities, onNavigate,
}: {
  capabilities: DashboardStats['capabilities'];
  onNavigate: (path: string) => void;
}) {
  const modelConfigured = capabilities.model_ai.status === 'CONFIGURED_UNVERIFIED';
  return (
    <Alert
      type={modelConfigured ? 'info' : 'warning'}
      showIcon
      style={{ marginBottom: 16 }}
      message={modelConfigured ? '模型凭据已配置，连通性尚未验证' : '本地核心已可用，AI 模型尚未配置'}
      description={(
        <Space direction="vertical" size={4}>
          <Text>
            本地核心：AVAILABLE / OK · 模型：{capabilities.model_ai.status} / UNKNOWN · 行情：RUNTIME_CHECK_REQUIRED / UNKNOWN
          </Text>
          <Text type="secondary">
            {modelConfigured
              ? '配置存在不等于上游可用；请在模型管理中由你显式执行当次连通性测试。'
              : '应用无需模型 key 也能启动；聊天、讨论和 AI 研究需要先配置凭据。行情只在具体请求时按来源与质量状态判断。'}
          </Text>
        </Space>
      )}
      action={(
        <Button onClick={() => onNavigate(capabilities.model_ai.action_path)}>
          {modelConfigured ? '去模型管理测试' : '配置模型'}
        </Button>
      )}
    />
  );
}

export function MarketSignalAvailability({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div aria-label="市场信号可用性">
      <Space size={8} wrap>
        <Tag>UNKNOWN</Tag>
        <Text strong>暂无可审计的跨标的信号汇总</Text>
      </Space>
      <div style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          技术事件只在具体标的分析时计算；UNKNOWN 不代表近期没有信号。
        </Text>
      </div>
      <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => onNavigate('/analysis/600519')}>
        分析示例 600519
      </Button>
    </div>
  );
}

function loadWatchlist(): WatchItem[] {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
  } catch { return []; }
}

function saveWatchlist(items: WatchItem[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

export default function Dashboard() {
  const navigate = useNavigate();
  const theme = 'light'; // 由 Settings 页控制，简化
  const currentModel = useModelStore((s) => s.currentModel);
  const currentModelId = useModelStore((s) => s.currentModelId);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [productProgress, setProductProgress] = useState(readProductProgress);
  const [decisionItems, setDecisionItems] = useState<DecisionInboxItem[]>([]);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [decisionError, setDecisionError] = useState('');

  // 自选股行情
  const [watchlist, setWatchlist] = useState<WatchItem[]>(loadWatchlist);
  const [quotes, setQuotes] = useState<Record<string, RealTimeQuote>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<WatchlistImportResult | null>(null);

  // 投资组合摘要（仪表盘概览）
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);

  // 快速分析入口
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisResults, setAnalysisResults] = useState<SearchResult[]>([]);

  // 加载统计
  const loadStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/dashboard/stats');
      setStats(res.data);
    } catch { /* stats not critical */ }
    finally { setLoading(false); }
  }, []);

  const loadDecisionInbox = useCallback(async () => {
    setDecisionLoading(true);
    setDecisionError('');
    try {
      const response = await apiClient.get('/dashboard/decision-inbox');
      setDecisionItems(response.data.items as DecisionInboxItem[]);
    } catch (error: unknown) {
      setDecisionItems([]);
      setDecisionError(error instanceof Error ? error.message : '无法读取个性化变化');
    } finally {
      setDecisionLoading(false);
    }
  }, []);

  // 加载投资组合摘要
  const loadPortfolioSummary = useCallback(async () => {
    try {
      const s = await fetchPortfolioSummary();
      setPortfolioSummary(s);
    } catch { /* 后端尚未实现时为静默失败 */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { void loadDecisionInbox(); }, [loadDecisionInbox]);
  useEffect(() => { loadPortfolioSummary(); }, [loadPortfolioSummary]);
  useEffect(() => {
    const syncProgress = () => setProductProgress(readProductProgress());
    window.addEventListener(PRODUCT_PROGRESS_EVENT, syncProgress);
    window.addEventListener('storage', syncProgress);
    return () => {
      window.removeEventListener(PRODUCT_PROGRESS_EVENT, syncProgress);
      window.removeEventListener('storage', syncProgress);
    };
  }, []);

  // 加载自选股行情
  const refreshQuotes = useCallback(async () => {
    if (watchlist.length === 0) return;
    const newQuotes: Record<string, RealTimeQuote> = {};
    await Promise.all(
      watchlist.map(async (item) => {
        try {
          const q = await fetchQuote(item.code);
          newQuotes[item.code] = q;
        } catch { /* ignore */ }
      })
    );
    setQuotes((prev) => ({ ...prev, ...newQuotes }));
  }, [watchlist]);

  useEffect(() => {
    refreshQuotes();
    const timer = setInterval(refreshQuotes, 10000);
    return () => clearInterval(timer);
  }, [refreshQuotes]);

  // 搜索股票（自选股添加用）
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await searchStocks(q);
      setSearchResults(res);
    } catch { setSearchResults([]); }
  }, []);

  // 搜索股票（快速分析用）
  const handleAnalysisSearch = useCallback(async (q: string) => {
    setAnalysisQuery(q);
    if (!q.trim()) { setAnalysisResults([]); return; }
    try {
      const res = await searchStocks(q);
      setAnalysisResults(res);
    } catch { setAnalysisResults([]); }
  }, []);

  // 跳转到分析页
  const goToAnalysis = async (code: string) => {
    setAnalysisQuery('');
    setAnalysisResults([]);
    try {
      const bars = await fetchKLine(code, '1d', 60);
      if (bars.length < 30) throw new Error('历史数据不足');
      navigate(`/analysis/${code}`);
    } catch {
      message.warning(`${code.toUpperCase()} 暂无足够历史 K 线，不能进入分析或回测；请换用“可回测”标的。`);
    }
  };

  // 添加到自选股
  const addToWatchlist = (code: string, name: string) => {
    if (watchlist.find((w) => w.code === code)) {
      message.info('已在自选股中');
      return;
    }
    const newList = [...watchlist, { code, name }];
    setWatchlist(newList);
    saveWatchlist(newList);
    setSearchResults([]);
    setSearchQuery('');
    message.success(`已添加 ${name}`);
  };

  // 从自选股移除
  const removeFromWatchlist = (code: string) => {
    const newList = watchlist.filter((w) => w.code !== code);
    setWatchlist(newList);
    saveWatchlist(newList);
  };

  const openWatchlistImport = () => {
    setImportText('');
    setImportFile(null);
    setImportResult(null);
    setImportOpen(true);
  };

  const importWatchlist = async () => {
    if (!importText.trim() && !importFile) {
      message.warning('请粘贴自选股文本或选择文件');
      return;
    }
    const payload = new FormData();
    payload.append('text', importText);
    payload.append('existing', JSON.stringify(watchlist.map((item) => item.code)));
    if (importFile) payload.append('file', importFile);
    setImportLoading(true);
    try {
      const response = await apiClient.post<WatchlistImportResult>('/dashboard/watchlist/import', payload);
      const result = response.data;
      const next = [...watchlist, ...result.items];
      setWatchlist(next);
      saveWatchlist(next);
      setImportResult(result);
      if (result.success > 0) message.success(`成功导入 ${result.success} 个标的`);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const statsCards = [
    { icon: <RobotOutlined />, title: '模型总数', value: stats?.model_count ?? 0, color: '#722ed1' },
    { icon: <MessageOutlined />, title: '会话数', value: stats?.conversation_count ?? 0, color: '#1890ff' },
    { icon: <TeamOutlined />, title: '讨论数', value: stats?.discussion_count ?? 0, color: '#13c2c2' },
    { icon: <CommentOutlined />, title: '消息数', value: stats?.message_count ?? 0, color: '#52c41a' },
  ];

  const formatAmount = (value: number) => value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const hasPortfolioData = portfolioSummary !== null;
  const totalProfit = portfolioSummary?.total_profit ?? 0;
  const totalProfitPercent = portfolioSummary?.total_profit_percent ?? 0;
  const profitTone = totalProfit > 0 ? 'red' : totalProfit < 0 ? 'green' : 'cyan';
  const screenMetrics = [
    {
      label: '组合市值',
      value: hasPortfolioData ? portfolioSummary.total_current : null,
      prefix: '¥', decimals: 2,
      detail: hasPortfolioData ? `投入 ¥${formatAmount(portfolioSummary.total_invested)}` : '等待组合数据',
      tone: 'cyan',
    },
    {
      label: '累计收益',
      value: hasPortfolioData ? totalProfit : null,
      prefix: totalProfit > 0 ? '+¥' : '¥', decimals: 2,
      detail: hasPortfolioData ? `${totalProfitPercent > 0 ? '+' : ''}${totalProfitPercent.toFixed(2)}%` : '等待组合数据',
      // A-share convention: gains are red and losses are green.
      tone: profitTone,
    },
    {
      label: '组合数量',
      value: hasPortfolioData ? portfolioSummary.group_summaries.length : null,
      detail: '已纳入组合追踪',
      tone: 'blue',
    },
    {
      label: '市场信号',
      value: null,
      detail: '跨标的聚合 UNKNOWN',
      tone: 'violet',
    },
  ];
  const exchangeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    watchlist.forEach(({ code }) => {
      const ticker = code.trim().toUpperCase();
      const province = ticker.endsWith('.SH') || /^6\d{5}$/.test(ticker) ? '上海市'
        : ticker.endsWith('.SZ') || /^[03]\d{5}$/.test(ticker) ? '广东省'
          : ticker.endsWith('.BJ') || /^[48]\d{5}$/.test(ticker) ? '北京市'
            : ticker.endsWith('.HK') || /^\d{5}$/.test(ticker) ? '香港特别行政区'
              : null;
      if (province) counts.set(province, (counts.get(province) ?? 0) + 1);
    });
    return Array.from(counts, ([name, value]) => ({ name, value }));
  }, [watchlist]);

  const coreTasks = [
    {
      key: 'analysis', icon: <FundOutlined />, area: '研究', title: '分析股票',
      question: '这家公司值得继续研究吗？',
      result: '从真实行情、技术信号和基本面证据开始。',
      run: () => navigate('/research'),
      example: '贵州茅台 · 600519', exampleAria: '示例分析 600519',
      runExample: () => navigate('/analysis/600519'),
    },
    {
      key: 'strategy', icon: <ExperimentOutlined />, area: '策略', title: '验证策略',
      question: '这个想法经得起历史检验吗？',
      result: '运行含基准、成本和稳健性检查的真实回测。',
      run: () => navigate('/strategy-lab/ma-crossover'),
      example: '贵州茅台 · MA20/50', exampleAria: '示例回测 600519',
      runExample: () => navigate('/strategy-lab/ma-crossover?symbol=600519'),
    },
    {
      key: 'portfolio', icon: <WalletOutlined />, area: '组合', title: '查看组合',
      question: '我的持仓表现和配置怎样？',
      result: '查看真实盈亏、持仓和当前配置，继续完善组合。',
      run: () => navigate('/portfolio'),
      example: '贵州茅台 · 10 股', exampleAria: '示例组合 600519',
      runExample: () => navigate('/portfolio?example=600519'),
    },
  ];
  const progressSteps = [
    { key: 'analysis', label: '首次分析', done: productProgress.analysis },
    { key: 'backtest', label: '首次回测', done: productProgress.backtest },
    { key: 'saved', label: '首次保存', done: productProgress.saved },
  ];
  const completedProgress = progressSteps.filter((step) => step.done).length;

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 16 }}>系统总览</Title>

      {stats?.capabilities ? <LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} /> : null}

      <DecisionInboxPanel
        items={decisionItems}
        loading={decisionLoading}
        error={decisionError}
        onRetry={() => void loadDecisionInbox()}
        onNavigate={navigate}
      />

      <section className="task-launchpad" aria-labelledby="task-launchpad-title">
        <div className="task-launchpad__header">
          <div>
            <Text className="task-launchpad__eyebrow">从真实问题开始</Text>
            <h2 id="task-launchpad-title">今天想完成什么？</h2>
          </div>
          <Text type="secondary">选择一项任务，先得到可验证的结果，再继续深入。</Text>
        </div>
        <div className="task-launchpad__progress" aria-label={`首次任务进度 ${completedProgress}/3`}>
          <div className="task-launchpad__progress-heading">
            <Text strong>首次任务进度 {completedProgress}/3</Text>
            <Button
              type="link"
              size="small"
              onClick={() => setProductHelpDismissed(!productProgress.helpDismissed)}
            >
              {productProgress.helpDismissed ? '显示提示' : '不再提示'}
            </Button>
          </div>
          <Progress percent={Math.round((completedProgress / 3) * 100)} showInfo={false} size="small" />
          <div className="task-launchpad__steps">
            {progressSteps.map((step) => (
              <span className={step.done ? 'is-done' : ''} key={step.key}>
                {step.done ? '已完成' : '待完成'} · {step.label}
              </span>
            ))}
          </div>
          {!productProgress.helpDismissed && (
            <Text className="task-launchpad__hint">建议先试用 600519；真实结果出现后自动更新，本地进度不会记录标的或结果内容。</Text>
          )}
        </div>
        <div className="task-launchpad__grid">
          {coreTasks.map((task) => (
            <article className="task-launchpad__card" key={task.key}>
              <span className="task-launchpad__icon" aria-hidden="true">{task.icon}</span>
              <div className="task-launchpad__copy">
                <Text type="secondary">{task.area}</Text>
                <h3>{task.question}</h3>
                <p>{task.result}</p>
                <Text className="task-launchpad__example">示例：{task.example}</Text>
              </div>
              <div className="task-launchpad__actions">
                <Button type="primary" onClick={task.run}>{task.title}</Button>
                <Button aria-label={task.exampleAria} onClick={task.runExample}>试用 600519</Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="big-screen-overview" aria-labelledby="big-screen-title">
        <div className="big-screen-overview__header">
          <div>
            <span className="big-screen-overview__eyebrow">FINQUANT DATA CENTER</span>
            <h2 id="big-screen-title">大屏概览</h2>
            <p>组合、信号与研究活动的实时监控面板</p>
          </div>
          <div className="big-screen-overview__status" aria-label="数据状态：已同步">
            <span /> 数据已同步
          </div>
        </div>
        <div className="big-screen-overview__metrics">
          {screenMetrics.map((metric) => (
            <div className={`big-screen-metric big-screen-metric--${metric.tone}`} key={metric.label}>
              <span className="big-screen-metric__label">{metric.label}</span>
              <strong className="big-screen-metric__value">
                {metric.value == null ? '—' : <CountUp value={metric.value} prefix={metric.prefix} decimals={metric.decimals} />}
              </strong>
              <span className="big-screen-metric__detail">{metric.detail}</span>
            </div>
          ))}
        </div>
        <div className="big-screen-live-grid">
          <div className="big-screen-panel">
            <h3>组合实时排行</h3>
            <ScrollingTable
              rows={portfolioSummary?.group_summaries ?? []}
              rowKey={(row) => String(row.group_id)}
              columns={[
                { key: 'name', title: '组合', render: (row) => row.group_name },
                { key: 'value', title: '市值', render: (row) => `¥${formatAmount(row.current)}` },
                { key: 'profit', title: '收益', render: (row) => <span style={{ color: row.profit >= 0 ? '#ff8594' : '#78e6b3' }}>{row.profit >= 0 ? '+' : ''}{row.profit_percent.toFixed(2)}%</span> },
              ]}
            />
          </div>
          <div className="big-screen-panel">
            <h3>自选标的交易市场覆盖</h3>
            <ChinaMap data={exchangeDistribution} title="自选标的交易市场覆盖" />
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              用它核对自选是否只集中在沪、深、北或港的单一交易规则；它不代表公司经营地域，也不能替代行业分散化分析。
            </Text>
          </div>
        </div>
        <div className="big-screen-overview__footer">
          <span>数据源：投资组合、信号中心与本地自选列表；地图表示交易所所在地，不代表公司注册地</span>
          <button type="button" onClick={() => navigate('/portfolio')}>查看投资组合 <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <MarketMoversPanel
        watchCodes={watchlist.map((item) => item.code)}
        onAdd={addToWatchlist}
        onAnalyze={goToAnalysis}
      />

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {statsCards.map((card) => (
          <Col xs={12} sm={6} key={card.title}>
            <Card hoverable>
              <Statistic
                title={card.title}
                value={card.value}
                prefix={<span style={{ color: card.color }}>{card.icon}</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 投资组合与信号概览 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 投资组合盈亏 */}
        <Col xs={24} md={12}>
          <Card title="投资组合概览" size="small" hoverable
            extra={<Button type="link" size="small" onClick={() => navigate('/portfolio')}>查看详情</Button>}
          >
            {portfolioSummary ? (
              <div>
                <Statistic
                  title="总盈亏"
                  value={portfolioSummary.total_profit}
                  precision={2}
                  prefix={portfolioSummary.total_profit > 0 ? <RiseOutlined /> : portfolioSummary.total_profit < 0 ? <FallOutlined /> : undefined}
                  valueStyle={{ color: portfolioSummary.total_profit > 0 ? '#f23645' : portfolioSummary.total_profit < 0 ? '#089981' : '#64748b', fontFamily: 'monospace' }}
                  suffix={<span style={{ fontSize: 14, fontWeight: 400 }}>({portfolioSummary.total_profit_percent.toFixed(2)}%)</span>}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>投入: ¥{portfolioSummary.total_invested.toFixed(2)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>市值: ¥{portfolioSummary.total_current.toFixed(2)}</Text>
                </div>
                {portfolioSummary.group_summaries?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {portfolioSummary.group_summaries.map((g) => (
                      <div key={g.group_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                        <span>{g.group_name}</span>
                        <span style={{ color: g.profit > 0 ? '#f23645' : g.profit < 0 ? '#089981' : '#64748b', fontFamily: 'monospace' }}>
                          {g.profit > 0 ? '+' : ''}{g.profit.toFixed(2)} ({g.profit_percent.toFixed(2)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无投资组合数据</Text>
            )}
          </Card>
        </Col>

        {/* 信号概览 */}
        <Col xs={24} md={12}>
          <Card title="信号概览" size="small">
            <MarketSignalAvailability onNavigate={navigate} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 近期会话 */}
        <Col xs={24} md={12}>
          <Card title="近期会话" size="small" extra={
            <Button type="link" onClick={() => navigate('/chat')}>查看全部</Button>
          }>
            <List
              size="small"
              dataSource={stats?.recent_conversations?.slice(0, 5) || []}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/chat')}
                >
                  <Text ellipsis>{item.title || `会话 #${item.id}`}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{item.last_message?.slice(0, 30)}</Text>
                </List.Item>
              )}
              locale={{ emptyText: '暂无会话' }}
            />
          </Card>
        </Col>

        {/* 近期讨论 */}
        <Col xs={24} md={12}>
          <Card title="近期讨论" size="small" extra={
            <Button type="link" onClick={() => navigate('/discussion')}>查看全部</Button>
          }>
            <List
              size="small"
              dataSource={stats?.recent_rooms?.slice(0, 5) || []}
              renderItem={(item) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/discussion')}
                >
                  <Text ellipsis>{item.topic}</Text>
                  <Tag color={item.current_phase === 'done' ? 'green' : item.current_phase === 'failed' ? 'red' : 'blue'}>
                    {item.current_phase === 'done' ? '已完成' : item.current_phase === 'failed' ? '失败，可重试' : '进行中'}
                  </Tag>
                </List.Item>
              )}
              locale={{ emptyText: '暂无讨论' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 快速入口 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="快速入口" size="small">
            <Row gutter={[12, 12]}>
              <Col><Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/chat')}>发起对话</Button></Col>
              <Col><Button icon={<TeamOutlined />} onClick={() => navigate('/discussion')}>创建讨论</Button></Col>
              <Col><Button icon={<RobotOutlined />} onClick={() => navigate('/models')}>管理模型</Button></Col>
              <Col><Button icon={<FundOutlined />} onClick={() => navigate('/research')}>深度研究</Button></Col>
              <Col><Button icon={<ReloadOutlined />} onClick={loadStats}>刷新</Button></Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 快速分析入口 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title="快速个股分析" size="small" extra={
            <Text type="secondary" style={{ fontSize: 11 }}>输入股票代码或名称，一键进入分析页</Text>
          }>
            <div style={{ position: 'relative' }}>
              <Input.Search
                placeholder="例如 600519 或 贵州茅台"
                value={analysisQuery}
                onChange={(e) => handleAnalysisSearch(e.target.value)}
                onSearch={(val) => val && goToAnalysis(val)}
                enterButton={<><SearchOutlined /> 分析</>}
                style={{ maxWidth: 400 }}
              />
              {analysisResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: 40, left: 0, width: 400, zIndex: 100,
                  background: '#fff', border: '1px solid #f0f0f0', borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  {analysisResults.slice(0, 6).map((item) => (
                    <div
                      key={item.code}
                      onClick={() => goToAnalysis(item.code)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Text strong>{item.name}</Text>
                      <Text style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{item.code}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 自选股行情面板 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title="自选股行情"
            size="small"
            extra={
              <Space>
                <Button size="small" icon={<UploadOutlined />} onClick={openWatchlistImport}>导入</Button>
                <Button size="small" icon={<ReloadOutlined />} onClick={refreshQuotes}>刷新</Button>
              </Space>
            }
          >
            {/* 搜索添加 */}
            <Input.Search
              placeholder="输入股票代码/名称搜索"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ marginBottom: 12, width: 300 }}
            />
            {searchResults.length > 0 && (
              <List
                size="small"
                dataSource={searchResults.slice(0, 5)}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button size="small" type="link" onClick={() => addToWatchlist(item.code, item.name)}>添加</Button>
                    ]}
                  >
                    <Text>{item.name} ({item.code})</Text>
                  </List.Item>
                )}
                style={{ marginBottom: 12, border: '1px solid #f0f0f0', borderRadius: 4, maxWidth: 400 }}
              />
            )}

            {/* 自选股列表 */}
            <Row gutter={[12, 12]}>
              {watchlist.map((item) => {
                const q = quotes[item.code];
                const isUp = (q?.change_percent ?? 0) >= 0;
                return (
                  <Col xs={12} sm={8} md={6} key={item.code}>
                    <Card
                      size="small"
                      hoverable
                      actions={[
                        <Button key="backtest" type="link" size="small" onClick={() => navigate(`/strategy-lab/ma-crossover?symbol=${encodeURIComponent(item.code)}`)}>回测</Button>,
                        <Button type="link" size="small" danger onClick={() => removeFromWatchlist(item.code)}>删除</Button>
                      ]}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{item.code}</div>
                        {q ? (
                          <>
                            <div style={{ fontSize: 18, fontWeight: 700, color: isUp ? '#f23645' : '#089981', fontFamily: 'monospace' }}>
                              {q.price.toFixed(2)}
                            </div>
                            <div style={{ fontSize: 12, color: isUp ? '#f23645' : '#089981' }}>
                              {q.change >= 0 ? '+' : ''}{q.change.toFixed(2)} ({q.change_percent.toFixed(2)}%)
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#aaa', fontSize: 12 }}>加载中...</div>
                        )}
                      </div>
                    </Card>
                  </Col>
                );
              })}
              {watchlist.length === 0 && (
                <Col span={24}>
                  <div style={{ textAlign: 'center', color: '#aaa', padding: 20 }}>
                    暂无自选股，请搜索添加
                  </div>
                </Col>
              )}
            </Row>

            {/* 显示第一个自选股的K线 */}
            {watchlist.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <StockChart ticker={watchlist[0].code} theme={theme} height={300} />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="批量导入自选股"
        open={importOpen}
        okText="开始导入"
        cancelText="关闭"
        confirmLoading={importLoading}
        onOk={importWatchlist}
        onCancel={() => setImportOpen(false)}
      >
        <Typography.Paragraph type="secondary">
          粘贴逗号或换行分隔的代码、中文名称或拼音，也可上传 CSV、TXT、XLSX（最大 5MB）。图片 OCR 暂列 P3。
        </Typography.Paragraph>
        <Input.TextArea
          rows={6}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={'例如：\n600519, 腾讯控股\nAAPL\nmaotai'}
        />
        <div style={{ marginTop: 12 }}>
          <input
            type="file"
            aria-label="选择自选股导入文件"
            accept=".csv,.txt,.xlsx"
            onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
          />
        </div>
        {importResult && (
          <Alert
            style={{ marginTop: 12 }}
            type={importResult.failed > 0 ? 'warning' : 'success'}
            showIcon
            message={`成功 ${importResult.success} · 重复 ${importResult.duplicate} · 失败 ${importResult.failed}`}
            description={importResult.failures.slice(0, 5).map((item) => `${item.input}：${item.reason}`).join('；') || undefined}
          />
        )}
      </Modal>

      {/* AI 免责声明 */}
      <div style={{ textAlign: 'center', fontSize: 11, color: '#bbb', marginTop: 24 }}>
        此内容由 AI 生成，不构成投资建议
      </div>
    </div>
  );
}
