import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Input, Select, Spin, Tag, Tooltip } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchMarketThemes } from '../services/marketDiscoveryApi';
import type { MarketThemesResponse, ThemeSort, ThemeStock } from '../types';

interface MarketThemesPanelProps {
  watchCodes: string[];
  onAdd: (code: string, name: string) => void;
  onAnalyze: (code: string) => void;
}

const DEFAULT_CATALOG = [
  { keyword: '机器人', category: '智能制造' },
  { keyword: '算力', category: '数字基础设施' },
  { keyword: '电力', category: '能源电网' },
  { keyword: '半导体', category: '硬科技' },
];

const SORT_OPTIONS: Array<{ value: ThemeSort; label: string }> = [
  { value: 'change', label: '日涨幅' },
  { value: 'weekly', label: '周涨幅' },
  { value: 'capital', label: '主力资金' },
  { value: 'turnover', label: '换手率' },
];

const formatAmount = (value: number | null | undefined) => {
  if (value == null) return '—';
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(1)}亿`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
  return `${sign}${absolute.toFixed(0)}`;
};

const formatWanAmount = (value: number | null | undefined) => {
  if (value == null) return '—';
  return Math.abs(value) >= 10_000
    ? `${(value / 10_000).toFixed(2)}亿`
    : `${value.toFixed(0)}万`;
};

const formatPercent = (value: number | null | undefined) => value == null
  ? '—'
  : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const sortValue = (stock: ThemeStock, sort: ThemeSort) => ({
  change: stock.change_percent,
  weekly: stock.weekly_change_percent,
  capital: stock.main_net_inflow,
  turnover: stock.turnover_rate,
})[sort];

const formatSortValue = (value: number | null | undefined, sort: ThemeSort) => sort === 'capital'
  ? formatAmount(value)
  : formatPercent(value);

export function buildThemeCandidateChartOption(candidates: ThemeStock[], sort: ThemeSort) {
  const rows = candidates.slice(0, 12).reverse();
  return {
    animationDuration: 450,
    grid: { top: 14, right: 72, bottom: 24, left: 86 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#7296ad',
        formatter: (value: number) => sort === 'capital' ? `${(value / 100_000_000).toFixed(0)}亿` : `${value}%`,
      },
      splitLine: { lineStyle: { color: 'rgba(107, 187, 224, .1)' } },
    },
    yAxis: {
      type: 'category', data: rows.map((item) => item.name),
      axisLabel: { color: '#bdd9e8', width: 76, overflow: 'truncate' },
    },
    series: [{
      type: 'bar', barWidth: 11,
      data: rows.map((stock) => {
        const value = sortValue(stock, sort);
        return {
          value,
          itemStyle: { color: (value ?? 0) >= 0 ? '#ff7d8b' : '#46d6a3' },
        };
      }),
      label: {
        show: true, position: 'right', color: '#dcecf5', fontSize: 9,
        formatter: ({ value }: { value: number }) => formatSortValue(value, sort),
      },
    }],
  };
}

function CandidateAction({
  stock, watched, onAdd, onAnalyze,
}: {
  stock: ThemeStock;
  watched: boolean;
  onAdd: (code: string, name: string) => void;
  onAnalyze: (code: string) => void;
}) {
  return (
    <span className="market-pulse__row-actions">
      <Button type="link" size="small" onClick={() => onAnalyze(stock.code)}>分析</Button>
      <Tooltip title={watched ? '已在自选股中' : '加入本地自选股'}>
        <Button type="text" size="small" disabled={watched} icon={<PlusOutlined />} onClick={() => onAdd(stock.code, stock.name)} aria-label={`${watched ? '已添加' : '添加'} ${stock.name} 到自选股`} />
      </Tooltip>
    </span>
  );
}

export default function MarketThemesPanel({ watchCodes, onAdd, onAnalyze }: MarketThemesPanelProps) {
  const [draft, setDraft] = useState('机器人');
  const [keyword, setKeyword] = useState('机器人');
  const [sort, setSort] = useState<ThemeSort>('change');
  const [data, setData] = useState<MarketThemesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextKeyword: string, nextSort: ThemeSort) => {
    const normalized = nextKeyword.trim();
    if (!normalized) return;
    setLoading(true);
    setError('');
    setKeyword(normalized);
    setSort(nextSort);
    try {
      setData(await fetchMarketThemes(normalized, nextSort));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '主题分类暂不可用');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load('机器人', 'change'); }, [load]);

  const catalog = data?.catalog ?? DEFAULT_CATALOG;
  const candidates = data?.candidates ?? [];
  const batch = useMemo(
    () => candidates.slice(0, 5).filter((item) => !watchCodes.includes(item.code)),
    [candidates, watchCodes],
  );

  return (
    <div className="market-themes" aria-label="关键词主题分类">
      <div className="market-themes__toolbar">
        <div className="market-themes__search">
          <Input
            value={draft}
            maxLength={30}
            prefix={<SearchOutlined />}
            placeholder="输入主题，例如机器人、算力、电力、半导体"
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={() => void load(draft, sort)}
            aria-label="主题关键词"
          />
          <Button type="primary" loading={loading} onClick={() => void load(draft, sort)}>检索主题</Button>
        </div>
        <Select<ThemeSort>
          value={sort}
          options={SORT_OPTIONS}
          onChange={(value) => void load(keyword, value)}
          aria-label="主题股票排序"
        />
        <Button type="text" icon={<ReloadOutlined spin={loading} />} onClick={() => void load(keyword, sort)}>刷新</Button>
      </div>

      <div className="market-themes__presets" aria-label="主题分类预设">
        {catalog.map((item) => (
          <button
            type="button"
            className={item.keyword === keyword ? 'is-active' : ''}
            key={item.keyword}
            onClick={() => {
              setDraft(item.keyword);
              void load(item.keyword, sort);
            }}
          >
            <span>{item.category}</span><strong>{item.keyword}</strong>
          </button>
        ))}
      </div>

      {error && <Alert type="warning" showIcon message="主题分类暂不可用" description={error} />}
      {loading && !data ? <div className="market-movers__loading"><Spin /><span>正在扫描完整行业与概念板块目录…</span></div> : data ? (
        <>
          <div className="market-themes__summary">
            <div><span>主题分类</span><strong>{data.category}</strong><small>{data.keyword} → {data.expanded_terms.slice(0, 4).join(' / ')}</small></div>
            <div><span>目录覆盖</span><strong>{data.coverage.industry_boards_scanned + data.coverage.concept_boards_scanned}</strong><small>{data.coverage.industry_boards_scanned} 行业 + {data.coverage.concept_boards_scanned} 概念</small></div>
            <div><span>匹配板块</span><strong>{data.matched_theme_count}</strong><small>当前展示 {data.returned_theme_count} 个高相关板块</small></div>
            <div><span>同花顺资金</span><strong>{data.coverage.tonghuashun_succeeded}/{data.coverage.tonghuashun_requested}</strong><small>命中率 {(data.coverage.tonghuashun_rate * 100).toFixed(0)}%</small></div>
          </div>

          {data.status === 'empty' ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`完整板块目录中没有匹配“${data.keyword}”的公开主题`} /> : (
            <>
              <div className="market-themes__boards" aria-label="匹配板块">
                {data.themes.map((theme) => (
                  <article key={theme.code}>
                    <div><Tag>{theme.kind === 'industry' ? '行业' : '概念'}</Tag><small>命中：{theme.matched_term}</small></div>
                    <strong>{theme.name}</strong>
                    <b className={(theme.change_percent ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatPercent(theme.change_percent)}</b>
                    <p>{theme.advancers ?? '—'} 涨 / {theme.decliners ?? '—'} 跌 · 领涨 {theme.leader ?? '—'} {formatPercent(theme.leader_change_percent)}</p>
                  </article>
                ))}
              </div>

              <div className="market-pulse__batchbar">
                <span>候选去重 {candidates.length} 只 · 当前按 {SORT_OPTIONS.find((item) => item.value === sort)?.label} 排序</span>
                <Button size="small" disabled={!batch.length} onClick={() => batch.forEach((stock) => onAdd(stock.code, stock.name))}>批量加入前 5</Button>
              </div>
              <div className="market-pulse__split">
                <div className="market-pulse__chart" aria-label={`${keyword}主题候选排行图`}>
                  <ReactECharts option={buildThemeCandidateChartOption(candidates, sort)} style={{ height: 430 }} notMerge lazyUpdate />
                </div>
                <div className="market-pulse__table-wrap">
                  <div className="market-pulse__subhead"><strong>跨板块候选</strong><span>东方财富排行 + 同花顺资金</span></div>
                  <table><thead><tr><th>股票</th><th>所属主题</th><th>日/周涨跌</th><th>主力资金</th><th>同花顺</th><th>操作</th></tr></thead><tbody>
                    {candidates.slice(0, 20).map((stock) => <tr key={stock.code}><td><strong>{stock.name}</strong><small>{stock.code.toUpperCase()} · {stock.ths_industry || stock.industry || '行业未知'}</small></td><td>{stock.theme_names?.slice(0, 2).map((name) => <Tag key={name}>{name}</Tag>)}</td><td className={(stock.change_percent ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatPercent(stock.change_percent)}<small>周 {formatPercent(stock.weekly_change_percent)}</small></td><td className={(stock.main_net_inflow ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatAmount(stock.main_net_inflow)}</td><td className={(stock.ths_main_net_inflow ?? 0) >= 0 ? 'price-up' : 'price-down'}>{stock.source_status.tonghuashun ? formatWanAmount(stock.ths_main_net_inflow) : <Tag>未请求</Tag>}</td><td><CandidateAction stock={stock} watched={watchCodes.includes(stock.code)} onAdd={onAdd} onAnalyze={onAnalyze} /></td></tr>)}
                  </tbody></table>
                </div>
              </div>
            </>
          )}
          <div className="market-themes__source">更新 {new Date(data.as_of).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 仅匹配东方财富公开板块名称及成分股；别名扩展词在摘要中可见</div>
        </>
      ) : null}
    </div>
  );
}
