import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { BacktestRun, Bar } from '../../types/research';

const base = {
  backgroundColor: '#fff', animationDuration: 350,
  textStyle: { color: '#586276', fontFamily: "Inter, 'PingFang SC', sans-serif" },
  tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
  grid: { left: 56, right: 22, top: 38, bottom: 52 },
};

export default function BacktestCharts({ run, bars }: { run: BacktestRun; bars: Bar[] }) {
  const equityOption = useMemo(() => ({
    ...base,
    legend: { top: 2, data: ['策略净值', '买入持有'] },
    xAxis: { type: 'category', data: run.equity_curve?.map((point) => point.time) ?? [], axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#eef2f7' } } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
    series: [
      { name: '策略净值', type: 'line', symbol: 'none', smooth: true, data: run.equity_curve?.map((point) => point.value) ?? [], lineStyle: { color: '#244f9e', width: 3 }, areaStyle: { color: 'rgba(36,79,158,.12)' } },
      { name: '买入持有', type: 'line', symbol: 'none', data: run.benchmark_curve?.map((point) => point.value) ?? [], lineStyle: { color: '#9aa6b6', width: 2 } },
    ],
  }), [run.benchmark_curve, run.equity_curve]);

  const drawdownOption = useMemo(() => ({
    ...base,
    xAxis: { type: 'category', data: run.drawdown_curve?.map((point) => point.time) ?? [], axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: '#eef2f7' } } },
    dataZoom: [{ type: 'inside' }],
    series: [{ name: '回撤', type: 'line', symbol: 'none', smooth: true, data: run.drawdown_curve?.map((point) => point.value * 100) ?? [], lineStyle: { color: '#c84a55', width: 2 }, areaStyle: { color: 'rgba(200,74,85,.24)' } }],
  }), [run.drawdown_curve]);

  const priceOption = useMemo(() => ({
    ...base,
    xAxis: { type: 'category', data: bars.map((bar) => bar.day), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', scale: true, splitLine: { lineStyle: { color: '#eef2f7' } } },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
    series: [{
      name: '价格', type: 'candlestick', data: bars.map((bar) => [bar.open, bar.close, bar.low, bar.high]),
      itemStyle: { color: '#d84a4a', color0: '#0e8b72', borderColor: '#d84a4a', borderColor0: '#0e8b72' },
      markPoint: {
        symbolSize: 36,
        data: (run.order_marks ?? []).map((mark) => ({ name: mark.side === 'buy' ? '买入' : '卖出', coord: [mark.time, mark.price], value: mark.side === 'buy' ? '买' : '卖', itemStyle: { color: mark.side === 'buy' ? '#244f9e' : '#c84a55' } })),
      },
    }],
  }), [bars, run.order_marks]);

  return (
    <div className="backtest-charts" data-testid="backtest-results-charts">
      <div className="chart-grid-two">
        <div className="chart-section"><div className="chart-label">策略权益 vs. 买入持有基准</div><ReactECharts option={equityOption} style={{ height: 360 }} notMerge /></div>
        <div className="chart-section"><div className="chart-label">回撤曲线（%）</div><ReactECharts option={drawdownOption} style={{ height: 360 }} notMerge /></div>
      </div>
      <div className="chart-section"><div className="chart-label">价格与实际成交标记</div><ReactECharts option={priceOption} style={{ height: 380 }} notMerge /></div>
    </div>
  );
}
