import { expect, test, type Page, type Route } from '@playwright/test';

import {
  expectHealthyPage,
  mockExternalApi,
  monitorBrowser,
  researchFixtures,
} from './helpers';

const usInstrument = {
  symbol: 'BRK-B', name: 'Berkshire Hathaway', market: 'US', exchange: 'NYSE',
  currency: 'USD', asset_type: 'equity',
};

const usProvenance = {
  provider: 'yahoo', as_of: '2026-08-31T20:00:00Z', timezone: 'America/New_York',
  currency: 'USD', adjustment: null, frequency: '1d', quality_flags: [],
};

const usSnapshot = {
  ...usProvenance,
  instrument: usInstrument,
  data: {
    price: 500, last_close: 495, open: 496, high: 502, low: 494,
    volume: 1000, amount: null, change: 5, change_percent: 1.01,
    turnover_rate: null, pe: 12, pb: 1.5, market_cap: 1_000_000_000, amplitude: 1.6,
  },
};

async function useGlobalTicker(page: Page, ticker: string, action: string) {
  await page.getByRole('button', { name: '打开全局命令栏' }).click();
  const dialog = page.getByRole('dialog', { name: '全局命令栏' });
  await dialog.getByLabel('证券代码、公司名称或研究任务').fill(ticker);
  await dialog.getByRole('button', { name: '识别意图' }).click();
  await expect(dialog.getByText(`已选择：${ticker.toUpperCase()} · ${ticker.toUpperCase()}`)).toBeVisible();
  await dialog.getByRole('button', { name: action }).click();
}

test('BRK.B and BRK-B research inputs issue only the same BRK-B canonical requests', async ({ page }) => {
  const snapshotPaths: string[] = [];
  const fixtures = {
    'GET /api/market/search': { items: [] },
    'GET /api/instruments/BRK-B/snapshot': (route: Route) => {
      snapshotPaths.push(new URL(route.request().url()).pathname);
      return usSnapshot;
    },
    'GET /api/instruments/BRK-B/bars': { ...usProvenance, instrument: usInstrument, items: [], indicators: {} },
    'GET /api/instruments/BRK-B/fundamentals': { ...usProvenance, instrument: usInstrument, items: [] },
    'GET /api/instruments/BRK-B/workspace': {
      symbol: 'BRK-B', name: 'Berkshire Hathaway', notes: '', evidence: [], saved: false,
    },
  };
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page, fixtures);

  for (const input of ['BRK.B', 'BRK-B']) {
    await page.goto('/');
    await useGlobalTicker(page, input, '打开研究');
    await expect(page).toHaveURL(/\/research\/BRK-B$/);
    await expect(page.getByText('当前对象：Berkshire Hathaway · BRK-B')).toBeVisible();
  }

  expect(snapshotPaths.length).toBeGreaterThanOrEqual(2);
  expect([...new Set(snapshotPaths)]).toEqual(['/api/instruments/BRK-B/snapshot']);
  await expectHealthyPage(page, errors, externalRequests);
});

test('600519 global input opens the normal A-share research journey', async ({ page }) => {
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page, {
    ...researchFixtures,
    'GET /api/market/search': { items: [] },
  });
  await page.goto('/');

  const snapshotRequest = page.waitForRequest((request) => (
    new URL(request.url()).pathname === '/api/instruments/600519/snapshot'
  ));
  await useGlobalTicker(page, '600519', '打开研究');
  await snapshotRequest;

  await expect(page).toHaveURL(/\/research\/600519$/);
  await expect(page.getByText('当前对象：贵州茅台 · 600519')).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});

test('unsupported 830799 research input shows the backend rejection instead of querying sh830799', async ({ page }) => {
  const requestedPaths: string[] = [];
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page);
  await page.route('**/api/instruments/830799/**', async (route) => {
    requestedPaths.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ detail: '暂不支持该股票代码段' }),
    });
  });
  await page.goto('/research/830799');

  await expect(page.getByText(/暂不支持该股票代码段/).first()).toBeVisible();
  expect(requestedPaths.length).toBeGreaterThan(0);
  expect(requestedPaths.every((path) => !path.includes('sh830799'))).toBe(true);
  await expectHealthyPage(page, errors, externalRequests);
});

test('0700 alert input is canonically prefilled as 00700.HK without creating a rule', async ({ page }) => {
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page, { 'GET /api/market/search': { items: [] } });
  await page.goto('/');

  await useGlobalTicker(page, '0700', '创建监控');

  await expect(page).toHaveURL(/\/alerts\?new=1&ticker=00700.HK/);
  await expect(page.getByLabel('股票代码')).toHaveValue('00700.HK');
  await expectHealthyPage(page, errors, externalRequests);
});

test('600519 portfolio input keeps the supported A-share external form as a prefill only', async ({ page }) => {
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page, { 'GET /api/market/search': { items: [] } });
  await page.goto('/');

  await useGlobalTicker(page, '600519', '加入组合');

  await expect(page).toHaveURL(/\/portfolio\?code=600519&name=600519/);
  await expect(page.getByText('待加入组合：600519 600519')).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});

test('BRK.B backtest input reaches Strategy Lab as BRK-B without running it', async ({ page }) => {
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page, { 'GET /api/market/search': { items: [] } });
  await page.goto('/');

  await useGlobalTicker(page, 'BRK.B', '验证策略');

  await expect(page).toHaveURL(/\/strategy-lab\/ma-crossover\?symbol=BRK-B/);
  await expect(page.getByLabel('股票代码', { exact: true })).toHaveValue('BRK-B');
  await expect(page.getByRole('button', { name: '运行回测' })).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});
