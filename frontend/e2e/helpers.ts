import type { Page, Route } from '@playwright/test';

export type MockValue = unknown | ((route: Route) => unknown | Promise<unknown>);

export const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

export async function fulfillSSE(route: Route, body: string) {
  await route.fulfill({
    status: 200,
    headers: {
      'cache-control': 'no-cache',
      'content-type': 'text/event-stream; charset=utf-8',
    },
    body,
  });
}

export async function mockApi(page: Page, responses: Record<string, MockValue> = {}) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
    localStorage.setItem('finquant_lang', 'zh');
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    const shell: Record<string, unknown> = {
      'GET /api/auth/me': { user: { id: 1, email: 'backlog-005@test.local', is_admin: false, local_mode: true } },
      'GET /api/health': { status: 'ok', db: 'wal' },
      'GET /api/models': { items: [] },
      'GET /api/notifications': { items: [], unread_count: 0 },
    };

    if (path === '/api/notifications/stream') {
      await fulfillSSE(route, 'event: heartbeat\ndata: {}\n\n');
      return;
    }

    const value = key in responses ? responses[key] : shell[key];
    if (value !== undefined) {
      const resolved = typeof value === 'function' ? await value(route) : value;
      if (resolved !== undefined) await json(route, resolved);
      return;
    }
    await json(route, { detail: `Unhandled BACKLOG-005 E2E API route: ${key}` }, 404);
  });
}

