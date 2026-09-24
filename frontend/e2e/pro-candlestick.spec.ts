import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { mockApi } from './helpers';

test.describe.configure({ mode: 'serial' });

const snapshot = {
  instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
  data: {
    price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
    volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
    turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
  },
  provider: 'e2e-fixture', as_of: '2026-10-10T07:00:00Z', timezone: 'Asia/Shanghai',
  currency: 'CNY', adjustment: null, frequency: '1d', quality_flags: [],
};

const report = {
  id: 71,
  ticker: '600519',
  company_name: '贵州茅台',
  status: 'completed',
  created_at: '2026-09-15T08:00:00Z',
  report_data: { verdict: '看多', executive_summary: 'E2E 确定性研报结论' },
  events: [],
};

function dateAt(dayOffset: number) {
  return new Date(Date.UTC(2026, 8, 1 + dayOffset)).toISOString().slice(0, 10);
}

function makeBars(period: string) {
  return Array.from({ length: 40 }, (_, index) => {
    const close = 1500 + index * 2;
    const day = period.endsWith('m') ? '2026-09-23' : dateAt(index);
    const time = period.endsWith('m')
      ? Math.floor(Date.UTC(2026, 8, 23, 1, 30 + index * 5) / 1000)
      : undefined;
    return {
      day,
      ...(time === undefined ? {} : { time }),
      open: close - 1,
      high: close + 4,
      low: close - 5,
      close,
      volume: 100_000 + index * 1_000,
      source: 'e2e-fixture',
      adjustment: 'none',
    };
  });
}

function watchBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function attachScreenshot(page: Page, testInfo: TestInfo) {
  const path = testInfo.outputPath('browser-final-state.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('browser-final-state.png', { path, contentType: 'image/png' });
}

async function openWorkspace(page: Page, requestedPeriods: string[]) {
  await mockApi(page, {
    'GET /api/agents': { items: [] },
    'GET /api/instruments/workspaces': { items: [] },
    'GET /api/instruments/600519/snapshot': snapshot,
    'GET /api/instruments/600519/bars': {
      ...snapshot, items: [], indicators: {},
    },
    'GET /api/instruments/600519/fundamentals': { ...snapshot, items: [] },
    'GET /api/instruments/600519/workspace': { symbol: '600519', notes: '', evidence: [], saved: false },
    'GET /api/instruments/600519/chip-distribution': null,
    'GET /api/instruments/600519/money-flow': null,
    'GET /api/instruments/600519/dragon-tiger': null,
    'GET /api/research/history': {
      items: [{
        ticker: '600519', company_name: '贵州茅台', run_count: 1, completed_count: 1,
        failed_count: 0, latest_at: report.created_at,
        runs: [{
          id: report.id, ticker: report.ticker, company_name: report.company_name,
          status: report.status, created_at: report.created_at,
        }],
      }],
    },
    'GET /api/research/71': report,
    'GET /api/discussion/rooms': { items: [] },
    'GET /api/thesis': { items: [] },
    'GET /api/market/kline': (route) => {
      const url = new URL(route.request().url());
      const period = url.searchParams.get('period') ?? 'day';
      requestedPeriods.push(period);
      return { items: makeBars(period) };
    },
  });
  await page.goto('/research/600519');
  await expect(page.getByTestId('pro-candlestick-chart')).toBeVisible();
  await expect(page.getByTestId('pro-chart-main').locator('canvas').first()).toBeVisible();
}

test('switches daily, weekly, monthly, and supported intraday market periods', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedPeriods: string[] = [];
  await openWorkspace(page, requestedPeriods);

  const periodControl = page.getByRole('radiogroup', { name: 'K 线周期' });
  for (const [label, period] of [
    ['周 K', 'week'], ['月 K', 'month'], ['60 分钟', '60m'],
    ['30 分钟', '30m'], ['15 分钟', '15m'], ['5 分钟', '5m'], ['日 K', 'day'],
  ]) {
    await periodControl.locator('.ant-segmented-item-label').getByText(label, { exact: true }).click();
    await expect.poll(() => requestedPeriods.at(-1)).toBe(period);
    await expect(periodControl.getByRole('radio', { name: label, exact: true })).toBeChecked();
    await expect(page.getByTestId('pro-chart-main').locator('canvas').first()).toBeVisible();
  }
  await expect(periodControl.getByRole('radio', { name: '1 分钟', exact: true })).toHaveCount(0);
  expect(requestedPeriods.slice(-7)).toEqual(['week', 'month', '60m', '30m', '15m', '5m', 'day']);
  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});

test('toggles MA, EMA, and BOLL overlays and switches lower indicator panels', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedPeriods: string[] = [];
  await openWorkspace(page, requestedPeriods);

  for (const name of ['MA', 'EMA', 'BOLL']) {
    const checkbox = page.getByRole('checkbox', { name, exact: true });
    const option = page.locator('.ant-checkbox-wrapper').filter({ hasText: new RegExp(`^${name}$`) });
    await expect(checkbox).toBeChecked();
    await option.click();
    await expect(checkbox).not.toBeChecked();
    await option.click();
    await expect(checkbox).toBeChecked();
  }

  const lowerIndicators = page.getByRole('radiogroup', { name: '副图指标' });
  for (const name of ['KDJ', 'RSI', 'MACD']) {
    await lowerIndicators.locator('.ant-segmented-item-label').getByText(name, { exact: true }).click();
    await expect(lowerIndicators.getByRole('radio', { name, exact: true })).toBeChecked();
    await expect(page.getByTestId('pro-chart-indicator').locator('canvas').first()).toBeVisible();
  }

  await expect(page.getByTestId('pro-chart-volume').locator('canvas').first()).toBeVisible();
  const panelHeights = await Promise.all(['pro-chart-main', 'pro-chart-volume', 'pro-chart-indicator'].map(
    (testId) => page.getByTestId(testId).evaluate((element) => element.getBoundingClientRect().height),
  ));
  expect(panelHeights[0]).toBeGreaterThan(0);
  expect(panelHeights[1]).toBeGreaterThan(0);
  expect(panelHeights[2]).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});

test('shows hovered OHLCV values, zooms the canvas, and keeps chart styling on design tokens', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedPeriods: string[] = [];
  await openWorkspace(page, requestedPeriods);

  const mainChart = page.getByTestId('pro-chart-main');
  await mainChart.scrollIntoViewIfNeeded();
  const bounds = await mainChart.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width * 0.62, bounds!.y + bounds!.height * 0.48);

  const tooltip = page.getByTestId('pro-chart-crosshair-tooltip');
  await expect(tooltip).toBeVisible();
  const tooltipValues = await tooltip.locator('span').allTextContents();
  expect(tooltipValues).toHaveLength(6);
  const offset = (Date.parse(`${tooltipValues[0]}T00:00:00Z`) - Date.parse('2026-09-01T00:00:00Z')) / 86_400_000;
  const close = 1500 + offset * 2;
  expect(tooltipValues).toEqual([
    tooltipValues[0],
    `开 ${(close - 1).toFixed(2)}`,
    `高 ${(close + 4).toFixed(2)}`,
    `低 ${(close - 5).toFixed(2)}`,
    `收 ${close.toFixed(2)}`,
    `量 ${(100_000 + offset * 1_000).toLocaleString('zh-CN')}`,
  ]);
  expect(await tooltip.getAttribute('style')).toContain('var(--fq-border)');
  expect(await tooltip.getAttribute('style')).toContain('var(--fq-surface-1)');
  const lightTokenSurface = await page.locator('.app-theme').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--fq-surface-1').trim()
  ));
  expect(lightTokenSurface).not.toBe('');
  const lightTooltipBackground = await tooltip.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.getByRole('button', { name: '切换到深色主题' }).click();
  await expect(page.locator('.app-theme')).toHaveClass(/app-theme--dark/);
  const darkTokenSurface = await page.locator('.app-theme').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--fq-surface-1').trim()
  ));
  expect(darkTokenSurface).not.toBe(lightTokenSurface);
  await mainChart.scrollIntoViewIfNeeded();
  const darkBounds = await mainChart.boundingBox();
  await page.mouse.move(darkBounds!.x + darkBounds!.width * 0.62, darkBounds!.y + darkBounds!.height * 0.48);
  await expect(tooltip).toBeVisible();
  const darkTooltipBackground = await tooltip.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkTooltipBackground).not.toBe(lightTooltipBackground);
  await page.getByRole('button', { name: '切换到浅色主题' }).click();
  await expect(page.locator('.app-theme')).not.toHaveClass(/app-theme--dark/);
  const resetTokenSurface = await page.locator('.app-theme').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--fq-surface-1').trim()
  ));
  expect(resetTokenSurface).toBe(lightTokenSurface);
  await mainChart.scrollIntoViewIfNeeded();
  const lightBounds = await mainChart.boundingBox();
  await page.mouse.move(lightBounds!.x + lightBounds!.width * 0.62, lightBounds!.y + lightBounds!.height * 0.48);
  await expect(tooltip).toBeVisible();
  await expect.poll(() => tooltip.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(lightTooltipBackground);

  await page.mouse.wheel(0, -320);
  await expect(mainChart.locator('canvas').first()).toBeVisible();
  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});

test('opens and closes the dated research marker report drawer', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedPeriods: string[] = [];
  await openWorkspace(page, requestedPeriods);

  const marker = page.getByRole('button', { name: /2026-09-15.*看多.*#71/ });
  await expect(marker).toBeVisible();
  await marker.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('贵州茅台');
  await expect(drawer).toContainText('看多 / 买入');
  await expect(drawer).toContainText('E2E 确定性研报结论');
  await drawer.getByRole('button', { name: '关闭' }).click();
  await expect(drawer).toBeHidden();

  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});
