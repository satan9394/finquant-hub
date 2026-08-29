import { useMemo } from 'react';
import type { BarsResponse } from '../../types/research';
import LazyEChart from '../LazyEChart';
import { readChartTokens } from '../../styles/themeTokens';
import { useLanguage } from '../../i18n/LanguageContext';
const numberText = (value: number | null | undefined) => value == null ? 'UNKNOWN' : value.toFixed(2);
const latestValue = (values: (number | null)[] | undefined) => {
  if (!values) return null;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] != null) return values[index];
  }
  return null;
};

export default function ResearchCharts({ payload }: { payload: BarsResponse }) {
  const { t } = useLanguage();
  const theme = readChartTokens();
  const colors = {
    red: theme.up,
    green: theme.down,
    blue: theme.primary,
    amber: theme.warning,
    violet: theme.model,
    slate: theme.unknown,
    cyan: theme.secondary,
  };
  const maSeries = [
    ['ma5', 'MA5', colors.amber, 'solid'],
    ['ma20', 'MA20', colors.blue, 'solid'],
    ['ma60', 'MA60', colors.violet, 'solid'],
    ['ma120', 'MA120', colors.cyan, 'dashed'],
    ['ma250', 'MA250', colors.slate, 'dashed'],
  ] as const;
  const base = {
    backgroundColor: theme.background,
    animationDuration: 350,
    textStyle: { color: theme.text, fontFamily: "Inter, 'PingFang SC', sans-serif" },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
  };
  const dates = payload.items.map((item) => item.day);
  const firstBar = payload.items[0];
  const lastBar = payload.items[payload.items.length - 1];
  const periodChange = firstBar && lastBar && firstBar.close
    ? (lastBar.close / firstBar.close - 1) * 100
    : null;
  const priceSummary = firstBar && lastBar
    ? t('research.chart.priceSummary', { from: firstBar.day, to: lastBar.day, count: payload.items.length, first: numberText(firstBar.close), last: numberText(lastBar.close), change: numberText(periodChange), provider: payload.provider ?? 'UNKNOWN', asOf: payload.as_of ?? 'UNKNOWN', adjustment: payload.adjustment ?? 'UNKNOWN' })
    : t('research.chart.priceEmpty');
  const priceOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: [t('research.chart.candlestick'), 'MA5', 'MA20', 'MA60', 'MA120', 'MA250', t('research.chart.volume')] },
    grid: [{ left: 54, right: 22, top: 38, height: '57%' }, { left: 54, right: 22, top: '76%', height: '14%' }],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLabel: { show: false } },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { hideOverlap: true } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: theme.grid } } },
      { gridIndex: 1, scale: true, splitNumber: 2, splitLine: { show: false } },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1] }, { type: 'slider', xAxisIndex: [0, 1], bottom: 0, height: 16 }],
    series: [
      {
        name: t('research.chart.candlestick'), type: 'candlestick',
        data: payload.items.map((item) => [item.open, item.close, item.low, item.high]),
        itemStyle: { color: colors.red, color0: colors.green, borderColor: colors.red, borderColor0: colors.green },
      },
      ...maSeries.map(([key, name, color, lineType]) => ({
        name, type: 'line', symbol: 'none', smooth: true, connectNulls: true,
        lineStyle: { width: 1.6, color, type: lineType }, data: payload.indicators.ma?.[key] ?? [],
      })),
      {
        name: t('research.chart.volume'), type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
        data: payload.items.map((item) => ({ value: item.volume, itemStyle: { color: item.close >= item.open ? colors.red : colors.green, opacity: 0.42 } })),
      },
    ],
  }), [colors.amber, colors.blue, colors.cyan, colors.green, colors.red, colors.slate, colors.violet, dates, payload, t, theme.background, theme.grid, theme.text]);

  const macd = payload.indicators.macd;
  const macdSummary = macd
    ? t('research.chart.macdSummary', { dif: numberText(latestValue(macd.dif)), dea: numberText(latestValue(macd.dea)), hist: numberText(latestValue(macd.hist)) })
    : t('research.chart.macdEmpty');
  const macdOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['DIF', 'DEA', 'MACD'] },
    grid: { left: 54, right: 22, top: 38, bottom: 38 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { scale: true, splitLine: { lineStyle: { color: theme.grid } } },
    dataZoom: [{ type: 'inside' }],
    series: macd ? [
      { name: 'MACD', type: 'bar', data: macd.hist.map((value) => ({ value, itemStyle: { color: (value ?? 0) >= 0 ? colors.red : colors.green } })) },
      { name: 'DIF', type: 'line', symbol: 'none', data: macd.dif, lineStyle: { color: colors.blue } },
      { name: 'DEA', type: 'line', symbol: 'none', data: macd.dea, lineStyle: { color: colors.amber } },
    ] : [],
  }), [colors.amber, colors.blue, colors.green, colors.red, dates, macd, theme.background, theme.grid, theme.text]);

  const rsiOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['RSI6', 'RSI12', 'RSI24'] },
    grid: { left: 54, right: 22, top: 38, bottom: 38 },
    xAxis: { type: 'category', data: dates, axisLabel: { hideOverlap: true } },
    yAxis: { min: 0, max: 100, splitLine: { lineStyle: { color: theme.grid } } },
    dataZoom: [{ type: 'inside' }],
    series: ([['rsi6', 'RSI6', colors.red], ['rsi12', 'RSI12', colors.blue], ['rsi24', 'RSI24', colors.violet]] as const).map(([key, name, color]) => ({
      name, type: 'line', symbol: 'none', connectNulls: true, data: payload.indicators.rsi?.[key] ?? [], lineStyle: { color },
    })),
  }), [colors.blue, colors.red, colors.violet, dates, payload.indicators.rsi, theme.background, theme.grid, theme.text]);
  const rsiSummary = t('research.chart.rsiSummary', { rsi6: numberText(latestValue(payload.indicators.rsi?.rsi6)), rsi12: numberText(latestValue(payload.indicators.rsi?.rsi12)), rsi24: numberText(latestValue(payload.indicators.rsi?.rsi24)) });

  return (
    <div className="research-charts" data-testid="research-charts">
      <div className="chart-section" role="img" aria-label={priceSummary}><div className="chart-label">{t('research.chart.priceTitle')}</div><p className="chart-text-summary">{priceSummary}</p><LazyEChart option={priceOption} style={{ height: 430 }} notMerge /></div>
      <div className="chart-grid-two">
        <div className="chart-section" role="img" aria-label={macdSummary}><div className="chart-label">MACD (12, 26, 9)</div><p className="chart-text-summary">{macdSummary}</p><LazyEChart option={macdOption} style={{ height: 360 }} notMerge /></div>
        <div className="chart-section" role="img" aria-label={rsiSummary}><div className="chart-label">RSI (6, 12, 24)</div><p className="chart-text-summary">{rsiSummary}</p><LazyEChart option={rsiOption} style={{ height: 360 }} notMerge /></div>
      </div>
    </div>
  );
}
