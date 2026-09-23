// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Portfolio from '../src/pages/Portfolio';
import apiClient from '../src/services/api';
import {
  fetchPortfolioAllocation,
  fetchPortfolioGroups,
  fetchPortfolioSummary,
} from '../src/services/analysisApi';

vi.mock('../src/services/analysisApi', () => ({
  fetchPortfolioGroups: vi.fn(),
  fetchPortfolioSummary: vi.fn(),
  fetchPortfolioHoldings: vi.fn().mockResolvedValue([]),
  fetchPortfolioAllocation: vi.fn(),
  createPortfolio: vi.fn(),
  addPortfolioHolding: vi.fn(),
  updatePortfolioHolding: vi.fn(),
  deletePortfolioHolding: vi.fn(),
}));
vi.mock('../src/services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../src/components/portfolio/PortfolioRiskWorkbench', () => ({ default: () => null }));

const paper = {
  id: 7,
  name: 'Paper US',
  base_currency: 'USD',
  initial_cash: 1000,
  status: 'ACTIVE',
  account_kind: 'PAPER',
  execution_kind: 'SIMULATED',
  capabilities: {
    real_account: false,
    real_orders: false,
    automatic_trading: false,
    simulated_ledger: true,
  },
} as const;

const reviewContext = (hypotheses: unknown[] = [], reviews: unknown[] = []) => ({
  schema_version: 'paper-portfolio-review-context/v1',
  paper_portfolio: paper,
  hypotheses,
  reviews,
  causal_proof: false,
});

const hypothesis = {
  id: 41,
  subject_type: 'instrument',
  subject_id: 'usAAPL',
  memory_type: 'hypothesis',
  information_kind: 'USER_HYPOTHESIS',
  content: { statement: 'AAPL momentum persists' },
  status: 'confirmed',
};

const validValuation = {
  ...paper,
  cash: 798,
  valuation_status: 'OK',
  valuation_reasons: [],
  total_value: 1018,
  total_return: 1.8,
  valuation_positions: [{
    symbol: 'usAAPL', quantity: 2, book_cost_base: 202,
    data_status: 'OK', current_price: 110, market_value: 220,
    quote_currency: 'USD', source: 'fixture:quote', as_of: '1786634400',
  }],
};

const prepareExistingPortfolio = () => {
  vi.mocked(fetchPortfolioGroups).mockResolvedValue([]);
  vi.mocked(fetchPortfolioSummary).mockResolvedValue({
    total_invested: 0,
    total_current: 0,
    total_profit: 0,
    total_profit_percent: 0,
    group_summaries: [],
  });
  vi.mocked(fetchPortfolioAllocation).mockResolvedValue([]);
};

describe('Portfolio page loading states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPortfolioGroups).mockRejectedValue(new Error('组合服务不可用'));
    vi.mocked(fetchPortfolioSummary).mockRejectedValue(new Error('盈亏服务不可用'));
    vi.mocked(fetchPortfolioAllocation).mockRejectedValue(new Error('配置服务不可用'));
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } } as never);
  });

  it('shows each failed source with an explicit retry instead of silently rendering zeros', async () => {
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('组合列表：组合服务不可用')).toBeTruthy();
    expect(screen.getByText('组合汇总：盈亏服务不可用')).toBeTruthy();
    expect(screen.getByText('资产配置：配置服务不可用')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /重\s*试/ })).toHaveLength(3);
    expect(screen.queryByText('行情与盈亏已更新')).toBeNull();
  });
});

describe('Paper portfolio states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prepareExistingPortfolio();
  });

  it('shows an independent empty state and explicit simulation boundary', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { items: [] } } as never);
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('暂无模拟组合；创建后才会写入独立模拟账本')).toBeTruthy();
    expect(screen.getByText('仅用于研究模拟，与现有组合完全分离')).toBeTruthy();
    expect(screen.getByRole('button', { name: '新建模拟组合' })).toBeTruthy();
    expect(screen.queryByText(/自动交易/)).toBeNull();
  });

  it('shows paper loading and a retryable error without hiding existing portfolio', async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    vi.mocked(apiClient.get).mockImplementation(() => new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }) as never);
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByLabelText('正在加载模拟组合')).toBeTruthy();
    rejectRequest?.(new Error('模拟服务不可用'));
    expect(await screen.findByText('模拟组合：模拟服务不可用')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载模拟组合' })).toBeTruthy();
    expect(screen.getByText('投资组合')).toBeTruthy();
  });

  it('renders partial valuation with UNKNOWN FX, provenance, and no fabricated total', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/portfolio/paper') return { data: { items: [paper] } } as never;
      if (url.endsWith('/reviews')) return { data: reviewContext() } as never;
      return {
        data: {
          ...paper,
          cash: 800,
          valuation_status: 'PARTIAL',
          valuation_reasons: ['FX_UNKNOWN:HKD->USD:hk00700'],
          total_value: null,
          total_return: null,
          valuation_positions: [{
            symbol: 'hk00700',
            quantity: 1,
            book_cost_base: 200,
            data_status: 'PARTIAL',
            current_price: 400,
            market_value: 400,
            quote_currency: 'HKD',
            source: 'fixture:quote',
            as_of: '1786634400',
          }],
        },
      } as never;
    });
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('模拟估值状态：PARTIAL')).toBeTruthy();
    expect(screen.getByText('FX_UNKNOWN:HKD->USD:hk00700')).toBeTruthy();
    expect(screen.getByText(/来源 fixture:quote/)).toBeTruthy();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '记录模拟买卖' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /停\s*用/ })).toBeTruthy();
  });

  it('renders a valid same-currency valuation with current source and time', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/portfolio/paper') return { data: { items: [paper] } } as never;
      if (url.endsWith('/reviews')) return { data: reviewContext() } as never;
      return { data: validValuation } as never;
    });
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('usAAPL')).toBeTruthy();
    expect(screen.getByText('现价 110 USD')).toBeTruthy();
    expect(screen.getByText(/来源 fixture:quote/)).toBeTruthy();
    expect(screen.queryByText(/模拟估值状态/)).toBeNull();
  });

  it('shows a review empty state without creating or inferring a hypothesis', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/portfolio/paper') return { data: { items: [paper] } } as never;
      if (url.endsWith('/reviews')) return { data: reviewContext() } as never;
      return { data: validValuation } as never;
    });
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('暂无 hypothesis 记忆；请先在研究记忆中显式保存假设')).toBeTruthy();
    expect(screen.getByText('复盘判断必须由用户显式选择')).toBeTruthy();
    expect(vi.mocked(apiClient.post)).not.toHaveBeenCalled();
  });

  it('keeps an UNKNOWN draft inconclusive and exposes provenance and formulas', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/portfolio/paper') return { data: { items: [paper] } } as never;
      if (url.endsWith('/reviews')) return { data: reviewContext([hypothesis]) } as never;
      if (url.includes('/reviews/draft')) return {
        data: {
          schema_version: 'paper-portfolio-review-draft/v1',
          paper_portfolio_id: paper.id,
          hypothesis,
          simulation_result: {
            information_kind: 'COMPUTED_RESULT',
            initial_cash: 1000,
            cash: 798,
            total_value: null,
            total_return: null,
            valuation_status: 'UNKNOWN',
            valuation_reasons: ['PRICE_UNKNOWN:usAAPL'],
            positions: [{
              symbol: 'usAAPL', quantity: 2, book_cost_base: 202,
              data_status: 'UNKNOWN', current_price: null, market_value: null,
              quote_currency: null, source: null, as_of: null,
            }],
            formula: 'total_return=(cash+sum(quantity*current_price))/initial_cash-1',
            fee_formula: 'BUY=-(quantity*price+fee)*fx; SELL=(quantity*price-fee)*fx',
          },
          outcome_options: ['inconclusive'],
          recommended_outcome: null,
          information_kind: 'USER_HYPOTHESIS',
          causal_proof: false,
          warning: '模拟收益不构成因果证明。',
        },
      } as never;
      return { data: validValuation } as never;
    });
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '准备模拟复盘' }));
    expect(await screen.findByText('草稿质量：UNKNOWN')).toBeTruthy();
    expect(screen.getByText(/PRICE_UNKNOWN:usAAPL；当前仅允许 inconclusive/)).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/total_return=/)).toBeTruthy();
    expect(screen.getByText(/BUY=-/)).toBeTruthy();
    expect(screen.getByText('模拟收益不构成因果证明。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '记录复盘判断' }));
    expect(await screen.findByText('这是用户判断，不是事实或因果证明')).toBeTruthy();
    expect(screen.getByText('系统不会预选 outcome；估值不完整时只能选择 inconclusive。')).toBeTruthy();
  });

  it('restores review history with explicit outcome, window, quality, and causal boundary', async () => {
    const reviews = [{
      id: 51,
      memory_type: 'review_outcome',
      information_kind: 'USER_HYPOTHESIS',
      content: {
        hypothesis_memory_id: hypothesis.id,
        outcome: 'supported',
        reason: '用户认为模拟方向一致。',
        observed_from: '2026-08-01T00:00:00Z',
        observed_to: '2026-08-13T00:00:00Z',
        simulation_result: {
          information_kind: 'COMPUTED_RESULT', total_value: 1018,
          total_return: 1.8, valuation_status: 'OK',
        },
        causal_proof: false,
        warning: '非因果证明',
      },
      created_at: '2026-08-13T00:00:00Z',
    }];
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === '/portfolio/paper') return { data: { items: [paper] } } as never;
      if (url.endsWith('/reviews')) return { data: reviewContext([hypothesis], reviews) } as never;
      return { data: validValuation } as never;
    });
    render(<MemoryRouter><Portfolio /></MemoryRouter>);

    expect(await screen.findByText('supported · 支持')).toBeTruthy();
    expect(screen.getByText('用户认为模拟方向一致。')).toBeTruthy();
    expect(screen.getByText(/观察 2026-08-01T00:00:00Z/)).toBeTruthy();
    expect(screen.getByText('causal_proof=false')).toBeTruthy();
  });
});
