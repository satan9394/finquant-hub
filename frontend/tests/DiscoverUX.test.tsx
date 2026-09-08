// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Discover from '../src/pages/Discover';
import DiscoverThemes from '../src/components/DiscoverThemes';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../src/services/api', () => ({ default: api }));
vi.mock('../src/services/alphaApi', () => ({ searchAlpha: vi.fn(async () => []) }));
vi.mock('../src/components/alpha/AlphaResearchPanel', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { items: [{ code: '600519', name: '贵州茅台' }] } });
  api.post.mockResolvedValue({ data: { items: [], errors: [] } });
});

it('shows honest examples without fetching invented recommendations', () => {
  render(<MemoryRouter><Discover /></MemoryRouter>);
  expect(screen.getByText('从示例公司开始')).toBeTruthy();
  expect(screen.getByText(/不是今日热门或投资推荐/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /贵州茅台/ })).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
});

it('resolves a company name before requesting screening', async () => {
  render(<MemoryRouter initialEntries={['/discover?q=茅台']}><Discover /></MemoryRouter>);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/market/search', { params: { q: '茅台' } }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/screening', { tickers: ['600519'] }));
  expect(screen.queryByText('当前后端不能执行全市场语义筛选')).toBeNull();
});

it('does not manufacture stocks when name search fails', async () => {
  api.get.mockRejectedValue(new Error('offline'));
  render(<MemoryRouter initialEntries={['/discover?q=茅台']}><Discover /></MemoryRouter>);
  expect(await screen.findByText(/公司搜索暂不可用/)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
});

it('shows provider industry/concept grouping and filters without inventing constituents', async () => {
  api.get.mockResolvedValue({ data: {
    source: ['eastmoney'], as_of: '2026-09-07', status: 'partial',
    themes: [
      { code: 'industry', name: '半导体行业', kind: 'industry', stocks: [{ code: '600000', name: '行业测试公司' }] },
      { code: 'concept', name: '芯片概念', kind: 'concept', stocks: [{ code: '000001', name: '概念测试公司' }] },
    ],
  } });
  render(<MemoryRouter><DiscoverThemes /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: '半导体' }));
  expect(await screen.findByRole('link', { name: /行业测试公司/ })).toBeTruthy();
  expect(screen.getByText(/当前结果不完整/)).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: '概念' }));
  expect(screen.queryByRole('link', { name: /行业测试公司/ })).toBeNull();
  expect(screen.getByRole('link', { name: /概念测试公司/ }).getAttribute('href')).toBe('/research/000001');
});
