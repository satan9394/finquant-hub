// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PortfolioRiskTearSheet } from '../src/pages/Portfolio';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));
vi.mock('../src/components/portfolio/UnderwaterChart', () => ({
  default: () => <div data-testid="portfolio-underwater-chart" />,
}));
vi.mock('../src/components/portfolio/RollingRiskChart', () => ({
  default: () => <div data-testid="portfolio-rolling-risk-chart" />,
}));

const result = {
  status: 'ok' as const,
  reason: null,
  as_of: '2026-12-31',
  currency: 'CNY',
  method: 'current_share_quantities_fixed_over_history',
  coverage: {
    requested_assets: 2,
    priced_assets: 2,
    available_symbols: ['AAA', 'BBB'],
    missing_symbols: [],
    source_metadata: {
      AAA: { sources: ['sina'], adjustments: ['none'] },
      BBB: { sources: ['sina'], adjustments: ['none'] },
    },
    observation_count: 60,
    history_start: '2026-10-01',
    history_end: '2026-12-31',
  },
  metrics: {
    max_drawdown: -0.12,
    max_drawdown_duration_days: 8,
    annualized_volatility: 0.2,
    calmar_ratio: 1.25,
    sortino_ratio: 1.4,
    concentration_hhi: 0.5,
    effective_asset_count: 2,
    largest_weight: 0.6667,
  },
  underwater_series: [{ time: '2026-12-31', value: -0.12 }],
  rolling_metrics: [{ time: '2026-12-31', sharpe: 1.1, volatility: 0.2 }],
  monthly_matrix: [{
    year: 2026,
    months: [0.02, -0.01, null, null, null, null, null, null, null, null, null, null],
    annual_total: 0.0098,
    complete_year: false,
  }],
  risk_contributions: [
    { symbol: 'AAA', weight: 0.6667, annualized_volatility: 0.18, risk_contribution: 0.7 },
    { symbol: 'BBB', weight: 0.3333, annualized_volatility: 0.24, risk_contribution: 0.3 },
  ],
  warnings: [],
};

describe('PortfolioRiskTearSheet', () => {
  beforeEach(() => api.get.mockReset());

  it('loads source-backed tear-sheet metrics, heatmap, charts, and risk exposures', async () => {
    api.get.mockResolvedValue({ data: result });
    render(<PortfolioRiskTearSheet portfolioId={12} />);

    expect(await screen.findByText('投资组合量化体检报告')).toBeTruthy();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/portfolio/12/risk-tearsheet'));
    expect(screen.getByText('历史重演口径')).toBeTruthy();
    expect(screen.getByText('最大回撤')).toBeTruthy();
    expect(screen.getByText('-12.00%')).toBeTruthy();
    expect(screen.getByTestId('portfolio-underwater-chart')).toBeTruthy();
    expect(screen.getByTestId('portfolio-rolling-risk-chart')).toBeTruthy();
    expect(screen.getByTestId('portfolio-monthly-heatmap')).toBeTruthy();
    expect(screen.getByTitle('2026年1月：+2.0%')).toBeTruthy();
    expect(screen.getAllByText('风险贡献').length).toBeGreaterThan(0);
    expect(screen.getByText('数据截至 2026-12-31。收益与风险按共同交易日估算；首尾月份可能为不完整样本期。')).toBeTruthy();
  });

  it('keeps unavailable risk metrics unknown and exposes a real retry', async () => {
    api.get.mockRejectedValueOnce(new Error('本次行情请求失败'));
    api.get.mockResolvedValueOnce({ data: result });
    render(<PortfolioRiskTearSheet portfolioId={12} />);

    expect(await screen.findByText('本次行情请求失败')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('portfolio-underwater-chart')).toBeTruthy();
  });

  it('does not leak a slower prior portfolio response into the newly selected portfolio', async () => {
    let resolveFirst!: (value: { data: typeof result }) => void;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    api.get.mockResolvedValueOnce({ data: { ...result, as_of: '2026-11-30' } });
    const view = render(<PortfolioRiskTearSheet portfolioId={12} />);
    view.rerender(<PortfolioRiskTearSheet portfolioId={13} />);

    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/portfolio/13/risk-tearsheet'));
    resolveFirst({ data: result });
    expect(await screen.findByText(/数据截至 2026-11-30/)).toBeTruthy();
    expect(screen.queryByText(/数据截至 2026-12-31/)).toBeNull();
  });
});
