// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import StrategyLab from '../src/pages/StrategyLab';
import { fetchMarketPulse } from '../src/services/marketDiscoveryApi';
import { fetchInstrumentBars } from '../src/services/researchApi';

vi.mock('../src/services/researchApi', () => ({
  createBacktest: vi.fn(),
  fetchBacktest: vi.fn(),
  fetchInstrumentBars: vi.fn(),
  listBacktests: vi.fn(async () => []),
  saveBacktest: vi.fn(),
}));
vi.mock('../src/services/marketDiscoveryApi', () => ({ fetchMarketPulse: vi.fn() }));

describe('StrategyLab', () => {
  beforeEach(() => {
    vi.mocked(fetchInstrumentBars).mockResolvedValue({ items: Array.from({ length: 60 }, (_, index) => ({ day: `2025-01-${index + 1}`, close: 1 })) } as never);
    vi.mocked(fetchMarketPulse).mockResolvedValue({
      sections: {
        weekly: {
          items: [{
            code: 'sh600519', name: '贵州茅台', price: 1500,
            weekly_change_percent: 12.3, change_percent: 2.1,
            turnover_rate: 1.2, amount: 100_000_000, amplitude: 3,
            volume_ratio: 1, industry: '白酒', ths_main_net_inflow: null,
            ths_industry: null, ths_main_net_inflow_unit: 'wan_cny',
            source_status: { eastmoney: true, tonghuashun: false },
            reason_tags: ['一周大涨'], eastmoney_url: '', tonghuashun_url: '',
          }],
        },
      },
    } as never);
  });

  test('offers a ranked market reference and exposes the actual default cost and drawdown controls', async () => {
    render(<MemoryRouter><StrategyLab /></MemoryRouter>);

    expect(await screen.findByRole('button', { name: /贵州茅台/ })).toBeTruthy();
    expect(screen.getByText('东方财富证券 A 股参考')).toBeTruthy();
    expect((screen.getByLabelText('手续费') as HTMLInputElement).value).toBe('2.5');
    expect((screen.getByLabelText('回撤止损') as HTMLInputElement).value).toBe('0');

    fireEvent.click(screen.getByRole('button', { name: /贵州茅台/ }));
    await waitFor(() => expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('SH600519'));
  });

  test('prefills a symbol passed from a watchlist backtest link', async () => {
    render(<MemoryRouter initialEntries={['/strategy-lab/ma-crossover?symbol=sh600519']}><StrategyLab /></MemoryRouter>);

    expect((screen.getByLabelText('股票代码') as HTMLInputElement).value).toBe('sh600519');
  });
});
