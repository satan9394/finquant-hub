/* FinQuant Entity Workspace — the canonical /analysis/:ticker surface. */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Input, message, Spin, Tabs } from 'antd';
import { fetchQuote } from '../services/stockApi';
import { requestAnalysis } from '../services/analysisApi';
import type { RealTimeQuote, SignalBadge, AnalysisSection } from '../types';
import EntityHeader from '../components/EntityHeader';
import MetricStrip from '../components/MetricStrip';
import ThesisBlock from '../components/ThesisBlock';
import EvidenceRail from '../components/EvidenceRail';
import AgentModeSelector, { type AgentMode } from '../components/AgentModeSelector';
import FinancialTable from '../components/FinancialTable';
import TimeseriesChart from '../components/TimeseriesChart';
import StockChart from '../components/StockChart';
import StatusChip from '../components/StatusChip';
import SourceChip from '../components/SourceChip';
import { useLanguage } from '../i18n/LanguageContext';
import type { Language } from '../i18n';
import Chat from './Chat';
import Discussion from './Discussion';
import Research from './Research';

const fmtPrice = (value?: number | null) => value == null ? 'UNKNOWN' : value.toFixed(2);
const fmtPercent = (value?: number | null) => value == null ? 'UNKNOWN' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const fmtVolume = (value: number | null | undefined, lang: Language) => value == null
  ? 'UNKNOWN'
  : new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);

export function addLocalWatchlistItem(code: string, name: string): boolean {
  const normalized = code.trim();
  let current: Array<{ code: string; name: string }> = [];
  try {
    const parsed = JSON.parse(localStorage.getItem('finquant_watchlist') || '[]');
    if (Array.isArray(parsed)) current = parsed;
  } catch {
    current = [];
  }
  if (current.some((item) => item.code.toUpperCase() === normalized.toUpperCase())) return false;
  localStorage.setItem('finquant_watchlist', JSON.stringify([...current, { code: normalized, name }]));
  return true;
}

// ponytail: removed the unreachable pre-Research-OS page; /analysis/:ticker now has one canonical implementation.

export default function StockAnalysis() {
  const { ticker = '' } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lang, t } = useLanguage();
  const [quote, setQuote] = useState<RealTimeQuote | null>(null);
  const [loading, setLoading] = useState(Boolean(ticker));
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>((searchParams.get('mode') as AgentMode | null) ?? 'analyst');
  const [analysisSections, setAnalysisSections] = useState<AnalysisSection[]>([]);
  const [signals, setSignals] = useState<SignalBadge[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [search, setSearch] = useState(ticker);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    fetchQuote(ticker)
      .then(setQuote)
      .catch((reason) => { setQuote(null); setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => setLoading(false));
  }, [ticker]);

  const runAnalysis = async () => {
    if (!ticker) return;
    setAnalysisLoading(true);
    try {
      const result = await requestAnalysis({ ticker });
      setAnalysisSections(result.sections ?? []);
      setSignals(result.signals ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAnalysisLoading(false);
    }
  };

  const addToWatchlist = () => {
    const code = ticker.trim();
    const name = quote?.name || code;
    if (!addLocalWatchlistItem(code, name)) {
      message.info(t('entity.watchExists', { ticker: code.toUpperCase() }));
      return;
    }
    message.success(t('entity.watchAdded', { name }));
  };

  const copy = {
    search: t('entity.workspace.search'), overview: t('entity.tab.overview'), thesis: t('entity.tab.thesis'),
    financials: t('entity.tab.financials'), valuation: t('entity.tab.valuation'), peers: t('entity.tab.peers'),
    earnings: t('entity.tab.earnings'), price: t('entity.tab.price'), research: t('entity.tab.research'),
    snapshot: t('entity.section.snapshot'), brief: t('entity.section.brief'), catalysts: t('entity.section.catalysts'),
    unavailable: t('entity.workspace.unavailable'), run: t('entity.action.refreshResearch'),
  };
  const asOf = quote?.timestamp ? new Date(quote.timestamp * 1000).toISOString() : null;
  const evidence = quote ? {
    id: 1,
    title: t('entity.evidence.marketSnapshot'),
    sourceType: 'Market data',
    authority: 'UNKNOWN',
    publisher: 'UNKNOWN',
    publishedAt: asOf,
    excerpt: `${quote.name} ${quote.code}: ${quote.price}`,
    confidence: 'UNKNOWN',
  } : null;
  const addEvidenceToThesis = () => {
    if (!evidence) return;
    const claim = `${evidence.title}: ${evidence.excerpt || 'UNKNOWN'} · ${evidence.sourceType || 'UNKNOWN'} · ${evidence.publishedAt || 'UNKNOWN'}`;
    navigate(`/research?mode=thesis&new=1&ticker=${encodeURIComponent(ticker)}&claim=${encodeURIComponent(claim)}`);
  };
  const thesisData = {
    stance: null,
    conviction: null,
    core: [] as string[],
    evidenceFor: signals.filter((signal) => signal.type === 'bullish').map((signal) => ({ text: signal.description ? `${signal.label}: ${signal.description}` : signal.label })),
    evidenceAgainst: signals.filter((signal) => signal.type === 'bearish').map((signal) => ({ text: signal.description ? `${signal.label}: ${signal.description}` : signal.label })),
    catalysts: [] as string[],
    invalidationRules: [] as string[],
    drift: null,
    convictionChange: null,
  };
  const unknown = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={copy.unavailable} />;
  const overview = (
    <div className="entity-overview">
      <section><h2>{copy.snapshot}</h2><MetricStrip onReference={() => setEvidenceOpen(true)} items={[
        { key: 'price', label: t('entity.metric.price'), value: quote ? fmtPrice(quote.price) : 'UNKNOWN', tone: quote ? (quote.change_percent >= 0 ? 'up' : 'down') : 'neutral', sourceRef: quote ? 1 : undefined },
        { key: 'market-cap', label: t('entity.metric.marketCap'), value: quote ? fmtVolume(quote.market_cap, lang) : 'UNKNOWN', sourceRef: quote ? 1 : undefined },
        { key: 'pe', label: 'PE', value: quote?.pe == null ? 'UNKNOWN' : quote.pe.toFixed(2), sourceRef: quote ? 1 : undefined },
        { key: 'pb', label: 'PB', value: quote?.pb == null ? 'UNKNOWN' : quote.pb.toFixed(2), sourceRef: quote ? 1 : undefined },
        { key: 'roe', label: 'ROE', value: 'UNKNOWN' },
        { key: 'fcf', label: 'FCF', value: 'UNKNOWN' },
      ]} /></section>
      <section className="entity-brief"><div className="section-heading"><h2>{copy.brief}</h2><StatusChip label={analysisSections.length ? 'MODEL_OUTPUT' : 'UNKNOWN'} tone={analysisSections.length ? 'info' : 'neutral'} /></div>
        {analysisSections.length ? <ul>{analysisSections.slice(0, 5).map((section) => <li key={section.title}><strong>{section.title}</strong><p>{section.content}</p></li>)}</ul> : unknown}
      </section>
      <ThesisBlock thesis={thesisData} onReference={() => setEvidenceOpen(true)} />
      <section><h2>{copy.catalysts}</h2>{unknown}</section>
    </div>
  );
  const researchView = mode === 'fast'
    ? <Chat initialPrompt={t('research.mode.fastPrompt', { ticker: ticker.toUpperCase() })} />
    : mode === 'deep'
      ? <Research initialTicker={ticker} />
      : mode === 'review'
        ? <Discussion initialTopic={t('research.mode.reviewTopic', { ticker: ticker.toUpperCase() })} />
        : <div className="research-mode-panel"><div className="section-heading"><h2>{copy.brief}</h2><Button type="primary" loading={analysisLoading} onClick={() => void runAnalysis()}>{copy.run}</Button></div>{analysisSections.length ? analysisSections.map((section) => <article key={section.title}><h3>{section.title}</h3><p>{section.content}</p><SourceChip provider="MODEL_OUTPUT" quality="UNKNOWN" /></article>) : unknown}</div>;

  if (!ticker) return <div className="entity-workspace"><Empty description={copy.search} /></div>;
  return (
    <div className="entity-workspace">
      <Input.Search aria-label={copy.search} value={search} placeholder={copy.search} onChange={(event) => setSearch(event.target.value)} onSearch={(value) => value.trim() && navigate(`/analysis/${encodeURIComponent(value.trim())}?autorun=0`)} />
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      {loading ? <div className="page-loading"><Spin /></div> : (
        <>
          <EntityHeader
            name={quote?.name || ticker.toUpperCase()}
            ticker={ticker}
            market={null}
            industry={null}
            price={quote ? fmtPrice(quote.price) : null}
            change={quote ? fmtPercent(quote.change_percent) : null}
            changeTone={quote ? (quote.change_percent >= 0 ? 'up' : 'down') : 'neutral'}
            asOf={asOf}
            provider={null}
            onWatch={addToWatchlist}
            onMonitor={() => navigate(`/alerts?new=1&ticker=${encodeURIComponent(ticker)}`)}
            onCompare={() => navigate(`/compare?query=${encodeURIComponent(ticker)}`)}
          />
          <div className="entity-mode-row"><AgentModeSelector value={mode} onChange={setMode} /></div>
          <Tabs
            className="entity-tabs"
            items={[
              { key: 'overview', label: copy.overview, children: overview },
              { key: 'thesis', label: copy.thesis, children: <ThesisBlock thesis={thesisData} onReference={() => setEvidenceOpen(true)} /> },
              { key: 'financials', label: copy.financials, children: <FinancialTable rows={[]} /> },
              { key: 'valuation', label: copy.valuation, children: <FinancialTable rows={[{ key: 'pe', metric: 'PE', value: quote?.pe == null ? 'UNKNOWN' : quote.pe.toFixed(2), source: 'UNKNOWN' }, { key: 'pb', metric: 'PB', value: quote?.pb == null ? 'UNKNOWN' : quote.pb.toFixed(2), source: 'UNKNOWN' }]} /> },
              { key: 'peers', label: copy.peers, children: unknown },
              { key: 'earnings', label: copy.earnings, children: unknown },
              { key: 'price', label: copy.price, children: <TimeseriesChart title={`${quote?.name || ticker} · ${copy.price}`} provider={null} asOf={asOf}><StockChart ticker={ticker} theme="light" /></TimeseriesChart> },
              { key: 'research', label: copy.research, children: researchView },
            ]}
          />
          <EvidenceRail open={evidenceOpen} evidence={evidence} onClose={() => setEvidenceOpen(false)} onAdd={evidence ? addEvidenceToThesis : undefined} />
        </>
      )}
    </div>
  );
}
