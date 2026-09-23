import { describe, expect, it } from 'vitest';

import { explainAlphaCategory, explainAlphaTemplate, formatAlphaCoverage } from '../src/features/alpha/catalog';

describe('Alpha catalog explanations', () => {
  it('maps the five backend template ids to stable plain-language hypotheses and limitations', () => {
    expect(explainAlphaTemplate('fundamental_quality')).toEqual(expect.objectContaining({
      category: '基本面', hypothesis: expect.stringContaining('经营利润'), limitation: expect.stringContaining('行业中性'),
    }));
    expect(explainAlphaTemplate('free_cash_flow_yield').category).toBe('基本面');
    expect(explainAlphaTemplate('analyst_earnings_yield').category).toBe('分析师预期');
    expect(explainAlphaTemplate('price_reversal').category).toBe('价格行为');
    expect(explainAlphaTemplate('volume_price_divergence').category).toBe('量价关系');
  });

  it('keeps unknown categories and coverage explicit instead of inventing metadata', () => {
    expect(explainAlphaCategory('Fundamental')).toEqual(expect.objectContaining({ label: '基本面数据' }));
    expect(explainAlphaCategory('Future Category')).toEqual({
      label: 'Future Category', description: '接口返回的新类别，当前版本尚无专门说明。',
    });
    expect(formatAlphaCoverage(0.5288)).toBe('52.9%');
    expect(formatAlphaCoverage(undefined)).toBe('UNKNOWN');
  });
});
