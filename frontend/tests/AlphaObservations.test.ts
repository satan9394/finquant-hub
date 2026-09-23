import { describe, expect, it } from 'vitest';

import { alignSimulationReturns, assessAlphaSample, parseAlphaObservations } from '../src/features/alpha/observations';
import type { AlphaSimulationResult } from '../src/services/alphaApi';

const csv = `date,symbol,factor,forward_return
2026-01-02,A,1,-0.02
2026-01-02,B,2,0.02
2026-01-05,A,1,-0.01
2026-01-05,B,2,0.03`;

const result = (dates: string[], returns: number[]): AlphaSimulationResult => ({
  equity_curve: [{ date: 'start', value: 1 }, ...dates.map((date, index) => ({ date, value: 1 + index / 100 }))],
  period_returns: returns,
  metrics: {
    total_return: 0.04, annualized_return: 1.2, benchmark_return: 0, excess_return: 0.04,
    max_drawdown: -0.02, sharpe_ratio: 1, sortino_ratio: 1, calmar_ratio: 2,
    information_ratio: null, average_turnover: 0.25, positive_period_rate: 0.5,
  },
});

describe('Alpha observations', () => {
  it('parses explicit CSV and reports rows, dates, and symbols', () => {
    const parsed = parseAlphaObservations(csv);
    expect(parsed.observations).toHaveLength(4);
    expect(parsed.observations[0]).toEqual({ date: '2026-01-02', symbol: 'A', factor: 1, forward_return: -0.02 });
    expect(parsed.summary).toEqual({ rows: 4, dates: 2, symbols: 2 });
  });

  it('accepts JSON but rejects duplicates and single-symbol dates', () => {
    expect(parseAlphaObservations(JSON.stringify([
      { date: '2026-01-02', symbol: 'A', factor: 1, forward_return: -0.02 },
      { date: '2026-01-02', symbol: 'B', factor: 2, forward_return: 0.02 },
    ])).summary.dates).toBe(1);
    expect(() => parseAlphaObservations(`${csv}\n2026-01-02,A,3,0.01`)).toThrow(/重复记录/);
    expect(() => parseAlphaObservations('date,symbol,factor,forward_return\n2026-01-02,A,1,0.01')).toThrow(/至少需要两个标的/);
  });

  it('flags short samples and aligns correlation series by shared dates only', () => {
    expect(assessAlphaSample(result(['2026-01-02', '2026-01-05'], [0.01, 0.02]))).toEqual(expect.objectContaining({
      status: 'insufficient', periods: 2,
    }));
    const aligned = alignSimulationReturns(
      result(['2026-01-02', '2026-01-05', '2026-01-06'], [0.01, 0.02, 0.03]),
      result(['2026-01-05', '2026-01-06', '2026-01-07'], [-0.02, 0.04, 0.01]),
    );
    expect(aligned).toEqual({
      dates: ['2026-01-05', '2026-01-06'], seriesA: [0.02, 0.03], seriesB: [-0.02, 0.04],
    });
  });
});
