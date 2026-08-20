import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockDashboardApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/auth/me': { user: { id: 1, email: 'dashboard@test.local', is_admin: false } },
      '/api/models': { items: [] },
      '/api/dashboard/stats': {
        model_count: 2,
        conversation_count: 3,
        discussion_count: 4,
        message_count: 5,
        recent_conversations: [],
        recent_rooms: [],
      },
      '/api/dashboard/decision-inbox': {
        engine_version: 'decision-inbox/v1',
        generated_at: '2026-08-08T10:30:00Z',
        items: [],
        total: 0,
      },
      '/api/portfolio': {
        items: [
          { id: 1, name: '核心组合' },
          { id: 2, name: '成长组合' },
        ],
      },
      '/api/portfolio/1/pnl': {
        total_cost: 1000,
        total_market_value: 1200,
        total_pnl: 200,
        total_pnl_pct: 20,
        positions: [],
      },
      '/api/portfolio/2/pnl': {
        total_cost: 2000,
        total_market_value: 2300,
        total_pnl: 300,
        total_pnl_pct: 15,
        positions: [],
      },
      '/api/market/pulse': {
        market: 'cn',
        scope: 'public_market_dimensions',
        status: 'ok',
        sources: ['eastmoney', 'tonghuashun'],
        as_of: '2026-08-08T10:30:00+08:00',
        sections: {
          breadth: { status: 'ok', advancers: 3210, decliners: 1800 },
          movers: {
            source: 'eastmoney', scope: 'a_share_market', status: 'ok', stale: false,
            as_of: '2026-08-08T10:30:00+08:00',
            gainers: [{
              code: 'sh688256', name: '寒武纪', price: 588.88, change: 64.77,
              change_percent: 12.36, weekly_change_percent: 18.8, turnover_rate: 8.7,
              amount: 8800000000, amplitude: 13.1, volume_ratio: 1.9,
              industry: '半导体', reason_tags: ['日内强势', '高换手'],
            }],
            decliners: [{
              code: 'sz300750', name: '宁德时代', price: 188.2, change: -12.6,
              change_percent: -6.28, weekly_change_percent: -9.3, turnover_rate: 2.4,
              amount: 5600000000, amplitude: 7.8, volume_ratio: 1.2,
              industry: '电池', reason_tags: ['日内弱势'],
            }],
          },
          industry: { status: 'ok', items: [{ code: 'BK1036', name: '半导体', change_percent: 3.2 }] },
          concept: { status: 'ok', items: [] },
          sector_flow: { status: 'ok', items: [{ code: 'BK1036', name: '半导体', main_net_inflow: 1200000000 }] },
          stock_flow: { status: 'ok', items: [] },
          weekly: { status: 'ok', items: [], coverage: { tonghuashun_succeeded: 8, tonghuashun_requested: 10, tonghuashun_rate: 0.8 } },
           popular: { status: 'ok', items: [] },
         },
      },
       '/api/market/themes': {
        keyword: '机器人', category: '智能制造', expanded_terms: ['机器人', '机器视觉'],
        sort_by: 'change', source: ['eastmoney', 'tonghuashun'],
        scope: 'public_board_catalog_and_constituents', status: 'ok',
        as_of: '2026-08-08T10:30:00+08:00', matched_theme_count: 1,
        returned_theme_count: 1,
        catalog: [{ keyword: '机器人', category: '智能制造', expanded_terms: ['机器人'] }],
        coverage: {
          industry_boards_scanned: 496, concept_boards_scanned: 504,
          tonghuashun_requested: 1, tonghuashun_succeeded: 1,
          tonghuashun_failed: 0, tonghuashun_rate: 1,
        },
        themes: [{
          kind: 'concept', code: 'BK1408', name: '机器人', price: 100,
          change_percent: 3.2, turnover_rate: 4, advancers: 18, decliners: 2,
          leader: '寒武纪', leader_change_percent: 4.2, market_cap: 1000000,
          match_score: 100, matched_term: '机器人', stocks: [],
        }],
         candidates: [],
       },
       '/api/notifications': { items: [], unread_count: 0 },
    };

    if (path === '/api/notifications/stream') {
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'event: heartbeat\ndata: {}\n\n',
      });
      return;
    }
    if (path in responses) {
      await json(route, responses[path]);
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: `Unhandled E2E API route: ${path}` }),
    });
  });
}

test('dashboard renders KPI cards from API data', async ({ page }) => {
  const browserErrors: string[] = [];
  const requestedPaths: string[] = [];
  page.on('request', (request) => requestedPaths.push(new URL(request.url()).pathname));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
  });
  await mockDashboardApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '系统总览' })).toBeVisible();
  const launchpad = page.locator('.task-launchpad');
  await expect(launchpad.getByRole('heading', { name: '今天想完成什么？' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '分析股票' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '验证策略' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '查看组合' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '示例分析 600519' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '示例回测 600519' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '示例组合 600519' })).toBeVisible();
  await expect(launchpad.getByText('首次任务进度 0/3')).toBeVisible();
  await expect(launchpad.getByText('建议先试用 600519')).toBeVisible();
  await launchpad.getByRole('button', { name: '不再提示' }).click();
  await expect(launchpad.getByText('建议先试用 600519')).toHaveCount(0);
  await launchpad.getByRole('button', { name: '显示提示' }).click();
  await expect(launchpad.getByText('建议先试用 600519')).toBeVisible();
  await expect(page.getByRole('heading', { name: '大屏概览' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A 股多维市场雷达' })).toBeVisible();
  await expect(page.getByText('寒武纪')).toBeVisible();
  await expect(page.getByText('+12.36%')).toBeVisible();
  await page.getByRole('tab', { name: '主题分类' }).click();
  await expect(page.getByText('496 行业 + 504 概念')).toBeVisible();
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveText('');

  const overview = page.locator('.big-screen-overview');
  const overviewKpis = [
    ['组合市值', '¥3,500.00'],
    ['累计收益', '+¥500.00'],
    ['组合数量', '2'],
    ['市场信号', '—'],
  ];
  for (const [label, value] of overviewKpis) {
    const card = overview.locator('.big-screen-metric').filter({ hasText: label });
    await expect(card).toBeVisible();
    await expect(card.locator('.big-screen-metric__value')).toHaveText(value);
  }
  await expect(overview.getByText('跨标的聚合 UNKNOWN')).toBeVisible();
  await expect(page.getByLabel('市场信号可用性')).toContainText('暂无可审计的跨标的信号汇总');
  expect(requestedPaths).not.toContain('/api/signals/summary');

  const systemKpis = [
    ['模型总数', '2'],
    ['会话数', '3'],
    ['讨论数', '4'],
    ['消息数', '5'],
  ];
  for (const [label, value] of systemKpis) {
    const statistic = page.locator('.ant-statistic').filter({ hasText: label });
    await expect(statistic).toBeVisible();
    await expect(statistic.locator('.ant-statistic-content-value')).toHaveText(value);
  }

  await expect(page.getByRole('button', { name: '查看投资组合' })).toBeVisible();
  const launchpadBox = await launchpad.boundingBox();
  const overviewBox = await overview.boundingBox();
  expect(launchpadBox?.y).toBeLessThan(overviewBox?.y ?? 0);
  expect(browserErrors).toEqual([]);
});

test('portfolio example pre-fills only verifiable inputs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
  });
  await mockDashboardApi(page);
  await page.goto('/portfolio?example=600519');

  await expect(page.getByText('真实示例：贵州茅台 600519')).toBeVisible();
  await expect(page.getByText('成本价保留为空')).toBeVisible();
  await page.getByRole('button', { name: '填入示例持仓' }).click();

  await expect(page.getByRole('dialog', { name: '添加持仓' })).toBeVisible();
  await expect(page.getByLabel('股票代码')).toHaveValue('600519');
  await expect(page.getByLabel('股票名称（可选）')).toHaveValue('贵州茅台');
  await expect(page.getByLabel('持仓数量')).toHaveValue('10');
  await expect(page.getByLabel('持仓成本价')).toHaveValue('');
});
