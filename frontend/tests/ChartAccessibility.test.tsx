// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import BacktestCharts from '../src/components/research/BacktestCharts';
import ResearchCharts from '../src/components/research/ResearchCharts';
import type { BacktestRun, BarsResponse } from '../src/types/research';

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="echart-canvas" /> }));

const payload: BarsResponse = {
  provider: 'sina', as_of: '2026-08-08', timezone: 'Asia/Shanghai', currency: 'CNY',
  adjustment: 'none', frequency: '1d', quality_flags: ['unadjusted_prices'],
  instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
  items: [
    { day: '2026-08-07', open: 100, high: 103, low: 99, close: 101, volume: 1000 },
    { day: '2026-08-08', open: 101, high: 106, low: 100, close: 105, volume: 1200 },
  ],
  indicators: {
    ma: { ma5: [100, 102] },
    macd: { dif: [0.2, 0.4], dea: [0.1, 0.3], hist: [0.1, 0.1] },
    rsi: { rsi6: [55, 62], rsi12: [52, 58], rsi24: [50, 54] },
  },
};

const run: BacktestRun = {
  id: 9, symbol: '600519', status: 'completed',
  params: {
    symbol: '600519', start_date: '2026-08-07', end_date: '2026-08-08',
    short_window: 20, long_window: 50, initial_capital: 100_000,
    commission_bps: 2.5, slippage_bps: 2, sell_stamp_duty_bps: 10,
    minimum_commission_cny: 5, max_drawdown_stop_pct: 0, benchmark: 'buy_and_hold',
  },
  provenance: payload,
  metrics: {
    total_return: 0.12, annualized_return: 0.1, benchmark_return: 0.08, excess_return: 0.04,
    max_drawdown: -0.06, sharpe_ratio: 1, sortino_ratio: 1, calmar_ratio: 1,
    information_ratio: 1, win_rate: 0.5, profit_factor: 1.2, turnover: 1, trade_count: 2,
  },
  equity_curve: [{ time: '2026-08-07', value: 100_000 }, { time: '2026-08-08', value: 112_000 }],
  benchmark_curve: [{ time: '2026-08-07', value: 100_000 }, { time: '2026-08-08', value: 108_000 }],
  drawdown_curve: [{ time: '2026-08-07', value: 0 }, { time: '2026-08-08', value: -0.02 }],
  order_marks: [{ time: '2026-08-07', price: 101, side: 'buy' }, { time: '2026-08-08', price: 105, side: 'sell' }],
};

describe('financial chart text equivalents', () => {
  it('describes research dates, values, source, and missing-value policy', () => {
    render(<ResearchCharts payload={payload} />);

    expect(screen.getByRole('img', { name: /2026-08-07 至 2026-08-08.*来源 sina.*复权 none/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最新 DIF 0.40，DEA 0.30/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最新 RSI6 62.00.*缺失值保持 UNKNOWN/ })).toBeTruthy();
  });

  it('describes backtest comparison, drawdown, source, and trade marks', () => {
    render(<BacktestCharts run={run} bars={payload.items} />);

    expect(screen.getByRole('img', { name: /策略期末净值 112000.00.*基准收益 8.00%.*来源 sina/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最大回撤 -6.00%.*期末回撤 -2.00%/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /2 个价格观察、1 个买入标记和 1 个卖出标记/ })).toBeTruthy();
  });

  it('does not turn unavailable legacy metrics into zero-valued chart claims', () => {
    render(<BacktestCharts run={{ ...run, metrics: undefined }} bars={payload.items} />);

    expect(screen.getByRole('img', { name: /总收益 UNKNOWN%，基准收益 UNKNOWN%/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最大回撤 UNKNOWN%/ })).toBeTruthy();
  });
});
