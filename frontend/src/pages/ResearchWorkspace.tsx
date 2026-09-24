import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Collapse, DatePicker, Descriptions, Empty, Input, List, Row, Segmented,
  Skeleton, Space, Spin, Statistic, Table, Tag, Typography, message,
} from 'antd';
import {
  ArrowRightOutlined, ExperimentOutlined, FileSearchOutlined, ReloadOutlined,
  SaveOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ProCandlestickChart from '../components/charts/ProCandlestickChart';
import SwarmStatusCard from '../components/SwarmStatusCard';
import TaskPageHeader from '../components/TaskPageHeader';
import ResultLayer from '../components/ResultLayer';
import EvidenceChip from '../components/EvidenceChip';
import ChipHistoryChart from '../components/ChipHistoryChart';
import MoneyFlowChart from '../components/MoneyFlowChart';
import ResearchContinuity from '../components/research/ResearchContinuity';
import ResearchTimeline from '../components/research/ResearchTimeline';
import ResearchIntentPicker from '../components/research/ResearchIntentPicker';
import FundamentalMetricsPanel from '../components/research/FundamentalMetricsPanel';
import AgentModeSelector, { type AgentMode } from '../components/AgentModeSelector';
import Chat from './Chat';
import Discussion from './Discussion';
import Research from './Research';
import Thesis from './Thesis';
import { matchesResearchSubject, sameTicker } from '../features/researchContinuity';
import { buildResearchTimeline } from '../features/researchTimeline';
import {
  fetchInstrumentBars,
  fetchChipDistribution,
  fetchDragonTiger,
  fetchInstrumentFundamentals,
  fetchInstrumentSnapshot,
  fetchMoneyFlow,
  fetchResearchWorkspace,
  fetchResearchDiscussions,
  fetchResearchHistory,
  fetchResearchReport,
  fetchResearchTheses,
  listResearchWorkspaces,
  saveResearchWorkspace,
  searchInstruments,
} from '../services/researchApi';
import type {
  BarsResponse, ChipDistributionResponse, DragonTigerResponse, DragonTigerSeat, EvidenceItem,
  FundamentalItem, FundamentalsResponse, Instrument, MoneyFlowResponse,
  ResearchDiscussionSummary, ResearchHistoryGroup, ResearchReportDetail, ResearchThesisSummary,
  ResearchWorkspace as WorkspaceType, SnapshotResponse,
} from '../types/research';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n';
import { formatWan, shanghaiToday } from '../utils/formatAStock';
import type { MoneyFlowPeriod } from '../utils/moneyFlowChart';
import type { ChipSeriesField } from '../utils/chipChart';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type Translate = (key: string, values?: Record<string, string | number>) => string;

const routedAgentModes = new Set<AgentMode>(['fast', 'analyst', 'deep', 'review']);

/**
 * VS-24：追问交接载荷（`ResearchWorkspace` 外的唯一消费点 → 模式面）。
 *
 * 有标的的 `?prompt=` 在被消费后**不再留在 URL 里**（留在 URL 会在刷新/返回时被重放），
 * 而是经 router state 原样交给能作答的问答面（`?mode=fast`）。两条入口
 * （`/analysis/:ticker`、`/research/:symbol`）走的是同一个消费点、同一个载荷。
 */
export type FollowupHandoff = { symbol: string; question: string };

export function readFollowupHandoff(state: unknown): FollowupHandoff | null {
  const handoff = (state as { followup?: Partial<FollowupHandoff> } | null | undefined)?.followup;
  const symbol = typeof handoff?.symbol === 'string' ? handoff.symbol.trim() : '';
  const question = typeof handoff?.question === 'string' ? handoff.question.trim() : '';
  return symbol && question ? { symbol, question } : null;
}

function ResearchModeSurface({ mode, symbol }: { mode: Exclude<AgentMode, 'analyst'>; symbol?: string }) {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const subject = symbol ? decodeURIComponent(symbol).toUpperCase() : '';
  // VS-24：追问被接住后在此处**可见回执**——用户按下发送后必须看到"问题真的到了"，
  // 而不是"点了没反应"。载荷同时作为问答面的初始草稿（Chat 既有契约：URL/预填
  // 只作为可编辑草稿，绝不自动发送；本卡不改该契约）。
  const followup = readFollowupHandoff(location.state);
  const selectMode = (nextMode: AgentMode) => {
    const next = new URLSearchParams(searchParams);
    // VS16：切换模式即离开"某一条记录"，不得把旧记录的深链 id 带到新模式（fast 带 session / review 带 room）。
    next.delete('session');
    next.delete('room');
    if (nextMode === 'analyst') next.delete('mode');
    else next.set('mode', nextMode);
    setSearchParams(next, { replace: true });
  };
  return (
    <main className="product-page research-mode-page" data-testid={`research-mode-${mode}`}>
      <section className="research-mode-switcher">
        <AgentModeSelector value={mode} onChange={selectMode} />
      </section>
      {followup ? (
        <Alert
          type="info"
          showIcon
          role="status"
          data-testid="followup-received"
          message={t('research.followup.received', { symbol: followup.symbol, question: followup.question })}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      {mode === 'fast' ? <Chat initialPrompt={followup?.question || (subject ? t('research.mode.fastPrompt', { ticker: subject }) : undefined)} /> : null}
      {mode === 'deep' ? <Research initialTicker={subject || undefined} /> : null}
      {mode === 'review' ? <Discussion initialTopic={subject ? t('research.mode.reviewTopic', { ticker: subject }) : undefined} /> : null}
    </main>
  );
}

function ThesisModeSurface() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const backToResearch = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('mode');
    next.delete('new');
    next.delete('ticker');
    next.delete('claim');
    setSearchParams(next, { replace: true });
  };
  return (
    <main className="product-page research-mode-page" data-testid="research-mode-thesis">
      <Button onClick={backToResearch}>{t('research.mode.backToWorkspace')}</Button>
      <Thesis />
    </main>
  );
}

const metricKeys: Record<string, string> = {
  trailingMarketCap: 'research.metric.marketCap',
  trailingPeRatio: 'research.metric.pe',
  trailingPbRatio: 'research.metric.pb',
  trailingEps: 'research.metric.eps',
  trailingTotalRevenue: 'research.metric.revenue',
  trailingNetIncome: 'research.metric.netIncome',
  trailingOperatingCashFlow: 'research.metric.operatingCashFlow',
  trailingFreeCashFlow: 'research.metric.freeCashFlow',
};

function formatNumber(value: number | null | undefined, currency: string | null | undefined, lang: Language, t: Translate) {
  if (value == null) return '—';
  const absolute = Math.abs(value);
  let formatted: string;
  if (absolute >= 1e12) formatted = t('research.number.trillion', { value: (value / 1e12).toFixed(2) });
  else if (lang === 'zh' && absolute >= 1e8) formatted = t('research.number.hundredMillion', { value: (value / 1e8).toFixed(2) });
  else if (lang === 'zh' && absolute >= 1e4) formatted = t('research.number.tenThousand', { value: (value / 1e4).toFixed(2) });
  else if (absolute >= 1e9) formatted = t('research.number.billion', { value: (value / 1e9).toFixed(2) });
  else if (absolute >= 1e6) formatted = t('research.number.million', { value: (value / 1e6).toFixed(2) });
  else if (absolute >= 1e3) formatted = t('research.number.thousand', { value: (value / 1e3).toFixed(2) });
  else formatted = value.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { maximumFractionDigits: 4 });
  return `${formatted}${currency ? ` ${currency}` : ''}`;
}

function provenanceEvidence(
  t: Translate,
  snapshot?: SnapshotResponse | null,
  bars?: BarsResponse | null,
  fundamentals?: FundamentalsResponse | null,
  chips?: ChipDistributionResponse | null,
  moneyFlow?: MoneyFlowResponse | null,
  dragonTiger?: DragonTigerResponse | null,
): EvidenceItem[] {
  return [
    snapshot && {
      label: 'FACT' as const,
      title: t('research.evidence.snapshot'),
      detail: `${snapshot.instrument.name} ${snapshot.data.price} ${snapshot.currency ?? ''}`,
      provider: snapshot.provider,
      as_of: snapshot.as_of,
    },
    bars && {
      label: 'FACT' as const,
      title: t('research.evidence.bars'),
      detail: t('research.evidence.barsDetail', { count: bars.items.length, frequency: bars.frequency ?? 'UNKNOWN', adjustment: bars.adjustment ?? 'UNKNOWN' }),
      provider: bars.provider,
      as_of: bars.as_of,
    },
    fundamentals && {
      label: 'FACT' as const,
      title: t('research.evidence.fundamentals'),
      detail: t('research.evidence.fundamentalsDetail', { count: fundamentals.items.length }),
      provider: fundamentals.provider,
      as_of: fundamentals.as_of,
    },
    chips && {
      label: 'INFERENCE' as const,
      title: t('research.evidence.chips'),
      detail: t('research.evidence.chipsDetail', { count: chips.items.length }),
      provider: chips.provider,
      as_of: chips.as_of,
    },
    moneyFlow && {
      label: 'FACT' as const,
      title: t('research.evidence.moneyFlow'),
      detail: t('research.evidence.moneyFlowDetail', { period: t(`research.moneyFlow.period.${moneyFlow.period}`) }),
      provider: moneyFlow.source,
      as_of: moneyFlow.as_of,
    },
    dragonTiger && {
      label: 'FACT' as const,
      title: t('research.evidence.dragonTiger'),
      detail: t('research.evidence.dragonTigerDetail', { count: dragonTiger.items.length }),
      provider: dragonTiger.source,
      as_of: dragonTiger.date,
    },
  ].filter(Boolean) as EvidenceItem[];
}

function ResearchWorkspaceCore({ followupPrompt = '' }: { followupPrompt?: string } = {}) {
  const { lang, t } = useLanguage();
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const agentMode: AgentMode = 'analyst';
  const currentSymbol = symbol ? decodeURIComponent(symbol).toUpperCase() : '';
  // Astra B6：底部/全局"继续研究"以 /research?prompt=… 进入默认研究页，此前
  // prompt 只留在 URL 不呈现，问题丢失。此处接住：预填搜索框（原问题可见），
  // 有 prompt 且无标的时自动搜索一次，让问题进入"已识别对象"流程而非被丢弃。
  // VS-24：消费点已上移到 `ResearchWorkspace`（挂载与查询串变化同源，两条入口共用），
  // 本组件只接收一次性交接的追问文本。
  const urlPrompt = followupPrompt.trim();
  const [query, setQuery] = useState(urlPrompt);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Instrument[]>([]);
  const [savedWorkspaces, setSavedWorkspaces] = useState<WorkspaceType[]>([]);
  const [workspaceRecord, setWorkspaceRecord] = useState<WorkspaceType | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [bars, setBars] = useState<BarsResponse | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalsResponse | null>(null);
  const [chips, setChips] = useState<ChipDistributionResponse | null>(null);
  const [chipSeriesField, setChipSeriesField] = useState<ChipSeriesField>('profit_ratio');
  const [moneyFlow, setMoneyFlow] = useState<MoneyFlowResponse | null>(null);
  const [moneyFlowPeriod, setMoneyFlowPeriod] = useState<MoneyFlowPeriod>('minute');
  const [moneyFlowLoading, setMoneyFlowLoading] = useState(false);
  const moneyFlowPeriodRef = useRef<MoneyFlowPeriod>('minute');
  const [dragonTiger, setDragonTiger] = useState<DragonTigerResponse | null>(null);
  const [selectedDragonTigerIndex, setSelectedDragonTigerIndex] = useState<number>(0);
  const [dragonTigerDate, setDragonTigerDate] = useState<string>(() => shanghaiToday());
  const dragonTigerDateRef = useRef(dragonTigerDate);
  const [dragonTigerLoading, setDragonTigerLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [continuityLoading, setContinuityLoading] = useState(false);
  const [continuityErrors, setContinuityErrors] = useState<string[]>([]);
  const [reports, setReports] = useState<ResearchReportDetail[]>([]);
  const [discussions, setDiscussions] = useState<ResearchDiscussionSummary[]>([]);
  const [theses, setTheses] = useState<ResearchThesisSummary[]>([]);
  const [homeHistory, setHomeHistory] = useState<ResearchHistoryGroup[]>([]);
  const [homeTheses, setHomeTheses] = useState<ResearchThesisSummary[]>([]);
  const [homeTimelineLoading, setHomeTimelineLoading] = useState(false);
  const [homeTimelineErrors, setHomeTimelineErrors] = useState<string[]>([]);

  // VS-24：显式词优先——追问交接进来的原问题必须按原样检索，不能读可能尚未同步的
  // `query` state（同一 Route 只改查询串时不会重挂载，闭包里的 query 会是旧值）。
  const runSearch = useCallback(async (explicitTerm?: string) => {
    const term = (explicitTerm ?? query).trim();
    if (!term) {
      message.warning(t('research.search.required'));
      return;
    }
    setSearching(true);
    setErrors([]);
    try {
      const response = await searchInstruments(term);
      setSearchResults(response.items);
      if (response.items.length === 0) setErrors([t('research.search.none')]);
    } catch (error: any) {
      setSearchResults([]);
      setErrors([error.message || t('research.search.failed')]);
    } finally {
      setSearching(false);
    }
  }, [query, t]);

  // Astra B6：URL 携带 prompt 且无标的时自动搜索一次（原问题留在输入框可见，
  // 结果列表让用户选择对象继续），避免提问被静默丢弃在 URL。
  // VS-24：改由外层唯一消费点交接（`followupPrompt`），并加 ref 守卫——同一个值
  // 只检索一次（StrictMode 双调用 / effect 重入都不会重发）。
  const searchedFollowupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlPrompt || searchedFollowupRef.current === urlPrompt) return;
    searchedFollowupRef.current = urlPrompt;
    setQuery(urlPrompt);
    void runSearch(urlPrompt);
  }, [runSearch, urlPrompt]);

  useEffect(() => {
    if (currentSymbol) return;
    setHomeTimelineLoading(true);
    setHomeTimelineErrors([]);
    Promise.allSettled([listResearchWorkspaces(), fetchResearchHistory(), fetchResearchTheses()])
      .then((outcomes) => {
        const nextErrors: string[] = [];
        if (outcomes[0].status === 'fulfilled') setSavedWorkspaces(outcomes[0].value);
        else nextErrors.push(t('research.error.workspace', { error: outcomes[0].reason?.message ?? t('research.error.loadFailed') }));
        if (outcomes[1].status === 'fulfilled') setHomeHistory(outcomes[1].value);
        else nextErrors.push(t('research.error.reportHistory', { error: outcomes[1].reason?.message ?? t('research.error.loadFailed') }));
        if (outcomes[2].status === 'fulfilled') setHomeTheses(outcomes[2].value);
        else nextErrors.push(t('research.error.thesis', { error: outcomes[2].reason?.message ?? t('research.error.loadFailed') }));
        setHomeTimelineErrors(nextErrors);
      })
      .finally(() => setHomeTimelineLoading(false));
  }, [currentSymbol, t]);

  const loadWorkspace = useCallback(async () => {
    if (!currentSymbol) return;
    setLoading(true);
    setErrors([]);
    setSnapshot(null);
    setBars(null);
    setFundamentals(null);
    setChips(null);
    setMoneyFlow(null);
    setDragonTiger(null);
    const isAShare = /^\d{6}$/.test(currentSymbol);
    const chipRequest: Promise<ChipDistributionResponse | null> = isAShare
      ? fetchChipDistribution(currentSymbol)
      : Promise.resolve(null);
    const moneyFlowRequest: Promise<MoneyFlowResponse | null> = isAShare
      ? fetchMoneyFlow(currentSymbol, moneyFlowPeriodRef.current)
      : Promise.resolve(null);
    const dragonTigerRequest: Promise<DragonTigerResponse | null> = isAShare
      ? fetchDragonTiger(currentSymbol, dragonTigerDateRef.current)
      : Promise.resolve(null);
    const outcomes = await Promise.allSettled([
      fetchInstrumentSnapshot(currentSymbol),
      fetchInstrumentBars(currentSymbol, 260),
      fetchInstrumentFundamentals(currentSymbol),
      fetchResearchWorkspace(currentSymbol),
      chipRequest,
      moneyFlowRequest,
      dragonTigerRequest,
    ]);
    const nextErrors: string[] = [];
    if (outcomes[0].status === 'fulfilled') setSnapshot(outcomes[0].value);
    else nextErrors.push(t('research.error.snapshot', { error: outcomes[0].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[1].status === 'fulfilled') setBars(outcomes[1].value);
    else nextErrors.push(t('research.error.bars', { error: outcomes[1].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[2].status === 'fulfilled') setFundamentals(outcomes[2].value);
    else nextErrors.push(t('research.error.fundamentals', { error: outcomes[2].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[3].status === 'fulfilled') {
      setWorkspaceRecord(outcomes[3].value);
      setNotes(outcomes[3].value.notes ?? '');
      setSaved(Boolean(outcomes[3].value.saved));
    } else {
      nextErrors.push(t('research.error.notes', { error: outcomes[3].reason?.message ?? t('research.error.loadFailed') }));
    }
    if (outcomes[4].status === 'fulfilled') setChips(outcomes[4].value);
    else nextErrors.push(t('research.error.chips', { error: outcomes[4].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[5].status === 'fulfilled') setMoneyFlow(outcomes[5].value);
    else nextErrors.push(t('research.error.moneyFlow', { error: outcomes[5].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[6].status === 'fulfilled') {
      setDragonTiger(outcomes[6].value);
      setSelectedDragonTigerIndex(0);
    } else nextErrors.push(t('research.error.dragonTiger', { error: outcomes[6].reason?.message ?? t('research.error.loadFailed') }));
    setErrors(nextErrors);
    setLoading(false);
  }, [currentSymbol, t]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const changeMoneyFlowPeriod = useCallback(async (period: MoneyFlowPeriod) => {
    const previousPeriod = moneyFlowPeriodRef.current;
    moneyFlowPeriodRef.current = period;
    setMoneyFlowPeriod(period);
    setMoneyFlowLoading(true);
    const errorPrefix = t('research.error.moneyFlow', { error: '' });
    try {
      const response = await fetchMoneyFlow(currentSymbol, period);
      setMoneyFlow(response);
      setErrors((current) => current.filter((error) => !error.startsWith(errorPrefix)));
    } catch (error) {
      moneyFlowPeriodRef.current = previousPeriod;
      setMoneyFlowPeriod(previousPeriod);
      const detail = error instanceof Error ? error.message : t('research.error.loadFailed');
      setErrors((current) => [
        ...current.filter((item) => !item.startsWith(errorPrefix)),
        t('research.error.moneyFlow', { error: detail }),
      ]);
    } finally {
      setMoneyFlowLoading(false);
    }
  }, [currentSymbol, t]);

  const changeDragonTigerDate = useCallback(async (date: string) => {
    const previousDate = dragonTigerDateRef.current;
    dragonTigerDateRef.current = date;
    setDragonTigerDate(date);
    setDragonTigerLoading(true);
    const errorPrefix = t('research.error.dragonTiger', { error: '' });
    try {
      const response = await fetchDragonTiger(currentSymbol, date);
      setDragonTiger(response);
      setSelectedDragonTigerIndex(0);
      setErrors((current) => current.filter((error) => !error.startsWith(errorPrefix)));
    } catch (error) {
      dragonTigerDateRef.current = previousDate;
      setDragonTigerDate(previousDate);
      const detail = error instanceof Error ? error.message : t('research.error.loadFailed');
      setErrors((current) => [
        ...current.filter((item) => !item.startsWith(errorPrefix)),
        t('research.error.dragonTiger', { error: detail }),
      ]);
    } finally {
      setDragonTigerLoading(false);
    }
  }, [currentSymbol, t]);

  const loadContinuity = useCallback(async () => {
    if (!currentSymbol) return;
    setContinuityLoading(true);
    setContinuityErrors([]);
    setReports([]);
    setDiscussions([]);
    setTheses([]);
    const outcomes = await Promise.allSettled([
      fetchResearchHistory(),
      fetchResearchDiscussions(),
      fetchResearchTheses(),
    ]);
    const nextErrors: string[] = [];
    if (outcomes[0].status === 'fulfilled') {
      const groups = outcomes[0].value as ResearchHistoryGroup[];
      const group = groups.find((item) => sameTicker(item.ticker, currentSymbol));
      if (group) {
        const details = await Promise.allSettled(group.runs.slice(0, 10).map((run) => fetchResearchReport(run.id)));
        setReports(details.filter((item): item is PromiseFulfilledResult<ResearchReportDetail> => item.status === 'fulfilled').map((item) => item.value));
        if (details.some((item) => item.status === 'rejected')) nextErrors.push(t('research.error.reportDetail'));
      }
    } else nextErrors.push(t('research.error.reportHistory', { error: outcomes[0].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[1].status === 'fulfilled') setDiscussions(outcomes[1].value as ResearchDiscussionSummary[]);
    else nextErrors.push(t('research.error.discussion', { error: outcomes[1].reason?.message ?? t('research.error.loadFailed') }));
    if (outcomes[2].status === 'fulfilled') setTheses(outcomes[2].value as ResearchThesisSummary[]);
    else nextErrors.push(t('research.error.thesis', { error: outcomes[2].reason?.message ?? t('research.error.loadFailed') }));
    setContinuityErrors(nextErrors);
    setContinuityLoading(false);
  }, [currentSymbol, t]);

  useEffect(() => { void loadContinuity(); }, [loadContinuity]);

  const evidence = useMemo(
    () => provenanceEvidence(t, snapshot, bars, fundamentals, chips, moneyFlow, dragonTiger),
    [t, snapshot, bars, fundamentals, chips, moneyFlow, dragonTiger],
  );
  const fundamentalsError = errors.find((error) => error.startsWith(t('research.error.fundamentalsPrefix')));
  const timelineEntries = useMemo(
    () => buildResearchTimeline(savedWorkspaces, homeHistory, homeTheses),
    [savedWorkspaces, homeHistory, homeTheses],
  );

  const saveWorkspace = async () => {
    if (!snapshot) {
      message.error(t('research.save.noSnapshot'));
      return;
    }
    setSaving(true);
    try {
      const savedRecord = await saveResearchWorkspace(currentSymbol, {
        name: snapshot.instrument.name,
        instrument: snapshot.instrument,
        notes,
        evidence,
        snapshot,
      });
      setWorkspaceRecord((current) => ({
        ...(current ?? { symbol: currentSymbol, evidence: [], notes: '', saved: true }),
        ...savedRecord,
        notes,
        evidence,
        snapshot,
        saved: true,
      }));
      setSaved(true);
      message.success(t('research.save.success'));
    } catch (error: any) {
      message.error(error.message || t('research.save.failed'));
    } finally {
      setSaving(false);
    }
  };

  const modePanel = (
    <section className="research-mode-switcher">
      <AgentModeSelector value={agentMode} onChange={(nextMode) => {
        const next = new URLSearchParams(searchParams);
        if (nextMode === 'analyst') next.delete('mode');
        else next.set('mode', nextMode);
        setSearchParams(next, { replace: true });
      }} />
    </section>
  );

  if (!currentSymbol) {
    return (
      <main className="product-page research-home" data-testid="research-home">
        <section className="page-hero compact-hero">
          <Text className="eyebrow">{t('research.eyebrow')}</Text>
          <Title level={2}>{t('research.landing.title')}</Title>
          <Paragraph>{t('research.landing.description')}</Paragraph>
          <Space.Compact block className="instrument-search">
            <Input
              aria-label={t('research.search.label')}
              placeholder={t('research.search.placeholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onPressEnter={() => void runSearch()}
              size="large"
            />
            <Button type="primary" size="large" icon={<SearchOutlined />} loading={searching} onClick={() => void runSearch()}>
              {t('research.search.action')}
            </Button>
          </Space.Compact>
        </section>
        {modePanel}

        {errors.map((error) => <Alert key={error} type="error" showIcon message={error} style={{ marginBottom: 12 }} />)}

        {searchResults.length > 0 && (
          <Card title={t('research.search.results', { count: searchResults.length })} className="surface-card" data-testid="instrument-search-results">
            <List
              dataSource={searchResults}
              renderItem={(item) => (
                <List.Item
                  actions={[<Button key="open" data-testid={`instrument-result-${item.symbol}`} type="link" onClick={() => navigate(`/research/${encodeURIComponent(item.symbol)}`)}>{t('research.search.open')} <ArrowRightOutlined /></Button>]}
                >
                  <List.Item.Meta
                    title={<Space><Text strong>{item.name}</Text><Tag>{item.symbol}</Tag></Space>}
                    description={`${item.market} · ${item.exchange} · ${item.currency} · ${item.asset_type}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        )}

        <div className="research-landing-grid">
        <Card title={t('research.recent')} className="surface-card" style={{ marginTop: 18 }} data-testid="saved-research-list">
          {savedWorkspaces.length ? (
            <List
              dataSource={savedWorkspaces}
              renderItem={(item) => (
                <List.Item actions={[<Button key="open" onClick={() => navigate(`/research/${encodeURIComponent(item.symbol)}`)}>{t('research.recent.continue')}</Button>]}>
                  <List.Item.Meta
                    title={<Space><Text strong>{item.name ?? item.symbol}</Text><Tag>{item.symbol}</Tag></Space>}
                    description={t('research.recent.description', { time: item.updated_at ?? t('research.unknown') })}
                  />
                </List.Item>
              )}
            />
          ) : <Empty description={t('research.recent.empty')} />}
        </Card>
        <Card title={t('research.reports.latest')} className="surface-card" style={{ marginTop: 18 }} data-testid="latest-research-reports">
          {homeHistory.length ? <List size="small" dataSource={homeHistory.slice(0, 5)} renderItem={(item) => <List.Item actions={[<Button key="open" type="link" onClick={() => navigate(`/research/reports?symbol=${encodeURIComponent(item.ticker)}`)}>{t('research.reports.view')}</Button>]}><List.Item.Meta title={<Space><Text strong>{item.company_name ?? item.ticker}</Text><Tag>{item.ticker}</Tag></Space>} description={t('research.reports.description', { completed: item.completed_count, total: item.run_count, time: item.latest_at })} /></List.Item>} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('research.reports.empty')} />}
        </Card>
        </div>
        <Collapse
          className="research-timeline-disclosure"
          items={[{ key: 'activity', label: t('research.activity'), children: <ResearchTimeline entries={timelineEntries} errors={homeTimelineErrors} loading={homeTimelineLoading} /> }]}
        />
        <Button className="research-deep-link" type="link" icon={<FileSearchOutlined />} onClick={() => navigate('/research/reports')} style={{ marginTop: 12 }}>
          {t('research.deep.prompt')}
        </Button>
      </main>
    );
  }

  const priceUp = (snapshot?.data.change_percent ?? 0) >= 0;
  const workspaceStatus = errors.length
    ? t('research.status.partial')
    : loading && !snapshot
      ? t('research.status.loading')
      : snapshot
        ? t('research.status.asOf', { asOf: snapshot.as_of ?? t('research.unknown') })
        : t('research.status.waiting');
  const workspaceStatusTone = errors.length
    ? 'warning' as const
    : loading && !snapshot
      ? 'loading' as const
      : snapshot
        ? 'success' as const
        : 'neutral' as const;
  const subjectName = snapshot?.instrument.name;
  const subjectDiscussions = discussions.filter((item) => matchesResearchSubject(item.topic, currentSymbol, subjectName));
  const subjectTheses = theses.filter((item) => sameTicker(item.ticker, currentSymbol));
  const latestMoneyFlow = moneyFlow?.items[moneyFlow.items.length - 1];
  return (
    <main className="product-page" data-testid="instrument-research-page">
      <TaskPageHeader
        eyebrow={t('research.eyebrow')}
        title={t('research.workspace.title')}
        goal={t('research.workspace.goal')}
        object={snapshot ? `${snapshot.instrument.name} · ${currentSymbol}` : currentSymbol}
        status={workspaceStatus}
        statusTone={workspaceStatusTone}
        actions={(
          <>
            <Button onClick={() => navigate('/research')}>{t('research.back')}</Button>
          <Button icon={<FileSearchOutlined />} onClick={() => navigate(`/research/reports?symbol=${encodeURIComponent(currentSymbol)}`)}>{t('research.deepReport')}</Button>
          <Button icon={<ExperimentOutlined />} onClick={() => navigate(`/strategy-lab/ma-crossover?symbol=${encodeURIComponent(currentSymbol)}`)}>
            {t('research.openStrategy')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveWorkspace()}>
            {saved ? t('research.update') : t('research.save')}
          </Button>
          </>
        )}
      />
      {modePanel}

      {errors.map((error) => <Alert key={error} type="warning" showIcon message={error} action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void loadWorkspace()}>{t('research.retry')}</Button>} style={{ marginBottom: 12 }} />)}

      <ResearchIntentPicker symbol={currentSymbol} onNavigate={navigate} />
      <Collapse
        className="advanced-research-disclosure"
        ghost
        items={[{
          key: 'team',
          label: t('research.agentAdvanced'),
          children: <SwarmStatusCard ticker={currentSymbol} />,
        }]}
      />

      {loading && !snapshot ? <Skeleton active paragraph={{ rows: 10 }} /> : snapshot ? (
        <>
          <ResultLayer layer="summary" title={t('research.summary.title')} description={t('research.summary.description')}>
            <section className="instrument-header">
              <div>
                <Text className="eyebrow">{snapshot.instrument.market} · {snapshot.instrument.exchange}</Text>
                <Title level={2}>{snapshot.instrument.name} <Text type="secondary">{snapshot.instrument.symbol}</Text></Title>
                <Space wrap>
                  <EvidenceChip evidence={{ kind: 'FACT', quality: 'OK', title: t('research.snapshot.title', { name: snapshot.instrument.name }), detail: t('research.snapshot.detail'), source: snapshot.provider, asOf: snapshot.as_of }} />
                  <Text type="secondary">{snapshot.provider}</Text>
                  <Text type="secondary">{t('research.asOf', { value: snapshot.as_of ?? t('research.unknown') })}</Text>
                  <Text type="secondary">{snapshot.timezone}</Text>
                </Space>
              </div>
              <div className="headline-price">
                <Text type="secondary">{t('research.price.current')}</Text>
                <div className={priceUp ? 'price-up' : 'price-down'}>{snapshot.data.price.toFixed(2)} <small>{snapshot.currency}</small></div>
                <Text className={priceUp ? 'price-up' : 'price-down'}>
                  {snapshot.data.change >= 0 ? '+' : ''}{snapshot.data.change.toFixed(2)} ({snapshot.data.change_percent >= 0 ? '+' : ''}{snapshot.data.change_percent.toFixed(2)}%)
                </Text>
              </div>
            </section>

            <Row gutter={[12, 12]} className="snapshot-grid">
              {[
                [t('research.snapshot.open'), snapshot.data.open], [t('research.snapshot.high'), snapshot.data.high], [t('research.snapshot.low'), snapshot.data.low],
                [t('research.snapshot.previousClose'), snapshot.data.last_close], [t('research.snapshot.volume'), snapshot.data.volume], [t('research.snapshot.marketCap'), snapshot.data.market_cap],
              ].map(([label, value]) => (
                <Col xs={12} sm={8} lg={4} key={String(label)}>
                  <Card size="small" className="metric-card"><Statistic title={label} value={value == null ? '—' : formatNumber(Number(value), null, lang, t)} /></Card>
                </Col>
              ))}
            </Row>
          </ResultLayer>

          <ResultLayer layer="evidence" title={t('research.evidence.title')}>
            <Row gutter={[18, 18]} align="top">
            <Col xs={24} xl={17}>
              <Card title={t('research.marketData')} className="surface-card">
                <ProCandlestickChart symbol={currentSymbol} reports={reports} />
              </Card>

              <Card title={t('research.fundamentals')} className="surface-card" style={{ marginTop: 18 }}>
                {fundamentals?.items.length ? (
                  <Row gutter={[12, 12]}>
                    {fundamentals.items.map((item: FundamentalItem) => (
                      <Col xs={24} sm={12} lg={8} key={item.metric}>
                        <div className="fundamental-tile">
                          <Text type="secondary">{metricKeys[item.metric] ? t(metricKeys[item.metric]) : item.metric}</Text>
                          <div className="fundamental-value">{formatNumber(item.value, item.currency, lang, t)}</div>
                          <Text type="secondary">{item.period_type ?? t('research.period.pointInTime')} · {item.as_of}</Text>
                        </div>
                      </Col>
                    ))}
                  </Row>
                ) : <Empty description={t('research.fundamentalsEmpty')} />}
              </Card>

              <FundamentalMetricsPanel fundamentals={fundamentals} error={fundamentalsError} />

              {/^\d{6}$/.test(currentSymbol) && (
                <>
                  <Card title={t('research.chips')} className="surface-card" style={{ marginTop: 18 }} data-testid="chip-card">
                    {chips ? (
                      <>
                        <Row gutter={[12, 12]}>
                          <Col xs={12} md={6}><Statistic title={t('research.chips.profitRatio')} value={chips.latest.profit_ratio * 100} precision={2} suffix="%" /></Col>
                          <Col xs={12} md={6}><Statistic title={t('research.chips.averageCost')} value={chips.latest.average_cost} precision={2} suffix=" CNY" /></Col>
                          <Col xs={12} md={6}><Statistic title={t('research.chips.cost90')} value={`${chips.latest.cost_90.low}–${chips.latest.cost_90.high}`} /></Col>
                          <Col xs={12} md={6}><Statistic title={t('research.chips.cost70')} value={`${chips.latest.cost_70.low}–${chips.latest.cost_70.high}`} /></Col>
                        </Row>
                        <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginTop: 16 }}>
                          <Descriptions.Item label={t('research.chips.concentration90')}>{(chips.latest.cost_90.concentration * 100).toFixed(2)}%</Descriptions.Item>
                          <Descriptions.Item label={t('research.chips.concentration70')}>{(chips.latest.cost_70.concentration * 100).toFixed(2)}%</Descriptions.Item>
                          <Descriptions.Item label={t('research.chips.peak')}><Tag>UNKNOWN</Tag> {t('research.chips.peakUnknown')}</Descriptions.Item>
                          <Descriptions.Item label={t('research.chips.method')}>{t('research.chips.methodValue')}</Descriptions.Item>
                          <Descriptions.Item label={t('research.chips.source')}>{t('research.chips.sourceValue', { provider: chips.provider ?? 'UNKNOWN', source: chips.source ?? 'UNKNOWN', asOf: chips.as_of ?? 'UNKNOWN' })}</Descriptions.Item>
                        </Descriptions>
                        {chips.items.length ? (
                          <section style={{ marginTop: 16 }} aria-label={t('research.chips.chart')}>
                            <Space wrap style={{ marginBottom: 12 }}>
                              <Text strong>{t('research.chips.chart')}</Text>
                              <Segmented<ChipSeriesField>
                                aria-label={t('research.chips.seriesSwitch')}
                                value={chipSeriesField}
                                onChange={setChipSeriesField}
                                options={[
                                  { label: t('research.chips.series.profitRatio'), value: 'profit_ratio' },
                                  { label: t('research.chips.series.averageCost'), value: 'average_cost' },
                                ]}
                              />
                            </Space>
                            <ChipHistoryChart items={chips.items} field={chipSeriesField} />
                          </section>
                        ) : <Empty description={t('research.chips.chartEmpty')} />}
                      </>
                    ) : <Empty description={t('research.chipsEmpty')} />}
                  </Card>

                  <Card title={t('research.moneyFlow.title')} className="surface-card" style={{ marginTop: 18 }} data-testid="money-flow-card">
                    <Spin spinning={moneyFlowLoading}>
                      {moneyFlow ? (
                        <>
                          {moneyFlow.items.length ? (
                            <>
                              <Row gutter={[12, 12]}>
                                {[
                                  [t('research.moneyFlow.mainNet'), moneyFlow.main_net],
                                  [t('research.moneyFlow.superLargeNet'), latestMoneyFlow?.super_large_net],
                                  [t('research.moneyFlow.largeNet'), latestMoneyFlow?.large_net],
                                  [t('research.moneyFlow.mediumNet'), latestMoneyFlow?.medium_net],
                                  [t('research.moneyFlow.smallNet'), latestMoneyFlow?.small_net],
                                ].map(([label, value]) => (
                                  <Col xs={12} md={8} key={String(label)}>
                                    <Statistic title={label} value={formatWan(value as number | null | undefined)} />
                                  </Col>
                                ))}
                              </Row>
                              <Descriptions column={{ xs: 1, sm: 3 }} size="small" style={{ marginTop: 16 }}>
                                <Descriptions.Item label={t('research.moneyFlow.asOf')}>{moneyFlow.as_of ?? t('research.unknown')}</Descriptions.Item>
                                <Descriptions.Item label={t('research.moneyFlow.period')}>{t(`research.moneyFlow.period.${moneyFlow.period}`)}</Descriptions.Item>
                                <Descriptions.Item label={t('research.moneyFlow.source')}>{moneyFlow.source} · {moneyFlow.quality}</Descriptions.Item>
                              </Descriptions>
                            </>
                          ) : <Empty description={t('research.moneyFlow.empty')} />}
                          <div style={{ marginTop: 16 }}>
                            <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                              <Text strong>{t('research.moneyFlow.chart')}</Text>
                              <Segmented
                                aria-label={t('research.moneyFlow.periodSwitch')}
                                disabled={moneyFlowLoading}
                                value={moneyFlowPeriod}
                                options={[
                                  { label: t('research.moneyFlow.period.minute'), value: 'minute' },
                                  { label: t('research.moneyFlow.period.120d'), value: '120d' },
                                ]}
                                onChange={(value) => { void changeMoneyFlowPeriod(value as MoneyFlowPeriod); }}
                              />
                            </Space>
                            <MoneyFlowChart items={moneyFlow.items} period={moneyFlow.period} />
                          </div>
                        </>
                      ) : <Empty description={t('research.moneyFlow.empty')} />}
                    </Spin>
                  </Card>

                  <Card title={t('research.dragonTiger.title')} className="surface-card" style={{ marginTop: 18 }} data-testid="dragon-tiger-card">
                    <Spin spinning={dragonTigerLoading}>
                      <Space wrap style={{ marginBottom: 16 }}>
                        <DatePicker
                          aria-label={t('research.dragonTiger.selectDate')}
                          allowClear={false}
                          disabled={dragonTigerLoading}
                          value={dayjs(dragonTigerDate)}
                          disabledDate={(current) => current.startOf('day').isAfter(dayjs(shanghaiToday()).startOf('day'))}
                          onChange={(value) => { if (value) void changeDragonTigerDate(value.format('YYYY-MM-DD')); }}
                        />
                        <Text type="secondary">{t('research.dragonTiger.dateHint')}</Text>
                      </Space>
                      {dragonTiger?.items.length ? (() => {
                        const record = dragonTiger.items[selectedDragonTigerIndex];
                        const columns = [
                          { title: t('research.dragonTiger.seat'), dataIndex: 'name', key: 'name' },
                          { title: t('research.dragonTiger.buy'), dataIndex: 'buy', key: 'buy', render: (value: number | null) => formatWan(value, 'CNY_10K') },
                          { title: t('research.dragonTiger.sell'), dataIndex: 'sell', key: 'sell', render: (value: number | null) => formatWan(value, 'CNY_10K') },
                          { title: t('research.dragonTiger.net'), dataIndex: 'net', key: 'net', render: (value: number | null) => formatWan(value, 'CNY_10K') },
                        ];
                        return (
                          <>
                            <div role="group" aria-label={t('research.dragonTiger.selectRecord')}>
                              <List
                                header={<Text strong>{t('research.dragonTiger.historyTitle')}</Text>}
                                dataSource={dragonTiger.items}
                                renderItem={(item, index) => (
                                  <List.Item>
                                    <Button
                                      block
                                      type={selectedDragonTigerIndex === index ? 'primary' : 'default'}
                                      aria-label={`${item.date} ${item.reason} ${formatWan(item.net, 'CNY_10K')}`}
                                      aria-pressed={selectedDragonTigerIndex === index}
                                      onClick={() => setSelectedDragonTigerIndex(index)}
                                      style={{ height: 'auto', textAlign: 'left' }}
                                    >
                                      <span style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, width: '100%' }}>
                                        <span>{item.date}</span>
                                        <span title={item.reason} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</span>
                                        <span>{formatWan(item.net, 'CNY_10K')}</span>
                                      </span>
                                    </Button>
                                  </List.Item>
                                )}
                              />
                            </div>
                            <Descriptions column={{ xs: 1, sm: 3 }} size="small" data-testid="dragon-tiger-detail">
                              <Descriptions.Item label={t('research.dragonTiger.code')}>{record.code}</Descriptions.Item>
                              <Descriptions.Item label={t('research.dragonTiger.name')}>{record.name}</Descriptions.Item>
                              <Descriptions.Item label={t('research.dragonTiger.date')}>{record.date}</Descriptions.Item>
                              <Descriptions.Item label={t('research.dragonTiger.reason')}>{record.reason}</Descriptions.Item>
                              <Descriptions.Item label={t('research.dragonTiger.net')}>{formatWan(record.net, 'CNY_10K')}</Descriptions.Item>
                            </Descriptions>
                            {record.top5_buy.length || record.top5_sell.length ? <Row gutter={[12, 12]} style={{ marginTop: 16 }} data-testid="dragon-tiger-seats">
                              <Col xs={24} lg={12}>
                                <Title level={5}>{t('research.dragonTiger.topBuy')}</Title>
                                <Table<DragonTigerSeat> size="small" pagination={false} columns={columns} dataSource={record.top5_buy} rowKey={(seat) => `buy-${seat.name}-${seat.buy}`} scroll={{ x: 'max-content' }} />
                              </Col>
                              <Col xs={24} lg={12}>
                                <Title level={5}>{t('research.dragonTiger.topSell')}</Title>
                                <Table<DragonTigerSeat> size="small" pagination={false} columns={columns} dataSource={record.top5_sell} rowKey={(seat) => `sell-${seat.name}-${seat.sell}`} scroll={{ x: 'max-content' }} />
                              </Col>
                            </Row> : <Empty description={t('research.dragonTiger.noSeats')} />}
                          </>
                        );
                      })() : <Empty description={dragonTiger?.note ?? t('research.dragonTiger.empty')} />}
                    </Spin>
                  </Card>
                </>
              )}

            </Col>

            <Col xs={24} xl={7}>
              <Card title={t('research.sources')} className="surface-card evidence-sidebar">
                <List
                  dataSource={evidence}
                  locale={{ emptyText: t('research.sourcesEmpty') }}
                  renderItem={(item) => (
                    <List.Item>
                      <div>
                        <Space><Tag color="blue">{item.label}</Tag><Text strong>{item.title}</Text></Space>
                        <Paragraph style={{ margin: '8px 0 4px' }}>{item.detail}</Paragraph>
                        <Text type="secondary">{item.provider ?? t('research.sourceUnknown')} · {item.as_of ?? t('research.timeUnknown')}</Text>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>

            </Col>
            </Row>
          </ResultLayer>

          <ResultLayer layer="method">
            <Card title={t('research.method')} className="surface-card">
              <Descriptions column={{ xs: 1, md: 4 }} size="small">
                <Descriptions.Item label={t('research.method.frequency')}>{bars?.frequency ?? snapshot.frequency}</Descriptions.Item>
                <Descriptions.Item label={t('research.method.adjustment')}>{bars?.adjustment ?? t('research.method.notApplicable')}</Descriptions.Item>
                <Descriptions.Item label={t('research.method.currency')}>{snapshot.currency}</Descriptions.Item>
                <Descriptions.Item label={t('research.method.timezone')}>{snapshot.timezone}</Descriptions.Item>
                <Descriptions.Item label={t('research.method.provider')}>{snapshot.provider}</Descriptions.Item>
                <Descriptions.Item label={t('research.method.asOf')}>{snapshot.as_of ?? t('research.unknown')}</Descriptions.Item>
              </Descriptions>
              {[...(snapshot.quality_flags ?? []), ...(bars?.quality_flags ?? []), ...(fundamentals?.quality_flags ?? [])].length ? (
                <Space wrap>
                  {[...(snapshot.quality_flags ?? []), ...(bars?.quality_flags ?? []), ...(fundamentals?.quality_flags ?? [])].map((flag) => <Tag key={flag} color="gold">{flag}</Tag>)}
                </Space>
              ) : <Tag color="green">{t('research.method.noFlags')}</Tag>}
            </Card>
          </ResultLayer>

          <ResearchContinuity
            symbol={currentSymbol}
            currentAsOf={snapshot.as_of}
            savedAsOf={workspaceRecord?.snapshot?.as_of}
            workspaceUpdatedAt={workspaceRecord?.updated_at}
            notes={notes}
            reports={reports}
            discussions={subjectDiscussions}
            theses={subjectTheses}
            errors={continuityErrors}
            loading={continuityLoading}
          />

          <Card title={t('research.notes')} className="surface-card" style={{ marginTop: 18 }}>
            <Alert type="info" showIcon message={t('research.notesNotice')} style={{ marginBottom: 12 }} />
            <TextArea
              aria-label={t('research.notes')}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('research.notesPlaceholder')}
              autoSize={{ minRows: 7, maxRows: 16 }}
            />
          </Card>
        </>
      ) : <Empty description={t('research.snapshotUnavailable')} />}
    </main>
  );
}

/**
 * VS-24：URL 追问（`?prompt=`）的**唯一消费点**。
 *
 * 缺陷（R5 A5-P1-1）：追问条把问题导航到 `/research/:symbol?prompt=…`，但
 * `/research/:symbol` 只对应**一个** Route，同路径仅改查询串**不会重挂载**；
 * 而消费 prompt 的代码此前只在挂载时读一次、且加了 `!currentSymbol` 条件
 * ⇒ 标的研究页提交后界面零反馈，问题只躺在地址栏。`/analysis/:ticker` 那条
 * 入口因 Route 变化会重挂载，于是"同一个按钮两条路径行为相反"。
 *
 * 本卡把消费上移到外层：`?prompt=` 出现即消费，**与是否重挂载无关**，
 * 两条入口（`/analysis/:ticker`、`/research/:symbol`）走同一段代码，不写第二套。
 *
 * 规则（含错误场景裁决）：
 * ① 空 / 纯空白 prompt（`?prompt=`）⇒ **忽略**（绝不发起空研究/空追问），只清理查询串；
 * ② 有标的 ⇒ **追问优先于 `mode`**：把原问题交给能作答的问答面
 *    （`/research/:symbol?mode=fast`），问题经 router state 原样携带；
 *    因与 VS-16 同构，换面时一并剥掉 `session`/`room`（那是"某一条记录"的深链）；
 * ③ 无标的 + 无 mode ⇒ 交给默认研究页的既有检索流程（Astra B6：预填 + 自动检索一次）；
 * ④ 无标的 + 有 mode（fast/deep/review/thesis）⇒ **不动**：这些面自己拥有 prompt
 *    （`Chat` 的 `?prompt=` 草稿契约是既有行为，本卡不碰）；deep/review/thesis 面
 *    目前仍不消费自由文本，属本卡未覆盖的既有边界，已记入结果文件。
 * ⑤ 无论 ①②③，消费后一律用 `replace` 把 `prompt` 从地址栏清掉 ⇒ 刷新/返回都不重放。
 *    （`replace` 是关键：带 prompt 的那条历史记录被就地替换，返回栈里不再存在它。）
 */
export default function ResearchWorkspace() {
  const { symbol } = useParams<{ symbol: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawMode = searchParams.get('mode');
  const rawPrompt = searchParams.get('prompt');
  const question = (rawPrompt ?? '').trim();
  const routedMode = Boolean(rawMode && routedAgentModes.has(rawMode as AgentMode) && rawMode !== 'analyst');
  // 无标的路径的一次性交接（交给 Core 的检索流程）；state 而非 ref，才能驱动 Core 重渲染。
  const [handoffQuestion, setHandoffQuestion] = useState('');
  // 同一个原始 prompt 值只消费一次（StrictMode 双调用 / effect 重入 / 导航回响都不会重放）；
  // 地址栏里 prompt 消失后立即复位，于是"同一问题再提交一次"仍会被当作新的一次追问。
  const consumedPromptRef = useRef<string | null>(null);

  useEffect(() => {
    if (rawPrompt === null) {
      consumedPromptRef.current = null;
      return;
    }
    if (consumedPromptRef.current === rawPrompt) return;
    // ④ 模式面自己拥有 prompt（Chat 草稿契约）——不消费、不清理。
    if (!symbol && routedMode) return;
    consumedPromptRef.current = rawPrompt;

    const next = new URLSearchParams(searchParams);
    next.delete('prompt');
    const clearPrompt = () => setSearchParams(new URLSearchParams(next), { replace: true });

    if (!question) {           // ① 空追问：忽略 + 清理
      clearPrompt();
      return;
    }
    if (!symbol) {             // ③ 无标的：默认研究页检索（B6）
      setHandoffQuestion(question);
      clearPrompt();
      return;
    }
    // ② 有标的：追问优先于 mode —— 交给问答面，问题经 state 原样携带。
    if (rawMode !== 'fast') {  // 与 VS-16 同构：换面即剥掉"某一条记录"的深链
      next.delete('session');
      next.delete('room');
    }
    next.set('mode', 'fast');
    navigate(`/research/${encodeURIComponent(symbol)}?${next.toString()}`, {
      replace: true,
      state: { followup: { symbol: decodeURIComponent(symbol).toUpperCase(), question } },
    });
  }, [navigate, question, rawMode, rawPrompt, routedMode, searchParams, setSearchParams, symbol]);

  if (rawMode === 'thesis') return <ThesisModeSurface />;
  if (rawMode && routedAgentModes.has(rawMode as AgentMode) && rawMode !== 'analyst') {
    return <ResearchModeSurface mode={rawMode as Exclude<AgentMode, 'analyst'>} symbol={symbol} />;
  }
  return <ResearchWorkspaceCore followupPrompt={handoffQuestion} />;
}
