// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../src/i18n/LanguageContext';
import ResearchWorkspace from '../src/pages/ResearchWorkspace';
import type { ChipDistributionResponse, DragonTigerResponse } from '../src/types/research';
import { shanghaiToday } from '../src/utils/formatAStock';

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
vi.mock('../src/components/ChipHistoryChart', () => ({
  default: ({ items, field }: { items: unknown[]; field: string }) => (
    <div data-testid="chip-history-chart" data-field={field} data-count={items.length} />
  ),
}));
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

function dragonTigerResponse(date = '2026-08-28', reason = '日涨幅偏离值达7%'): DragonTigerResponse {
  return {
    ticker: '600519', date, source: 'eastmoney.datacenter-web', quality: 'DIRECT',
    items: [{
      code: '600519', name: '贵州茅台', date, reason, net: 120, unit: 'CNY_10K',
      top5_buy: [{ name: '机构专用', buy: 300, sell: 100, net: 200, unit: 'CNY_10K' }],
      top5_sell: [],
    }],
  };
}

function chipResponse(): ChipDistributionResponse {
  const latest = {
    date: '2026-08-31', profit_ratio: 0.625, average_cost: 1480.25,
    cost_90: { low: 1400, high: 1600, concentration: 0.1 },
    cost_70: { low: 1450, high: 1550, concentration: 0.05 }, chip_peak: null,
  };
  return {
    ...snapshot, symbol: '600519', source: 'stock_cyq_em',
    methodology: 'akshare_cyq_calculator_120_day_turnover_decay', latest,
    items: [{ ...latest, date: '2026-08-28', profit_ratio: 0.6 }, latest],
  };
}

function selectDragonTigerDate(date: string) {
  const input = screen.getByRole('textbox', { name: '选择龙虎榜窗口截止日期' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: date } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
}

function dragonTigerHistory(): DragonTigerResponse {
  const response = dragonTigerResponse();
  return {
    ...response,
    items: [response.items[0], {
      code: '600519', name: '贵州茅台', date: '2026-08-19', reason: '历史上榜原因',
      net: -90, unit: 'CNY_10K', top5_buy: [], top5_sell: [],
    }],
  };
}

function renderWorkspace() {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/research/600519']}>
        <Link to="/research/000001">切换到平安银行</Link>
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
    api.fetchMoneyFlow.mockResolvedValue(null);
    api.fetchDragonTiger.mockResolvedValue({
      ticker: '600519', date: '2026-08-31', source: 'eastmoney.datacenter-web', quality: 'DIRECT', items: [],
    });
    api.fetchResearchHistory.mockResolvedValue([]);
    api.fetchResearchDiscussions.mockResolvedValue([]);
    api.fetchResearchTheses.mockResolvedValue([]);
  });

  it('keeps chip snapshots and switches the historical field locally without refetching workspace data', async () => {
    api.fetchChipDistribution.mockResolvedValue(chipResponse());
    renderWorkspace();

    const card = await screen.findByTestId('chip-card');
    const chart = within(card).getByTestId('chip-history-chart');
    expect(chart.getAttribute('data-field')).toBe('profit_ratio');
    expect(chart.getAttribute('data-count')).toBe('2');
    expect(Array.from(card.querySelectorAll('.ant-statistic-content'), (node) => node.textContent)).toEqual([
      '62.50%', '1,480.25 CNY', '1400–1600', '1450–1550',
    ]);
    for (const text of ['10.00%', '5.00%', 'UNKNOWN']) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(within(card).getByText('提供方未公开该字段')).toBeTruthy();
    expect(api.fetchChipDistribution).toHaveBeenCalledWith('600519');
    expect(api.fetchChipDistribution).toHaveBeenCalledTimes(1);
    const fetchers = [
      api.fetchChipDistribution, api.fetchInstrumentSnapshot, api.fetchInstrumentBars,
      api.fetchInstrumentFundamentals, api.fetchResearchWorkspace, api.fetchMoneyFlow,
      api.fetchDragonTiger, api.fetchResearchHistory, api.fetchResearchDiscussions, api.fetchResearchTheses,
    ];
    const calls = fetchers.map((fetcher) => fetcher.mock.calls.length);
    const control = within(card).getByLabelText('筹码历史指标切换');
    fireEvent.click(within(control).getByRole('radio', { name: '平均成本' }));
    await waitFor(() => expect(chart.getAttribute('data-field')).toBe('average_cost'));
    fireEvent.click(within(control).getByRole('radio', { name: '获利比例' }));
    await waitFor(() => expect(chart.getAttribute('data-field')).toBe('profit_ratio'));
    expect(fetchers.map((fetcher) => fetcher.mock.calls.length)).toEqual(calls);
  });

  it('retains the chip snapshot and honest Empty state when there are no historical items', async () => {
    api.fetchChipDistribution.mockResolvedValue({ ...chipResponse(), items: [] });
    renderWorkspace();
    const card = await screen.findByTestId('chip-card');
    expect(card.querySelector('.ant-statistic-content')?.textContent).toBe('62.50%');
    expect(within(card).getByText('暂无筹码历史序列；未用估算值替代')).toBeTruthy();
    expect(within(card).queryByTestId('chip-history-chart')).toBeNull();
    expect(within(card).queryByLabelText('筹码历史指标切换')).toBeNull();
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
    expect(within(within(dragonTigerCard).getByTestId('dragon-tiger-detail')).getByText('日涨幅偏离值达7%')).toBeTruthy();
    expect(within(dragonTigerCard).getByText('机构专用')).toBeTruthy();
  });

  it('lists all dragon-tiger records and selects the latest record with its original seats by default', async () => {
    const response = dragonTigerHistory();
    response.items[0].top5_sell = [{ name: '沪股通专用', buy: 100, sell: 250, net: -150, unit: 'CNY_10K' }];
    api.fetchDragonTiger.mockResolvedValue(response);
    renderWorkspace();

    const card = await screen.findByTestId('dragon-tiger-card');
    const list = within(card).getByLabelText('选择龙虎榜上榜记录');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByRole('button', { name: '2026-08-28 日涨幅偏离值达7% 120.00 万元', pressed: true })).toBeTruthy();
    expect(within(list).getByRole('button', { name: '2026-08-19 历史上榜原因 -90.00 万元', pressed: false })).toBeTruthy();
    const detail = within(card).getByTestId('dragon-tiger-detail');
    for (const text of ['600519', '贵州茅台', '2026-08-28', '日涨幅偏离值达7%', '120.00 万元']) {
      expect(within(detail).getByText(text)).toBeTruthy();
    }
    expect(within(card).getByText('机构专用')).toBeTruthy();
    expect(within(card).getByText('沪股通专用')).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-seats')).getAllByRole('table')).toHaveLength(2);
  });

  it('switches listing details locally, shows honest missing seats and restores the latest seats', async () => {
    api.fetchDragonTiger.mockResolvedValue(dragonTigerHistory());
    renderWorkspace();
    const card = await screen.findByTestId('dragon-tiger-card');
    const calls = api.fetchDragonTiger.mock.calls.length;
    fireEvent.click(within(card).getByRole('button', { name: /2026-08-19 历史上榜原因/ }));

    const detail = within(card).getByTestId('dragon-tiger-detail');
    for (const text of ['2026-08-19', '历史上榜原因', '-90.00 万元']) {
      expect(within(detail).getByText(text)).toBeTruthy();
    }
    expect(within(detail).queryByText('日涨幅偏离值达7%')).toBeNull();
    expect(within(card).getByRole('button', { name: /2026-08-19/, pressed: true })).toBeTruthy();
    expect(within(card).getByText('该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）')).toBeTruthy();
    expect(within(card).queryByTestId('dragon-tiger-seats')).toBeNull();
    expect(within(card).queryByText('机构专用')).toBeNull();
    expect(api.fetchDragonTiger).toHaveBeenCalledTimes(calls);

    fireEvent.click(within(card).getByRole('button', { name: /2026-08-28/ }));
    expect(within(card).getByText('机构专用')).toBeTruthy();
    expect(within(card).queryByText('该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）')).toBeNull();
    expect(api.fetchDragonTiger).toHaveBeenCalledTimes(calls);
  });

  it('renders actual historical seats if provided instead of forcing a latest-only placeholder', async () => {
    const response = dragonTigerHistory();
    response.items[1].top5_sell = [{ name: '历史卖出席位', buy: null, sell: 60, net: null, unit: 'CNY_10K' }];
    api.fetchDragonTiger.mockResolvedValue(response);
    renderWorkspace();
    const card = await screen.findByTestId('dragon-tiger-card');
    fireEvent.click(within(card).getByRole('button', { name: /2026-08-19/ }));

    expect(within(card).getByText('历史卖出席位')).toBeTruthy();
    expect(within(card).getByText('60.00 万元')).toBeTruthy();
    expect(within(card).queryByText('机构专用')).toBeNull();
    expect(within(card).queryByText('该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）')).toBeNull();
  });

  it('retains historical selection while the date loads and resets only on success, including shorter windows', async () => {
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerHistory());
    let resolveRequest!: (value: DragonTigerResponse) => void;
    api.fetchDragonTiger.mockImplementationOnce(() => new Promise<DragonTigerResponse>((resolve) => {
      resolveRequest = resolve;
    }));
    renderWorkspace();
    const card = await screen.findByTestId('dragon-tiger-card');
    fireEvent.click(within(card).getByRole('button', { name: /2026-08-19/ }));
    selectDragonTigerDate('2026-08-20');
    await waitFor(() => expect(api.fetchDragonTiger).toHaveBeenLastCalledWith('600519', '2026-08-20'));
    expect(within(card).getByRole('button', { name: /2026-08-19/, pressed: true })).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('历史上榜原因')).toBeTruthy();

    await act(async () => resolveRequest(dragonTigerResponse('2026-08-18', '新窗口最近上榜')));
    expect(within(card).getByRole('button', { name: /2026-08-18/, pressed: true })).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('新窗口最近上榜')).toBeTruthy();
    expect(within(card).getByText('机构专用')).toBeTruthy();
  });

  it('keeps historical selection after a failed date and resets after a successful workspace retry', async () => {
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerHistory());
    api.fetchDragonTiger.mockRejectedValueOnce(new Error('历史龙虎榜不可用'));
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerHistory());
    renderWorkspace();
    let card = await screen.findByTestId('dragon-tiger-card');
    fireEvent.click(within(card).getByRole('button', { name: /2026-08-19/ }));
    selectDragonTigerDate('2026-08-20');
    await screen.findByText('龙虎榜：历史龙虎榜不可用');
    expect(within(card).getByRole('button', { name: /2026-08-19/, pressed: true })).toBeTruthy();
    expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());

    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    card = await screen.findByTestId('dragon-tiger-card');
    expect(within(card).getByRole('button', { name: /2026-08-28/, pressed: true })).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('日涨幅偏离值达7%')).toBeTruthy();
    expect(api.fetchDragonTiger).toHaveBeenCalledTimes(3);
    expect(api.fetchInstrumentSnapshot).toHaveBeenCalledTimes(2);
  });

  it('resets selection on a real symbol navigation when the same workspace component is reused', async () => {
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerHistory());
    const response = dragonTigerResponse('2026-08-27', '平安银行最近上榜');
    response.ticker = '000001';
    response.items[0] = { ...response.items[0], code: '000001', name: '平安银行' };
    api.fetchDragonTiger.mockResolvedValueOnce(response);
    api.fetchInstrumentSnapshot.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({
      ...snapshot, instrument: { ...snapshot.instrument, symbol: '000001', name: '平安银行' },
    });
    renderWorkspace();
    let card = await screen.findByTestId('dragon-tiger-card');
    fireEvent.click(within(card).getByRole('button', { name: /2026-08-19/ }));
    fireEvent.click(screen.getByRole('link', { name: '切换到平安银行' }));

    await waitFor(() => expect(api.fetchDragonTiger).toHaveBeenLastCalledWith('000001', shanghaiToday()));
    card = await screen.findByTestId('dragon-tiger-card');
    expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy();
    const detail = within(card).getByTestId('dragon-tiger-detail');
    for (const text of ['000001', '平安银行', '平安银行最近上榜']) {
      expect(within(detail).getByText(text)).toBeTruthy();
    }
    expect(within(card).queryByText('历史上榜原因')).toBeNull();
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

  it('refetches only dragon-tiger data, retains it while loading and distinguishes the listing date', async () => {
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerResponse());
    let resolveRequest!: (value: DragonTigerResponse) => void;
    api.fetchDragonTiger.mockImplementationOnce(() => new Promise<DragonTigerResponse>((resolve) => {
      resolveRequest = resolve;
    }));
    renderWorkspace();

    const card = await screen.findByTestId('dragon-tiger-card');
    const input = within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement;
    expect(input.value).toBe(shanghaiToday());
    expect(api.fetchDragonTiger).toHaveBeenCalledWith('600519', shanghaiToday());
    const otherFetchers = [
      api.fetchInstrumentSnapshot, api.fetchInstrumentBars, api.fetchInstrumentFundamentals,
      api.fetchResearchWorkspace, api.fetchMoneyFlow, api.fetchChipDistribution,
      api.fetchResearchHistory, api.fetchResearchDiscussions, api.fetchResearchTheses,
    ];
    const previousCalls = otherFetchers.map((fetcher) => fetcher.mock.calls.length);
    selectDragonTigerDate('2026-08-20');

    await waitFor(() => expect(api.fetchDragonTiger).toHaveBeenLastCalledWith('600519', '2026-08-20'));
    expect(input.value).toBe('2026-08-20');
    expect(input.disabled).toBe(true);
    expect(card.querySelector('.ant-spin-spinning')).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('日涨幅偏离值达7%')).toBeTruthy();

    await act(async () => resolveRequest(dragonTigerResponse('2026-08-19', '历史上榜原因')));

    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('历史上榜原因')).toBeTruthy();
    expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('2026-08-19')).toBeTruthy();
    expect(within(card).getByText('显示截至所选日期的最近上榜记录')).toBeTruthy();
    expect(within(card).queryByText('日涨幅偏离值达7%')).toBeNull();
    expect(input.value).toBe('2026-08-20');
    expect(input.disabled).toBe(false);
    expect(otherFetchers.map((fetcher) => fetcher.mock.calls.length)).toEqual(previousCalls);
  });

  it('rolls back failed dates without losing rows, deduplicates errors and recovers to an honest empty window', async () => {
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerResponse());
    api.fetchDragonTiger.mockResolvedValueOnce(dragonTigerResponse('2026-08-19', '历史上榜原因'));
    api.fetchDragonTiger.mockRejectedValueOnce(new Error('历史龙虎榜不可用'));
    api.fetchDragonTiger.mockRejectedValueOnce(new Error('历史龙虎榜不可用'));
    api.fetchDragonTiger.mockResolvedValueOnce({
      ...dragonTigerResponse(), items: [], note: '所选回看窗口内未上榜',
    });
    api.fetchMoneyFlow.mockRejectedValue(new Error('资金接口不可用'));
    renderWorkspace();

    const card = await screen.findByTestId('dragon-tiger-card');
    const input = within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement;
    selectDragonTigerDate('2026-08-20');
    await within(within(card).getByTestId('dragon-tiger-detail')).findByText('历史上榜原因');
    const previousDate = input.value;
    const snapshotCalls = api.fetchInstrumentSnapshot.mock.calls.length;
    for (const date of ['2026-08-21', '2026-08-22']) {
      selectDragonTigerDate(date);
      await waitFor(() => expect(api.fetchDragonTiger).toHaveBeenLastCalledWith('600519', date));
      await waitFor(() => expect(input.value).toBe(previousDate));
      expect(screen.getAllByText('龙虎榜：历史龙虎榜不可用')).toHaveLength(1);
      expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('历史上榜原因')).toBeTruthy();
      expect(within(within(card).getByTestId('dragon-tiger-detail')).getByText('2026-08-19')).toBeTruthy();
      expect(input.disabled).toBe(false);
    }

    selectDragonTigerDate('2026-08-23');
    expect(await within(card).findByText('所选回看窗口内未上榜')).toBeTruthy();
    expect(input.value).toBe('2026-08-23');
    expect(screen.queryByText('龙虎榜：历史龙虎榜不可用')).toBeNull();
    expect(screen.getByText('资金流向：资金接口不可用')).toBeTruthy();
    expect(within(card).queryByText('历史上榜原因')).toBeNull();
    expect(api.fetchInstrumentSnapshot).toHaveBeenCalledTimes(snapshotCalls);
  });
});
