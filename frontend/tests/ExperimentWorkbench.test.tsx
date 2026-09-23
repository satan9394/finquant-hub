// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ExperimentWorkbench from '../src/components/strategy/ExperimentWorkbench';
import type { BacktestCreatePayload, BacktestRun } from '../src/types/research';

const params: BacktestCreatePayload = {
  symbol: 'AAPL', start_date: '2024-01-01', end_date: '2025-01-01',
  short_window: 20, long_window: 50, initial_capital: 100_000,
  commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 0,
  minimum_commission_cny: 0, max_drawdown_stop_pct: 0, benchmark: 'buy_and_hold',
};

const savedRun = (id: number, overrides: Partial<BacktestCreatePayload> = {}, totalReturn = 0.1): BacktestRun => ({
  id, symbol: 'AAPL', status: 'completed', is_saved: true, params: { ...params, ...overrides },
  metrics: {
    total_return: totalReturn, annualized_return: totalReturn, benchmark_return: 0.12,
    excess_return: totalReturn - 0.12, max_drawdown: -0.1, sharpe_ratio: 0.5,
    sortino_ratio: 0.6, calmar_ratio: 0.7, information_ratio: 0.1,
    win_rate: 0.5, profit_factor: 1.2, turnover: 2, trade_count: 6,
  },
});

describe('ExperimentWorkbench', () => {
  it('shows a single-parameter setup, strictly comparable presets, and actual result deltas', () => {
    const baseline = savedRun(1);
    const steady = savedRun(2, { short_window: 30, long_window: 90, max_drawdown_stop_pct: 0.12 }, 0.08);
    const current = savedRun(3, { short_window: 25 }, 0.14);

    render(
      <ExperimentWorkbench
        values={{ ...params, short_window: 25 }}
        history={[baseline, steady]}
        run={current}
        baselineId={1}
        onBaselineChange={vi.fn()}
      />,
    );

    expect(screen.getByText('单参数实验可归因')).toBeTruthy();
    expect(screen.getByText('短均线：20 → 25')).toBeTruthy();
    expect(screen.getByTestId('preset-standard').textContent).toContain('+10.00%');
    expect(screen.getByTestId('preset-steady').textContent).toContain('+8.00%');
    expect(screen.getByTestId('preset-active').textContent).toContain('未运行');
    expect(screen.getByTestId('experiment-metric-total_return').textContent).toContain('+4.00%');
  });

  it('does not imply comparability before a saved baseline is selected', () => {
    render(
      <ExperimentWorkbench values={params} history={[]} run={null} baselineId={null} onBaselineChange={vi.fn()} />,
    );

    expect(screen.getByText('先选择一个已保存实验作为基准')).toBeTruthy();
    expect(screen.getByText(/不会自动运行或保存/)).toBeTruthy();
  });
});
