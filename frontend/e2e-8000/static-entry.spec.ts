import { expect, test } from '@playwright/test';

import { expectHealthyPage, mockExternalApi, monitorBrowser } from './helpers';

test('016 serves the production index and a hashed asset from the real 8000 entry', async ({ request }) => {
  const index = await request.get('/');
  expect(index.status()).toBe(200);
  expect(index.headers()['content-type']).toContain('text/html');
  const html = await index.text();
  expect(html).toContain('<title>FinQuant Hub</title>');
  expect(html).not.toContain('/@vite/client');
  expect(html).not.toContain('vite-error-overlay');
  const assetPath = html.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
  expect(assetPath).toBeTruthy();
  const asset = await request.get(assetPath!);
  expect(asset.status()).toBe(200);
  expect(asset.headers()['content-type']).not.toContain('text/html');
});

test('019 serves favicon.svg as a root static SVG instead of SPA HTML', async ({ request }) => {
  const response = await request.get('/favicon.svg');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<svg');
});

test('016 keeps the real health endpoint and unknown API paths outside SPA fallback', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok', db: 'wal' });
  const missing = await request.get('/api/backlog-026-missing');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  expect(await missing.json()).toEqual({ detail: 'Not Found' });
});

for (const path of [
  '/research',
  '/portfolio',
  '/discover',
  '/strategy-lab/ma-crossover',
  '/alerts',
  '/knowledge',
]) {
  test(`016 refreshes ${path} through the real SPA fallback`, async ({ page }) => {
    const errors = monitorBrowser(page);
    const externalRequests = await mockExternalApi(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/FinQuant Hub$/);
    const reload = await page.reload();
    expect(reload?.status()).toBe(200);
    await expect(page.locator('main').first()).toBeVisible();
    await expectHealthyPage(page, errors, externalRequests);
  });
}
