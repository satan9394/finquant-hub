// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import MarketBrief from '../src/components/MarketBrief';
import type { MarketPulseResponse } from '../src/types';

const pulse: MarketPulseResponse = {
  as_of: '2026-08-20T08:00:00Z', market: 'cn', scope: 'public_market_dimensions', status: 'partial',
  sources: ['eastmoney'],
  sections: {
    breadth: { status: 'ok', total: 10, advancers: 6, decliners: 3, unchanged: 1 },
    movers: { status: 'partial' },
    industry: { status: 'ok', source: 'eastmoney', items: [{ code: 'industry-1', name: '银行', price: null, change_percent: 2.4, turnover_rate: null, advancers: 4, decliners: 1, leader: '银行A', leader_change_percent: 5 }] },
    concept: { status: 'unavailable' }, sector_flow: { status: 'ok' }, stock_flow: { status: 'ok', items: [{ code: '600519', name: '贵州茅台', price: 1500, change_percent: 3, main_net_inflow: 1000000, main_net_inflow_rate: null, super_large_net_inflow: null, super_large_net_inflow_rate: null, large_net_inflow: null, large_net_inflow_rate: null, medium_net_inflow: null, medium_net_inflow_rate: null, small_net_inflow: null, small_net_inflow_rate: null }] },
    weekly: { status: 'ok', items: [{ code: '600519', name: '贵州茅台', price: 1500, weekly_change_percent: 8.2, change_percent: 3, turnover_rate: null, amount: null, amplitude: null, volume_ratio: null, industry: '白酒', ths_main_net_inflow: null, ths_main_net_inflow_unit: 'wan_cny', ths_industry: null, source_status: { eastmoney: true, tonghuashun: false }, reason_tags: ['异动'], eastmoney_url: '', tonghuashun_url: '' }] },
    popular: { status: 'unavailable' },
  },
};

describe('MarketBrief', () => {
  it('shows real as-of, source, breadth, sector, flow and up to five movers', () => {
    render(<MemoryRouter><MarketBrief data={pulse} /></MemoryRouter>);
    expect(screen.getByTestId('market-brief-as-of').textContent).toContain('2026-08-20T08:00:00Z');
    expect(screen.getByTestId('market-brief-sources').textContent).toContain('eastmoney');
    expect(screen.getByText(/6 涨/)).toBeTruthy();
    expect(screen.getByText('银行')).toBeTruthy();
    expect(screen.getAllByText('贵州茅台').length).toBeGreaterThan(0);
    expect(screen.getByText('PARTIAL')).toBeTruthy();
  });

  it('keeps unavailable sections explicit', () => {
    render(<MemoryRouter><MarketBrief data={{ ...pulse, status: 'partial', sections: { ...pulse.sections, breadth: { status: 'unavailable', error: 'source down' }, industry: { status: 'unavailable', error: 'source down' }, weekly: { status: 'unavailable', error: 'source down' } } }} /></MemoryRouter>);
    expect(screen.getAllByText('暂不可用').length).toBeGreaterThan(0);
    expect(screen.queryByText('银行')).toBeNull();
  });
});
