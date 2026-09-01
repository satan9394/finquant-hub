import { describe, expect, it } from 'vitest';

import { formatWan } from '../src/utils/formatAStock';

describe('formatWan', () => {
  it('formats yuan values in ten-thousand-yuan units, including zero and negatives', () => {
    expect(formatWan(0)).toBe('0.00 万元');
    expect(formatWan(15_000)).toBe('1.50 万元');
    expect(formatWan(-25_000)).toBe('-2.50 万元');
  });

  it('preserves values already expressed in CNY_10K and rejects missing values', () => {
    expect(formatWan(120.5, 'CNY_10K')).toBe('120.50 万元');
    expect(formatWan(null)).toBe('—');
    expect(formatWan(Number.NaN)).toBe('—');
  });
});
