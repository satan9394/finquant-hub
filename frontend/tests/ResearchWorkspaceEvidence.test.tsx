// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../src/i18n/LanguageContext';
import ResearchWorkspace from '../src/pages/ResearchWorkspace';

const api = vi.hoisted(() => ({
  fetchChipDistribution: vi.fn(),
  fetchDragonTiger: vi.fn(),
  fetchInstrumentBars: vi.fn(),
  fetchInstrumentFundamentals: vi.fn(),
  fetchInstrumentSnapshot: vi.fn(),
  fetchMoneyFlow: vi.fn(),
  fetchResearchDiscussions: vi.fn(),
  fetchResearchHistory: vi.fn(),
  fetchResearchReport: vi.fn(),
  fetchResearchTheses: vi.fn(),
  fetchResearchWorkspace: vi.fn(),
  listResearchWorkspaces: vi.fn(),
  saveResearchWorkspace: vi.fn(),
  searchInstruments: vi.fn(),
}));

vi.mock('../src/services/researchApi', () => api);
vi.mock('../src/components/research/ResearchCharts', () => ({ default: () => <div>CHARTS</div> }));
vi.mock('../src/components/SwarmStatusCard', () => ({ default: () => null }));
vi.mock('../src/components/research/ResearchContinuity', () => ({ default: () => null }));
vi.mock('../src/components/research/ResearchIntentPicker', () => ({ default: () => null }));
vi.mock('../src/components/research/FundamentalMetricsPanel', () => ({ default: () => null }));
vi.mock('../src/components/MoneyFlowChart', () => ({
  default: ({ items, period }: { items: unknown[]; period: string }) => (
    items.length ? <div data-testid="money-flow-chart" data-period={period} /> : <div>暂无资金流序列；未用估算值替代</div>
  ),
}));

const snapshot = {
  instrument: {
    symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE',
    currency: 'CNY', asset_type: 'stock',
  },
  data: {
    price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
    volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
    turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
  },
  provider: 'eastmoney', as_of: '2026-08-31T15:00:00+08:00', timezone: 'Asia/Shanghai',
  currency: 'CNY', adjustment: null, frequency: null, quality_flags: [],
};

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/research/600519']}>
        <Routes><Route path="/research/:symbol" element={<ResearchWorkspace />} /></Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('ResearchWorkspace A-share evidence cards', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
    api.fetchInstrumentSnapshot.mockResolvedValue(snapshot);
    api.fetchInstrumentBars.mockResolvedValue({
      ...snapshot, instrument: snapshot.instrument, items: [], indicators: {}, frequency: '1d',
    });
    api.fetchInstrumentFundamentals.mockResolvedValue({
      ...snapshot, instrument: snapshot.instrument, items: [],
    });
    api.fetchResearchWorkspace.mockResolvedValue({ symbol: '600519', notes: '', evidence: [], saved: false });
    api.fetchChipDistribution.mockResolvedValue(null);
    api.fetchDragonTiger.mockResolvedValue({
      ticker: '600519', date: '2026-08-31', source: 'eastmoney.datacenter-web', quality: 'DIRECT', items: [],
    });
    api.fetchResearchHistory.mockResolvedValue([]);
    api.fetchResearchDiscussions.mockResolvedValue([]);
    api.fetchResearchTheses.mockResolvedValue([]);
  });

  it('renders successful money-flow and dragon-tiger fetch results', async () => {
    api.fetchMoneyFlow.mockResolvedValue({
      ticker: '600519', period: 'minute', source: 'eastmoney.push2', as_of: '2026-08-31 14:59',
      quality: 'DIRECT', main_net: 120_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000,
      items: [{
        time: '2026-08-31 14:59', main_net: 120_000, super_large_net: 80_000,
        large_net: 30_000, medium_net: 20_000, small_net: -10_000,
      }],
    });
    api.fetchDragonTiger.mockResolvedValue({
      ticker: '600519', date: '2026-08-28', source: 'eastmoney.datacenter-web', quality: 'DIRECT',
      items: [{
        code: '600519', name: '贵州茅台', date: '2026-08-28', reason: '日涨幅偏离值达7%', net: 120,
        unit: 'CNY_10K',
        top5_buy: [{ name: '机构专用', buy: 300, sell: 100, net: 200, unit: 'CNY_10K' }],
        top5_sell: [{ name: '沪股通专用', buy: 100, sell: 250, net: -150, unit: 'CNY_10K' }],
      }],
    });

    renderWorkspace();

    const moneyFlowCard = await screen.findByTestId('money-flow-card');
    expect(within(moneyFlowCard).getByText('12.00 万元')).toBeTruthy();
    expect(within(moneyFlowCard).getAllByText('分钟')).toHaveLength(2);
    expect(within(moneyFlowCard).getByTestId('money-flow-chart')).toBeTruthy();
    const dragonTigerCard = screen.getByTestId('dragon-tiger-card');
    expect(within(dragonTigerCard).getByText('日涨幅偏离值达7%')).toBeTruthy();
    expect(within(dragonTigerCard).getByText('机构专用')).toBeTruthy();
  });

  it('keeps both cards visible with honest Empty fallbacks when fetchers fail', async () => {
    api.fetchMoneyFlow.mockRejectedValue(new Error('资金接口不可用'));
    api.fetchDragonTiger.mockRejectedValue(new Error('龙虎榜接口不可用'));

    renderWorkspace();

    expect(await screen.findByText('资金流向：资金接口不可用')).toBeTruthy();
    expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();
    expect(within(screen.getByTestId('money-flow-card')).getByText('资金流向暂不可用；未用估算值替代')).toBeTruthy();
    expect(within(screen.getByTestId('dragon-tiger-card')).getByText('回看窗口内暂无龙虎榜记录')).toBeTruthy();
  });

  it('refetches only money flow and updates the chart after switching to 120 days', async () => {
    api.fetchMoneyFlow.mockImplementation((_symbol: string, period: 'minute' | '120d' = 'minute') => Promise.resolve({
      ticker: '600519', period, source: period === 'minute' ? 'eastmoney.push2' : 'eastmoney.push2his',
      as_of: period === 'minute' ? '2026-08-31 14:59' : '2026-08-31', quality: 'DIRECT',
      main_net: 120_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000,
      items: period === 'minute'
        ? [{ time: '2026-08-31 14:59', main_net: 120_000, super_large_net: 80_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000 }]
        : [{ date: '2026-08-31', main_net: 150_000, super_large_net: 90_000, large_net: 40_000, medium_net: 10_000, small_net: -5_000 }],
    }));

    renderWorkspace();

    const card = await screen.findByTestId('money-flow-card');
    expect(within(card).getByTestId('money-flow-chart').getAttribute('data-period')).toBe('minute');
    const snapshotCalls = api.fetchInstrumentSnapshot.mock.calls.length;
    fireEvent.click(within(card).getByText('120 日'));

    await waitFor(() => expect(api.fetchMoneyFlow).toHaveBeenCalledWith('600519', '120d'));
    await waitFor(() => expect(within(card).getByTestId('money-flow-chart').getAttribute('data-period')).toBe('120d'));
    expect(api.fetchInstrumentSnapshot).toHaveBeenCalledTimes(snapshotCalls);
  });

  it('keeps the old series and restores its selected period when a period refetch fails', async () => {
    api.fetchMoneyFlow.mockImplementation((_symbol: string, period: 'minute' | '120d' = 'minute') => {
      if (period === '120d') return Promise.reject(new Error('120 日资金接口不可用'));
      return Promise.resolve({
        ticker: '600519', period, source: 'eastmoney.push2', as_of: '2026-08-31 14:59', quality: 'DIRECT',
        main_net: 120_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000,
        items: [{ time: '2026-08-31 14:59', main_net: 120_000, super_large_net: 80_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000 }],
      });
    });

    renderWorkspace();

    const card = await screen.findByTestId('money-flow-card');
    fireEvent.click(within(card).getByText('120 日'));

    expect(await screen.findByText('资金流向：120 日资金接口不可用')).toBeTruthy();
    expect(within(card).getByTestId('money-flow-chart').getAttribute('data-period')).toBe('minute');
    expect((within(card).getByRole('radio', { name: '分钟' }) as HTMLInputElement).checked).toBe(true);
  });
});
