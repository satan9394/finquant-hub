import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Spin, Tabs, Tag, Tooltip } from 'antd';
import { ArrowRightOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchMarketPulse } from '../services/marketDiscoveryApi';
import MarketThemesPanel from './MarketThemesPanel';
import type {
  CapitalFlowItem,
  MarketMover,
  MarketPulseResponse,
  MarketSector,
  WeeklyMarketMover,
} from '../types';
import { readChartTokens, withAlpha } from '../styles/themeTokens';

interface MarketMoversPanelProps {
  watchCodes: string[];
  onAdd: (code: string, name: string) => void;
  onAnalyze: (code: string) => void;
}

type PulseSections = MarketPulseResponse['sections'];

export function buildMoverChartOption(gainers: MarketMover[], decliners: MarketMover[]) {
  const colors = readChartTokens();
  const rows = [
    ...[...decliners].sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0)).slice(0, 6).reverse(),
    ...[...gainers].sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0)).slice(0, 6).reverse(),
  ].filter((item) => item.change_percent !== null);
  return {
    animationDuration: 450,
    grid: { top: 12, right: 58, bottom: 24, left: 78, containLabel: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%` },
    xAxis: {
      type: 'value',
      axisLabel: { color: colors.text, formatter: (value: number) => `${value}%` },
      axisLine: { lineStyle: { color: withAlpha(colors.gridStrong, 0.28) } },
      splitLine: { lineStyle: { color: withAlpha(colors.grid, 0.1) } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((item) => item.name),
      axisLabel: { color: colors.textPrimary, width: 68, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      barWidth: 12,
      data: rows.map((item) => ({
        value: item.change_percent,
        itemStyle: {
          color: (item.change_percent ?? 0) >= 0 ? colors.up : colors.down,
          borderRadius: (item.change_percent ?? 0) >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
        },
      })),
      label: {
        show: true,
        position: 'right',
        color: colors.textPrimary,
        fontSize: 10,
        formatter: (params: { value: number }) => `${params.value > 0 ? '+' : ''}${params.value.toFixed(2)}%`,
      },
    }],
  };
}

export function buildSectorChartOption(items: MarketSector[]) {
  const colors = readChartTokens();
  const rows = [...items].sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity)).slice(0, 12).reverse();
  return {
    animationDuration: 450,
    grid: { top: 10, right: 60, bottom: 20, left: 92 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLabel: { color: colors.text, formatter: '{value}%' }, splitLine: { lineStyle: { color: withAlpha(colors.grid, 0.1) } } },
    yAxis: { type: 'category', data: rows.map((item) => item.name), axisLabel: { color: colors.textPrimary, width: 82, overflow: 'truncate' } },
    series: [{
      type: 'bar',
      barWidth: 11,
      data: rows.map((item) => ({
        value: item.change_percent,
        itemStyle: { color: (item.change_percent ?? 0) >= 0 ? colors.up : colors.down },
      })),
      label: { show: true, position: 'right', color: colors.textPrimary, fontSize: 10, formatter: ({ value }: { value: number }) => `${value > 0 ? '+' : ''}${value?.toFixed(2) ?? '—'}%` },
    }],
  };
}

export function buildFlowChartOption(items: CapitalFlowItem[]) {
  const colors = readChartTokens();
  const rows = [...items].sort((a, b) => (b.main_net_inflow ?? -Infinity) - (a.main_net_inflow ?? -Infinity)).slice(0, 12).reverse();
  return {
    animationDuration: 450,
    grid: { top: 10, right: 68, bottom: 20, left: 92 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLabel: { color: colors.text, formatter: (value: number) => `${(value / 100_000_000).toFixed(0)}亿` }, splitLine: { lineStyle: { color: withAlpha(colors.grid, 0.1) } } },
    yAxis: { type: 'category', data: rows.map((item) => item.name), axisLabel: { color: colors.textPrimary, width: 82, overflow: 'truncate' } },
    series: [{
      type: 'bar',
      barWidth: 11,
      data: rows.map((item) => ({
        value: item.main_net_inflow,
        itemStyle: { color: (item.main_net_inflow ?? 0) >= 0 ? colors.up : colors.down },
      })),
      label: { show: true, position: 'right', color: colors.textPrimary, fontSize: 10, formatter: ({ value }: { value: number }) => formatAmount(value) },
    }],
  };
}

const formatAmount = (value: number | null | undefined) => {
  if (value == null) return '—';
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${sign}${(absolute / 100_000_000).toFixed(1)}亿`;
  if (absolute >= 10_000) return `${sign}${(absolute / 10_000).toFixed(0)}万`;
  return `${sign}${absolute.toFixed(0)}`;
};

const formatPercent = (value: number | null | undefined) => value == null
  ? '—'
  : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

const formatWanAmount = (value: number | null | undefined) => {
  if (value == null) return '—';
  return Math.abs(value) >= 10_000
    ? `${(value / 10_000).toFixed(2)}亿`
    : `${value.toFixed(0)}万`;
};

export function marketPulseSummary(data: MarketPulseResponse | null) {
  const breadth = data?.sections.breadth;
  const industry = data?.sections.industry.items?.[0];
  const sectorFlow = data?.sections.sector_flow.items?.[0];
  const coverage = data?.sections.weekly.coverage;
  return {
    breadth: breadth?.advancers != null && breadth.decliners != null
      ? `${breadth.advancers} 涨 / ${breadth.decliners} 跌`
      : '暂不可用',
    industry: industry ? `${industry.name} ${formatPercent(industry.change_percent)}` : '暂不可用',
    capital: sectorFlow ? `${sectorFlow.name} ${formatAmount(sectorFlow.main_net_inflow)}` : '暂不可用',
    tonghuashun: coverage
      ? `${coverage.tonghuashun_succeeded}/${coverage.tonghuashun_requested} · ${(coverage.tonghuashun_rate * 100).toFixed(0)}%`
      : '待采集',
  };
}

function SectionUnavailable({ section, label }: { section: { error?: string; status?: string }; label: string }) {
  if (section.status !== 'unavailable') return null;
  return <Alert type="warning" showIcon message={`${label}暂不可用`} description={section.error ?? '上游公开接口未返回可验证数据'} />;
}

function StockAction({
  code, name, watched, onAdd, onAnalyze,
}: {
  code: string;
  name: string;
  watched: boolean;
  onAdd: (code: string, name: string) => void;
  onAnalyze: (code: string) => void;
}) {
  return (
    <span className="market-pulse__row-actions">
      <Button type="link" size="small" onClick={() => onAnalyze(code)}>分析</Button>
      <Tooltip title={watched ? '已在自选股中' : '加入本地自选股'}>
        <Button type="text" size="small" disabled={watched} icon={<PlusOutlined />} onClick={() => onAdd(code, name)} aria-label={`${watched ? '已添加' : '添加'} ${name} 到自选股`} />
      </Tooltip>
    </span>
  );
}

function MoversView({ sections, watchCodes, onAdd, onAnalyze }: MarketMoversPanelProps & { sections: PulseSections }) {
  const gainers = [...(sections.movers.gainers ?? [])].sort((a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0));
  const decliners = [...(sections.movers.decliners ?? [])].sort((a, b) => (a.change_percent ?? 0) - (b.change_percent ?? 0));
  const shortlist = [...gainers.slice(0, 4), ...decliners.slice(0, 4)]
    .sort((a, b) => Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0));
  return (
    <>
      <SectionUnavailable section={sections.movers} label="全市场涨跌榜" />
      {shortlist.length ? (
        <div className="market-pulse__split">
          <div className="market-pulse__chart" aria-label="今日领涨与领跌股票涨跌幅对比图">
            <ReactECharts option={buildMoverChartOption(gainers, decliners)} style={{ height: 360 }} notMerge lazyUpdate />
          </div>
          <div className="market-pulse__list">
            <div className="market-pulse__subhead"><strong>异动候选</strong><span>成交 / 换手 / 周涨跌</span></div>
            {shortlist.map((item) => (
              <article className="market-pulse__stock" key={item.code}>
                <button type="button" onClick={() => onAnalyze(item.code)}>
                  <span><strong>{item.name}</strong><small>{item.code.toUpperCase()} · {item.industry ?? '行业未知'}</small></span>
                  <b className={(item.change_percent ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatPercent(item.change_percent)}</b>
                  <ArrowRightOutlined />
                </button>
                <div><span>成交 {formatAmount(item.amount)}</span><span>换手 {formatPercent(item.turnover_rate)}</span><span>周 {formatPercent(item.weekly_change_percent)}</span></div>
              </article>
            ))}
          </div>
        </div>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可验证的涨跌榜数据" />}
    </>
  );
}

function SectorView({ sections }: { sections: PulseSections }) {
  const industries = [...(sections.industry.items ?? [])].sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity));
  const concepts = [...(sections.concept.items ?? [])].sort((a, b) => (b.change_percent ?? -Infinity) - (a.change_percent ?? -Infinity));
  return (
    <>
      <SectionUnavailable section={sections.industry} label="行业排行" />
      <SectionUnavailable section={sections.concept} label="概念排行" />
      <div className="market-pulse__split">
        <div className="market-pulse__chart"><ReactECharts option={buildSectorChartOption(industries)} style={{ height: 380 }} notMerge lazyUpdate /></div>
        <div className="market-pulse__table-wrap">
          <div className="market-pulse__subhead"><strong>概念强度</strong><span>按日涨幅降序 · 领涨股与上涨家数</span></div>
          <table><thead><tr><th>概念</th><th>涨跌</th><th>上涨/下跌</th><th>领涨</th></tr></thead><tbody>
            {concepts.slice(0, 15).map((item) => <tr key={item.code}><td>{item.name}</td><td className={(item.change_percent ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatPercent(item.change_percent)}</td><td>{item.advancers ?? '—'}/{item.decliners ?? '—'}</td><td>{item.leader ?? '—'} <small>{formatPercent(item.leader_change_percent)}</small></td></tr>)}
          </tbody></table>
        </div>
      </div>
    </>
  );
}

function CapitalFlowView({ sections, watchCodes, onAdd, onAnalyze }: MarketMoversPanelProps & { sections: PulseSections }) {
  const sectors = [...(sections.sector_flow.items ?? [])].sort((a, b) => (b.main_net_inflow ?? -Infinity) - (a.main_net_inflow ?? -Infinity));
  const stocks = [...(sections.stock_flow.items ?? [])].sort((a, b) => (b.main_net_inflow ?? -Infinity) - (a.main_net_inflow ?? -Infinity));
  return (
    <>
      <SectionUnavailable section={sections.sector_flow} label="板块资金流" />
      <SectionUnavailable section={sections.stock_flow} label="个股资金流" />
      <div className="market-pulse__split">
        <div className="market-pulse__chart"><ReactECharts option={buildFlowChartOption(sectors)} style={{ height: 400 }} notMerge lazyUpdate /></div>
        <div className="market-pulse__table-wrap">
          <div className="market-pulse__subhead"><strong>个股主力净流入</strong><span>按主力净流入降序 · 超大 / 大 / 中 / 小单</span></div>
          <table><thead><tr><th>股票</th><th>主力</th><th>超大单</th><th>大单</th><th>操作</th></tr></thead><tbody>
            {stocks.slice(0, 15).map((item) => {
              const code = (/^(6|68)/.test(item.code) ? 'sh' : 'sz') + item.code;
              return <tr key={item.code}><td><strong>{item.name}</strong><small>{item.code}</small></td><td className={(item.main_net_inflow ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatAmount(item.main_net_inflow)}</td><td>{formatAmount(item.super_large_net_inflow)}</td><td>{formatAmount(item.large_net_inflow)}</td><td><StockAction code={code} name={item.name} watched={watchCodes.includes(code)} onAdd={onAdd} onAnalyze={onAnalyze} /></td></tr>;
            })}
          </tbody></table>
        </div>
      </div>
    </>
  );
}

function WeeklyView({ sections, watchCodes, onAdd, onAnalyze }: MarketMoversPanelProps & { sections: PulseSections }) {
  const weekly = sections.weekly;
  const items = [...(weekly.items ?? [])].sort((a, b) => Math.abs(b.weekly_change_percent) - Math.abs(a.weekly_change_percent));
  const batch = items.slice(0, 5).filter((item) => !watchCodes.includes(item.code));
  return (
    <>
      <SectionUnavailable section={weekly} label="周异动与同花顺资金" />
      <div className="market-pulse__batchbar">
        <span>阈值 |{weekly.threshold_percent ?? 8}%| · 同花顺命中 {weekly.coverage?.tonghuashun_succeeded ?? 0}/{weekly.coverage?.tonghuashun_requested ?? 0}</span>
        <Button size="small" disabled={!batch.length} onClick={() => batch.forEach((item) => onAdd(item.code, item.name))}>批量加入前 5</Button>
      </div>
      <div className="market-pulse__table-wrap market-pulse__table-wrap--wide">
        <table><thead><tr><th>股票</th><th>周涨跌</th><th>日涨跌</th><th>换手/量比</th><th>同花顺主力</th><th>证据标签</th><th>操作</th></tr></thead><tbody>
          {items.map((item: WeeklyMarketMover) => <tr key={item.code}><td><strong>{item.name}</strong><small>{item.code.toUpperCase()} · {item.ths_industry || item.industry || '行业未知'}</small></td><td className={item.weekly_change_percent >= 0 ? 'price-up' : 'price-down'}>{formatPercent(item.weekly_change_percent)}</td><td>{formatPercent(item.change_percent)}</td><td>{formatPercent(item.turnover_rate)} / {item.volume_ratio?.toFixed(2) ?? '—'}</td><td className={(item.ths_main_net_inflow ?? 0) >= 0 ? 'price-up' : 'price-down'}>{item.source_status.tonghuashun ? formatWanAmount(item.ths_main_net_inflow) : <Tag>未命中</Tag>}</td><td>{item.reason_tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}</td><td><StockAction code={item.code} name={item.name} watched={watchCodes.includes(item.code)} onAdd={onAdd} onAnalyze={onAnalyze} /></td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}

function PopularView({ sections, watchCodes, onAdd, onAnalyze }: MarketMoversPanelProps & { sections: PulseSections }) {
  const items = sections.popular.items ?? [];
  return (
    <>
      <SectionUnavailable section={sections.popular} label="东方财富热度榜" />
      <div className="market-pulse__popular">
        {items.map((item) => <article key={item.code}><b>{item.rank ?? '—'}</b><span><strong>{item.name}</strong><small>{item.code.toUpperCase()}</small></span><em className={(item.change_percent ?? 0) >= 0 ? 'price-up' : 'price-down'}>{formatPercent(item.change_percent)}</em><StockAction code={item.code} name={item.name} watched={watchCodes.includes(item.code)} onAdd={onAdd} onAnalyze={onAnalyze} /></article>)}
      </div>
    </>
  );
}

export default function MarketMoversPanel(props: MarketMoversPanelProps) {
  const [data, setData] = useState<MarketPulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchMarketPulse());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '市场全景暂不可用');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => marketPulseSummary(data), [data]);
  const tabs = data ? [
    { key: 'movers', label: '今日异动', children: <MoversView {...props} sections={data.sections} /> },
    { key: 'themes', label: '主题分类', children: <MarketThemesPanel {...props} /> },
    { key: 'sectors', label: '板块题材', children: <SectorView sections={data.sections} /> },
    { key: 'capital', label: '资金流', children: <CapitalFlowView {...props} sections={data.sections} /> },
    { key: 'weekly', label: `周异动 ${data.sections.weekly.items?.length ?? 0}`, children: <WeeklyView {...props} sections={data.sections} /> },
    { key: 'popular', label: '热度榜', children: <PopularView {...props} sections={data.sections} /> },
  ] : [];

  return (
    <section className="market-movers market-pulse" aria-labelledby="market-movers-title">
      <div className="market-movers__header">
        <div>
          <span className="market-movers__eyebrow">MULTI-DIMENSION MARKET PULSE · A-SHARE</span>
          <h2 id="market-movers-title">A 股多维市场雷达</h2>
          <p>东方财富批量筛选全市场与资金排行，同花顺补充周异动个股资金；每个维度独立标注可用性。</p>
        </div>
        <div className="market-movers__actions">
          <span>{data ? `${data.status === 'partial' ? '部分可用' : '已更新'} ${new Date(data.as_of).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '等待行情'}</span>
          <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={() => void load()} aria-label="刷新多维市场雷达">刷新</Button>
        </div>
      </div>

      {error && <Alert type="warning" showIcon message="市场雷达暂不可用" description={error} />}
      {data?.status === 'partial' && !error && <Alert type="info" showIcon message="部分公开接口暂不可用；其余维度仍为真实数据，未做推算或填充。" />}
      {loading && !data ? <div className="market-movers__loading"><Spin /><span>正在批量读取东方财富并补充同花顺资金…</span></div> : data ? (
        <>
          <div className="market-pulse__metrics" aria-label="市场雷达摘要">
            <div><span>市场广度</span><strong>{summary.breadth}</strong><small>东方财富全 A 扫描</small></div>
            <div><span>最强行业</span><strong>{summary.industry}</strong><small>行业涨幅排行</small></div>
            <div><span>板块主力</span><strong>{summary.capital}</strong><small>当日净流入</small></div>
            <div><span>同花顺覆盖</span><strong>{summary.tonghuashun}</strong><small>周异动资金命中</small></div>
          </div>
          <Tabs className="market-pulse__tabs" items={tabs} destroyOnHidden />
          <div className="market-movers__footer">公开数据维度：东方财富全市场/板块/资金/热度 + 同花顺逐股资金 · 不包含平台私有、付费或登录后数据 · 不构成投资建议</div>
        </>
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可验证的市场数据" />}
    </section>
  );
}
