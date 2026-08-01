import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockDashboardApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses: Record<string, unknown> = {
      '/api/models': { items: [] },
      '/api/dashboard/stats': {
        model_count: 2,
        conversation_count: 3,
        discussion_count: 4,
        message_count: 5,
        recent_conversations: [],
        recent_rooms: [],
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
      '/api/signals/summary': {
        total: 7,
        bullish: 4,
        bearish: 2,
        neutral: 1,
        signals: [],
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
  await expect(page.getByRole('heading', { name: '大屏概览' })).toBeVisible();
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveText('');

  const overview = page.locator('.big-screen-overview');
  const overviewKpis = [
    ['组合市值', '¥3,500.00'],
    ['累计收益', '+¥500.00'],
    ['组合数量', '02'],
    ['市场信号', '07'],
  ];
  for (const [label, value] of overviewKpis) {
    const card = overview.locator('.big-screen-metric').filter({ hasText: label });
    await expect(card).toBeVisible();
    await expect(card.locator('.big-screen-metric__value')).toHaveText(value);
  }

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
  expect(browserErrors).toEqual([]);
});
