// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComparisonCandidate } from '../src/features/comparisonWorkspace';
import {
  buildReproducibilityManifest,
  downloadReproducibilityManifest,
  serializeReproducibilityManifest,
} from '../src/features/reproducibilityManifest';

const strategy: ComparisonCandidate = {
  id: 'strategy:2', kind: 'strategy', title: 'AAPL · MA20/50', object: 'AAPL',
  asOf: '2026-07-27', source: 'yahoo', quality: '无质量标记', evidence: '已保存实验 #2',
  href: '/strategy-lab/ma-crossover?symbol=AAPL',
  missingFields: ['params.sell_stamp_duty_bps', 'params.minimum_commission_cny'],
  contract: {
    period: '2024-07-27 → 2026-07-27', parameters: 'MA20/50 · 资金 100000 · 回撤止损 UNKNOWN',
    costs: '佣金 3bps · 印花税 UNKNOWNbps', benchmark: 'buy_and_hold',
    source: 'yahoo · 2026-07-27 · 1d · none · USD · America/New_York', complete: false,
  },
  metrics: { totalReturn: 0.1758, excessReturn: -0.368, maxDrawdown: -0.2472, annualizedVolatility: null, tradeCount: 8 },
};

afterEach(() => vi.restoreAllMocks());

describe('reproducibility manifest', () => {
  it('uses stable schema/version and keeps legacy gaps explicitly UNKNOWN', () => {
    const manifest = buildReproducibilityManifest([strategy], '2026-08-09T22:00:00.000Z');
    expect(manifest).toMatchObject({
      schema: 'finquant_reproducibility_manifest', schema_version: 1,
      generated_at: '2026-08-09T22:00:00.000Z', entry_count: 1,
    });
    expect(manifest.entries[0]).toMatchObject({
      record_id: 'strategy:2', methodology: 'ma_crossover_backtest_saved_run',
      missing_fields: ['params.sell_stamp_duty_bps', 'params.minimum_commission_cny'],
      metrics: { annualized_volatility: 'UNKNOWN' },
    });
    expect(serializeReproducibilityManifest(manifest)).toContain('回撤止损 UNKNOWN');
  });

  it('exports only normalized summaries and names excluded sensitive/raw data', () => {
    const research: ComparisonCandidate = {
      id: 'research:1', kind: 'research', title: '贵州茅台', object: '600519', asOf: '2026-08-07',
      source: 'sina', quality: 'unadjusted_prices', evidence: '1 条已保存证据', href: '/research/600519',
    };
    const portfolio: ComparisonCandidate = {
      id: 'portfolio:risk-1', kind: 'portfolio', title: '测试组合', object: '测试组合', asOf: '2026-08-09',
      source: '本机派生风险摘要', quality: '待复盘', evidence: '集中度高', href: '/portfolio',
    };
    const serialized = serializeReproducibilityManifest(buildReproducibilityManifest(
      [research, portfolio], '2026-08-09T22:00:00.000Z',
    ));
    expect(serialized).toContain('saved_research_workspace_snapshot');
    expect(serialized).toContain('local_derived_portfolio_risk_review_summary');
    expect(serialized).toContain('raw_observation_input');
    expect(serialized).not.toContain('API_KEY');
  });

  it('downloads the exact serialized manifest only when called explicitly', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const manifest = buildReproducibilityManifest([strategy], '2026-08-09T22:00:00.000Z');

    expect(click).not.toHaveBeenCalled();
    expect(downloadReproducibilityManifest(manifest)).toBe('finquant-reproducibility-2026-08-09.json');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
