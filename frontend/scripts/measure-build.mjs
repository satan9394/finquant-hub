import { chromium } from '@playwright/test';

const baseURL = process.env.PERF_BASE_URL || 'http://127.0.0.1:4174';
const routes = [
  { name: 'research-home', path: '/research', ready: '[data-testid="research-home"]' },
  { name: 'strategy-lab', path: '/strategy-lab/ma-crossover?symbol=AAPL', ready: '[data-testid="ma-crossover-lab"]' },
  { name: 'portfolio', path: '/portfolio', ready: 'h2' },
];

const browser = await chromium.launch({ headless: true });
const results = [];

for (const target of routes) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assetResponses = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.includes('/assets/')) assetResponses.push(response);
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies = {
      '/api/auth/me': { user: { id: 1, email: 'perf@test.local', is_admin: false, local_mode: true } },
      '/api/models': { items: [] },
      '/api/notifications': { items: [], unread_count: 0 },
      '/api/instruments/workspaces': { items: [] },
      '/api/research/history': { items: [] },
      '/api/thesis': { items: [] },
      '/api/backtests': { items: [] },
      '/api/market/pulse': { sections: { weekly: { items: [] } } },
      '/api/portfolio': { items: [] },
    };
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(bodies[path] ?? { items: [] }),
    });
  });

  const startedAt = Date.now();
  await page.goto(`${baseURL}${target.path}`, { waitUntil: 'load' });
  await page.locator(target.ready).first().waitFor({ state: 'visible' });
  const readyMs = Date.now() - startedAt;
  await page.waitForTimeout(250);
  const assets = await Promise.all(assetResponses.map(async (response) => ({
    file: new URL(response.url()).pathname.split('/').pop(),
    bytes: (await response.body()).byteLength,
  })));
  results.push({
    route: target.name,
    ready_ms: readyMs,
    asset_bytes: assets.reduce((total, asset) => total + asset.bytes, 0),
    assets: assets.sort((a, b) => b.bytes - a.bytes),
  });
  await context.close();
}

await browser.close();
process.stdout.write(`${JSON.stringify({ base_url: baseURL, measured_at: new Date().toISOString(), results }, null, 2)}\n`);
