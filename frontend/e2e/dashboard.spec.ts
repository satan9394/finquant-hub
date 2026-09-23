import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockDashboardApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
    localStorage.setItem('finquant_lang', 'zh');
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/auth/me': { user: { id: 1, email: 'dashboard@test.local', is_admin: false } },
      '/api/models': { items: [] },
      '/api/health': { status: 'ok', db: 'wal' },
      '/api/dashboard/stats': {
        model_count: 2,
        conversation_count: 3,
        discussion_count: 4,
        message_count: 5,
        recent_conversations: [],
        recent_rooms: [],
        // BACKLOG-035b：与后端 dashboard/stats capabilities 契约（local-capabilities/v1）
        // 及 frontend types/index.ts DashboardStats.capabilities 一致——仅补字段，不改既有断言。
        capabilities: {
          contract_version: 'local-capabilities/v1',
          runtime_mode: 'LOCAL_ONLY',
          local_core: { status: 'AVAILABLE', quality_status: 'OK' },
          model_ai: {
            status: 'UNCONFIGURED', quality_status: 'UNKNOWN',
            credential_source: 'none', model_id: 1, action_path: '/models',
          },
          market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' },
        },
      },
      '/api/dashboard/decision-inbox': {
        engine_version: 'decision-inbox/v1',
        generated_at: '2026-08-08T10:30:00Z',
        items: [],
        total: 0,
      },
      '/api/dashboard/news': {
        keyword: '中国 A股 港股 美股 财经', queried_at: '2026-08-08T10:30:00Z', as_of: '2026-08-08T10:30:00Z',
        providers_attempted: ['google_news'], providers_used: ['google_news'], errors: {}, data_status: 'OK',
        news: [{ title: '财经市场简报', source: '公开来源', published_at: '2026-08-08', url: 'https://example.test/news', snippet: '市场摘要', provider: 'google_news' }],
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

test('dashboard renders an evidence-first workbench from API data', async ({ page }) => {
  const browserErrors: string[] = [];
  const requestedPaths: string[] = [];
  page.on('request', (request) => requestedPaths.push(new URL(request.url()).pathname));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await mockDashboardApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '今日' })).toBeVisible();
  const launchpad = page.locator('.task-launchpad');
  await expect(launchpad.getByRole('heading', { name: '今天想完成什么？' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '分析股票' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '验证策略' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '查看组合' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '试用研究示例 600519' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '试用策略示例 600519' })).toBeVisible();
  await expect(launchpad.getByRole('button', { name: '试用组合示例 600519' })).toBeVisible();
  await expect(launchpad.getByText('首次任务进度 0/3')).toBeVisible();
  await expect(launchpad.getByText('建议先试用 600519')).toBeVisible();
  await launchpad.getByRole('button', { name: '不再提示' }).click();
  await expect(launchpad.getByText('建议先试用 600519')).toHaveCount(0);
  await launchpad.getByRole('button', { name: '显示提示' }).click();
  await expect(launchpad.getByText('建议先试用 600519')).toBeVisible();
  await expect(page.getByText('真实市场简报', { exact: true })).toBeVisible();
  await expect(page.getByText('2026-08-08T10:30:00+08:00')).toBeVisible();
  await expect(page.getByText('eastmoney')).toBeVisible();
  await expect(page.getByText('最新财经消息', { exact: true })).toBeVisible();
  await expect(page.getByText('财经市场简报')).toBeVisible();
  await expect(page.getByRole('heading', { name: '大屏概览' })).toHaveCount(0);
  await expect(page.locator('.big-screen-overview')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A 股多维市场雷达' })).toHaveCount(0);
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveText('');
  expect(requestedPaths).not.toContain('/api/signals/summary');
  expect(browserErrors).toEqual([]);
});

test('portfolio example pre-fills only verifiable inputs', async ({ page }) => {
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
