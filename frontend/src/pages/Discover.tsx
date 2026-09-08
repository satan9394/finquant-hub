import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, List, message, Space, Typography } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DiscoverSearch from '../components/DiscoverSearch';
import DiscoverResults, { type DiscoveredStock } from '../components/DiscoverResults';
import SourceChip from '../components/SourceChip';
import TaskPageHeader from '../components/TaskPageHeader';
import AlphaResearchPanel from '../components/alpha/AlphaResearchPanel';
import apiClient from '../services/api';
import { searchAlpha, type AlphaSearchResult } from '../services/alphaApi';
import { useLanguage } from '../i18n/LanguageContext';
import { searchStocks } from '../services/stockApi';
import DiscoverThemes from '../components/DiscoverThemes';

// 股票代码提取：6/5 位数字与 .HK 后缀按代码处理；裸字母 token 需排除常见
// 筛选/因子术语（ROE/FCF/CAGR 等财务缩写），避免把自然语言筛选词误当证券
// 代码提交（Astra B7：`ROE > 20%` 被提取成 ROE、`FCF CAGR > 10%` 提取成
// FCF、CAGR）。AAPL 之类真实 US 代码不在术语表，仍正常提取。
const tickerPattern = /\b(?:[036]\d{5}|\d{5}|[A-Z]{2,5}(?:\.[A-Z])?)\b/gi;

// 与 i18n discover.filter.* 及常见财务因子缩写一致的术语黑名单（大写比对）。
const FACTOR_TERMS = new Set([
  'ROE', 'FCF', 'CAGR', 'PE', 'PB', 'EPS', 'ROA', 'ROIC', 'DCF', 'EV', 'EBITDA',
  'PEG', 'VS', 'AND', 'OR', 'WITH', 'HIGH', 'LOW', 'GROWING', 'STOCKS', 'COMPANY',
]);

export function extractTickers(query: string) {
  return Array.from(new Set(
    (query.match(tickerPattern) ?? [])
      .map((ticker) => ticker.toUpperCase())
      .filter((candidate) => !FACTOR_TERMS.has(candidate)),
  ));
}

export default function Discover() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const initialQuery = searchParams.get('q') || searchParams.get('query') || searchParams.get('tickers') || '';

  const [query, setQuery] = useState(initialQuery);
  const [stocks, setStocks] = useState<DiscoveredStock[]>([]);
  const [factors, setFactors] = useState<AlphaSearchResult[]>([]);
  const [errors, setErrors] = useState<Array<{ ticker: string; error: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [executedQuery, setExecutedQuery] = useState('');
  const [tickers, setTickers] = useState<string[]>([]);
  const [nameSearchFailed, setNameSearchFailed] = useState(false);
  const requestId = useRef(0);

  const run = async (rawQuery = query) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      message.warning(t('discover.emptyQuery'));
      return;
    }
    const id = ++requestId.current;
    let requestedTickers = extractTickers(trimmed);
    setLoading(true);
    setNameSearchFailed(false);
    setExecutedQuery(trimmed);
    setSearchParams({ q: trimmed });
    try {
      if (!requestedTickers.length) {
        try {
          const matches = await searchStocks(trimmed);
          if (id !== requestId.current) return;
          requestedTickers = Array.from(new Set(matches.map((match) => match.code))).slice(0, 10);
        } catch {
          if (id !== requestId.current) return;
          setNameSearchFailed(true);
        }
      }
      setTickers(requestedTickers);
      const [screenResult, factorResult] = await Promise.allSettled([
        requestedTickers.length ? apiClient.post('/screening', { tickers: requestedTickers }) : Promise.resolve(null),
        searchAlpha(trimmed),
      ]);
      if (id !== requestId.current) return;
      if (screenResult.status === 'fulfilled' && screenResult.value) {
        setStocks(screenResult.value.data.items ?? []);
        setErrors(screenResult.value.data.errors ?? []);
      } else {
        setStocks([]);
        setErrors(requestedTickers.map((ticker) => ({ ticker, error: 'screening unavailable' })));
      }
      setFactors(factorResult.status === 'fulfilled' ? factorResult.value : []);
      if (factorResult.status === 'rejected') message.warning(t('discover.factorUnavailable'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (mode !== 'alpha' && initialQuery) void run(initialQuery);
    // URL presets are explicit user input and should execute once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToWatchlist = (stock: DiscoveredStock) => {
    const current = JSON.parse(localStorage.getItem('finquant_watchlist') || '[]') as Array<{ code: string; name: string }>;
    if (!current.some((item) => item.code === stock.ticker)) {
      localStorage.setItem('finquant_watchlist', JSON.stringify([...current, { code: stock.ticker, name: stock.name }]));
    }
    message.success(t('discover.watchAdded', { name: stock.name }));
  };

  if (mode === 'alpha') {
    return <AlphaResearchPanel />;
  }

  return <main className="product-page discover-page">
    <TaskPageHeader
      eyebrow={t('discover.eyebrow')}
      title={t('discover.title')}
      goal={t('discover.goal')}
      object={executedQuery || t('discover.waitingObject')}
      status={loading ? t('discover.loading') : executedQuery ? t('discover.checked', { count: tickers.length }) : t('discover.waiting')}
      statusTone={loading ? 'loading' : errors.length ? 'warning' : executedQuery ? 'success' : 'neutral'}
    />
    <DiscoverSearch
      value={query}
      loading={loading}
      onChange={setQuery}
      onSubmit={() => void run()}
      onApplyFilter={(filter, checked) => setQuery((current) => {
        const parts = current.split(' · ').map((part) => part.trim()).filter(Boolean).filter((part) => part !== filter);
        return (checked ? [...parts, filter] : parts).join(' · ');
      })}
    />
    {!executedQuery && <Card className="surface-card" title={t('discover.examples.title')}>
      <Typography.Paragraph>{t('discover.examples.help')}</Typography.Paragraph>
      <Space wrap>{[
        { name: '贵州茅台', ticker: '600519' }, { name: '腾讯控股', ticker: '00700' }, { name: 'Apple', ticker: 'AAPL' },
      ].map((item) => <Button key={item.ticker} onClick={() => { setQuery(item.ticker); void run(item.ticker); }}>{item.name} · {item.ticker}</Button>)}</Space>
    </Card>}
    <DiscoverThemes />
    {nameSearchFailed && <Alert showIcon type="warning" message={t('discover.nameSearchFailed')} />}
    {executedQuery && !tickers.length ? <Alert showIcon type="warning" message={t('discover.semanticWarning')} description={t('discover.semanticDescription')} /> : null}
    {errors.length ? <Alert showIcon type="warning" message={t('discover.failed', { tickers: errors.map((item) => item.ticker).join('、') })} description={t('discover.failedDescription')} /> : null}
    {executedQuery && <><Card className="surface-card" title={t('discover.stockResults')} extra={<SourceChip provider="screening API" quality={stocks.length ? 'OK' : 'UNKNOWN'} />}>
      <DiscoverResults items={stocks} loading={loading} navigate={navigate} onWatch={addToWatchlist} />
    </Card>
    <Card className="surface-card" title={t('discover.factorResults')} extra={<SourceChip provider="WQ catalogue" quality={factors.length ? 'OK' : 'UNKNOWN'} />}>
      <List<AlphaSearchResult>
        dataSource={factors}
        locale={{ emptyText: t('discover.noFactors') }}
        renderItem={(item) => <List.Item><List.Item.Meta title={item.name} description={`${item.desc || 'UNKNOWN'} · ${item.dataset || item.category || 'UNKNOWN'}`} /></List.Item>}
      />
    </Card></>}
  </main>;
}
