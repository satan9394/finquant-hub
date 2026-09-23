import { expect, test } from '@playwright/test';

import { mockApi } from './helpers';

const instrument = {
  symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE',
  currency: 'CNY', asset_type: 'stock',
};

const provenance = {
  provider: 'eastmoney', as_of: '2026-08-31T15:00:00+08:00', timezone: 'Asia/Shanghai',
  currency: 'CNY', adjustment: null, frequency: '1d', quality_flags: [],
};

test('money-flow evidence charts direct data and requests the selected 120-day period', async ({ page }) => {
  await mockApi(page, {
    'GET /api/research/history': { items: [] },
    'GET /api/thesis': { items: [] },
    'GET /api/discussion/rooms': { items: [] },
    'GET /api/instruments/600519/snapshot': {
      ...provenance,
      instrument,
      data: {
        price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
        volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
        turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
      },
    },
    'GET /api/instruments/600519/bars': { ...provenance, instrument, items: [], indicators: {} },
    'GET /api/instruments/600519/fundamentals': { ...provenance, instrument, items: [] },
    'GET /api/instruments/600519/workspace': { symbol: '600519', name: '贵州茅台', notes: '', evidence: [], saved: false },
    'GET /api/instruments/600519/chip-distribution': null,
    'GET /api/instruments/600519/dragon-tiger': {
      ticker: '600519', date: '2026-08-31', source: 'eastmoney.datacenter-web', quality: 'DIRECT', items: [],
    },
    'GET /api/instruments/600519/money-flow': (route) => {
      const period = new URL(route.request().url()).searchParams.get('period') === '120d' ? '120d' : 'minute';
      return {
        ticker: '600519',
        period,
        source: period === 'minute' ? 'eastmoney.push2' : 'eastmoney.push2his',
        as_of: period === 'minute' ? '2026-08-31 14:59' : '2026-08-31',
        quality: 'DIRECT',
        main_net: period === 'minute' ? 120_000 : 150_000,
        large_net: 30_000,
        medium_net: 20_000,
        small_net: -10_000,
        items: period === 'minute'
          ? [{ time: '2026-08-31 14:59', main_net: 120_000, super_large_net: 80_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000 }]
          : [{ date: '2026-08-31', main_net: 150_000, super_large_net: 90_000, large_net: 40_000, medium_net: 10_000, small_net: -5_000 }],
      };
    },
  });

  await page.goto('/research/600519');

  const card = page.getByTestId('money-flow-card');
  await expect(card.getByTestId('money-flow-chart')).toBeVisible();
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/instruments/600519/money-flow' && url.searchParams.get('period') === '120d';
  });
  await card.getByLabel('资金流周期切换').getByText('120 日', { exact: true }).click();
  await request;
  await expect(card.getByText('120 日', { exact: true })).toHaveCount(2);
  await expect(card.getByTestId('money-flow-chart')).toBeVisible();
});
