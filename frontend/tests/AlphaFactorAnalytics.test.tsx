// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AlphaFactorAnalytics from '../src/pages/alpha/AlphaFactorAnalytics';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));
vi.mock('../src/components/LazyEChart', () => ({
  default: ({ option }: { option: { series: unknown[] } }) => (
    <div data-testid="echart" data-series-count={option.series.length} />
  ),
}));

const response = {
  status: 'insufficient' as const,
  minimum_valid_periods: 20,
  valid_periods: 1,
  total_periods: 1,
  observation_count: 2,
  cache_ttl_seconds: 3500,
  summary: {
    ic_mean: null, ic_std: null, ic_ir: null, t_stat: null,
    monotonicity_score: null, mean_long_short_turnover: null, factor_autocorrelation: null,
  },
  ic_series: [{ date: '2026-01-02', ic: 0.2, rank_ic: 0.1 }],
  quantile_returns: {
    dates: ['2026-01-02'], q1: [0.98], q2: [0.99], q3: [1], q4: [1.01], q5: [1.02], long_short: [0.04],
  },
};

describe('AlphaFactorAnalytics', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  it('submits explicit observations, loads the cached analysis, and keeps insufficient metrics unknown', async () => {
    api.post.mockResolvedValue({ data: { factor_id: 'alpha-123', status: 'insufficient', cache_ttl_seconds: 3600 } });
    api.get.mockResolvedValue({ data: response });
    render(<AlphaFactorAnalytics />);

    const analyze = screen.getByText('计算并加载').closest('button')!;
    expect(analyze.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: '因子 ID' }), { target: { value: 'alpha-123' } });
    const rows = 'date,symbol,factor,forward_return\n2026-01-02,A,1,0.01\n2026-01-02,B,2,0.02';
    fireEvent.change(screen.getByRole('textbox', { name: '因子观察数据' }), { target: { value: rows } });
    fireEvent.click(analyze);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/wq/factors/alpha-123/analytics', {
      observations: [
        { date: '2026-01-02', symbol: 'A', factor: 1, forward_return: 0.01 },
        { date: '2026-01-02', symbol: 'B', factor: 2, forward_return: 0.02 },
      ],
    }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/wq/factors/alpha-123/analytics'));
    expect(await screen.findByText(/有效期数 1\/20/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByTestId('echart')[0].getAttribute('data-series-count')).toBe('6');
    expect(screen.getAllByTestId('echart')).toHaveLength(2);
  });

  it('scopes failures to the factor id and offers a real retry', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: '观察日期格式无效' } } });
    api.post.mockResolvedValueOnce({ data: { factor_id: 'second', status: 'insufficient', cache_ttl_seconds: 3600 } });
    api.get.mockResolvedValueOnce({ data: response });
    render(<AlphaFactorAnalytics />);
    const input = screen.getByRole('textbox', { name: '因子 ID' });
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.change(screen.getByRole('textbox', { name: '因子观察数据' }), {
      target: { value: 'date,symbol,factor,forward_return\n2026-01-02,A,1,0.01\n2026-01-02,B,2,0.02' },
    });
    fireEvent.click(screen.getByText('计算并加载'));

    expect(await screen.findByText('观察日期格式无效')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'second' } });
    expect(screen.queryByText('观察日期格式无效')).toBeNull();
    fireEvent.click(screen.getByText('计算并加载'));
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/wq/factors/second/analytics', expect.anything()));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/wq/factors/second/analytics'));
    expect(await screen.findByText(/有效期数 1\/20/)).toBeTruthy();
  });

  it('can read a still-cached factor result using its factor ID', async () => {
    api.get.mockResolvedValue({ data: response });
    render(<AlphaFactorAnalytics />);
    fireEvent.change(screen.getByRole('textbox', { name: '因子 ID' }), { target: { value: 'saved-factor' } });
    fireEvent.click(screen.getByText('读取缓存'));

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/wq/factors/saved-factor/analytics'));
    expect(await screen.findByText(/数据来源：用户提交的 2 条观察记录/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});
