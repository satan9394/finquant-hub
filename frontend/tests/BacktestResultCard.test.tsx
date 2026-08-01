// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import BacktestResultCard, { type BacktestResult } from '../src/components/BacktestResultCard';

const chart = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('echarts-for-react', () => ({
  default: (props: unknown) => {
    chart.render(props);
    return <div data-testid="echarts" />;
  },
}));

const result: BacktestResult = {
  id: 7,
  strategy: 'ma_cross',
  period: { from: '2026-01-02', to: '2026-06-30', days: 120 },
  metrics: {
    total_return_pct: 12.5,
    sharpe_ratio: 1.2345,
    max_drawdown_pct: -6.789,
    annual_return_pct: 8.25,
    win_rate_pct: 62.34,
    trade_count: 6,
  },
  buy_hold_return_pct: 9.5,
  trades: [],
  equity_curve: [
    { day: '2026-01-02', equity: 100_000, signal: 0, position: 0 },
    { day: '2026-01-05', equity: 101_250, signal: 1, position: 1 },
  ],
  benchmark_curve: [
    { day: '2026-01-02', equity: 100_000 },
    { day: '2026-01-05', equity: 100_950 },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('BacktestResultCard', () => {
  test('renders metrics and sends strategy plus benchmark data to ECharts', () => {
    render(<BacktestResultCard ticker="AAPL" result={result} />);

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('ma_cross')).toBeTruthy();
    expect(screen.getByText('收益率').parentElement?.textContent).toContain('12.50%');
    expect(screen.getByText('交易次数').parentElement?.textContent).toContain('6');
    expect(screen.getByText(/2026-01-02 至 2026-06-30/)).toBeTruthy();
    expect(chart.render).toHaveBeenCalledOnce();
    const option = (chart.render.mock.calls[0][0] as { option: { xAxis: { data: string[] }; series: { name: string; data: number[] }[] } }).option;
    expect(option.xAxis.data).toEqual(['2026-01-02', '2026-01-05']);
    expect(option.series).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '策略净值', data: [100_000, 101_250] }),
      expect.objectContaining({ name: '买入持有', data: [100_000, 100_950] }),
    ]));

    fireEvent.click(screen.getByText('更多指标'));
    expect(screen.getByText('8.25%')).toBeTruthy();
    expect(screen.getByText('62.3%')).toBeTruthy();
    expect(screen.getByText('9.50%')).toBeTruthy();
  });

  test('shows a truthful empty state without rendering a chart', () => {
    render(<BacktestResultCard ticker="AAPL" result={{ ...result, equity_curve: [] }} />);

    expect(screen.getByText('没有可展示的权益曲线')).toBeTruthy();
    expect(chart.render).not.toHaveBeenCalled();
  });
});
