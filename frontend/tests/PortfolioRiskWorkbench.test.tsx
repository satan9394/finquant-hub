// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../src/charts/echartsSetup';
import PortfolioRiskWorkbench from '../src/components/portfolio/PortfolioRiskWorkbench';
import { runPortfolioBacktest } from '../src/services/analysisApi';
import type { PortfolioBacktestResult, PortfolioHolding } from '../src/types';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="portfolio-risk-chart" /> }));
vi.mock('../src/services/analysisApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/analysisApi')>();
  return { ...original, runPortfolioBacktest: vi.fn() };
});

const holdings = [
  { id: 1, group_id: 1, code: '600519', name: '贵州茅台', shares: 10, cost_price: 1500, added_at: '' },
  { id: 2, group_id: 1, code: '000001', name: '平安银行', shares: 1000, cost_price: 10, added_at: '' },
] as PortfolioHolding[];

const result: PortfolioBacktestResult = {
  strategy: 'ma_crossover', optimizer: 'equal_weight', optimization_lookback: 60,
  weights: { '600519.SS@1d': 0.7, '000001.SZ@1d': 0.3 },
  metrics: { total_return: 0.12, benchmark_return: 0.1, excess_return: 0.02, max_drawdown: -0.08, turnover: 1.25, trade_count: 6, win_rate: 0.5, profit_factor: 1.4 },
  equity_curve: [{ time: '2026-01-01', value: 25_000 }, { time: '2026-02-01', value: 28_000 }],
  benchmark_curve: [{ time: '2026-01-01', value: 25_000 }, { time: '2026-02-01', value: 27_500 }],
  assets: [
    { asset_id: '600519.SS@1d', symbol: '600519.SS', period: '1d', weight: 0.7, provenance: { provider: 'akshare', as_of: '2026-02-01', market: 'CN', currency: 'CNY', quality_flags: [] } },
    { asset_id: '000001.SZ@1d', symbol: '000001.SZ', period: '1d', weight: 0.3, provenance: { provider: 'sina', as_of: '2026-02-01', market: 'CN', currency: 'CNY', quality_flags: ['unadjusted_prices'] } },
  ],
  risk_xray: {
    concentration: { hhi: 0.58, effective_asset_count: 1.724, largest_weight: 0.7, top3_weight: 1, level: 'high' },
    drawdown: { max: -0.08, current: -0.02 },
    tail_risk: { status: 'ok', observations: 30, confidence: 0.95, var: 0.025, expected_shortfall: 0.04, var_amount: 700, expected_shortfall_amount: 1120 },
    diversification: {
      status: 'ok', observations: 30, average_correlation: 0.35, benefit: 0.2,
      correlation_matrix: {
        status: 'ok', observations: 30, asset_ids: ['600519.SS@1d', '000001.SZ@1d'],
        values: [[1, 0.35], [0.35, 1]],
      },
      risk_contribution: {
        status: 'ok', observations: 30, minimum_required: 20,
        method: 'sample_covariance_component_share', portfolio_volatility: 0.012,
        items: [
          { asset_id: '600519.SS@1d', weight: 0.7, contribution: 0.82 },
          { asset_id: '000001.SZ@1d', weight: 0.3, contribution: 0.18 },
        ],
      },
    },
  },
  warnings: ['weights_calibrated_before_backtest_window'],
};

describe('PortfolioRiskWorkbench', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.mocked(runPortfolioBacktest).mockResolvedValue(result); });

  it('runs a disclosed read-only baseline and renders backend risk evidence', async () => {
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    expect(screen.getByText(/未模拟最低佣金、印花税或汇率换算/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));

    await waitFor(() => expect(runPortfolioBacktest).toHaveBeenCalledWith(expect.objectContaining({
      optimizer: 'equal_weight', optimization_lookback: 60, count: 800, initial_capital: 25_000,
      assets: [
        expect.objectContaining({ symbol: '600519', period: '1d', short_window: 20, long_window: 50 }),
        expect.objectContaining({ symbol: '000001', period: '1d', short_window: 20, long_window: 50 }),
      ],
    })));
    await waitFor(() => expect(screen.getAllByTestId('portfolio-risk-chart')).toHaveLength(3));
    expect(screen.getByText('+12.00%')).toBeTruthy();
    expect(screen.getByText('胜率').parentElement?.textContent).toContain('50.00%');
    expect(screen.getByText('盈亏比').parentElement?.textContent).toContain('1.400');
    expect(screen.getByText('首要关注：持仓集中度高')).toBeTruthy();
    expect(screen.getByText(/95% 历史单期口径/).textContent).toContain('不是未来最大损失');
    expect(screen.getByText(/平均相关性 0.350/).textContent).toContain('共同收益观察 30 个');
    expect(screen.getByText('权重集中来源（非风险贡献）')).toBeTruthy();
    expect(screen.getByText('最大项：600519.SS@1d · 70.00%')).toBeTruthy();
    expect(screen.getByTestId('portfolio-weight-chart')).toBeTruthy();
    expect(screen.getByTestId('portfolio-correlation-chart')).toBeTruthy();
    expect(screen.getByRole('img', { name: /组合与基准权益曲线：组合收益 \+12.00%/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /权重集中图：最大项 600519.SS@1d，权重 70.00%/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /平均相关性位置图：平均相关性 0.350，共同收益观察 30 个/ })).toBeTruthy();
    expect(screen.getByText(/基于同一组 30 个对齐的真实策略收益观察/)).toBeTruthy();
    expect(screen.getByText('风险贡献 82.00%')).toBeTruthy();
    expect(screen.getByText('相关矩阵')).toBeTruthy();
    expect(screen.getByText(/压力测试仍不可用/)).toBeTruthy();
    expect(screen.getByText('暴露数据可行性')).toBeTruthy();
    expect(screen.getByText('市场 2/2 · 币种 2/2 · 行业 0/2')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN')).toHaveLength(2);
    const alertLink = screen.getByRole('link', { name: '去预警中心' });
    expect(alertLink.getAttribute('href')).toContain('source=portfolio');
    expect(alertLink.getAttribute('href')).toContain('ticker=600519.SS');
    expect(screen.getByText('有效资产数').parentElement?.textContent).toContain('2');
    expect(screen.getByText('2.50%')).toBeTruthy();
    expect(screen.getByText('akshare')).toBeTruthy();
    expect(screen.getByText('weights_calibrated_before_backtest_window')).toBeTruthy();
  });

  it('does not request a simulation with fewer than two holdings', () => {
    render(<PortfolioRiskWorkbench holdings={holdings.slice(0, 1)} initialCapital={15_000} />);
    expect((screen.getByRole('button', { name: /运行组合风险模拟/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/至少需要两个持仓/)).toBeTruthy();
    expect(runPortfolioBacktest).not.toHaveBeenCalled();
  });

  it('keeps unavailable tail and diversification evidence explicit', async () => {
    vi.mocked(runPortfolioBacktest).mockResolvedValue({
      ...result,
      risk_xray: {
        ...result.risk_xray,
        tail_risk: {
          status: 'insufficient_data', observations: 3, minimum_required: 20, confidence: 0.95,
          var: null, expected_shortfall: null, var_amount: null, expected_shortfall_amount: null,
        },
        diversification: {
          status: 'unsupported_mixed_frequency', average_correlation: null, benefit: null,
        },
      },
    });
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));

    expect(await screen.findByText('尾部风险样本不足')).toBeTruthy();
    expect(screen.getByText(/只有 3 个收益观察，后端至少需要 20 个/)).toBeTruthy();
    expect(screen.getByText('分散化暂不可判断')).toBeTruthy();
    expect(screen.getByText(/混合频率资产不可直接比较相关性/)).toBeTruthy();
    expect(screen.queryByTestId('portfolio-correlation-chart')).toBeNull();
    expect(screen.queryByText(/历史 VaR 为/)).toBeNull();
  });

  it('compares four optimizers while changing only the optimizer field', async () => {
    const returns: Record<string, number> = { equal_weight: 0.12, risk_parity: 0.1, mean_variance: 0.16, inverse_volatility: 0.08 };
    vi.mocked(runPortfolioBacktest).mockImplementation(async (payload) => ({
      ...result,
      optimizer: payload.optimizer,
      metrics: { ...result.metrics, total_return: returns[payload.optimizer] },
    }));
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));
    await screen.findByText('风险怎么理解');
    fireEvent.click(screen.getByRole('button', { name: /比较四种优化器/ }));

    expect(await screen.findByText('均值方差')).toBeTruthy();
    expect(runPortfolioBacktest).toHaveBeenCalledTimes(4);
    const payloads = vi.mocked(runPortfolioBacktest).mock.calls.map(([payload]) => payload);
    expect(payloads.map((payload) => payload.optimizer)).toEqual(['equal_weight', 'risk_parity', 'mean_variance', 'inverse_volatility']);
    expect(payloads.map(({ optimizer: _optimizer, ...payload }) => payload)).toEqual(Array(4).fill(payloads.map(({ optimizer: _optimizer, ...payload }) => payload)[0]));
    expect(screen.getAllByText('1.250×')).toHaveLength(4);
    expect(screen.getByText(/仅优化器不同/)).toBeTruthy();
  });

  it('keeps one failed optimizer explicitly unavailable', async () => {
    vi.mocked(runPortfolioBacktest).mockImplementation(async (payload) => {
      if (payload.optimizer === 'risk_parity') throw new Error('risk parity failed');
      return { ...result, optimizer: payload.optimizer };
    });
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));
    await screen.findByText('风险怎么理解');
    fireEvent.click(screen.getByRole('button', { name: /比较四种优化器/ }));

    expect(await screen.findByText(/风险平价不可用：risk parity failed/)).toBeTruthy();
    expect(screen.getByText('逆波动')).toBeTruthy();
  });

  it('does not crash when an older result has no portfolio turnover', async () => {
    vi.mocked(runPortfolioBacktest).mockImplementation(async (payload) => ({
      ...result,
      optimizer: payload.optimizer,
      metrics: { ...result.metrics, turnover: undefined },
    }));
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));
    await screen.findByText('风险怎么理解');
    fireEvent.click(screen.getByRole('button', { name: /比较四种优化器/ }));

    expect((await screen.findAllByText('不可用')).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('均值方差')).toBeTruthy();
  });

  it('keeps missing market and currency metadata unknown', async () => {
    vi.mocked(runPortfolioBacktest).mockResolvedValue({
      ...result,
      assets: result.assets.map((asset, index) => index ? asset : {
        ...asset, provenance: { ...asset.provenance, market: null, currency: null },
      }),
    });
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));

    expect(await screen.findByText('市场 1/2 · 币种 1/2 · 行业 0/2')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(4);
  });

  it('persists a derived review task and supports delete undo', async () => {
    const view = render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} portfolioName="测试组合" />);
    fireEvent.click(screen.getByRole('button', { name: /运行组合风险模拟/ }));
    await screen.findByText('风险跟踪动作');
    fireEvent.click(screen.getByRole('button', { name: '创建 7 天复盘待办' }));
    expect(screen.getByText('测试组合')).toBeTruthy();
    expect(localStorage.getItem('finquant_portfolio_risk_reviews_v1')).toContain('最大权重 70.00%');

    view.unmount();
    render(<PortfolioRiskWorkbench holdings={holdings} initialCapital={25_000} portfolioName="测试组合" />);
    expect(screen.getByText('测试组合')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /删\s*除/ }));
    expect(screen.queryByText('测试组合')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /撤\s*销/ }));
    expect(screen.getByText('测试组合')).toBeTruthy();
  });
});
