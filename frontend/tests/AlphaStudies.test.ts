// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALPHA_STUDIES_KEY, deleteAlphaStudy, readAlphaStudies, readTrashedAlphaStudies,
  restoreAlphaStudy, saveAlphaStudy,
} from '../src/features/alpha/studies';
import type { AlphaSimulationResult } from '../src/services/alphaApi';

const result: AlphaSimulationResult = {
  equity_curve: [{ date: 'start', value: 1 }, { date: '2026-01-02', value: 1.01 }],
  period_returns: [0.01],
  metrics: {
    total_return: 0.01, annualized_return: null, benchmark_return: 0, excess_return: 0.01,
    max_drawdown: 0, sharpe_ratio: null, sortino_ratio: null, calmar_ratio: null,
    information_ratio: null, average_turnover: 1, positive_period_rate: 1,
  },
};

describe('local Alpha studies', () => {
  beforeEach(() => { localStorage.clear(); vi.spyOn(Date, 'now').mockReturnValue(123); });

  it('saves only a named derived snapshot and deletes it explicitly', () => {
    const saved = saveAlphaStudy({
      name: '反转研究', templateId: 'price_reversal', templateName: '短期价格反转',
      quantile: 0.2, periodsPerYear: 252, result,
    });

    expect(readAlphaStudies()).toEqual([saved]);
    const stored = localStorage.getItem(ALPHA_STUDIES_KEY) ?? '';
    expect(stored).not.toContain('observations');
    expect(stored).not.toContain('PRIVATE_SYMBOL');

    deleteAlphaStudy(saved.id);
    expect(readAlphaStudies()).toEqual([]);
    expect(readTrashedAlphaStudies()).toEqual([saved]);
    restoreAlphaStudy(saved.id);
    expect(readAlphaStudies()).toEqual([saved]);
    expect(readTrashedAlphaStudies()).toEqual([]);
  });

  it('rejects blank names and safely ignores malformed storage', () => {
    expect(() => saveAlphaStudy({
      name: '  ', templateId: 'x', templateName: 'X', quantile: 0.2,
      periodsPerYear: 252, result,
    })).toThrow('研究名称');

    localStorage.setItem(ALPHA_STUDIES_KEY, '{bad json');
    expect(readAlphaStudies()).toEqual([]);
  });
});
