import { describe, expect, test } from 'vitest';
import { validateBacktestForm, type BacktestFormValues } from '../src/features/backtest/validation';
import { parseBacktestRequest } from '../src/features/backtest/request';

const valid: BacktestFormValues = {
  symbol: 'AAPL',
  start_date: '2024-01-01',
  end_date: '2026-01-01',
  short_window: 20,
  long_window: 50,
  initial_capital: 100000,
  commission_bps: 3,
  slippage_bps: 2,
  sell_stamp_duty_bps: 0,
  minimum_commission_cny: 0,
  max_drawdown_stop_pct: 0,
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

describe('parseBacktestRequest', () => {
  test('keeps stock symbols that are also strategy abbreviations', () => {
    expect(parseBacktestRequest('回测 MA ma_cross')).toEqual({ ticker: 'MA', strategy: 'ma_cross' });
    expect(parseBacktestRequest('回测 RSI ma_cross')).toEqual({ ticker: 'RSI', strategy: 'ma_cross' });
  });

  test('prefers the ticker after the backtest command', () => {
    expect(parseBacktestRequest('请用 RSI 回测 AAPL')).toEqual({ ticker: 'AAPL', strategy: 'rsi_reversal' });
    expect(parseBacktestRequest('backtest 0700.HK bollinger')).toEqual({ ticker: '00700.HK', strategy: 'bollinger_breakout' });
    expect(parseBacktestRequest('backtest BRK.B')).toEqual({ ticker: 'BRK-B', strategy: 'ma_cross' });
    expect(parseBacktestRequest('backtest 830799')).toEqual({ ticker: undefined, strategy: 'ma_cross' });
  });

  test('removes every repeated ticker occurrence before strategy detection', () => {
    expect(parseBacktestRequest('回测 RSI，重复确认 RSI，使用 ma_cross')).toEqual({
      ticker: 'RSI',
      strategy: 'ma_cross',
    });
  });
});
