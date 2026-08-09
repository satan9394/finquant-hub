// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import MarketThemesPanel, { buildThemeCandidateChartOption } from '../src/components/MarketThemesPanel';
import { fetchMarketThemes } from '../src/services/marketDiscoveryApi';
import type { MarketThemesResponse, ThemeStock } from '../src/types';

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="theme-chart" /> }));
vi.mock('../src/services/marketDiscoveryApi', () => ({ fetchMarketThemes: vi.fn() }));

const stock: ThemeStock = {
  code: 'sh688256', name: '寒武纪', price: 588.8,
  change_percent: 4.2, weekly_change_percent: 18.6, turnover_rate: 8.5,
  amount: 8_800_000_000, amplitude: 7.2, volume_ratio: 1.9,
  industry: '半导体', main_net_inflow: 1_200_000_000,
  main_net_inflow_rate: 6.8, ths_main_net_inflow: 21690.71,
  ths_main_net_inflow_unit: 'wan_cny', ths_industry: '半导体',
  source_status: { eastmoney: true, tonghuashun: true },
  reason_tags: ['周异动'], theme_names: ['算力概念'],
  eastmoney_url: 'https://quote.eastmoney.com/sh688256.html',
  tonghuashun_url: 'https://stockpage.10jqka.com.cn/688256/',
};

const response = (keyword: string): MarketThemesResponse => ({
  keyword,
  category: keyword === '机器人' ? '智能制造' : '自定义主题',
  expanded_terms: [keyword], sort_by: 'change',
  source: ['eastmoney', 'tonghuashun'],
  scope: 'public_board_catalog_and_constituents',
  as_of: '2026-08-08T10:30:00+08:00', status: 'ok',
  catalog: [
    { keyword: '机器人', category: '智能制造', expanded_terms: ['机器人'] },
    { keyword: '算力', category: '数字基础设施', expanded_terms: ['算力'] },
    { keyword: '电力', category: '能源电网', expanded_terms: ['电力'] },
    { keyword: '半导体', category: '硬科技', expanded_terms: ['半导体'] },
  ],
  matched_theme_count: 1, returned_theme_count: 1,
  coverage: {
    industry_boards_scanned: 496, concept_boards_scanned: 504,
    tonghuashun_requested: 1, tonghuashun_succeeded: 1,
    tonghuashun_failed: 0, tonghuashun_rate: 1,
  },
  themes: [{
    kind: 'concept', code: 'BK1134', name: `${keyword}概念`, price: 100,
    change_percent: 3.2, turnover_rate: 4, advancers: 30, decliners: 4,
    leader: '寒武纪', leader_change_percent: 4.2, market_cap: 1_000_000,
    match_score: 70, matched_term: keyword, stocks: [stock],
  }],
  candidates: [stock],
});

describe('MarketThemesPanel', () => {
  beforeEach(() => {
    vi.mocked(fetchMarketThemes).mockImplementation(async (keyword) => response(keyword));
  });

  test('builds candidate chart from the selected provider metric', () => {
    const option = buildThemeCandidateChartOption([stock], 'capital');
    expect(option.yAxis.data).toEqual(['寒武纪']);
    expect(option.series[0].data[0]).toEqual(expect.objectContaining({ value: 1_200_000_000 }));
  });

  test('loads the default taxonomy and executes a custom keyword search', async () => {
    render(<MarketThemesPanel watchCodes={[]} onAdd={vi.fn()} onAnalyze={vi.fn()} />);

    await waitFor(() => expect(fetchMarketThemes).toHaveBeenCalledWith('机器人', 'change'));
    expect(await screen.findByText('496 行业 + 504 概念')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('主题关键词'), { target: { value: '低空经济' } });
    fireEvent.click(screen.getByRole('button', { name: /检索主题/ }));

    await waitFor(() => expect(fetchMarketThemes).toHaveBeenLastCalledWith('低空经济', 'change'));
    expect(await screen.findByText('低空经济概念')).toBeTruthy();
  });
});
