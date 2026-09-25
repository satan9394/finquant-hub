// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../src/services/api', () => ({ default: { get: chartMocks.get } }));
vi.mock('../src/components/DiscoverThemes', () => ({ default: () => null }));
vi.mock('../src/components/LazyEChart', async () => {
  const React = await import('react');
  return {
    default: ({ option }: { option: unknown }) => React.createElement(
      'pre', { 'data-testid': 'echart-option' }, JSON.stringify(option),
    ),
  };
});

import MarketTreemapChart from '../src/components/charts/MarketTreemapChart';
import DragonTigerSeatGraph from '../src/components/charts/DragonTigerSeatGraph';
import SentimentLadderChart from '../src/components/charts/SentimentLadderChart';
import Discover from '../src/pages/Discover';
import { LanguageProvider } from '../src/i18n/LanguageContext';

function renderChart(node: React.ReactNode) {
  localStorage.setItem('finquant_lang', 'zh');
  return render(<StrictMode><LanguageProvider>{node}</LanguageProvider></StrictMode>);
}

describe('Discover market panorama charts', () => {
  beforeEach(() => chartMocks.get.mockReset());

  it('renders the real industry hierarchy and uses theme tokens for direction colors', async () => {
    chartMocks.get.mockResolvedValue({ data: {
      as_of: '2026-09-23T15:00:00+08:00', source: 'eastmoney.push2delay',
      quality: 'DIRECT', classification_note: '东财行业板块分类。', items: [{
        name: '行业甲', code: 'BK1', value: 1000, change_percent: 2,
        children: [{ name: '成分股甲', code: '600001', value: 400, change_percent: 1 }],
      }],
    } });

    renderChart(<MarketTreemapChart />);

    const option = JSON.parse((await screen.findByTestId('echart-option')).textContent || '{}');
    expect(chartMocks.get).toHaveBeenCalledWith('/market/sector-treemap');
    expect(option.series[0].type).toBe('treemap');
    expect(['var(--fq-price-up)', '#d03f56']).toContain(option.series[0].data[0].itemStyle.color);
    expect(['var(--fq-price-up)', '#d03f56']).toContain(option.series[0].data[0].children[0].itemStyle.color);
  });

  it('uses a capped, non-physical graph layout for observed seat overlap', async () => {
    chartMocks.get.mockResolvedValue({ data: {
      status: 'ok', note: '同日同股买入席位共现。',
      nodes: [{ id: '席位甲', name: '席位甲', category: 'brokerage', buy_amount_cny_10k: 3, security_count: 1 }],
      edges: [],
    } });

    renderChart(<DragonTigerSeatGraph />);

    const option = JSON.parse((await screen.findByTestId('echart-option')).textContent || '{}');
    expect(chartMocks.get).toHaveBeenCalledWith('/market/dragon-tiger-network', { params: { days: 5 } });
    expect(option.series[0].layout).toBe('circular');
    expect(option.series[0].force).toBeUndefined();
  });

  it('keeps the failed limit-up rate explicitly unknown', async () => {
    chartMocks.get.mockResolvedValue({ data: {
      status: 'partial', date: '2026-09-23', highest_board: 2, total_limit_up: 5,
      promotion_rate: null, break_rate: null,
      break_rate_note: '当前源没有当日失败涨停股总数。', sentiment_index: null,
      sentiment_index_basis: null, items: [{ height: 1, count: 4, previous_count: null, promoted_count: null, promotion_rate: null }],
    } });

    renderChart(<SentimentLadderChart />);

    expect(await screen.findByText('炸板率：未知')).toBeTruthy();
    expect((await screen.findAllByText('UNKNOWN')).length).toBeGreaterThan(0);
    const option = JSON.parse((await screen.findByTestId('echart-option')).textContent || '{}');
    expect(option.series[0].type).toBe('bar');
    expect(option.series[1].data).toEqual([null]);
  });

  it('does not request market snapshots until the panorama tab is opened', async () => {
    chartMocks.get.mockResolvedValue({ data: { quality: 'UNKNOWN', items: [] } });
    render(<StrictMode><MemoryRouter><LanguageProvider><Discover /></LanguageProvider></MemoryRouter></StrictMode>);

    expect(chartMocks.get).not.toHaveBeenCalledWith('/market/sector-treemap');
    fireEvent.click(screen.getByRole('tab', { name: '市场全景' }));

    await screen.findByText('当前没有可核验的行业数据');
    expect(chartMocks.get).toHaveBeenCalledWith('/market/sector-treemap');
    expect(chartMocks.get.mock.calls.filter(([path]) => path === '/market/sector-treemap')).toHaveLength(1);
    expect(chartMocks.get).not.toHaveBeenCalledWith('/market/dragon-tiger-network', { params: { days: 5 } });
  });
});
