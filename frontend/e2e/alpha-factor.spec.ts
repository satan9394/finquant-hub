import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { mockApi } from './helpers';

test.describe.configure({ mode: 'serial' });

const factorId = 'e2e-momentum';
const dates = Array.from({ length: 20 }, (_, index) => (
  new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString().slice(0, 10)
));
const symbols = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'];
const observations = dates.flatMap((date, dateIndex) => symbols.map((symbol, symbolIndex) => ({
  date,
  symbol,
  factor: symbolIndex + dateIndex / 10,
  forward_return: (symbolIndex - 2) * 0.01 + dateIndex * 0.0002,
})));
const csv = [
  'date,symbol,factor,forward_return',
  ...observations.map((row) => `${row.date},${row.symbol},${row.factor},${row.forward_return}`),
].join('\n');

const analytics = {
  status: 'ok' as const,
  minimum_valid_periods: 20,
  valid_periods: 20,
  total_periods: 20,
  observation_count: observations.length,
  cache_ttl_seconds: 3540,
  summary: {
    ic_mean: 0.5123,
    ic_std: 0.1245,
    ic_ir: 0.7312,
    t_stat: 4.216,
    monotonicity_score: 0.95,
    mean_long_short_turnover: 0.24,
    factor_autocorrelation: 0.61,
  },
  ic_series: dates.map((date, index) => ({
    date,
    ic: Number((0.2 + index * 0.012).toFixed(4)),
    rank_ic: Number((0.3 + (index % 7) * 0.01).toFixed(4)),
  })),
  quantile_returns: {
    dates,
    q1: dates.map((_, index) => Number((0.99 - index * 0.0005).toFixed(4))),
    q2: dates.map((_, index) => Number((1 + index * 0.0002).toFixed(4))),
    q3: dates.map((_, index) => Number((1 + index * 0.0005).toFixed(4))),
    q4: dates.map((_, index) => Number((1.01 + index * 0.0007).toFixed(4))),
    q5: dates.map((_, index) => Number((1.02 + index * 0.001).toFixed(4))),
    long_short: dates.map((_, index) => Number((0.03 + index * 0.0015).toFixed(4))),
  },
};

const alphaCatalogue = {
  schema_version: 'alpha-catalogue/v1',
  mode: 'FINQUANT_STARTER',
  data_status: 'PARTIAL',
  source: 'finquant.starter',
  redistribution_status: 'PROJECT_AUTHORED',
  field_count: 0,
};

function watchBrowserErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const expectedTransientNetworkErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const error = message.text();
    if (error === 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)') {
      expectedTransientNetworkErrors.push(error);
    } else {
      consoleErrors.push(error);
    }
  });
  return { pageErrors, consoleErrors, expectedTransientNetworkErrors };
}

async function attachScreenshot(page: Page, testInfo: TestInfo) {
  const path = testInfo.outputPath('browser-final-state.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach('browser-final-state.png', { path, contentType: 'image/png' });
}

test('validates input, retries a transient failure, and explores IC and quantile charts', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const submittedBodies: Array<{ observations: typeof observations }> = [];
  const cachedReads: string[] = [];

  await mockApi(page, {
    'GET /api/agents': { items: [] },
    'GET /api/wq/categories': { items: [], catalogue: alphaCatalogue },
    'GET /api/wq/templates': { items: [] },
    [`POST /api/wq/factors/${factorId}/analytics`]: async (route) => {
      submittedBodies.push(route.request().postDataJSON() as { observations: typeof observations });
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (submittedBodies.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: '模拟分析服务暂时不可用' }),
        });
        return undefined;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ factor_id: factorId, status: 'ok', cache_ttl_seconds: 3600 }),
      });
      return undefined;
    },
    [`GET /api/wq/factors/${factorId}/analytics`]: (route) => {
      cachedReads.push(route.request().url());
      return analytics;
    },
  });

  await page.goto('/alpha');
  await expect(page).toHaveURL(/\/discover\?mode=alpha$/);
  await expect(page.getByTestId('alpha-factor-analytics')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '因子观察数据' })).toHaveValue('');
  await expect(page.getByRole('button', { name: /示例数据|填充样本/ })).toHaveCount(0);
  await expect(page.getByRole('img', { name: '按日期排列的 IC 柱状图与 Rank IC 折线图' })).toHaveCount(0);
  const chartTokens = await page.locator('.app-theme').evaluate((root) => {
    const styles = getComputedStyle(root);
    return [
      '--fq-surface-1', '--fq-surface-2', '--fq-border', '--fq-text-primary',
      '--fq-ai-primary', '--fq-price-up', '--fq-price-down', '--fq-evidence-unknown',
    ].map((name) => styles.getPropertyValue(name).trim());
  });
  expect(chartTokens.every(Boolean)).toBe(true);

  const factorInput = page.getByRole('textbox', { name: '因子 ID' });
  const observationInput = page.getByRole('textbox', { name: '因子观察数据' });
  const submit = page.getByRole('button', { name: /计算并加载/ });
  await factorInput.fill(factorId);
  await observationInput.fill('not,a,valid,observation');
  await submit.click();

  const alert = page.locator('.ant-alert').filter({ hasText: '因子分析暂不可用' });
  await expect(alert).toContainText('CSV 缺少列');
  expect(submittedBodies).toHaveLength(0);

  await observationInput.fill(csv);
  await submit.click();
  await expect(submit).toHaveClass(/ant-btn-loading/);
  await expect(alert).toContainText('模拟分析服务暂时不可用');

  const retry = alert.getByRole('button', { name: /重\s*试/ });
  await retry.click();
  await expect(submit).toHaveClass(/ant-btn-loading/);
  await expect(page.getByText('样本达标')).toBeVisible();
  await expect(alert).toHaveCount(0);

  expect(submittedBodies).toHaveLength(2);
  expect(submittedBodies[0]).toEqual({ observations });
  expect(submittedBodies[1]).toEqual({ observations });
  expect(cachedReads).toHaveLength(1);
  await expect(page.getByText(/数据来源：用户提交的 100 条观察记录/)).toBeVisible();
  for (const [label, value] of [
    ['平均 IC', '0.512'], ['IC 标准差', '0.124'], ['IC_IR', '0.731'],
    ['t 统计量', '4.216'], ['分层单调性', '0.950'], ['多空换手', '0.240'], ['因子自相关', '0.610'],
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText(value, { exact: true })).toBeVisible();
  }

  const quantileChart = page.getByRole('img', { name: '五分位累计收益与 Q5 减 Q1 净值差' });
  const icChart = page.getByRole('img', { name: '按日期排列的 IC 柱状图与 Rank IC 折线图' });
  await expect(quantileChart).toBeVisible();
  await expect(icChart).toBeVisible();
  await expect(page.locator('.echarts-for-react canvas')).toHaveCount(2);

  await icChart.scrollIntoViewIfNeeded();
  const icBounds = await icChart.boundingBox();
  expect(icBounds).not.toBeNull();
  await page.mouse.move(icBounds!.x + icBounds!.width * 0.55, icBounds!.y + icBounds!.height * 0.58);
  const tooltip = icChart.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]')
    .filter({ hasText: dates[10] });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(dates[10]);
  await expect(tooltip).toContainText('IC');
  await expect(tooltip).toContainText('Rank IC');
  await expect(tooltip).toContainText('0.3200');
  await expect(tooltip).toContainText('0.3300');

  await quantileChart.scrollIntoViewIfNeeded();
  const quantileCanvas = quantileChart.locator('canvas').first();
  const quantileBounds = await quantileCanvas.boundingBox();
  expect(quantileBounds).not.toBeNull();
  const quantileHover = {
    x: quantileBounds!.x + quantileBounds!.width * 0.55,
    y: quantileBounds!.y + quantileBounds!.height * 0.58,
  };
  await page.mouse.move(quantileHover.x, quantileHover.y);
  const quantileTooltip = quantileChart.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]')
    .filter({ hasText: dates[10] });
  await expect(quantileTooltip).toBeVisible();
  await expect(quantileTooltip).toContainText('Q1');
  await expect(quantileTooltip).toContainText('Q2');
  await expect(quantileTooltip).toContainText('Q3');
  await expect(quantileTooltip).toContainText('Q4');
  await expect(quantileTooltip).toContainText('Q5');
  await expect(quantileTooltip).toContainText('Q5 − Q1');
  await expect(quantileTooltip.getByText('Q1', { exact: true })).toBeVisible();

  // ECharts centers the six-item legend above the grid; this coordinate hits Q1 in the
  // fixed Chromium viewport. Prove the click through the axis tooltip's selected series.
  await page.mouse.click(quantileBounds!.x + quantileBounds!.width * 0.35, quantileBounds!.y + 12);
  await page.mouse.move(quantileHover.x, quantileHover.y);
  await expect(quantileTooltip).toBeVisible();
  await expect(quantileTooltip.getByText('Q1', { exact: true })).toHaveCount(0);
  await expect(quantileTooltip).toContainText('Q2');
  await expect(quantileTooltip).toContainText('Q5');

  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
  expect(browserErrors.expectedTransientNetworkErrors).toHaveLength(1);
  await attachScreenshot(page, testInfo);
});
