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

test('dragon-tiger requests the selected window end and updates the actual listing record', async ({ page }) => {
  let snapshotCalls = 0;
  await mockApi(page, {
    'GET /api/research/history': { items: [] },
    'GET /api/thesis': { items: [] },
    'GET /api/discussion/rooms': { items: [] },
    'GET /api/instruments/600519/snapshot': () => {
      snapshotCalls += 1;
      return {
        ...provenance, instrument,
        data: {
          price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
          volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
          turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
        },
      };
    },
    'GET /api/instruments/600519/bars': { ...provenance, instrument, items: [], indicators: {} },
    'GET /api/instruments/600519/fundamentals': { ...provenance, instrument, items: [] },
    'GET /api/instruments/600519/workspace': { symbol: '600519', name: '贵州茅台', notes: '', evidence: [], saved: false },
    'GET /api/instruments/600519/chip-distribution': null,
    'GET /api/instruments/600519/money-flow': {
      ticker: '600519', period: 'minute', source: 'eastmoney.push2', quality: 'DIRECT',
      as_of: null, main_net: null, large_net: null, medium_net: null, small_net: null, items: [],
    },
    'GET /api/instruments/600519/dragon-tiger': (route) => {
      const date = new URL(route.request().url()).searchParams.get('date');
      const historical = date === '2026-08-20';
      return {
        ticker: '600519', date, source: 'eastmoney.datacenter-web', quality: 'DIRECT',
        items: [{
          code: '600519', name: '贵州茅台', date: historical ? '2026-08-19' : '2026-08-28',
          reason: historical ? '历史上榜原因' : '日涨幅偏离值达7%', net: historical ? 90 : 120,
          unit: 'CNY_10K',
          top5_buy: [{ name: '机构专用', buy: 300, sell: 100, net: 200, unit: 'CNY_10K' }],
          top5_sell: [],
        }],
      };
    },
  });

  await page.goto('/research/600519');

  const card = page.getByTestId('dragon-tiger-card');
  const detail = card.getByTestId('dragon-tiger-detail');
  await expect(detail.getByText('日涨幅偏离值达7%')).toBeVisible();
  const previousSnapshotCalls = snapshotCalls;
  const datePicker = card.getByRole('textbox', { name: '选择龙虎榜窗口截止日期' });
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return candidate.method() === 'GET'
      && url.pathname === '/api/instruments/600519/dragon-tiger'
      && url.searchParams.get('date') === '2026-08-20'
      && url.searchParams.get('look_back') === '30';
  });
  await datePicker.fill('2026-08-20');
  await datePicker.press('Enter');
  await request;

  await expect(datePicker).toHaveValue('2026-08-20');
  await expect(detail.getByText('历史上榜原因')).toBeVisible();
  await expect(detail.getByText('2026-08-19', { exact: true })).toBeVisible();
  await expect(detail.getByText('90.00 万元', { exact: true })).toBeVisible();
  await expect(card.getByText('显示截至所选日期的最近上榜记录')).toBeVisible();
  await expect(card.getByText('日涨幅偏离值达7%')).toHaveCount(0);
  expect(snapshotCalls).toBe(previousSnapshotCalls);
});

test('dragon-tiger lists historical records and switches details without requesting again', async ({ page }) => {
  let dragonTigerCalls = 0;
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
    'GET /api/instruments/600519/chip-distribution': null,
    'GET /api/instruments/600519/money-flow': null,
    'GET /api/instruments/600519/dragon-tiger': () => {
      dragonTigerCalls += 1;
      return {
        ticker: '600519', date: '2026-08-28', source: 'eastmoney.datacenter-web', quality: 'DIRECT',
        items: [{
          code: '600519', name: '贵州茅台', date: '2026-08-28', reason: '日涨幅偏离值达7%',
          net: 120, unit: 'CNY_10K',
          top5_buy: [{ name: '机构专用', buy: 300, sell: 100, net: 200, unit: 'CNY_10K' }],
          top5_sell: [{ name: '沪股通专用', buy: 100, sell: 250, net: -150, unit: 'CNY_10K' }],
        }, {
          code: '600519', name: '贵州茅台', date: '2026-08-19', reason: '历史上榜原因',
          net: -90, unit: 'CNY_10K', top5_buy: [], top5_sell: [],
        }],
      };
    },
  });
  await page.goto('/research/600519');

  const card = page.getByTestId('dragon-tiger-card');
  const list = card.getByLabel('选择龙虎榜上榜记录');
  const detail = card.getByTestId('dragon-tiger-detail');
  const latest = list.getByRole('button', { name: '2026-08-28 日涨幅偏离值达7% 120.00 万元' });
  const historical = list.getByRole('button', { name: '2026-08-19 历史上榜原因 -90.00 万元' });
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(latest).toHaveAttribute('aria-pressed', 'true');
  await expect(historical).toHaveAttribute('aria-pressed', 'false');
  await expect(detail.getByText('日涨幅偏离值达7%', { exact: true })).toBeVisible();
  await expect(detail.getByText('120.00 万元', { exact: true })).toBeVisible();
  await expect(card.getByText('机构专用', { exact: true })).toBeVisible();
  await expect(card.getByText('沪股通专用', { exact: true })).toBeVisible();
  // ponytail: dev StrictMode may fetch twice on mount; selection must add no requests.
  expect(dragonTigerCalls).toBeGreaterThan(0);
  const previousDragonTigerCalls = dragonTigerCalls;

  await historical.click();
  await expect(historical).toHaveAttribute('aria-pressed', 'true');
  await expect(latest).toHaveAttribute('aria-pressed', 'false');
  await expect(detail.getByText('2026-08-19', { exact: true })).toBeVisible();
  await expect(detail.getByText('历史上榜原因', { exact: true })).toBeVisible();
  await expect(detail.getByText('-90.00 万元', { exact: true })).toBeVisible();
  await expect(detail.getByText('日涨幅偏离值达7%')).toHaveCount(0);
  await expect(card.getByText('该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）')).toBeVisible();
  await expect(card.getByTestId('dragon-tiger-seats')).toHaveCount(0);
  await expect(card.getByText('机构专用', { exact: true })).toHaveCount(0);
  await expect(card.getByText('沪股通专用', { exact: true })).toHaveCount(0);
  expect(dragonTigerCalls).toBe(previousDragonTigerCalls);

  await latest.focus();
  await page.keyboard.press('Enter');
  await expect(latest).toHaveAttribute('aria-pressed', 'true');
  await expect(card.getByText('机构专用', { exact: true })).toBeVisible();
  await expect(card.getByText('沪股通专用', { exact: true })).toBeVisible();
  expect(dragonTigerCalls).toBe(previousDragonTigerCalls);
});
