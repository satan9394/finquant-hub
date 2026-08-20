// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AlphaSimulationWorkbench from '../src/components/alpha/AlphaSimulationWorkbench';
import { correlateAlphaSeries, simulateAlphaLocally, type AlphaSimulationResult, type AlphaTemplate } from '../src/services/alphaApi';

vi.mock('../src/services/alphaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/alphaApi')>();
  return { ...original, simulateAlphaLocally: vi.fn(), correlateAlphaSeries: vi.fn() };
});

const template: AlphaTemplate = {
  id: 'price_reversal', name: '短期价格反转', expression: 'rank(-(close / open - 1))',
  fields: [{ id: 'close', description: 'Daily close', coverage: 1 }],
  settings: { neutralization: 'INDUSTRY', decay: 10, delay: 1, nanHandling: 'ON' },
};
const input = `date,symbol,factor,forward_return
2026-01-02,A,1,-0.02
2026-01-02,B,2,0.02
2026-01-05,A,1,-0.01
2026-01-05,B,2,0.03
2026-01-06,A,1,-0.01
2026-01-06,B,2,0.01`;
const simulation = (returns: number[]): AlphaSimulationResult => ({
  equity_curve: [{ date: 'start', value: 1 }, ...['2026-01-02', '2026-01-05', '2026-01-06'].map((date, index) => ({ date, value: 1 + (index + 1) / 100 }))],
  period_returns: returns,
  metrics: {
    total_return: 0.03, annualized_return: 10, benchmark_return: 0, excess_return: 0.03,
    max_drawdown: -0.01, sharpe_ratio: 1.2, sortino_ratio: 1.4, calmar_ratio: 3,
    information_ratio: null, average_turnover: 0.25, positive_period_rate: 2 / 3,
  },
  factor_analysis: {
    status: 'ok', method: 'cross_sectional_pearson_and_spearman', total_periods: 5,
    valid_periods: 5, minimum_assets_per_period: 5, minimum_valid_periods: 5,
    mean_ic: 0.8, mean_rank_ic: 0.84, rank_ic_std: 0.1, icir: 8.4,
    excluded_periods: [], periods: [],
  },
});

describe('AlphaSimulationWorkbench', () => {
  beforeEach(() => localStorage.clear());

  it('runs only explicit observations, warns on short samples, and correlates aligned local results', async () => {
    vi.mocked(simulateAlphaLocally)
      .mockResolvedValueOnce(simulation([0.01, 0.02, -0.01]))
      .mockResolvedValueOnce(simulation([0.02, 0.01, -0.02]));
    vi.mocked(correlateAlphaSeries).mockResolvedValue({ correlation: 0.5, p_value: 0.2, n: 3, note: '样本较少' });
    const view = render(<AlphaSimulationWorkbench template={template} />);

    expect(screen.getByText('证据状态与可用结果')).toBeTruthy();
    expect(screen.getByText('IC / Rank IC / ICIR')).toBeTruthy();
    expect(screen.getByText(/至少需要每期 5 个标的/)).toBeTruthy();
    expect(screen.getByText(/没有多期限 forward return/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /计算 IC|计算衰减/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('观察数据'), { target: { value: input } });
    fireEvent.click(screen.getByRole('button', { name: /运行本地模拟/ }));
    expect(await screen.findByText('样本不足，不主推年化指标')).toBeTruthy();
    expect(screen.getByText(/每年 252 期.*无风险收益按 0.*目标收益按 0.*未扣佣金、滑点或税费/)).toBeTruthy();
    expect(screen.getByTestId('alpha-total-return').textContent).toContain('+3.00%');
    expect(screen.getByText(/平均 Rank IC \+0.8400/)).toBeTruthy();
    expect(screen.getByText(/ICIR 8.4000/)).toBeTruthy();
    expect(simulateAlphaLocally).toHaveBeenCalledWith(expect.objectContaining({ observations: expect.any(Array), quantile: 0.2, periods_per_year: 252 }));

    fireEvent.click(screen.getByRole('button', { name: '设为相关性基准' }));
    fireEvent.change(screen.getByLabelText('观察数据'), { target: { value: input.replace('0.03', '0.02') } });
    fireEvent.click(screen.getByRole('button', { name: /运行本地模拟/ }));
    await waitFor(() => expect(simulateAlphaLocally).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole('button', { name: '计算与基准相关性' }));

    await waitFor(() => expect(correlateAlphaSeries).toHaveBeenCalledWith([0.01, 0.02, -0.01], [0.02, 0.01, -0.02]));
    expect(await screen.findByText('相关系数 0.5000')).toBeTruthy();
    expect(screen.getByText(/p=0.2000 · n=3 · 样本较少/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('研究名称'), { target: { value: '短期反转验证' } });
    fireEvent.click(screen.getByRole('button', { name: '保存本地研究' }));
    expect(await screen.findByText('已保存：短期反转验证')).toBeTruthy();
    expect(localStorage.getItem('finquant_alpha_studies_v1')).not.toContain('2026-01-02,A,1');

    view.unmount();
    render(<AlphaSimulationWorkbench template={template} />);
    expect(await screen.findByText('已恢复：短期反转验证')).toBeTruthy();
    expect((screen.getByLabelText('观察数据') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText('已保存本地研究')).toBeTruthy();
  });

  it('requires a selected template and never exposes a BRAIN action', () => {
    render(<AlphaSimulationWorkbench template={null} />);
    expect(screen.getByText('先选择一个真实字段模板')).toBeTruthy();
    expect(screen.queryByText(/BRAIN/)).toBeNull();
  });
});
