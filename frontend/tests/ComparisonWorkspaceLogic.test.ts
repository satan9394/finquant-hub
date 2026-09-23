// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  COMPARISON_SELECTION_KEY,
  assessComparison,
  buildComparisonCandidates,
  clearComparisonSelection,
  readComparisonSelection,
  saveComparisonSelection,
  type ComparisonCandidate,
  type ComparisonContract,
} from '../src/features/comparisonWorkspace';
import type { BacktestRun, ResearchWorkspace } from '../src/types/research';

const contract: ComparisonContract = {
  period: '2025-01-01 → 2025-12-31',
  parameters: 'MA20/50 · 资金 100000',
  costs: '佣金 3bps',
  benchmark: 'buy_and_hold',
  source: 'sina · 2025-12-31 · 1d · none · CNY · Asia/Shanghai',
  complete: true,
};

const strategy = (id: string, overrides: Partial<ComparisonCandidate> = {}): ComparisonCandidate => ({
  id,
  kind: 'strategy',
  title: id,
  object: id,
  asOf: '2025-12-31',
  source: 'sina',
  quality: 'ok',
  evidence: 'saved',
  href: '/strategy-lab/ma-crossover',
  contract,
  metrics: { totalReturn: 0.1, excessReturn: 0.02, maxDrawdown: -0.1, annualizedVolatility: 0.2, tradeCount: 8 },
  ...overrides,
});

describe('comparison workspace contracts', () => {
  beforeEach(() => localStorage.clear());

  it('validates and caps the persisted selection envelope', () => {
    localStorage.setItem(COMPARISON_SELECTION_KEY, '{bad json');
    expect(readComparisonSelection()).toEqual([]);
    expect(saveComparisonSelection(['a', 'b', 'a', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd']);
    expect(readComparisonSelection()).toEqual(['a', 'b', 'c', 'd']);
    clearComparisonSelection();
    expect(localStorage.getItem(COMPARISON_SELECTION_KEY)).toBeNull();
  });

  it('builds candidates only from real saved/completed records and validated local reviews', () => {
    localStorage.setItem('finquant_portfolio_risk_reviews_v1', JSON.stringify([
      { id: 'risk-1', portfolio: '测试组合', summary: '集中度高', createdAt: '2026-08-09T00:00:00Z', dueAt: '2026-08-16T00:00:00Z', completed: false },
      { id: 2, portfolio: 'bad' },
    ]));
    const research = [{
      id: 1, symbol: '600519', name: '贵州茅台', notes: '', evidence: [], saved: true,
      snapshot: { provider: 'sina', as_of: '2026-08-07', timezone: 'Asia/Shanghai', currency: 'CNY', adjustment: 'none', frequency: '1d', quality_flags: [] },
    }] as ResearchWorkspace[];
    const params = {
      symbol: '600519', start_date: '2025-01-01', end_date: '2025-12-31', short_window: 20, long_window: 50,
      initial_capital: 100000, commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 5,
      minimum_commission_cny: 5, max_drawdown_stop_pct: 0.15, benchmark: 'buy_and_hold' as const,
    };
    const backtests = [
      { id: 1, symbol: '600519', status: 'completed', is_saved: true, params, metrics: { total_return: 0.1, excess_return: 0.02, max_drawdown: -0.1, annualized_volatility: 0.2, trade_count: 8 }, provenance: { provider: 'sina', as_of: '2025-12-31', frequency: '1d', adjustment: 'none', currency: 'CNY', timezone: 'Asia/Shanghai', quality_flags: [] } },
      { id: 2, symbol: '600519', status: 'failed', is_saved: true, params },
    ] as BacktestRun[];

    const candidates = buildComparisonCandidates(research, backtests);
    expect(candidates.map((item) => item.id)).toEqual(['research:1', 'strategy:1', 'portfolio:risk-1']);
    expect(candidates.find((item) => item.id === 'strategy:1')?.metrics?.totalReturn).toBe(0.1);
  });

  it('permits numbers only for complete identical strategy contracts', () => {
    expect(assessComparison([strategy('a'), strategy('b')]).status).toBe('comparable');
    expect(assessComparison([
      strategy('a'), strategy('b', { contract: { ...contract, costs: '佣金 5bps' } }),
    ])).toMatchObject({ status: 'incompatible', differences: ['成本'] });
    expect(assessComparison([
      strategy('a'), strategy('b', { contract: { ...contract, complete: false } }),
    ])).toMatchObject({ status: 'incompatible', differences: ['合同字段不完整'] });
    expect(assessComparison([
      strategy('a'), { ...strategy('research'), kind: 'research', contract: undefined, metrics: undefined },
    ]).status).toBe('cross_type');
  });
});
