import { describe, expect, it } from 'vitest';

import type { ChipDistributionItem } from '../src/types/research';
import { chipToAreaData, type ChipSeriesField } from '../src/utils/chipChart';

const item: ChipDistributionItem = {
  date: '2026-08-31', profit_ratio: 0.625, average_cost: 1480.25,
  cost_90: { low: 1400, high: 1600, concentration: 0.1 },
  cost_70: { low: 1450, high: 1550, concentration: 0.05 }, chip_peak: null,
};

describe('chipToAreaData', () => {
  it('preserves fractional profit ratios, zero and one, with the original daily dates', () => {
    expect(chipToAreaData([
      { ...item, date: '2026-08-27', profit_ratio: 0 },
      { ...item, date: '2026-08-28', profit_ratio: 1 }, item,
    ], 'profit_ratio')).toEqual([
      { time: '2026-08-27', value: 0 }, { time: '2026-08-28', value: 1 },
      { time: '2026-08-31', value: 0.625 },
    ]);
  });

  it('maps average cost without converting units and returns an empty array for no items', () => {
    expect(chipToAreaData([item], 'average_cost')).toEqual([{ time: '2026-08-31', value: 1480.25 }]);
    expect(chipToAreaData([], 'average_cost')).toEqual([]);
  });

  it.each<ChipSeriesField>(['profit_ratio', 'average_cost'])('filters invalid %s points without mutating input', (field) => {
    const items = [
      item, { ...item, date: '' }, { ...item, date: '   ' },
      ...[null, NaN, Infinity, -Infinity].map((value) => ({ ...item, [field]: value } as ChipDistributionItem)),
    ];
    const original = structuredClone(items);
    items.forEach(Object.freeze);
    Object.freeze(items);

    const data = chipToAreaData(items, field);

    expect(data).toEqual([{ time: item.date, value: item[field] }]);
    expect(items).toEqual(original);
    expect(data).not.toBe(items);
    expect(data[0]).not.toBe(item);
  });
});
