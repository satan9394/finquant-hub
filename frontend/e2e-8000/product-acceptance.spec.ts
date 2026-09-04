import { expect, test, type Route } from '@playwright/test';

import {
  expectHealthyPage,
  limitPoolFixture,
  mockExternalApi,
  monitorBrowser,
  researchFixtures,
} from './helpers';

test('017/018 loads the Dashboard and exposes all eight real navigation groups', async ({ page }) => {
  const errors = monitorBrowser(page);
  const externalRequests = await mockExternalApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今天想完成什么？' })).toBeVisible();
  for (const group of ['今日', '研究', '发现', '策略', '组合', '监控', '资料库', '设置']) {
    await expect(page.getByText(group, { exact: true }).first()).toBeVisible();
  }

  for (const [group, link, path] of [
    ['研究', '研究工作区', '/research'],
    ['发现', '机会发现', '/discover'],
    ['策略', '策略实验室', '/strategy-lab/ma-crossover'],
    ['组合', '组合与风险', '/portfolio'],
    ['监控', '持续监控', '/alerts'],
    ['资料库', '研究资料库', '/knowledge'],
    ['设置', '系统设置', '/settings'],
    ['今日', '今日工作台', '/'],
  ]) {
    await page.getByRole('menuitem', { name: new RegExp(`${group}$`) }).click();
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === '/' ? '/$' : `${path}$`}`));
  }
  // ponytail: the production CSP blocks Knowledge's child iframe; keep that tracked defect distinct from main-app crashes.
  const knowledgeFrameErrors = errors.filter((message) => message.includes("Failed to read the 'localStorage' property from 'Window'"));
  expect(knowledgeFrameErrors.length).toBeGreaterThan(0);
  const unexpectedErrors = errors.filter((message) => !knowledgeFrameErrors.includes(message));
  await expectHealthyPage(page, unexpectedErrors, externalRequests);
});

test('013/020 renders the A-share snapshot plus chip and money-flow history containers', async ({ page }) => {
  const errors = monitorBrowser(page, true);
  const externalRequests = await mockExternalApi(page, researchFixtures);
  await page.goto('/research/600519');

  await expect(page.getByText('贵州茅台', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1500.00 CNY', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chip-card').getByTestId('chip-history-chart')).toBeVisible();
  await expect(page.getByTestId('money-flow-card').getByTestId('money-flow-chart')).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});

test('015 renders dragon-tiger history and switches the selected record without a request', async ({ page }) => {
  let calls = 0;
  const fixtures = {
    ...researchFixtures,
    'GET /api/instruments/600519/dragon-tiger': (route: Route) => {
      calls += 1;
      return (researchFixtures['GET /api/instruments/600519/dragon-tiger'] as (value: typeof route) => unknown)(route);
    },
  };
  const errors = monitorBrowser(page, true);
  const externalRequests = await mockExternalApi(page, fixtures);
  await page.goto('/research/600519');

  const list = page.getByLabel('选择龙虎榜上榜记录');
  await expect(list.getByRole('button')).toHaveCount(2);
  const initialCalls = calls;
  await list.getByRole('button', { name: '2026-08-19 历史上榜原因 -90.00 万元' }).click();
  await expect(page.getByTestId('dragon-tiger-detail').getByText('历史上榜原因')).toBeVisible();
  expect(calls).toBe(initialCalls);
  await expectHealthyPage(page, errors, externalRequests);
});

test('014/015 sends the selected dragon-tiger date and renders its historical record', async ({ page }) => {
  const errors = monitorBrowser(page, true);
  const externalRequests = await mockExternalApi(page, researchFixtures);
  await page.goto('/research/600519');

  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/instruments/600519/dragon-tiger'
      && url.searchParams.get('date') === '2026-08-20'
      && url.searchParams.get('look_back') === '30';
  });
  const picker = page.getByRole('textbox', { name: '选择龙虎榜窗口截止日期' });
  await picker.fill('2026-08-20');
  await picker.press('Enter');
  await request;
  await expect(page.getByTestId('dragon-tiger-detail').getByText('历史上榜原因')).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});

test('014 renders the deterministic Eastmoney limit-up pool at the real route', async ({ page }) => {
  const errors = monitorBrowser(page, true);
  const externalRequests = await mockExternalApi(page, {
    'GET /api/market/limit-pool': limitPoolFixture,
  });
  await page.goto('/discover/limit-pool');

  await expect(page.getByTestId('limit-pool-page')).toBeVisible();
  await expect(page.getByRole('cell', { name: '600519' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '贵州茅台' })).toBeVisible();
  await expect(page.getByText(/eastmoney\.push2ex.*DIRECT/)).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});

test('014 sends the selected limit-pool date and limit-down type', async ({ page }) => {
  const errors = monitorBrowser(page, true);
  const externalRequests = await mockExternalApi(page, {
    'GET /api/market/limit-pool': limitPoolFixture,
  });
  await page.goto('/discover/limit-pool');

  const poolRequest = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/market/limit-pool' && url.searchParams.get('pool') === 'limit_down';
  });
  await page.getByLabel('涨跌停池类型').getByText('跌停池', { exact: true }).click();
  await poolRequest;
  await expect(page.getByRole('cell', { name: '000001' })).toBeVisible();

  const dateRequest = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/market/limit-pool'
      && url.searchParams.get('date') === '2026-08-20'
      && url.searchParams.get('pool') === 'limit_down';
  });
  const picker = page.getByRole('textbox', { name: '交易日期' });
  await picker.fill('2026-08-20');
  await picker.press('Enter');
  await dateRequest;
  await expect(page.getByText(/20260820.*DIRECT/)).toBeVisible();
  await expectHealthyPage(page, errors, externalRequests);
});
