import { describe, expect, it } from 'vitest';

import {
  explainBacktestFailure, interpretBacktest, rankBacktestWarnings,
} from '../src/features/backtest/interpretation';
import type { BacktestRun } from '../src/types/research';

const run = (overrides: Partial<BacktestRun['metrics']> = {}): BacktestRun => ({
  id: 1, symbol: '600519', status: 'completed',
  params: {} as BacktestRun['params'],
  metrics: {
    total_return: 0.12, annualized_return: 0.08, benchmark_return: 0.15, excess_return: -0.03,
    max_drawdown: -0.24, sharpe_ratio: 0.6, sortino_ratio: 0.8, calmar_ratio: 0.3,
    information_ratio: -0.2, win_rate: 0.48, profit_factor: 1.1, turnover: 3, trade_count: 3,
    ...overrides,
  },
});

describe('backtest interpretation', () => {
  it('keeps the existing verdict threshold and ranks decision blockers', () => {
    const result = interpretBacktest(run());

    expect(result.message).toBe('暂不建议据此交易');
    expect(result.reasons.map((reason) => reason.title)).toEqual([
      '未跑赢买入持有', '最大回撤超过基础门槛', '交易样本不足',
    ]);
    expect(result.reasons[0].detail).toContain('-3.00%');
  });

  it('allows further validation only when the original three gates pass', () => {
    const result = interpretBacktest(run({ excess_return: 0.04, max_drawdown: -0.12, trade_count: 12 }));

    expect(result.message).toBe('可继续验证');
    expect(result.type).toBe('success');
  });

  it('orders readable warnings and categorizes failures without hiding raw text', () => {
    const warnings = rankBacktestWarnings(['profit_factor_undefined_without_losses', 'unadjusted_prices', 'future_unknown']);
    expect(warnings.map((warning) => warning.code)).toEqual(['unadjusted_prices', 'profit_factor_undefined_without_losses', 'future_unknown']);

    expect(explainBacktestFailure('无法获取 AAPL 的行情数据')).toEqual({
      category: '数据不可用',
      nextStep: '检查标的代码或稍后重试；不要用其他标的或模拟数据替代。',
      raw: '无法获取 AAPL 的行情数据',
    });
  });
});
