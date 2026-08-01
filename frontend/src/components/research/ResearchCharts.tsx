import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { BarsResponse } from '../../types/research';

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

export default function ResearchCharts({ payload }: { payload: BarsResponse }) {
  const dates = payload.items.map((item) => item.day);
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

  return (
    <div className="research-charts" data-testid="research-charts">
      <div className="chart-section"><div className="chart-label">价格 · 成交量 · MA5 / MA20 / MA60 / MA120 / MA250</div><ReactECharts option={priceOption} style={{ height: 430 }} notMerge /></div>
      <div className="chart-grid-two">
        <div className="chart-section"><div className="chart-label">MACD (12, 26, 9)</div><ReactECharts option={macdOption} style={{ height: 360 }} notMerge /></div>
        <div className="chart-section"><div className="chart-label">RSI (6, 12, 24)</div><ReactECharts option={rsiOption} style={{ height: 360 }} notMerge /></div>
      </div>
    </div>
  );
}
