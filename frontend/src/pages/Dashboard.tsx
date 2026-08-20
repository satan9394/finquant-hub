/* FinQuant Workbench — quiet, evidence-first landing surface. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, List, Progress, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, FundOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { fetchMarketPulse } from '../services/marketDiscoveryApi';
import type { DashboardStats, MarketPulseResponse } from '../types';
import { PRODUCT_PROGRESS_EVENT, readProductProgress, setProductHelpDismissed } from '../features/productProgress';
import CommandBar from '../components/CommandBar';
import DecisionCard from '../components/DecisionCard';
import LatestNews, { type LatestNewsResponse } from '../components/LatestNews';
import MarketBrief from '../components/MarketBrief';

const { Text, Title } = Typography;
interface DecisionEvidenceRef { evidence_id: string; kind: string; data_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR'; source?: string | null; as_of?: string | null; retrieved_at: string }
export interface DecisionInboxItem { id: string; kind: 'thesis_claim_change' | 'thesis_version_review' | 'scheduled_research_failure'; priority: 'high' | 'medium' | 'low'; why_now: string; occurred_at?: string | null; object_ref: { type: string; id: number; title: string; ticker?: string; status?: string; path: string }; evidence_refs: DecisionEvidenceRef[]; quality_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR'; next_action: { kind: 'navigate'; label: string; path: string } }
const inboxPriorityLabel = { high: '高优先级', medium: '中优先级', low: '低优先级' } as const;

export function DecisionInboxPanel({ items, loading, error, onRetry, onNavigate }: { items: DecisionInboxItem[]; loading: boolean; error: string; onRetry: () => void; onNavigate: (path: string) => void }) {
  return <section aria-labelledby="decision-inbox-title" className="workbench-context-block"><Card title={<span id="decision-inbox-title">今日决策收件箱</span>} loading={loading}>{error ? <Alert type="error" showIcon message="决策收件箱加载失败" description={error} action={<Button onClick={onRetry}>重试</Button>} /> : <List dataSource={items} locale={{ emptyText: <Empty description="今天没有需要复核的用户对象变化" /> }} renderItem={(item) => <List.Item><DecisionCard type={item.priority === 'high' ? 'risk' : item.priority === 'medium' ? 'review' : 'opportunity'} title={`${item.object_ref.title}${item.object_ref.ticker ? ` · ${item.object_ref.ticker}` : ''}`} whyNow={item.why_now} impact={inboxPriorityLabel[item.priority]} dueAt={item.occurred_at} quality={item.quality_status} evidence={item.evidence_refs.map((ref) => ({ id: ref.evidence_id, kind: ref.kind === 'observed_fact' ? 'FACT' : 'UNKNOWN', quality: ref.data_status, source: ref.source, asOf: ref.as_of || ref.retrieved_at, title: ref.evidence_id, detail: `证据状态 ${ref.data_status}` }))} actionLabel={item.next_action.label} onAction={() => onNavigate(item.next_action.path)} /></List.Item>} />}</Card></section>;
}

export function LocalCapabilityBanner({ capabilities, onNavigate }: { capabilities: DashboardStats['capabilities']; onNavigate: (path: string) => void }) {
  const modelConfigured = capabilities.model_ai.status === 'CONFIGURED_UNVERIFIED';
  return <Alert type={modelConfigured ? 'info' : 'warning'} showIcon className="workbench-capabilities" message={modelConfigured ? '模型凭据已配置，连通性尚未验证' : '本地核心已可用，AI 模型尚未配置'} description={<Space direction="vertical" size={4}><Text>本地核心：AVAILABLE / OK · 模型：{capabilities.model_ai.status} / UNKNOWN · 行情：RUNTIME_CHECK_REQUIRED / UNKNOWN</Text><Text type="secondary">{modelConfigured ? '配置存在不等于上游可用；请在模型管理中由你显式执行当次连通性测试。' : '应用无需模型 key 也能启动；聊天、讨论和 AI 研究需要先配置凭据。'}</Text></Space>} action={<Button onClick={() => onNavigate(capabilities.model_ai.action_path)}>{modelConfigured ? '去模型管理测试' : '配置模型'}</Button>} />;
}

export function MarketSignalAvailability({ onNavigate }: { onNavigate: (path: string) => void }) {
  return <div aria-label="市场信号可用性"><Space size={8} wrap><Tag>UNKNOWN</Tag><Text strong>暂无可审计的跨标的信号汇总</Text></Space><div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>技术事件只在具体标的分析时计算；UNKNOWN 不代表近期没有信号。</Text></div><Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => onNavigate('/analysis/600519')}>分析示例 600519</Button></div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [productProgress, setProductProgress] = useState(readProductProgress);
  const [decisionItems, setDecisionItems] = useState<DecisionInboxItem[]>([]);
  const [decisionLoading, setDecisionLoading] = useState(true);
  const [decisionError, setDecisionError] = useState('');
  const [marketPulse, setMarketPulse] = useState<MarketPulseResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState('');
  const [latestNews, setLatestNews] = useState<LatestNewsResponse | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState('');

  const loadStats = useCallback(async () => { try { setStats((await apiClient.get('/dashboard/stats')).data); } catch { /* non-critical context */ } }, []);
  const loadDecisionInbox = useCallback(async () => { setDecisionLoading(true); setDecisionError(''); try { setDecisionItems((await apiClient.get('/dashboard/decision-inbox')).data.items as DecisionInboxItem[]); } catch (error: unknown) { setDecisionItems([]); setDecisionError(error instanceof Error ? error.message : '无法读取个性化变化'); } finally { setDecisionLoading(false); } }, []);
  const loadMarket = useCallback(async () => { setMarketLoading(true); setMarketError(''); try { setMarketPulse(await fetchMarketPulse(12, 8, 12)); } catch (error: unknown) { setMarketError(error instanceof Error ? error.message : '市场数据请求失败'); } finally { setMarketLoading(false); } }, []);
  const loadNews = useCallback(async () => { setNewsLoading(true); setNewsError(''); try { setLatestNews((await apiClient.get<LatestNewsResponse>('/dashboard/news', { params: { max_results: 6 } })).data); } catch (error: unknown) { setNewsError(error instanceof Error ? error.message : '最新消息请求失败'); } finally { setNewsLoading(false); } }, []);
  useEffect(() => { void loadStats(); void loadDecisionInbox(); void loadMarket(); void loadNews(); }, [loadStats, loadDecisionInbox, loadMarket, loadNews]);
  useEffect(() => { const sync = () => setProductProgress(readProductProgress()); window.addEventListener(PRODUCT_PROGRESS_EVENT, sync); window.addEventListener('storage', sync); return () => { window.removeEventListener(PRODUCT_PROGRESS_EVENT, sync); window.removeEventListener('storage', sync); }; }, []);

  const coreTasks = [
    { key: 'analysis', icon: <FundOutlined />, area: '研究', title: '分析股票', question: '这家公司值得继续研究吗？', result: '从真实行情、技术信号和基本面证据开始。', run: () => navigate('/research'), example: '贵州茅台 · 600519', exampleAria: '示例分析 600519', runExample: () => navigate('/analysis/600519') },
    { key: 'strategy', icon: <ExperimentOutlined />, area: '策略', title: '验证策略', question: '这个想法经得起历史检验吗？', result: '运行含基准、成本和稳健性检查的真实回测。', run: () => navigate('/strategy-lab/ma-crossover'), example: '贵州茅台 · MA20/50', exampleAria: '示例回测 600519', runExample: () => navigate('/strategy-lab/ma-crossover?symbol=600519') },
    { key: 'portfolio', icon: <WalletOutlined />, area: '组合', title: '查看组合', question: '我的持仓表现和配置怎样？', result: '查看真实盈亏、持仓和当前配置，继续完善组合。', run: () => navigate('/portfolio'), example: '贵州茅台 · 10 股', exampleAria: '示例组合 600519', runExample: () => navigate('/portfolio?example=600519') },
  ];
  const progressSteps = [{ key: 'analysis', label: '首次分析', done: productProgress.analysis }, { key: 'backtest', label: '首次回测', done: productProgress.backtest }, { key: 'saved', label: '首次保存', done: productProgress.saved }];
  const completedProgress = progressSteps.filter((step) => step.done).length;

  return <main className="workbench-page">
    <Title level={4} className="workbench-page__title">工作台</Title>
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title"><Text className="dashboard-hero__eyebrow">FINQUANT WORKBENCH · AI RESEARCH PARTNER</Text><Title id="dashboard-hero-title" level={2}>先说人话，从你想了解的公司开始</Title><Text className="dashboard-hero__subtitle">把问题交给研究伙伴，先得到可验证的结果，再决定下一步。</Text><CommandBar onNavigate={navigate} variant="hero" /></section>
    <section className="workbench-brief-grid" aria-label="市场与消息简报"><MarketBrief data={marketPulse} loading={marketLoading} error={marketError} /><LatestNews data={latestNews} loading={newsLoading} error={newsError} /></section>
    <DecisionInboxPanel items={decisionItems} loading={decisionLoading} error={decisionError} onRetry={() => void loadDecisionInbox()} onNavigate={navigate} />
    <section className="task-launchpad" aria-labelledby="task-launchpad-title"><div className="task-launchpad__header"><div><Text className="task-launchpad__eyebrow">从真实问题开始</Text><h2 id="task-launchpad-title">今天想完成什么？</h2></div><Text type="secondary">选择一项任务，先得到可验证的结果，再继续深入。</Text></div><div className="task-launchpad__progress" aria-label={`首次任务进度 ${completedProgress}/3`}><div className="task-launchpad__progress-heading"><Text strong>首次任务进度 {completedProgress}/3</Text><Button type="link" size="small" onClick={() => setProductHelpDismissed(!productProgress.helpDismissed)}>{productProgress.helpDismissed ? '显示提示' : '不再提示'}</Button></div><Progress percent={Math.round((completedProgress / 3) * 100)} showInfo={false} size="small" /><div className="task-launchpad__steps">{progressSteps.map((step) => <span className={step.done ? 'is-done' : ''} key={step.key}>{step.done ? '已完成' : '待完成'} · {step.label}</span>)}</div>{!productProgress.helpDismissed ? <Text className="task-launchpad__hint">建议先试用 600519；真实结果出现后自动更新，本地进度不会记录标的或结果内容。</Text> : null}</div><div className="task-launchpad__grid">{coreTasks.map((task) => <article className="task-launchpad__card" key={task.key}><span className="task-launchpad__icon" aria-hidden="true">{task.icon}</span><div className="task-launchpad__copy"><Text type="secondary">{task.area}</Text><h3>{task.question}</h3><p>{task.result}</p><Text className="task-launchpad__example">示例：{task.example}</Text></div><div className="task-launchpad__actions"><Button type="primary" onClick={task.run}>{task.title}</Button><Button aria-label={task.exampleAria} onClick={task.runExample}>试用 600519</Button></div></article>)}</div></section>
    {stats?.capabilities ? <LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} /> : null}
    <section className="workbench-context-grid" aria-label="个性化研究上下文"><Card title="近期会话" size="small" extra={<Button type="link" onClick={() => navigate('/chat')}>查看全部</Button>}><List size="small" dataSource={stats?.recent_conversations?.slice(0, 5) ?? []} renderItem={(item) => <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate('/chat')}><Text ellipsis>{item.title || `会话 #${item.id}`}</Text><Text type="secondary" style={{ fontSize: 11 }}>{item.last_message?.slice(0, 30)}</Text></List.Item>} locale={{ emptyText: '暂无会话' }} /></Card><Card title="近期讨论" size="small" extra={<Button type="link" onClick={() => navigate('/discussion')}>查看全部</Button>}><List size="small" dataSource={stats?.recent_rooms?.slice(0, 5) ?? []} renderItem={(item) => <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate('/discussion')}><Text ellipsis>{item.topic}</Text><Tag color={item.current_phase === 'done' ? 'green' : item.current_phase === 'failed' ? 'red' : 'blue'}>{item.current_phase === 'done' ? '已完成' : item.current_phase === 'failed' ? '失败，可重试' : '进行中'}</Tag></List.Item>} locale={{ emptyText: '暂无讨论' }} /></Card></section>
    <div className="workbench-footer-actions"><Space wrap><Button icon={<PlusOutlined />} onClick={() => navigate('/chat')}>发起对话</Button><Button icon={<TeamOutlined />} onClick={() => navigate('/discussion')}>创建讨论</Button><Button icon={<RobotOutlined />} onClick={() => navigate('/models')}>管理模型</Button><Button icon={<MessageOutlined />} onClick={() => { void loadStats(); void loadMarket(); void loadNews(); }}>刷新数据</Button><Button icon={<ReloadOutlined />} onClick={() => navigate('/research')}>继续研究</Button></Space></div>
    <div className="workbench-disclaimer">此内容由 AI 生成，不构成投资建议</div>
  </main>;
}
