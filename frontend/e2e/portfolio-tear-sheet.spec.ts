import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { mockApi } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const groups = [
  { id: 12, name: '核心组合', description: '长期资产配置', created_at: '2026-01-01T00:00:00Z' },
  { id: 13, name: '成长组合', description: '成长策略观察', created_at: '2026-01-02T00:00:00Z' },
];

const pnl = {
  total_cost: 30_000,
  total_market_value: 32_100,
  total_pnl: 2_100,
  total_pnl_pct: 7,
  positions: [
    { id: 1, ticker: 'AAA', name: '甲公司', shares: 100, avg_cost: 100, current_price: 110, market_value: 11_000, cost: 10_000, pnl: 1_000, pnl_pct: 10 },
    { id: 2, ticker: 'BBB', name: '乙公司', shares: 200, avg_cost: 100, current_price: 105.5, market_value: 21_100, cost: 20_000, pnl: 1_100, pnl_pct: 5.5 },
  ],
};

const dates = Array.from({ length: 12 }, (_, index) => {
  const day = String(index + 1).padStart(2, '0');
  return `2026-01-${day}`;
});

const tearSheet = {
  status: 'ok',
  reason: null,
  as_of: '2026-12-31',
  currency: 'CNY',
  method: 'current_share_quantities_fixed_over_history',
  coverage: {
    requested_assets: 2,
    priced_assets: 2,
    available_symbols: ['AAA', 'BBB'],
    missing_symbols: [],
    source_metadata: {
      AAA: { sources: ['sina'], adjustments: ['none'] },
      BBB: { sources: ['sina'], adjustments: ['none'] },
    },
    observation_count: 60,
    history_start: '2026-10-01',
    history_end: '2026-12-31',
  },
  metrics: {
    max_drawdown: -0.12,
    max_drawdown_duration_days: 8,
    annualized_volatility: 0.2,
    calmar_ratio: 1.25,
    sortino_ratio: 1.4,
    concentration_hhi: 0.5,
    effective_asset_count: 2,
    largest_weight: 0.6667,
  },
  underwater_series: dates.map((time, index) => ({
    time,
    value: [-0.01, -0.03, -0.06, -0.12, -0.1, -0.08, -0.05, -0.03, -0.02, -0.01, 0, -0.01][index],
  })),
  rolling_metrics: dates.map((time, index) => ({
    time,
    sharpe: Number((0.4 + index * 0.08).toFixed(2)),
    volatility: Number((0.22 - index * 0.006).toFixed(3)),
  })),
  monthly_matrix: [{
    year: 2026,
    months: [0.02, -0.01, -0.03, 0.015, null, null, null, null, null, null, null, null],
    annual_total: -0.005,
    complete_year: false,
  }],
  risk_contributions: [
    { symbol: 'AAA', weight: 0.6667, annualized_volatility: 0.18, risk_contribution: 0.7 },
    { symbol: 'BBB', weight: 0.3333, annualized_volatility: 0.24, risk_contribution: 0.3 },
  ],
  warnings: [],
};

function watchBrowserErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const knownWarnings: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    const text = message.text();
    if (text === 'Warning: [antd: Modal] `destroyOnClose` is deprecated. Please use `destroyOnHidden` instead.') {
      knownWarnings.push(text);
    } else if (message.type() === 'error') {
      consoleErrors.push(text);
    }
  });
  return { pageErrors, consoleErrors, knownWarnings };
}

async function canvasSignature(container: ReturnType<Page['getByTestId']>) {
  return container.evaluate((element) => Array.from(element.querySelectorAll('canvas'))
    .map((canvas) => canvas.toDataURL()).join('|'));
}

async function attachPageScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('selects a portfolio and explores tear-sheet drawdown, monthly, and rolling-risk views', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedRiskPaths: string[] = [];

  await mockApi(page, {
    'GET /api/portfolio': { items: groups },
    'GET /api/portfolio/12/pnl': pnl,
    'GET /api/portfolio/13/pnl': pnl,
    'GET /api/portfolio/paper': { items: [] },
    'GET /api/portfolio/12/risk-tearsheet': async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      requestedRiskPaths.push('/api/portfolio/12/risk-tearsheet');
      return tearSheet;
    },
    'GET /api/portfolio/13/risk-tearsheet': async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      requestedRiskPaths.push('/api/portfolio/13/risk-tearsheet');
      return tearSheet;
    },
  });

  await page.goto('/portfolio', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '投资组合' })).toBeVisible({ timeout: 45_000 });
  const selectedGroup = page.getByRole('tab', { name: '成长组合' });
  await expect(selectedGroup).toBeVisible({ timeout: 20_000 });
  await selectedGroup.click();
  await page.getByRole('tab', { name: '量化体检报告' }).click();

  await expect(page.getByText('最大回撤', { exact: true })).toBeVisible();
  await expect(page.getByText('-12.00%', { exact: true })).toBeVisible();
  await expect(page.getByText('最长修复期', { exact: true })).toBeVisible();
  await expect(page.getByText('8', { exact: true })).toBeVisible();
  await expect(page.getByTestId('portfolio-underwater-chart')).toBeVisible();
  await expect(page.getByTestId('portfolio-monthly-heatmap')).toBeVisible();
  await expect(page.getByTestId('portfolio-rolling-risk-chart')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '风险贡献' })).toBeVisible();
  expect(requestedRiskPaths).toContain('/api/portfolio/13/risk-tearsheet');

  const themeValues = await page.locator('.app-theme').evaluate((root) => {
    const styles = getComputedStyle(root);
    return ['--fq-price-up', '--fq-price-down', '--fq-surface-1', '--fq-border', '--fq-text-primary']
      .map((token) => styles.getPropertyValue(token).trim());
  });
  expect(themeValues.every(Boolean)).toBe(true);

  const positiveMonth = page.locator('[role="gridcell"][title="2026年1月：+2.0%"]');
  const negativeMonth = page.locator('[role="gridcell"][title="2026年2月：-1.0%"]');
  await expect(positiveMonth).toBeVisible();
  await expect(negativeMonth).toBeVisible();
  const monthColors = await Promise.all([positiveMonth, negativeMonth].map((cell) => cell.evaluate((element) => getComputedStyle(element).backgroundColor)));
  expect(monthColors[0]).not.toBe(monthColors[1]);
  await positiveMonth.hover();
  await expect(positiveMonth).toHaveAttribute('title', '2026年1月：+2.0%');

  const underwater = page.getByTestId('portfolio-underwater-chart');
  const underwaterBounds = await underwater.boundingBox();
  expect(underwaterBounds).not.toBeNull();
  const underwaterBefore = await canvasSignature(underwater);
  await page.mouse.move(underwaterBounds!.x + underwaterBounds!.width * 0.56, underwaterBounds!.y + underwaterBounds!.height * 0.54);
  await expect.poll(() => canvasSignature(underwater)).not.toBe(underwaterBefore);
  await attachPageScreenshot(page, testInfo, 'portfolio-underwater-crosshair.png');

  const rolling = page.getByTestId('portfolio-rolling-risk-chart');
  const rollingBounds = await rolling.boundingBox();
  expect(rollingBounds).not.toBeNull();
  const rollingBefore = await canvasSignature(rolling);
  await page.mouse.move(rollingBounds!.x + rollingBounds!.width * 0.62, rollingBounds!.y + rollingBounds!.height * 0.48);
  await expect.poll(() => canvasSignature(rolling)).not.toBe(rollingBefore);
  await attachPageScreenshot(page, testInfo, 'browser-final-state.png');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
  expect(browserErrors.knownWarnings).toHaveLength(1);
});
