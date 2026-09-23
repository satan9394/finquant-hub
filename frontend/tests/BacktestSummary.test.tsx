// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BacktestFailurePanel from '../src/components/strategy/BacktestFailurePanel';
import BacktestSummary from '../src/components/strategy/BacktestSummary';
import type { BacktestRun } from '../src/types/research';

const run: BacktestRun = {
  id: 31,
  symbol: '600519',
  status: 'completed',
  params: {} as BacktestRun['params'],
  metrics: {
    total_return: 0.12,
    annualized_return: 0.08,
    benchmark_return: 0.15,
    excess_return: -0.03,
    max_drawdown: -0.24,
    sharpe_ratio: 0.6,
    sortino_ratio: 0.8,
    calmar_ratio: 0.3,
    information_ratio: -0.2,
    annualized_volatility: 0.21,
    annualized_downside_volatility: 0.14,
    max_drawdown_duration_periods: 7,
    max_drawdown_recovery_periods: 2,
    max_drawdown_recovered: true,
    beta: 0.8,
    alpha: 0.04,
    r_squared: 0.64,
    tracking_error: 0.12,
    win_rate: 0.48,
    profit_factor: null,
    trade_expectancy: 0.02,
    average_win: 0.08,
    average_loss: -0.04,
    average_holding_periods: 5,
    market_exposure: 0.42,
    total_commission_cost: 60,
    total_stamp_duty_cost: 20,
    total_slippage_cost: 40,
    total_trading_cost: 120,
    trading_cost_ratio: 0.012,
    turnover: 3,
    trade_count: 3,
  },
  validation: {
    bootstrap: { confidence_interval: [-0.05, 0.2], probability_positive: 0.62, samples: 1_000 },
    monte_carlo: {
      terminal_return: { p05: -0.12, median: 0.06, p95: 0.21 },
      probability_loss: 0.32,
      probability_bust: 0,
      samples: 1_000,
      max_drawdown: { worst_confidence_tail: -0.3, median: -0.14 },
    },
    walk_forward: { status: 'insufficient_data' },
  },
  warnings: ['profit_factor_undefined_without_losses', 'unadjusted_prices'],
};

describe('BacktestSummary', () => {
  it('shows the decision metrics, ranked limits, readable warnings, and expandable explanations', () => {
    render(<BacktestSummary run={run} />);

    expect(screen.getByText('暂不建议据此交易')).toBeTruthy();
    expect(screen.getByTestId('metric-total-return').textContent).toContain('+12.00%');
    expect(screen.getByTestId('metric-benchmark-return').textContent).toContain('+15.00%');
    expect(screen.getByTestId('metric-excess-return').textContent).toContain('-3.00%');
    expect(screen.getByTestId('metric-max-drawdown').textContent).toContain('-24.00%');
    expect(screen.getByTestId('metric-recovery').textContent).toContain('已恢复 · 2期');
    expect(screen.getByTestId('metric-trade-count').textContent).toContain('3');
    expect(screen.getAllByText(/未跑赢买入持有|最大回撤超过基础门槛|交易样本不足|稳健性证据有限/)).toHaveLength(4);
    expect(screen.getByText(/Bootstrap 区间 -5.00% ～ \+20.00%/)).toBeTruthy();
    expect(screen.getByText(/Walk-forward 样本不足/)).toBeTruthy();
    expect(screen.getByText('价格未复权')).toBeTruthy();
    expect(screen.getByText('unadjusted_prices')).toBeTruthy();

    fireEvent.click(screen.getByText('专业指标与通俗解释'));
    expect(screen.getByText(/无风险收益按 0/)).toBeTruthy();
    expect(screen.getByText(/目标收益按 0/)).toBeTruthy();
    expect(screen.getByText('无亏损时不可定义。', { exact: false })).toBeTruthy();

    fireEvent.click(screen.getByText('P1 风险、基准归因与交易质量'));
    expect(screen.getByTestId('metric-beta').textContent).toContain('0.800');
    expect(screen.getByTestId('metric-tracking-error').textContent).toContain('+12.00%');
    expect(screen.getByTestId('metric-trade-expectancy').textContent).toContain('+2.00%');
    expect(screen.getByTestId('metric-trading-cost').textContent).toContain('120.00');
    expect(screen.getByTestId('metric-trading-cost').textContent).toContain('1.20%');
  });

  it('marks P1 diagnostics unavailable for persisted legacy results', () => {
    render(<BacktestSummary run={{
      ...run,
      metrics: {
        ...run.metrics!,
        max_drawdown_recovered: undefined,
        beta: undefined,
        trade_expectancy: undefined,
      },
    }} />);

    // ②-E：空值不再 pre-format 成 '—' 冒充 OK——recovery 缺失时 FinancialMetric 显示 unknown 占位（'未知'）且不带 OK 标记
    expect(screen.getByTestId('metric-recovery').textContent).toContain('未知');
    expect(screen.getByTestId('metric-recovery').textContent).not.toContain('—');
    expect(screen.getByText(/历史结果未包含 P1 诊断/)).toBeTruthy();
  });

  it('classifies a data failure and preserves its raw error', () => {
    render(<BacktestFailurePanel error="无法获取 AAPL 的行情数据" title="部分证据不可用" />);

    expect(screen.getByText('部分证据不可用')).toBeTruthy();
    expect(screen.getByText('数据不可用')).toBeTruthy();
    expect(screen.getByText(/不要用其他标的或模拟数据替代/)).toBeTruthy();
    expect(screen.getByText('无法获取 AAPL 的行情数据')).toBeTruthy();
  });
});
