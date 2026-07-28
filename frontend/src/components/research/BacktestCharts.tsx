import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, type IChartApi, type Time } from 'lightweight-charts';
import type { BacktestRun, Bar } from '../../types/research';

const baseOptions = {
  height: 360,
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: '#ffffff' },
    textColor: '#586276',
    fontFamily: "Inter, 'PingFang SC', sans-serif",
    attributionLogo: false,
  },
  grid: { vertLines: { color: '#eef2f7' }, horzLines: { color: '#eef2f7' } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#dbe3ee' },
  timeScale: { borderColor: '#dbe3ee' },
};

export default function BacktestCharts({ run, bars }: { run: BacktestRun; bars: Bar[] }) {
  const equityRef = useRef<HTMLDivElement>(null);
  const drawdownRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!equityRef.current || !drawdownRef.current || !priceRef.current || !run.equity_curve) return;
    const charts: IChartApi[] = [];
    const equityChart = createChart(equityRef.current, baseOptions);
    charts.push(equityChart);
    const strategy = equityChart.addLineSeries({ color: '#244f9e', lineWidth: 3, title: '策略净值' });
    strategy.setData(run.equity_curve.map((point) => ({ time: point.time as Time, value: point.value })));
    const benchmark = equityChart.addLineSeries({ color: '#9aa6b6', lineWidth: 2, title: '买入持有' });
    benchmark.setData((run.benchmark_curve ?? []).map((point) => ({ time: point.time as Time, value: point.value })));
    equityChart.timeScale().fitContent();

    const drawdownChart = createChart(drawdownRef.current, baseOptions);
    charts.push(drawdownChart);
    const drawdown = drawdownChart.addAreaSeries({
      lineColor: '#c84a55', topColor: 'rgba(200,74,85,.32)', bottomColor: 'rgba(200,74,85,.03)', lineWidth: 2,
    });
    drawdown.setData((run.drawdown_curve ?? []).map((point) => ({ time: point.time as Time, value: point.value * 100 })));
    drawdownChart.timeScale().fitContent();

    const priceChart = createChart(priceRef.current, baseOptions);
    charts.push(priceChart);
    const candles = priceChart.addCandlestickSeries({
      upColor: '#d84a4a', downColor: '#0e8b72',
      borderUpColor: '#d84a4a', borderDownColor: '#0e8b72',
      wickUpColor: '#d84a4a', wickDownColor: '#0e8b72',
    });
    candles.setData(bars.map((bar) => ({
      time: bar.day as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
    })));
    candles.setMarkers((run.order_marks ?? []).map((mark) => ({
      time: mark.time as Time,
      position: mark.side === 'buy' ? 'belowBar' as const : 'aboveBar' as const,
      color: mark.side === 'buy' ? '#244f9e' : '#c84a55',
      shape: mark.side === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
      text: mark.side === 'buy' ? '买入' : '卖出',
    })));
    priceChart.timeScale().fitContent();

    return () => charts.forEach((chart) => chart.remove());
  }, [run, bars]);

  return (
    <div className="backtest-charts" data-testid="backtest-results-charts">
      <div className="chart-grid-two">
        <div className="chart-section">
          <div className="chart-label">策略权益 vs. 买入持有基准</div>
          <div ref={equityRef} className="chart-canvas" />
        </div>
        <div className="chart-section">
          <div className="chart-label">回撤曲线（%）</div>
          <div ref={drawdownRef} className="chart-canvas" />
        </div>
      </div>
      <div className="chart-section">
        <div className="chart-label">价格与实际成交标记</div>
        <div ref={priceRef} className="chart-canvas" />
      </div>
    </div>
  );
}
