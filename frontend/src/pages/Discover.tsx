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
import LoadFailureAlert from '../components/LoadFailureAlert';

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

/**
 * VS36：一次检索的**全部产出连同它属于哪个查询词**作为一个整体提交。
 * 分开的 `stocks` / `factors` / `errors` / `tickers` 四个 state 各自被赋值 ⇒ "新词的对象 + 上一词的结果"
 * 可以并存；绑定成一个值之后，"只渲染属于当前查询词的那一份"就成了结构性质，而不是纪律。
 */
type DiscoverOutcome = {
  query: string;
  tickers: string[];
  stocks: DiscoveredStock[];
  factors: AlphaSearchResult[];
  errors: Array<{ ticker: string; error: string }>;
};

export default function Discover() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  const initialQuery = searchParams.get('q') || searchParams.get('query') || searchParams.get('tickers') || '';

  const [query, setQuery] = useState(initialQuery);
  // VS36：结果不再各自散落 —— 一份产出 = 一个值 + 它属于哪个查询词（`query` 字段）。
  const [outcome, setOutcome] = useState<DiscoverOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [executedQuery, setExecutedQuery] = useState('');
  // VS36：公司名检索的失败态**自带归属**（哪个查询词 + 出错原文），不再靠"发起新请求时清一下"掩盖。
  // 同族范式：VS-32 的 `detailErrorId`（27233a4）——切到新词时旧失败因归属不匹配而自动不渲染，
  // 而"这条失败是谁的"这一信息被保住（切回来仍然显示它）。
  const [nameSearchFailure, setNameSearchFailure] = useState<{ query: string; error: string } | null>(null);
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
    // 这里**只是把"页面当前对象"切到新词上**：上一词的产出/失败因归属不匹配而不再渲染，
    // 不需要（也不应该）顺手把它们清掉 —— 信息保留在原位，切回去还在。
    setExecutedQuery(trimmed);
    setSearchParams({ q: trimmed });
    try {
      if (!requestedTickers.length) {
        try {
          const matches = await searchStocks(trimmed);
          if (id !== requestId.current) return;
          requestedTickers = Array.from(new Set(matches.map((match) => match.code))).slice(0, 10);
          // "成功才清失败态"（VS-32 口径）：失败态在重试期间保持显示，成功后才消失。
          setNameSearchFailure((current) => (current && current.query === trimmed ? null : current));
        } catch (error) {
          if (id !== requestId.current) return;
          setNameSearchFailure({
            query: trimmed,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const [screenResult, factorResult] = await Promise.allSettled([
        requestedTickers.length ? apiClient.post('/screening', { tickers: requestedTickers }) : Promise.resolve(null),
        searchAlpha(trimmed),
      ]);
      if (id !== requestId.current) return;
      const next: DiscoverOutcome = {
        query: trimmed,
        tickers: requestedTickers,
        stocks: [],
        errors: [],
        factors: factorResult.status === 'fulfilled' ? factorResult.value : [],
      };
      if (screenResult.status === 'fulfilled' && screenResult.value) {
        next.stocks = screenResult.value.data.items ?? [];
        next.errors = screenResult.value.data.errors ?? [];
      } else if (requestedTickers.length) {
        next.errors = requestedTickers.map((ticker) => ({ ticker, error: 'screening unavailable' }));
      }
      setOutcome(next);
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

  // VS36：渲染处只认"属于**页面当前对象**（executedQuery）"的那一份产出 —— 换词在途时不可能再看到
  // 上一词的结果（`TaskPageHeader.object` 就是 executedQuery，页面只有一个"当前对象"）。
  const scopedOutcome = outcome && outcome.query === executedQuery ? outcome : null;
  const tickers = scopedOutcome?.tickers ?? [];
  const stocks = scopedOutcome?.stocks ?? [];
  const factors = scopedOutcome?.factors ?? [];
  const errors = scopedOutcome?.errors ?? [];
  // VS36：失败同样只认"属于当前对象"的那一份；并且**输入框里已经是别的词时不再显示**它
  // （错误横幅就在检索入口下方，读起来会像是"你正在输入的这个新词失败了"）。
  const objectNameSearchFailure = nameSearchFailure && nameSearchFailure.query === executedQuery ? nameSearchFailure : null;
  const scopedNameSearchFailure = objectNameSearchFailure && query.trim() === executedQuery
    ? objectNameSearchFailure
    : null;

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
    {/* VS36：公司名检索失败 ⇒ 复用族内唯一错误态实现（VS-29 的 `LoadFailureAlert`）：说清是什么失败、
        带出底层原文、并给一个**真的重发同一查询词**的重试。失败不再被渲染成"没有可验证的股票结果"的空态。 */}
    {scopedNameSearchFailure && <LoadFailureAlert
      message={t('discover.nameSearchFailed')}
      error={scopedNameSearchFailure.error}
      onRetry={() => void run(scopedNameSearchFailure.query)}
    />}
    {executedQuery && !objectNameSearchFailure && !loading && !tickers.length
      ? <Alert showIcon type="warning" message={t('discover.semanticWarning')} description={t('discover.semanticDescription')} />
      : null}
    {errors.length ? <Alert showIcon type="warning" message={t('discover.failed', { tickers: errors.map((item) => item.ticker).join('、') })} description={t('discover.failedDescription')} /> : null}
    {executedQuery && <>{/* 当前对象连公司名都没检索出来 ⇒ 不摆一张"没有可验证的股票结果"的空态去冒称"确实没有"。 */}
      {!objectNameSearchFailure && <Card className="surface-card" title={t('discover.stockResults')} extra={<SourceChip provider="screening API" quality={stocks.length ? 'OK' : 'UNKNOWN'} />}>
        <DiscoverResults items={stocks} loading={loading} navigate={navigate} onWatch={addToWatchlist} />
      </Card>}
    <Card className="surface-card" title={t('discover.factorResults')} extra={<SourceChip provider="WQ catalogue" quality={factors.length ? 'OK' : 'UNKNOWN'} />}>
      <List<AlphaSearchResult>
        dataSource={factors}
        // 在途且手上还没有属于当前对象的结果 ⇒ 交给加载态，不用"没有匹配的真实因子目录结果"冒充结论。
        loading={loading && !factors.length}
        locale={{ emptyText: t('discover.noFactors') }}
        renderItem={(item) => <List.Item><List.Item.Meta title={item.name} description={`${item.desc || 'UNKNOWN'} · ${item.dataset || item.category || 'UNKNOWN'}`} /></List.Item>}
      />
    </Card></>}
  </main>;
}
