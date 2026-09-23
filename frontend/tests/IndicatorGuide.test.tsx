// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import IndicatorGuide, { latestIndicatorValues } from '../src/components/IndicatorGuide';
import type { IndicatorData } from '../src/types';

const payload: IndicatorData = {
  ticker: '600519',
  days: ['2026-08-06', '2026-08-07'],
  indicators: {
    ma: { ma5: [null, 1310.12], ma10: [null, 1302.34], ma20: [null, 1298.56], ma30: [], ma60: [], ma120: [], ma250: [] },
    macd: { dif: [null, 1.2345], dea: [null, 0.9876], hist: [null, 0.4938] },
    rsi: { rsi6: [null, 71.8], rsi12: [null, 62.2], rsi24: [null, 55.4] },
    kdj: { k: [null, 68.1], d: [null, 64.2], j: [null, 75.9] },
  },
};

describe('IndicatorGuide', () => {
  it('uses the latest non-null values without inventing missing series', () => {
    expect(latestIndicatorValues(payload, 'macd')).toEqual([
      ['DIF', '1.23'], ['DEA', '0.99'], ['MACD', '0.49'],
    ]);
    expect(latestIndicatorValues(payload, 'ma')).toContainEqual(['MA60', '未知']);
  });

  it('exposes raw values, shared knowledge, and interpretation limits', () => {
    render(<MemoryRouter><IndicatorGuide data={payload} /></MemoryRouter>);

    expect(screen.getByText('截止 2026-08-07')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看原始指标' }).getAttribute('href')).toBe('#raw-indicators');

    fireEvent.click(screen.getByRole('button', { name: /MACD/ }));
    expect(screen.getByRole('link', { name: '打开 MACD 知识主题' }).getAttribute('href')).toBe('/knowledge?indicator=macd');
    expect(screen.getByText('常见误区')).toBeTruthy();
    expect(screen.getByText(/零轴附近可能频繁交叉/)).toBeTruthy();
  });

  it('shows only explicitly preferred indicator guides', () => {
    render(<MemoryRouter><IndicatorGuide data={payload} keys={['ma', 'rsi']} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /MA 移动平均线/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /RSI 相对强弱指标/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /MACD 指数平滑/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /KDJ 随机指标/ })).toBeNull();
  });
});
