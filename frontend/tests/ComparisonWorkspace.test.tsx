// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ComparisonWorkspace from '../src/pages/ComparisonWorkspace';

const mocks = vi.hoisted(() => ({
  listResearchWorkspaces: vi.fn(),
  listBacktests: vi.fn(),
}));

vi.mock('../src/services/researchApi', () => ({
  listResearchWorkspaces: mocks.listResearchWorkspaces,
  listBacktests: mocks.listBacktests,
}));

const params = {
  symbol: '600519', start_date: '2025-01-01', end_date: '2025-12-31', short_window: 20, long_window: 50,
  initial_capital: 100000, commission_bps: 3, slippage_bps: 2, sell_stamp_duty_bps: 5,
  minimum_commission_cny: 5, max_drawdown_stop_pct: 0.15, benchmark: 'buy_and_hold', market_rules: 'auto',
  price_limit_ratio: null, validation_samples: 60,
};
const provenance = {
  provider: 'sina', as_of: '2025-12-31', frequency: '1d', adjustment: 'none', currency: 'CNY',
  timezone: 'Asia/Shanghai', quality_flags: ['unadjusted_prices'],
};
const run = (id: number, symbol: string, totalReturn: number) => ({
  id, symbol, status: 'completed', is_saved: true, params: { ...params, symbol }, provenance,
  metrics: { total_return: totalReturn, excess_return: totalReturn - 0.05, max_drawdown: -0.1, annualized_volatility: 0.2, trade_count: 8 },
});

describe('ComparisonWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.listResearchWorkspaces.mockResolvedValue([{
      id: 1, symbol: '600519', name: '贵州茅台', notes: '', evidence: [{ label: 'FACT', title: '价格', detail: '真实快照' }], saved: true,
      snapshot: { provider: 'sina', as_of: '2026-08-07', frequency: '1d', adjustment: 'none', currency: 'CNY', timezone: 'Asia/Shanghai', quality_flags: ['unadjusted_prices'], instrument: { name: '贵州茅台' } },
    }]);
    mocks.listBacktests.mockResolvedValue([run(1, '600519', 0.1), run(2, '000858', 0.12)]);
    localStorage.setItem('finquant_portfolio_risk_reviews_v1', JSON.stringify([{
      id: 'risk-1', portfolio: '测试组合', summary: '集中度高 · 最大权重 50.00%',
      createdAt: '2026-08-09T00:00:00Z', dueAt: '2026-08-16T00:00:00Z', completed: false,
    }]));
  });

  it('persists explicit selection and shows numbers only for identical strategy contracts', async () => {
    const view = render(<MemoryRouter><ComparisonWorkspace /></MemoryRouter>);
    const first = await screen.findByRole('checkbox', { name: '选择已保存策略实验：600519 · MA20/50' });
    const second = screen.getByRole('checkbox', { name: '选择已保存策略实验：000858 · MA20/50' });
    fireEvent.click(first);
    fireEvent.click(second);

    expect(await screen.findByText('同口径策略指标可并排查看')).toBeTruthy();
    expect(screen.getByText('总收益')).toBeTruthy();
    expect(screen.getByText('+10.00%')).toBeTruthy();
    expect(screen.getByText('+12.00%')).toBeTruthy();
    expect(localStorage.getItem('finquant_comparison_selection_v1')).toContain('strategy:1');

    view.unmount();
    render(<MemoryRouter><ComparisonWorkspace /></MemoryRouter>);
    expect((await screen.findByRole('checkbox', { name: '选择已保存策略实验：600519 · MA20/50' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: '选择已保存策略实验：000858 · MA20/50' }) as HTMLInputElement).checked).toBe(true);
  });

  it('keeps mixed research and portfolio records metadata-only without writes', async () => {
    render(<MemoryRouter><ComparisonWorkspace /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('checkbox', { name: '选择已保存研究：贵州茅台' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择本地组合复盘：测试组合' }));

    expect(await screen.findByText(/跨类型只核对对象、时间、来源和证据/)).toBeTruthy();
    expect(screen.queryByText('同口径策略原始指标')).toBeNull();
    expect(mocks.listResearchWorkspaces).toHaveBeenCalledTimes(1);
    expect(mocks.listBacktests).toHaveBeenCalledWith(true);
  });

  it('previews only selected records and downloads only after the explicit click', async () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<MemoryRouter><ComparisonWorkspace /></MemoryRouter>);
    const download = await screen.findByRole('button', { name: '下载可复现清单（JSON）' });
    expect((download as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('checkbox', { name: '选择本地组合复盘：测试组合' }));
    expect(screen.getByText('schema v1 · 1 个显式选择记录')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /查看与下载一致的 JSON/ }));
    const preview = await screen.findByTestId('reproducibility-json');
    expect(preview.textContent).toContain('"record_id": "portfolio:risk-1"');
    expect(preview.textContent).not.toContain('strategy:1');
    expect(createObjectURL).not.toHaveBeenCalled();

    fireEvent.click(download);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('skips stale restored ids and reports partial source failures', async () => {
    localStorage.setItem('finquant_comparison_selection_v1', JSON.stringify({ version: 1, ids: ['strategy:missing'] }));
    mocks.listResearchWorkspaces.mockRejectedValueOnce(new Error('offline'));
    render(<MemoryRouter><ComparisonWorkspace /></MemoryRouter>);

    expect(await screen.findByText('1 个旧选择已跳过')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('已保存研究：offline')).toBeTruthy());
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });
});
