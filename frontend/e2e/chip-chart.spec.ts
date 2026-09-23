import { expect, test } from '@playwright/test';

import { mockApi } from './helpers';

test('chip history displays daily data and switches metrics without another request', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const instrument = {
    symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE',
    currency: 'CNY', asset_type: 'stock',
  };
  const provenance = {
    provider: 'akshare', as_of: '2026-08-31', timezone: 'Asia/Shanghai', currency: 'CNY',
    adjustment: null, frequency: '1d', quality_flags: ['chip_peak_not_exposed_by_provider'],
  };
  const latest = {
    date: '2026-08-31', profit_ratio: 0.625, average_cost: 1480.25,
    cost_90: { low: 1400, high: 1600, concentration: 0.1 },
    cost_70: { low: 1450, high: 1550, concentration: 0.05 }, chip_peak: null,
  };
  let chipRequests = 0;
  await mockApi(page, {
    'GET /api/research/history': { items: [] },
    'GET /api/thesis': { items: [] },
    'GET /api/discussion/rooms': { items: [] },
    'GET /api/instruments/600519/snapshot': {
      ...provenance, instrument,
      data: {
        price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
        volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
        turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
      },
    },
    'GET /api/instruments/600519/bars': { ...provenance, instrument, items: [], indicators: {} },
    'GET /api/instruments/600519/fundamentals': { ...provenance, instrument, items: [] },
    'GET /api/instruments/600519/workspace': { symbol: '600519', name: '贵州茅台', notes: '', evidence: [], saved: false },
    'GET /api/instruments/600519/money-flow': null,
    'GET /api/instruments/600519/dragon-tiger': {
      ticker: '600519', date: '2026-08-31', source: 'eastmoney.datacenter-web', quality: 'DIRECT', items: [],
    },
    'GET /api/instruments/600519/chip-distribution': () => {
      chipRequests += 1;
      return {
        ...provenance, symbol: '600519', source: 'stock_cyq_em',
        methodology: 'akshare_cyq_calculator_120_day_turnover_decay', latest,
        items: [{ ...latest, date: '2026-08-28', profit_ratio: 0.6, average_cost: 1470 }, latest],
      };
    },
  });

  await page.goto('/research/600519');
  const card = page.getByTestId('chip-card');
  await expect(card.getByTestId('chip-history-chart')).toBeVisible();
  await expect(card.getByText('获利比例 (%) · 2026-08-31: 62.50%', { exact: true })).toBeVisible();
  // ponytail: dev StrictMode may fetch twice on mount; metric selection must add no requests.
  expect(chipRequests).toBeGreaterThan(0);
  const initialChipRequests = chipRequests;
  const control = card.getByLabel('筹码历史指标切换');
  await control.getByText('平均成本', { exact: true }).click();
  await expect(control.getByRole('radio', { name: '平均成本' })).toBeChecked();
  await expect(card.getByText('平均成本 (CNY) · 2026-08-31: 1480.25 CNY', { exact: true })).toBeVisible();
  await expect(card.getByTestId('chip-history-chart')).toBeVisible();
  expect(chipRequests).toBe(initialChipRequests);
  await control.getByText('获利比例', { exact: true }).click();
  await expect(control.getByRole('radio', { name: '获利比例' })).toBeChecked();
  await expect(card.getByText('获利比例 (%) · 2026-08-31: 62.50%', { exact: true })).toBeVisible();
  expect(chipRequests).toBe(initialChipRequests);
  expect(pageErrors).toEqual([]);
});
