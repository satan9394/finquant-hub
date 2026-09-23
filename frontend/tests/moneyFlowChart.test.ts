import { describe, expect, it } from 'vitest';

import type { MoneyFlowItem } from '../src/types/research';
import { moneyFlowTimeToEpoch, moneyFlowToAreaData } from '../src/utils/moneyFlowChart';

function moneyFlowItem(overrides: Partial<MoneyFlowItem>): MoneyFlowItem {
  return {
    main_net: 1,
    small_net: null,
    medium_net: null,
    large_net: null,
    super_large_net: null,
    ...overrides,
  };
}

describe('money-flow chart mapping', () => {
  it('converts zero-padded Shanghai minute timestamps to exact epoch seconds across dates', () => {
    expect(moneyFlowTimeToEpoch('2026-08-31 14:59')).toBe(1_788_159_540);
    expect(moneyFlowTimeToEpoch('2026-09-01 00:05')).toBe(1_788_192_300);
  });

  it('returns null for malformed or impossible minute timestamps', () => {
    expect(moneyFlowTimeToEpoch('2026-08-31')).toBeNull();
    expect(moneyFlowTimeToEpoch('2026-02-30 09:30')).toBeNull();
    expect(moneyFlowTimeToEpoch('2026-08-31 24:00')).toBeNull();
  });

  it('maps minute points without mutating input and drops invalid timestamps', () => {
    const items = [
      moneyFlowItem({ time: '2026-08-31 14:59', main_net: 120_000 }),
      moneyFlowItem({ time: 'not-a-time', main_net: 80_000 }),
    ];
    const original = structuredClone(items);

    expect(moneyFlowToAreaData(items, 'minute')).toEqual([
      { time: 1_788_159_540, value: 120_000 },
    ]);
    expect(items).toEqual(original);
  });

  it('preserves valid 120-day date strings in area data', () => {
    expect(moneyFlowToAreaData([
      moneyFlowItem({ date: '2026-08-29', main_net: -50_000 }),
      moneyFlowItem({ date: '2026-08-31', main_net: 90_000 }),
    ], '120d')).toEqual([
      { time: '2026-08-29', value: -50_000 },
      { time: '2026-08-31', value: 90_000 },
    ]);
  });

  it('drops null and non-finite amounts instead of fabricating values', () => {
    expect(moneyFlowToAreaData([
      moneyFlowItem({ date: '2026-08-28', main_net: null }),
      moneyFlowItem({ date: '2026-08-29', main_net: Number.NaN }),
      moneyFlowItem({ date: '2026-08-30', main_net: Number.POSITIVE_INFINITY }),
      moneyFlowItem({ date: '2026-08-31', main_net: 0 }),
    ], '120d')).toEqual([{ time: '2026-08-31', value: 0 }]);
  });
});
