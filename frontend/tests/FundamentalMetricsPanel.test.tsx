// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FundamentalMetricsPanel from '../src/components/research/FundamentalMetricsPanel';

describe('P1 fundamental metrics', () => {
  it('separates real derived values from unavailable metrics', () => {
    render(<FundamentalMetricsPanel fundamentals={{
      instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'equity' },
      provider: 'akshare', as_of: '2026-03-31', timezone: 'Asia/Shanghai', currency: 'CNY', adjustment: 'not_applicable', frequency: 'TTM_or_point_in_time', quality_flags: [],
      items: [{
        metric: 'cfo_to_net_income', value: 125, as_of: '2026-03-31', currency: null,
        period_type: 'derived_ttm', provider: 'akshare', source: 'akshare.test', is_ttm: true,
        components: ['operating_cash_flow', 'net_income'], quality_flags: [],
      }],
    }} />);

    expect(screen.getByText('CFO / 净利润')).toBeTruthy();
    expect(screen.getByText('125.00%')).toBeTruthy();
    expect(screen.getByText('确定性派生')).toBeTruthy();
    expect(screen.getByText('EV / EBITDA')).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(screen.getByText(/需要企业价值与 EBITDA/)).toBeTruthy();
  });

  it('keeps every P1 metric unknown when the provider is unavailable', () => {
    render(<FundamentalMetricsPanel fundamentals={null} error="基本面：上游不可用" />);

    expect(screen.getByText(/真实基本面当前不可用/)).toBeTruthy();
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThanOrEqual(13);
    expect(screen.getAllByText('上游错误')).toHaveLength(13);
    expect(screen.queryByText('0.00%')).toBeNull();
  });
});
