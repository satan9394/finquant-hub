/* FinQuant Workbench — quiet, evidence-first landing surface. */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, List, Progress, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, FundOutlined, MessageOutlined, PlusOutlined, ReloadOutlined, RobotOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import { fetchMarketPulse } from '../services/marketDiscoveryApi';
import type { DashboardStats, MarketPulseResponse } from '../types';
import { PRODUCT_PROGRESS_EVENT, readProductProgress, setProductHelpDismissed } from '../features/productProgress';
import CommandBar from '../components/CommandBar';
import DecisionCard from '../components/DecisionCard';
import LatestNews, { type LatestNewsResponse } from '../components/LatestNews';
import MarketBrief from '../components/MarketBrief';
import TodayNeedAttention from '../components/TodayNeedAttention';
import TodayUniverse from '../components/TodayUniverse';
import TodayMarketPulse from '../components/TodayMarketPulse';
import ResearchRuns from '../components/ResearchRuns';
import { useLanguage } from '../i18n/LanguageContext';

const { Text, Title } = Typography;
interface DecisionEvidenceRef { evidence_id: string; kind: string; data_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR'; source?: string | null; as_of?: string | null; retrieved_at: string }
export interface DecisionInboxItem { id: string; kind: 'thesis_claim_change' | 'thesis_version_review' | 'scheduled_research_failure'; priority: 'high' | 'medium' | 'low'; why_now: string; occurred_at?: string | null; object_ref: { type: string; id: number; title: string; ticker?: string; status?: string; path: string }; evidence_refs: DecisionEvidenceRef[]; quality_status: 'OK' | 'UNKNOWN' | 'PARTIAL' | 'UPSTREAM_ERROR'; next_action: { kind: 'navigate'; label: string; path: string } }
export function DecisionInboxPanel({ items, loading, error, onRetry, onNavigate }: { items: DecisionInboxItem[]; loading: boolean; error: string; onRetry: () => void; onNavigate: (path: string) => void }) {
  const { t } = useLanguage();
  return <section aria-labelledby="decision-inbox-title" className="workbench-context-block"><Card title={<span id="decision-inbox-title">{t('today.inbox')}</span>} loading={loading}>{error ? <Alert type="error" showIcon message={t('today.inboxFailed')} description={error} action={<Button onClick={onRetry}>{t('today.retry')}</Button>} /> : <List dataSource={items} locale={{ emptyText: <Empty description={t('today.inboxEmpty')} /> }} renderItem={(item) => <List.Item><DecisionCard type={item.priority === 'high' ? 'risk' : item.priority === 'medium' ? 'review' : 'opportunity'} title={`${item.object_ref.title}${item.object_ref.ticker ? ` · ${item.object_ref.ticker}` : ''}`} whyNow={item.why_now} impact={t(`today.priority.${item.priority}`)} dueAt={item.occurred_at} quality={item.quality_status} evidence={item.evidence_refs.map((ref) => ({ id: ref.evidence_id, kind: ref.kind === 'observed_fact' ? 'FACT' : 'UNKNOWN', quality: ref.data_status, source: ref.source, asOf: ref.as_of || ref.retrieved_at, title: ref.evidence_id, detail: t('today.evidenceStatus', { status: ref.data_status }) }))} actionLabel={item.next_action.label} onAction={() => onNavigate(item.next_action.path)} /></List.Item>} />}</Card></section>;
}

export function LocalCapabilityBanner({ capabilities, onNavigate }: { capabilities: DashboardStats['capabilities']; onNavigate: (path: string) => void }) {
  const { t } = useLanguage();
  const modelConfigured = capabilities.model_ai.status === 'CONFIGURED_UNVERIFIED';
  return <Alert type={modelConfigured ? 'info' : 'warning'} showIcon className="workbench-capabilities" message={t(modelConfigured ? 'today.capability.configured' : 'today.capability.unconfigured')} description={<Space direction="vertical" size={4}><Text>{t('today.capability.status', { model: capabilities.model_ai.status })}</Text><Text type="secondary">{t(modelConfigured ? 'today.capability.configuredDescription' : 'today.capability.unconfiguredDescription')}</Text></Space>} action={<Button onClick={() => onNavigate(capabilities.model_ai.action_path)}>{t(modelConfigured ? 'today.capability.test' : 'today.capability.configure')}</Button>} />;
}

export function MarketSignalAvailability({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { t } = useLanguage();
  return <div aria-label={t('today.signal.aria')}><Space size={8} wrap><Tag>UNKNOWN</Tag><Text strong>{t('today.signal.empty')}</Text></Space><div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>{t('today.signal.description')}</Text></div><Button type="link" size="small" style={{ paddingInline: 0 }} onClick={() => onNavigate('/analysis/600519')}>{t('today.signal.example')}</Button></div>;
}

export default function Dashboard() {
  const { t } = useLanguage();
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
  const loadDecisionInbox = useCallback(async () => { setDecisionLoading(true); setDecisionError(''); try { setDecisionItems((await apiClient.get('/dashboard/decision-inbox')).data.items as DecisionInboxItem[]); } catch (error: unknown) { setDecisionItems([]); setDecisionError(error instanceof Error ? error.message : t('today.error.decision')); } finally { setDecisionLoading(false); } }, [t]);
  const loadMarket = useCallback(async () => { setMarketLoading(true); setMarketError(''); try { setMarketPulse(await fetchMarketPulse(12, 8, 12)); } catch (error: unknown) { setMarketError(error instanceof Error ? error.message : t('today.error.market')); } finally { setMarketLoading(false); } }, [t]);
  const loadNews = useCallback(async () => { setNewsLoading(true); setNewsError(''); try { setLatestNews((await apiClient.get<LatestNewsResponse>('/dashboard/news', { params: { max_results: 6 } })).data); } catch (error: unknown) { setNewsError(error instanceof Error ? error.message : t('today.error.news')); } finally { setNewsLoading(false); } }, [t]);
  useEffect(() => { void loadStats(); void loadDecisionInbox(); void loadMarket(); void loadNews(); }, [loadStats, loadDecisionInbox, loadMarket, loadNews]);
  useEffect(() => { const sync = () => setProductProgress(readProductProgress()); window.addEventListener(PRODUCT_PROGRESS_EVENT, sync); window.addEventListener('storage', sync); return () => { window.removeEventListener(PRODUCT_PROGRESS_EVENT, sync); window.removeEventListener('storage', sync); }; }, []);

  const coreTasks = [
    { key: 'analysis', icon: <FundOutlined />, run: () => navigate('/research'), runExample: () => navigate('/analysis/600519') },
    { key: 'strategy', icon: <ExperimentOutlined />, run: () => navigate('/strategy-lab/ma-crossover'), runExample: () => navigate('/strategy-lab/ma-crossover?symbol=600519') },
    { key: 'portfolio', icon: <WalletOutlined />, run: () => navigate('/portfolio'), runExample: () => navigate('/portfolio?example=600519') },
  ];
  const progressSteps = [{ key: 'analysis', done: productProgress.analysis }, { key: 'backtest', done: productProgress.backtest }, { key: 'saved', done: productProgress.saved }];
  const completedProgress = progressSteps.filter((step) => step.done).length;
  const runningRooms = stats?.recent_rooms?.filter((room) => !['done', 'failed'].includes(room.current_phase)).length ?? 0;
  const researchRuns = (stats?.recent_rooms ?? []).slice(0, 5).map((room) => ({ id: room.id, title: room.topic, state: room.current_phase, progress: null, updatedAt: null }));
  const attentionCount = decisionItems.length;
  const majorChangeCount = decisionItems.filter((item) => item.priority === 'high').length;

  return <main className="workbench-page">
    <Title level={4} className="workbench-page__title">{t('today.title')}</Title>
    <section className="dashboard-hero" aria-labelledby="dashboard-hero-title"><Text className="dashboard-hero__eyebrow">{t('today.eyebrow')}</Text><Title id="dashboard-hero-title" level={2}>{t('today.hero')}</Title><Text className="dashboard-hero__subtitle">{t('today.heroDescription')}</Text><CommandBar onNavigate={navigate} variant="hero" /></section>
    <TodayNeedAttention attention={attentionCount} running={runningRooms} changes={majorChangeCount} events="UNKNOWN">
      <DecisionInboxPanel items={decisionItems} loading={decisionLoading} error={decisionError} onRetry={() => void loadDecisionInbox()} onNavigate={navigate} />
    </TodayNeedAttention>
    <TodayUniverse onOpen={navigate} />
    <TodayMarketPulse><section className="workbench-brief-grid" aria-label={t('today.briefAria')}><MarketBrief data={marketPulse} loading={marketLoading} error={marketError} /><LatestNews data={latestNews} loading={newsLoading} error={newsError} /></section></TodayMarketPulse>
    <ResearchRuns runs={researchRuns} />
    <section className="task-launchpad" aria-labelledby="task-launchpad-title"><div className="task-launchpad__header"><div><Text className="task-launchpad__eyebrow">{t('today.launch.eyebrow')}</Text><h2 id="task-launchpad-title">{t('today.launch.title')}</h2></div><Text type="secondary">{t('today.launch.description')}</Text></div><div className="task-launchpad__progress" aria-label={t('today.progress', { done: completedProgress })}><div className="task-launchpad__progress-heading"><Text strong>{t('today.progress', { done: completedProgress })}</Text><Button type="link" size="small" onClick={() => setProductHelpDismissed(!productProgress.helpDismissed)}>{t(productProgress.helpDismissed ? 'today.showHint' : 'today.hideHint')}</Button></div><Progress percent={Math.round((completedProgress / 3) * 100)} showInfo={false} size="small" /><div className="task-launchpad__steps">{progressSteps.map((step) => <span className={step.done ? 'is-done' : ''} key={step.key}>{t(step.done ? 'today.done' : 'today.pending')} · {t(`today.progress.${step.key}`)}</span>)}</div>{!productProgress.helpDismissed ? <Text className="task-launchpad__hint">{t('today.hint')}</Text> : null}</div><div className="task-launchpad__grid">{coreTasks.map((task) => <article className="task-launchpad__card" key={task.key}><span className="task-launchpad__icon" aria-hidden="true">{task.icon}</span><div className="task-launchpad__copy"><Text type="secondary">{t(`today.task.${task.key}.area`)}</Text><h3>{t(`today.task.${task.key}.question`)}</h3><p>{t(`today.task.${task.key}.result`)}</p><Text className="task-launchpad__example">{t('today.example', { example: t(`today.task.${task.key}.example`) })}</Text></div><div className="task-launchpad__actions"><Button type="primary" onClick={task.run}>{t(`today.task.${task.key}.action`)}</Button><Button aria-label={t('today.tryExampleAria', { task: t(`today.task.${task.key}.area`) })} onClick={task.runExample}>{t('today.tryExample')}</Button></div></article>)}</div></section>
    <section className="workbench-context-grid" aria-label={t('today.recentContext')}>
      <Card title={t('today.conversations')} size="small" extra={<Button type="link" onClick={() => navigate('/chat')}>{t('today.viewAll')}</Button>}>
        <List
          size="small"
          dataSource={stats?.recent_conversations?.slice(0, 5) ?? []}
          renderItem={(item) => (
            <List.Item>
              <Link to="/chat" style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
                <Text ellipsis>{item.title || t('today.conversation', { id: item.id })}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>{item.last_message?.slice(0, 30)}</Text>
              </Link>
            </List.Item>
          )}
          locale={{ emptyText: t('today.noConversations') }}
        />
      </Card>
      <Card title={t('today.discussions')} size="small" extra={<Button type="link" onClick={() => navigate('/discussion')}>{t('today.viewAll')}</Button>}>
        <List
          size="small"
          dataSource={stats?.recent_rooms?.slice(0, 5) ?? []}
          renderItem={(item) => (
            <List.Item>
              <Link to="/discussion" style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
                <Text ellipsis>{item.topic}</Text>
                <Tag color={item.current_phase === 'done' ? 'green' : item.current_phase === 'failed' ? 'red' : 'blue'}>{t(item.current_phase === 'done' ? 'today.state.done' : item.current_phase === 'failed' ? 'today.state.failed' : 'today.state.running')}</Tag>
              </Link>
            </List.Item>
          )}
          locale={{ emptyText: t('today.noDiscussions') }}
        />
      </Card>
    </section>
    <div className="workbench-footer-actions"><Space wrap><Button icon={<PlusOutlined />} onClick={() => navigate('/chat')}>{t('today.startChat')}</Button><Button icon={<TeamOutlined />} onClick={() => navigate('/discussion')}>{t('today.createDiscussion')}</Button><Button icon={<RobotOutlined />} onClick={() => navigate('/models')}>{t('today.manageModels')}</Button><Button icon={<MessageOutlined />} onClick={() => { void loadStats(); void loadMarket(); void loadNews(); }}>{t('today.refresh')}</Button><Button icon={<ReloadOutlined />} onClick={() => navigate('/research')}>{t('today.continueResearch')}</Button></Space></div>
    <div className="workbench-disclaimer">{t('today.disclaimer')}</div>
  </main>;
}
