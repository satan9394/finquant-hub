import { describe, expect, it } from 'vitest';

import {
  assessExperimentChange, compareExperimentMetrics, findComparablePresetRuns,
} from '../src/features/backtest/experiments';
import type { BacktestCreatePayload, BacktestRun } from '../src/types/research';

const params: BacktestCreatePayload = {
  symbol: 'AAPL', start_date: '2024-01-01', end_date: '2025-01-01',
  short_window: 20, long_window: 50, initial_capital: 100_000,
  commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 0,
  minimum_commission_cny: 0, max_drawdown_stop_pct: 0, benchmark: 'buy_and_hold',
};

const savedRun = (id: number, overrides: Partial<BacktestCreatePayload> = {}, totalReturn = 0.1): BacktestRun => ({
  id, symbol: overrides.symbol ?? params.symbol, status: 'completed', is_saved: true,
  params: { ...params, ...overrides },
  metrics: {
    total_return: totalReturn, annualized_return: totalReturn, benchmark_return: 0.12,
    excess_return: totalReturn - 0.12, max_drawdown: -0.1, sharpe_ratio: 0.5,
    sortino_ratio: 0.6, calmar_ratio: 0.7, information_ratio: 0.1,
    win_rate: 0.5, profit_factor: 1.2, turnover: 2, trade_count: 6,
  },
});

describe('backtest experiments', () => {
  it('distinguishes zero, one, and multiple parameter changes with actual values', () => {
    expect(assessExperimentChange(params, params).status).toBe('same');

    const single = assessExperimentChange(params, { ...params, short_window: 25 });
    expect(single.status).toBe('single');
    expect(single.differences).toEqual([
      expect.objectContaining({ key: 'short_window', label: '短均线', before: '20', after: '25' }),
    ]);

    const multiple = assessExperimentChange(params, { ...params, short_window: 25, commission_bps: 5 });
    expect(multiple.status).toBe('multiple');
    expect(multiple.differences.map((item) => item.label)).toEqual(['短均线', '手续费']);
  });

  it('only matches real saved preset results with identical non-strategy context', () => {
    const standard = savedRun(1);
    const steady = savedRun(2, { short_window: 30, long_window: 90, max_drawdown_stop_pct: 0.12 }, 0.08);
    const activeWrongDates = savedRun(3, {
      short_window: 10, long_window: 30, max_drawdown_stop_pct: 0.08,
      start_date: '2024-02-01',
    }, 0.2);

    const matches = findComparablePresetRuns([standard, steady, activeWrongDates], params);
    expect(matches.standard?.id).toBe(1);
    expect(matches.steady?.id).toBe(2);
    expect(matches.active).toBeNull();
  });

  it('compares actual persisted metrics without creating a conclusion threshold', () => {
    const baseline = savedRun(1, {}, 0.1);
    const candidate = savedRun(2, { short_window: 25 }, 0.14);
    const comparison = compareExperimentMetrics(baseline, candidate);

    expect(comparison?.map((item) => item.key)).toEqual([
      'total_return', 'excess_return', 'max_drawdown', 'trade_count',
    ]);
    expect(comparison?.[0]).toEqual(expect.objectContaining({ baseline: 0.1, candidate: 0.14, delta: 0.04 }));
  });
});
