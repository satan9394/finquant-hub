import { describe, expect, test } from 'bun:test';
import { validateBacktestForm, type BacktestFormValues } from '../src/features/backtest/validation';

const valid: BacktestFormValues = {
  symbol: 'AAPL',
  start_date: '2024-01-01',
  end_date: '2026-01-01',
  short_window: 20,
  long_window: 50,
  initial_capital: 100000,
  commission_bps: 3,
  slippage_bps: 2,
  benchmark: 'buy_and_hold',
};

describe('validateBacktestForm', () => {
  test('accepts the MA20/MA50 flow', () => {
    expect(validateBacktestForm(valid)).toEqual({});
  });

  test('rejects invalid windows, dates and capital', () => {
    const errors = validateBacktestForm({
      ...valid,
      short_window: 1,
      long_window: 1,
      start_date: '2026-01-01',
      end_date: '2025-01-01',
      initial_capital: 0,
    });
    expect(errors.short_window).toBeDefined();
    expect(errors.long_window).toBeDefined();
    expect(errors.end_date).toBeDefined();
    expect(errors.initial_capital).toBeDefined();
  });
});
