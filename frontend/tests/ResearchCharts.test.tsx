// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../src/charts/echartsSetup';
import ResearchCharts from '../src/components/research/ResearchCharts';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="echart" /> }));

const base = {
  provider: 'sina', as_of: '2026-08-30', timezone: 'Asia/Shanghai', currency: 'CNY', adjustment: 'none', frequency: '1d', quality_flags: [],
  instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
};

describe('ResearchCharts', () => {
  it('renders populated price, MACD, and RSI summaries over mocked charts', async () => {
    const payload = {
      ...base,
      items: [{ day: '2026-08-29', open: 100, high: 103, low: 99, close: 101, volume: 10 }, { day: '2026-08-30', open: 101, high: 105, low: 100, close: 104, volume: 12 }],
      indicators: { ma: { ma5: [100, 102] }, macd: { dif: [0.1, 0.2], dea: [0.05, 0.1], hist: [0.05, 0.1] }, rsi: { rsi6: [50, 60] } },
    } as any;
    render(<LanguageProvider><ResearchCharts payload={payload} /></LanguageProvider>);

    expect(screen.getByRole('img', { name: /来源 sina.*截止 2026-08-30/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最新 DIF 0.20/ })).toBeTruthy();
    expect((await screen.findAllByTestId('echart')).length).toBe(3);
  });

  it('keeps empty price and indicator series explicit', () => {
    render(<LanguageProvider><ResearchCharts payload={{ ...base, items: [], indicators: {} } as any} /></LanguageProvider>);

    expect(screen.getByRole('img', { name: /没有可用日线观察/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /没有返回可用 MACD 序列/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /RSI6 UNKNOWN/ })).toBeTruthy();
  });
});
