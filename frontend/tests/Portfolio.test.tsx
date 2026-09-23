// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Portfolio from '../src/pages/Portfolio';
import apiClient from '../src/services/api';
import {
  fetchPortfolioAllocation,
  fetchPortfolioGroups,
  fetchPortfolioHoldings,
  fetchPortfolioSummary,
} from '../src/services/analysisApi';

vi.mock('../src/services/analysisApi', () => ({
  fetchPortfolioGroups: vi.fn(),
  fetchPortfolioSummary: vi.fn(),
  fetchPortfolioHoldings: vi.fn(),
  fetchPortfolioAllocation: vi.fn(),
  createPortfolio: vi.fn(),
  addPortfolioHolding: vi.fn(),
  updatePortfolioHolding: vi.fn(),
  deletePortfolioHolding: vi.fn(),
}));
vi.mock('../src/services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../src/components/portfolio/PortfolioRiskWorkbench', () => ({ default: () => null }));

const holding = {
  id: 17,
  group_id: 1,
  code: '600519',
  name: '贵州茅台',
  shares: 10,
  cost_price: 1500,
  current_price: 1600,
  profit: 1000,
  profit_percent: 6.67,
};

function renderPortfolio() {
  return render(<MemoryRouter><Portfolio /></MemoryRouter>);
}

describe('Portfolio holdings read state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPortfolioGroups).mockResolvedValue([{ id: 1, name: '长期组合' }] as never);
    vi.mocked(fetchPortfolioSummary).mockResolvedValue({
      total_invested: 0,
      total_current: 0,
      total_profit: 0,
      total_profit_percent: 0,
      group_summaries: [],
    });
    vi.mocked(fetchPortfolioAllocation).mockResolvedValue([]);
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } } as never);
  });

  it('keeps loading and confirmed empty states mutually exclusive', async () => {
    let resolveHoldings: ((items: typeof holding[]) => void) | undefined;
    vi.mocked(fetchPortfolioHoldings).mockImplementation(() => new Promise((resolve) => {
      resolveHoldings = resolve;
    }) as never);

    renderPortfolio();
    await waitFor(() => expect(fetchPortfolioHoldings).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('正在加载持仓明细')).toBeTruthy();
    expect(screen.queryByText('暂无真实持仓')).toBeNull();
    expect(screen.queryByText('持仓明细读取失败')).toBeNull();

    resolveHoldings?.([]);
    expect(await screen.findByText('暂无真实持仓')).toBeTruthy();
    expect(screen.queryByText('正在加载持仓明细')).toBeNull();
    expect(screen.queryByText('持仓明细读取失败')).toBeNull();
  });

  it('shows a read error instead of empty and retry really reloads holdings', async () => {
    vi.mocked(fetchPortfolioHoldings)
      .mockRejectedValueOnce(new Error('行情源暂不可用'))
      .mockResolvedValueOnce([holding] as never);

    renderPortfolio();
    expect(await screen.findByText('持仓明细读取失败')).toBeTruthy();
    expect(screen.getByText('行情源暂不可用')).toBeTruthy();
    expect(screen.queryByText('暂无真实持仓')).toBeNull();
    expect(fetchPortfolioHoldings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    await waitFor(() => expect(fetchPortfolioHoldings).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('600519')).toBeTruthy();
    expect(screen.queryByText('持仓明细读取失败')).toBeNull();
    expect(screen.queryByText('暂无真实持仓')).toBeNull();
  });
});
