// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockChart from '../src/components/StockChart';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  fetchKLine: vi.fn(),
  switchToCandlestick: vi.fn(), clearAllSeries: vi.fn(), fitContent: vi.fn(),
}));
vi.mock('../src/services/stockApi', () => ({ fetchKLine: mocks.fetchKLine, fetchIndicators: vi.fn() }));
vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: () => ({
    switchToCandlestick: mocks.switchToCandlestick,
    clearAllSeries: mocks.clearAllSeries,
    fitContent: mocks.fitContent,
  }),
}));

describe('StockChart', () => {
  beforeEach(() => {
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    mocks.fetchKLine.mockResolvedValue([{ day: '2026-08-30', open: 100, high: 106, low: 99, close: 105, volume: 1000 }]);
  });

  it('loads candles into the mocked lightweight-chart boundary and shows the legend', async () => {
    render(<LanguageProvider><StockChart ticker="aapl" theme="light" /></LanguageProvider>);

    expect(await screen.findByText('105.00')).toBeTruthy();
    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('+5.00 (+5.00%)')).toBeTruthy();
    expect(mocks.fetchKLine).toHaveBeenCalledWith('aapl', '1d', 120);
    expect(mocks.switchToCandlestick).toHaveBeenCalledTimes(1);
  });

  it('shows the honest empty state when no candle data is returned', async () => {
    mocks.fetchKLine.mockResolvedValue([]);
    render(<LanguageProvider><StockChart ticker="UNKNOWN" theme="dark" /></LanguageProvider>);

    expect(await screen.findByText('暂无数据')).toBeTruthy();
    await waitFor(() => expect(mocks.switchToCandlestick).not.toHaveBeenCalled());
  });
});
