import { useMemo } from 'react';
import type { BacktestRun, Bar } from '../../types/research';
import LazyEChart from '../LazyEChart';
import { readChartTokens } from '../../styles/themeTokens';
import { useLanguage } from '../../i18n/LanguageContext';
const valueText = (value: number | null | undefined) => value == null ? 'UNKNOWN' : value.toFixed(2);

export default function BacktestCharts({ run, bars }: { run: BacktestRun; bars: Bar[] }) {
  const { t } = useLanguage();
  const colors = readChartTokens();
  const base = {
    backgroundColor: colors.background, animationDuration: 350,
    textStyle: { color: colors.text, fontFamily: "Inter, 'PingFang SC', sans-serif" },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: { left: 56, right: 22, top: 38, bottom: 52 },
  };
  const firstEquity = run.equity_curve?.[0];
  const lastEquity = run.equity_curve?.[run.equity_curve.length - 1];
  const lastBenchmark = run.benchmark_curve?.[run.benchmark_curve.length - 1];
  const equitySummary = firstEquity && lastEquity
    ? t('strategy.chart.equitySummary', { from: firstEquity.time, to: lastEquity.time, strategy: valueText(lastEquity.value), benchmark: valueText(lastBenchmark?.value), return: valueText(run.metrics?.total_return == null ? null : run.metrics.total_return * 100), benchmarkReturn: valueText(run.metrics?.benchmark_return == null ? null : run.metrics.benchmark_return * 100), provider: run.provenance?.provider ?? 'UNKNOWN' })
    : t('strategy.chart.equityEmpty');
  const currentDrawdown = run.drawdown_curve?.[run.drawdown_curve.length - 1]?.value;
  const drawdownSummary = t('strategy.chart.drawdownSummary', { max: valueText(run.metrics?.max_drawdown == null ? null : run.metrics.max_drawdown * 100), current: valueText(currentDrawdown == null ? null : currentDrawdown * 100) });
  const firstBar = bars[0];
  const lastBar = bars[bars.length - 1];
  const buyMarks = (run.order_marks ?? []).filter((mark) => mark.side === 'buy').length;
  const sellMarks = (run.order_marks ?? []).filter((mark) => mark.side === 'sell').length;
  const tradeSummary = firstBar && lastBar
    ? t('strategy.chart.tradeSummary', { from: firstBar.day, to: lastBar.day, bars: bars.length, buys: buyMarks, sells: sellMarks })
    : t('strategy.chart.tradeEmpty', { buys: buyMarks, sells: sellMarks });
  const equityOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: [t('strategy.chart.strategyEquity'), t('strategy.chart.buyHold')] },
    xAxis: { type: 'category', data: run.equity_curve?.map((point) => point.time) ?? [], axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
    series: [
      { name: t('strategy.chart.strategyEquity'), type: 'line', symbol: 'none', smooth: true, data: run.equity_curve?.map((point) => point.value) ?? [], lineStyle: { color: colors.primary, width: 3 }, areaStyle: { color: colors.primary, opacity: 0.12 } },
      { name: t('strategy.chart.buyHold'), type: 'line', symbol: 'none', data: run.benchmark_curve?.map((point) => point.value) ?? [], lineStyle: { color: colors.unknown, width: 2 } },
    ],
  }), [colors.background, colors.grid, colors.primary, colors.text, colors.unknown, run.benchmark_curve, run.equity_curve, t]);

  const drawdownOption = useMemo(() => ({
    ...base,
    xAxis: { type: 'category', data: run.drawdown_curve?.map((point) => point.time) ?? [], axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: [{ type: 'inside' }],
    series: [{ name: t('strategy.chart.drawdown'), type: 'line', symbol: 'none', smooth: true, data: run.drawdown_curve?.map((point) => point.value * 100) ?? [], lineStyle: { color: colors.risk, width: 2 }, areaStyle: { color: colors.risk, opacity: 0.24 } }],
  }), [colors.background, colors.grid, colors.risk, colors.text, run.drawdown_curve, t]);

  const priceOption = useMemo(() => ({
    ...base,
    xAxis: { type: 'category', data: bars.map((bar) => bar.day), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
    series: [{
      name: t('strategy.chart.price'), type: 'candlestick', data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
      itemStyle: { color: colors.up, color0: colors.down, borderColor: colors.up, borderColor0: colors.down },
      markPoint: {
        symbolSize: 36,
        data: (run.order_marks ?? []).map((mark) => ({ name: t(mark.side === 'buy' ? 'strategy.chart.buy' : 'strategy.chart.sell'), coord: [mark.time, mark.price], value: t(mark.side === 'buy' ? 'strategy.chart.buyShort' : 'strategy.chart.sellShort'), itemStyle: { color: mark.side === 'buy' ? colors.primary : colors.risk } })),
      },
    }],
  }), [bars, colors.background, colors.down, colors.grid, colors.primary, colors.risk, colors.text, colors.up, run.order_marks, t]);

  return (
    <div className="backtest-charts" data-testid="backtest-results-charts">
      <div className="chart-grid-two">
        <div className="chart-section" role="img" aria-label={equitySummary}><div className="chart-label">{t('strategy.chart.equityTitle')}</div><p className="chart-text-summary">{equitySummary}</p><LazyEChart option={equityOption} style={{ height: 360 }} notMerge /></div>
        <div className="chart-section" role="img" aria-label={drawdownSummary}><div className="chart-label">{t('strategy.chart.drawdownTitle')}</div><p className="chart-text-summary">{drawdownSummary}</p><LazyEChart option={drawdownOption} style={{ height: 360 }} notMerge /></div>
      </div>
      <div className="chart-section" role="img" aria-label={tradeSummary}><div className="chart-label">{t('strategy.chart.tradeTitle')}</div><p className="chart-text-summary">{tradeSummary}</p><LazyEChart option={priceOption} style={{ height: 380 }} notMerge /></div>
    </div>
  );
}
