import { useMemo } from 'react';
import type { BarsResponse } from '../../types/research';
import LazyEChart from '../LazyEChart';

const colors = { red: '#d84a4a', green: '#0e8b72', blue: '#3f6fc9', amber: '#e59b27', violet: '#7c5fc5', slate: '#64748b', cyan: '#0891b2' };
const maSeries = [
  ['ma5', 'MA5', colors.amber, 'solid'],
  ['ma20', 'MA20', colors.blue, 'solid'],
  ['ma60', 'MA60', colors.violet, 'solid'],
  ['ma120', 'MA120', colors.cyan, 'dashed'],
  ['ma250', 'MA250', colors.slate, 'dashed'],
] as const;
const base = {
  backgroundColor: '#fff',
  animationDuration: 350,
  textStyle: { color: '#586276', fontFamily: "Inter, 'PingFang SC', sans-serif" },
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
};
const numberText = (value: number | null | undefined) => value == null ? 'UNKNOWN' : value.toFixed(2);
const latestValue = (values: (number | null)[] | undefined) => {
  if (!values) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] != null) return values[index];
  }
  return null;
};

export default function ResearchCharts({ payload }: { payload: BarsResponse }) {
  const dates = payload.items.map((item) => item.day);
  const firstBar = payload.items[0];
  const lastBar = payload.items[payload.items.length - 1];
  const periodChange = firstBar && lastBar && firstBar.close
    ? (lastBar.close / firstBar.close - 1) * 100
    : null;
  const priceSummary = firstBar && lastBar
    ? `价格图文字摘要：${firstBar.day} 至 ${lastBar.day}，共 ${payload.items.length} 个日频观察；首日收盘 ${numberText(firstBar.close)}，末日收盘 ${numberText(lastBar.close)}，区间变化 ${numberText(periodChange)}%；来源 ${payload.provider ?? 'UNKNOWN'}，截止 ${payload.as_of ?? 'UNKNOWN'}，复权 ${payload.adjustment ?? 'UNKNOWN'}。`
    : '价格图文字摘要：没有可用日线观察，不展示价格或成交量结论。';
  const priceOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['K线', 'MA5', 'MA20', 'MA60', 'MA120', 'MA250', '成交量'] },
    grid: [{ left: 54, right: 22, top: 38, height: '57%' }, { left: 54, right: 22, top: '76%', height: '14%' }],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLabel: { show: false } },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { hideOverlap: true } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: '#eef2f7' } } },
      { gridIndex: 1, scale: true, splitNumber: 2, splitLine: { show: false } },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 16 }],
    series: [
      {
        name: 'K线', type: 'candlestick',
        data: payload.items.map((item) => [item.open, item.close, item.low, item.high]),
        itemStyle: { color: colors.red, color0: colors.green, borderColor: colors.red, borderColor0: colors.green },
      },
      ...maSeries.map(([key, name, color, lineType]) => ({
        name, type: 'line', symbol: 'none', smooth: true, connectNulls: true,
        lineStyle: { width: 1.6, color, type: lineType }, data: payload.indicators.ma?.[key] ?? [],
      })),
      {
        name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
        data: payload.items.map((item) => ({ value: item.volume, itemStyle: { color: item.close >= item.open ? 'rgba(216,74,74,.42)' : 'rgba(14,139,114,.42)' } })),
      },
    ],
  }), [dates, payload]);

  const macd = payload.indicators.macd;
  const macdSummary = macd
    ? `MACD 图文字摘要：最新 DIF ${numberText(latestValue(macd.dif))}，DEA ${numberText(latestValue(macd.dea))}，柱值 ${numberText(latestValue(macd.hist))}；参数为 12、26、9。`
    : 'MACD 图文字摘要：提供方没有返回可用 MACD 序列。';
  const macdOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['DIF', 'DEA', 'MACD'] },
    grid: { left: 54, right: 22, top: 38, bottom: 38 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { scale: true, splitLine: { lineStyle: { color: '#eef2f7' } } },
    dataZoom: [{ type: 'inside' }],
    series: macd ? [
      { name: 'MACD', type: 'bar', data: macd.hist.map((value) => ({ value, itemStyle: { color: (value ?? 0) >= 0 ? colors.red : colors.green } })) },
      { name: 'DIF', type: 'line', symbol: 'none', data: macd.dif, lineStyle: { color: colors.blue } },
      { name: 'DEA', type: 'line', symbol: 'none', data: macd.dea, lineStyle: { color: colors.amber } },
    ] : [],
  }), [dates, macd]);

  const rsiOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['RSI6', 'RSI12', 'RSI24'] },
    grid: { left: 54, right: 22, top: 38, bottom: 38 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { min: 0, max: 100, splitLine: { lineStyle: { color: '#eef2f7' } } },
    dataZoom: [{ type: 'inside' }],
    series: ([['rsi6', 'RSI6', colors.red], ['rsi12', 'RSI12', colors.blue], ['rsi24', 'RSI24', colors.violet]] as const).map(([key, name, color]) => ({
      name, type: 'line', symbol: 'none', connectNulls: true, data: payload.indicators.rsi?.[key] ?? [], lineStyle: { color },
    })),
  }), [dates, payload.indicators.rsi]);
  const rsiSummary = `RSI 图文字摘要：最新 RSI6 ${numberText(latestValue(payload.indicators.rsi?.rsi6))}，RSI12 ${numberText(latestValue(payload.indicators.rsi?.rsi12))}，RSI24 ${numberText(latestValue(payload.indicators.rsi?.rsi24))}；缺失值保持 UNKNOWN。`;

  return (
    <div className="research-charts" data-testid="research-charts">
      <div className="chart-section" role="img" aria-label={priceSummary}><div className="chart-label">价格 · 成交量 · MA5 / MA20 / MA60 / MA120 / MA250</div><p className="chart-text-summary">{priceSummary}</p><LazyEChart option={priceOption} style={{ height: 430 }} notMerge /></div>
      <div className="chart-grid-two">
        <div className="chart-section" role="img" aria-label={macdSummary}><div className="chart-label">MACD (12, 26, 9)</div><p className="chart-text-summary">{macdSummary}</p><LazyEChart option={macdOption} style={{ height: 360 }} notMerge /></div>
        <div className="chart-section" role="img" aria-label={rsiSummary}><div className="chart-label">RSI (6, 12, 24)</div><p className="chart-text-summary">{rsiSummary}</p><LazyEChart option={rsiOption} style={{ height: 360 }} notMerge /></div>
      </div>
    </div>
  );
}
