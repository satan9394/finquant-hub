import { expect, test, type Page, type Route } from '@playwright/test';

type MockValue = unknown | ((route: Route) => unknown | Promise<unknown>);

const json = (route: Route, body: unknown) => route.fulfill({
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function mockApi(page: Page, responses: Record<string, MockValue> = {}) {
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
      'GET /api/auth/me': { user: { id: 1, email: 'discover@test.local', is_admin: false, local_mode: true } },
      'GET /api/models': { items: [] },
      'GET /api/notifications': { items: [], unread_count: 0 },
      'GET /api/health': { status: 'ok', db: 'wal' },
    };

    if (path === '/api/notifications/stream') {
      await route.fulfill({ contentType: 'text/event-stream', body: 'event: heartbeat\ndata: {}\n\n' });
      return;
    }
    const value = key in responses ? responses[key] : shell[key];
    if (value !== undefined) {
      const resolved = typeof value === 'function' ? await value(route) : value;
      if (resolved !== undefined) await json(route, resolved);
      return;
    }
    await json(route, { detail: `Unhandled Discover E2E API route: ${key}` });
  });
}

const catalogue = {
  schema_version: 'alpha-catalogue/v1',
  mode: 'FINQUANT_STARTER',
  data_status: 'PARTIAL',
  source: 'finquant.starter',
  redistribution_status: 'PROJECT_AUTHORED',
  field_count: 1,
};
const categories = [{ name: 'Fundamental', count: 1, examples: ['operating_income'] }];
const templates = [{
  id: 'fundamental_quality',
  name: '基本面质量',
  expression: 'rank(operating_income)',
  fields: [{ id: 'operating_income', description: '营业利润', coverage: null }],
  settings: { neutralization: 'INDUSTRY', decay: 0, delay: 1, nanHandling: 'ON' },
}];
const searchItems = [{
  name: 'Momentum Field',
  field: 'momentum',
  desc: 'Minimal deterministic E2E fixture',
  type: 'wq_field',
  dataset: 'starter',
  category: 'Price Volume',
  region: 'GLOBAL',
}];

const alphaResponses: Record<string, MockValue> = {
  'GET /api/wq/categories': { items: categories, catalogue },
  'GET /api/wq/templates': { items: templates, catalogue },
  'GET /api/wq/search': { items: searchItems, catalogue },
  // BACKLOG-002 originally recorded POST; the current alphaApi contract uses GET.
  'POST /api/wq/search': { items: searchItems, catalogue },
};

test('discover defaults to screening without the alpha workbench', async ({ page }) => {
  await mockApi(page);
  await page.goto('/discover');

  await expect(page.getByRole('textbox', { name: '发现条件' })).toBeVisible();
  await expect(page.getByTestId('alpha-research')).toHaveCount(0);
});

test('legacy alpha route redirects to the Discover alpha workbench', async ({ page }) => {
  await mockApi(page, alphaResponses);
  await page.goto('/alpha');

  await expect(page).toHaveURL(/\/discover\?mode=alpha$/);
  await expect(page.getByTestId('alpha-research')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alpha 因子研究' })).toBeVisible();
});

test('legacy screening route redirects to Discover screening mode', async ({ page }) => {
  await mockApi(page);
  await page.goto('/screening');

  await expect(page).toHaveURL(/\/discover\?mode=screening$/);
  await expect(page.getByRole('textbox', { name: '发现条件' })).toBeVisible();
  await expect(page.getByTestId('alpha-research')).toHaveCount(0);
});

test('alpha mode renders API-backed categories, templates, and search results', async ({ page }) => {
  await mockApi(page, alphaResponses);
  await page.goto('/discover?mode=alpha');

  const categoryCards = page.locator('[data-testid^="alpha-category-"]');
  await expect(categoryCards).toHaveCount(1);
  await expect(page.getByTestId('alpha-category-Fundamental')).toContainText('Fundamental');
  await expect(page.getByText('基本面质量')).toBeVisible();

  await page.getByPlaceholder('例如 operating_income、momentum、Alpha001').fill('momentum');
  await page.getByRole('button', { name: /检索/ }).click();
  await expect(page.getByText('Momentum Field')).toBeVisible();
});

test('alpha workbench has no page-level horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, alphaResponses);
  await page.goto('/discover?mode=alpha');

  await expect(page.getByTestId('alpha-category-Fundamental')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});
