import { describe, expect, test } from 'vitest';

import { extractTickers } from '../src/pages/Discover';

describe('extractTickers — Astra B7 筛选术语误识别回归', () => {
  test('ROE/FCF/CAGR 不再被当证券代码提取', () => {
    expect(extractTickers('ROE > 20%')).toEqual([]);
    expect(extractTickers('FCF CAGR > 10%')).toEqual([]);
    expect(extractTickers('茅台 ROE 提升')).toEqual([]);
    expect(extractTickers('筛选 ROE>15% 且 FCF 增长的 A 股')).toEqual([]);
  });

  test('真实代码仍被提取（含与术语混排）', () => {
    expect(extractTickers('600519 · ROE > 20%')).toEqual(['600519']);
    expect(extractTickers('000001 600519 00700')).toEqual(['000001', '600519', '00700']);
    expect(extractTickers('AAPL')).toEqual(['AAPL']);
    // 术语/停用词黑名单不误伤真实 US 代码
    expect(extractTickers('PEP vs KO')).toEqual(['PEP', 'KO']);
  });

  test('大小写与去重', () => {
    expect(extractTickers('600519 600519 roe')).toEqual(['600519']);
    expect(extractTickers('aaple')).toEqual(['AAPLE']);
  });
});
