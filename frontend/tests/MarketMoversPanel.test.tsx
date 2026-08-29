// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import {
  buildFlowChartOption,
  buildMoverChartOption,
  buildSectorChartOption,
  marketPulseSummary,
} from '../src/components/MarketMoversPanel';
import type { MarketMover, MarketPulseResponse } from '../src/types';

const mover = (name: string, changePercent: number): MarketMover => ({
  code: name === '寒武纪' ? 'sh688256' : 'sz300750',
  name,
  price: 100,
  change: changePercent,
  change_percent: changePercent,
  weekly_change_percent: null,
  turnover_rate: 5,
  amount: 1_000_000_000,
  amplitude: 8,
  volume_ratio: 1.5,
  industry: '示例行业',
  reason_tags: [],
});

describe('MarketMoversPanel', () => {
  test('builds an A-share red-up green-down diverging chart', () => {
    const option = buildMoverChartOption(
      [mover('寒武纪', 12.36)],
      [mover('宁德时代', -6.28)],
    );

    expect(option.yAxis.data).toEqual(['宁德时代', '寒武纪']);
    expect(option.series[0].data).toEqual([
      expect.objectContaining({ value: -6.28, itemStyle: expect.objectContaining({ color: 'var(--fq-price-down)' }) }),
      expect.objectContaining({ value: 12.36, itemStyle: expect.objectContaining({ color: 'var(--fq-price-up)' }) }),
    ]);
  });

  test('builds sector and capital-flow rankings from provider values', () => {
    const sector = buildSectorChartOption([{
      code: 'BK1036', name: '半导体', price: 1000, change_percent: 3.2,
      turnover_rate: 4, advancers: 42, decliners: 3,
      leader: '寒武纪', leader_change_percent: 12,
    }]);
    const flow = buildFlowChartOption([{
      code: 'BK1036', name: '半导体', price: 1000, change_percent: 3.2,
      main_net_inflow: 1_200_000_000, main_net_inflow_rate: 6.8,
      super_large_net_inflow: 700_000_000, super_large_net_inflow_rate: 4,
      large_net_inflow: 500_000_000, large_net_inflow_rate: 2.8,
      medium_net_inflow: -300_000_000, medium_net_inflow_rate: -1.7,
      small_net_inflow: -900_000_000, small_net_inflow_rate: -5.1,
    }]);

    expect(sector.series[0].data[0]).toEqual(expect.objectContaining({ value: 3.2 }));
    expect(flow.series[0].data[0]).toEqual(expect.objectContaining({ value: 1_200_000_000 }));
  });

  test('summarizes breadth, leaders and explicit Tonghuashun coverage', () => {
    const pulse = {
      sections: {
        breadth: { status: 'ok', advancers: 3210, decliners: 1800 },
        industry: { items: [{ name: '半导体', change_percent: 3.2 }] },
        sector_flow: { items: [{ name: '算力', main_net_inflow: 1_200_000_000 }] },
        weekly: { coverage: { tonghuashun_succeeded: 8, tonghuashun_requested: 10, tonghuashun_rate: 0.8 } },
      },
    } as MarketPulseResponse;

    expect(marketPulseSummary(pulse)).toEqual({
      breadth: '3210 涨 / 1800 跌',
      industry: '半导体 +3.20%',
      capital: '算力 12.0亿',
      tonghuashun: '8/10 · 80%',
    });
  });
});
