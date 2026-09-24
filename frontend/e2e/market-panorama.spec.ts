import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { mockApi } from './helpers';

test.describe.configure({ mode: 'serial', timeout: 90_000 });

const sectorData = {
  as_of: '2026-09-23T15:00:00+08:00',
  source: 'e2e.fixture',
  classification: 'eastmoney_board',
  classification_note: '东财行业板块分类。',
  quality: 'DIRECT',
  status: 'ok',
  items: [
    {
      name: '电子行业', code: 'BK001', value: 1000, change_percent: 0.025, kind: 'industry', coverage: 'DIRECT',
      children: [
        { name: '成分股甲', code: '600001', value: 600, change_percent: 0.04, kind: 'constituent', coverage: 'DIRECT' },
        { name: '成分股乙', code: '600002', value: 400, change_percent: -0.01, kind: 'constituent', coverage: 'DIRECT' },
      ],
    },
    {
      name: '消费行业', code: 'BK002', value: 500, change_percent: -0.015, kind: 'industry', coverage: 'DIRECT',
      children: [{ name: '成分股丙', code: '600003', value: 500, change_percent: -0.02, kind: 'constituent', coverage: 'DIRECT' }],
    },
  ],
};

const seatData = {
  status: 'ok',
  note: '同日同股买入席位共现。',
  source: 'e2e.fixture',
  date_from: '2026-09-17',
  date_to: '2026-09-23',
  nodes: [
    { id: 'seat-a', name: '一线营业部', category: 'brokerage' as const, buy_amount_cny_10k: 90, security_count: 3 },
    { id: 'seat-b', name: '机构专用', category: 'institution' as const, buy_amount_cny_10k: 70, security_count: 2 },
    { id: 'seat-c', name: '活跃营业部', category: 'brokerage' as const, buy_amount_cny_10k: 50, security_count: 2 },
  ],
  edges: [
    { source: 'seat-a', target: 'seat-b', shared_buy_amount_cny_10k: 15, common_security_days: 2 },
    { source: 'seat-b', target: 'seat-c', shared_buy_amount_cny_10k: 8, common_security_days: 1 },
  ],
};

const sentimentData = {
  status: 'partial',
  source: 'e2e.fixture',
  date: '2026-09-23',
  highest_board: 3,
  total_limit_up: 12,
  promotion_rate: 0.5,
  break_rate: null,
  break_rate_note: '当前源没有当日失败涨停股总数。',
  sentiment_index: 63,
  sentiment_index_basis: '按可用晋级率计算。',
  items: [
    { height: 1, count: 8, previous_count: 10, promoted_count: 6, promotion_rate: 0.6 },
    { height: 2, count: 5, previous_count: 8, promoted_count: 4, promotion_rate: 0.5 },
    { height: 3, count: 2, previous_count: 5, promoted_count: 1, promotion_rate: 0.2 },
  ],
};

function watchBrowserErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    console.log('BROWSER_CONSOLE', message.type(), message.text());
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => console.log('BROWSER_PAGEERROR', error.message));
  return { pageErrors, consoleErrors };
}

async function chartCanvas(chart: ReturnType<Page['getByRole']>) {
  return chart.locator('.echarts-for-react canvas').first();
}

async function canvasSignature(chart: ReturnType<Page['getByRole']>) {
  return chart.locator('.echarts-for-react canvas').evaluateAll((canvases) => canvases
    .map((canvas) => (canvas as HTMLCanvasElement).toDataURL()).join('|'));
}

async function waitForStableCanvas(chart: ReturnType<Page['getByRole']>) {
  let previous = '';
  let stableSamples = 0;
  await expect.poll(async () => {
    const current = await canvasSignature(chart);
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
    return stableSamples;
  }, { timeout: 5_000, intervals: [100] }).toBeGreaterThanOrEqual(3);
}

async function attachPageScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('navigates market-panorama tabs and exercises treemap, seat graph, and sentiment chart', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedMarketPaths: string[] = [];

  await mockApi(page, {
    'GET /api/market/sector-treemap': async () => {
      requestedMarketPaths.push('/api/market/sector-treemap');
      return sectorData;
    },
    'GET /api/market/dragon-tiger-network': async () => {
      requestedMarketPaths.push('/api/market/dragon-tiger-network');
      return seatData;
    },
    'GET /api/market/sentiment-ladder': async () => {
      requestedMarketPaths.push('/api/market/sentiment-ladder');
      return sentimentData;
    },
  });

  await page.goto('/discover', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '市场全景' }).click();
  await expect(page.getByRole('tab', { name: '行业热力' })).toBeVisible();
  await expect(page.getByText('东财行业板块分类。')).toBeVisible();

  const chartTokens = await page.locator('.app-theme').evaluate((root) => {
    const styles = getComputedStyle(root);
    return ['--fq-surface-1', '--fq-surface-2', '--fq-border', '--fq-text-primary', '--fq-ai-primary', '--fq-price-up', '--fq-price-down', '--fq-evidence-unknown']
      .map((token) => styles.getPropertyValue(token).trim());
  });
  expect(chartTokens.every(Boolean)).toBe(true);

  const treemap = page.locator('.ant-card').filter({ hasText: '行业成交额热力树图' }).last();
  const treemapCanvas = await chartCanvas(treemap);
  await expect(treemapCanvas).toBeVisible();
  await treemapCanvas.scrollIntoViewIfNeeded();
  const treeBounds = await treemapCanvas.boundingBox();
  expect(treeBounds).not.toBeNull();
  const treeHover = {
    x: treeBounds!.x + treeBounds!.width * 0.3,
    y: treeBounds!.y + treeBounds!.height * 0.55,
  };
  await page.mouse.move(treeHover.x, treeHover.y);
  const treemapTooltip = treemap.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]');
  await expect(treemapTooltip).toBeVisible();
  await expect(treemapTooltip).toContainText(/电子行业|成分股甲|成分股乙/);
  const treemapBeforeZoom = await canvasSignature(treemap);
  const treeZoom = { x: treeBounds!.x + treeBounds!.width * 0.1, y: treeBounds!.y + treeBounds!.height * 0.25 };
  await page.mouse.click(treeZoom.x, treeZoom.y);
  await expect.poll(() => canvasSignature(treemap)).not.toBe(treemapBeforeZoom);
  await page.mouse.move(treeBounds!.x + treeBounds!.width * 0.52, treeBounds!.y + treeBounds!.height * 0.48);
  await expect(treemap.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]')).toBeVisible();
  await attachPageScreenshot(page, testInfo, 'market-treemap-zoom.png');

  await page.getByRole('tab', { name: '席位关系' }).click();
  const seatChart = page.locator('.ant-card').filter({ hasText: '龙虎榜席位共现网络' }).last();
  const seatCanvas = await chartCanvas(seatChart);
  await expect(seatCanvas).toBeVisible();
  await expect(seatChart.getByText(/数据源：e2e\.fixture/)).toBeVisible();
  await seatCanvas.scrollIntoViewIfNeeded();
  await waitForStableCanvas(seatChart);
  const seatBounds = await seatCanvas.boundingBox();
  expect(seatBounds).not.toBeNull();
  const seatTooltip = seatChart.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]');
  let seatTooltipText = '';
  for (const [xRatio, yRatio] of [[0.59, 0.85], [0.32, 0.49], [0.59, 0.16]]) {
    const point = { x: seatBounds!.x + seatBounds!.width * xRatio, y: seatBounds!.y + seatBounds!.height * yRatio };
    await page.mouse.move(point.x, point.y);
    const matchingSeatTooltip = seatTooltip.filter({ hasText: /一线营业部|机构专用|活跃营业部/ }).first();
    try {
      await expect(matchingSeatTooltip).toBeVisible({ timeout: 500 });
      seatTooltipText = await matchingSeatTooltip.innerText();
      break;
    } catch {
      // Try the next deterministic node center in this fixed Chromium viewport.
    }
  }
  expect(seatTooltipText).toMatch(/一线营业部|机构专用|活跃营业部/);
  const seatBeforePan = await canvasSignature(seatChart);
  await page.mouse.move(seatBounds!.x + seatBounds!.width * 0.2, seatBounds!.y + seatBounds!.height * 0.8);
  await page.mouse.down();
  await page.mouse.move(seatBounds!.x + seatBounds!.width * 0.34, seatBounds!.y + seatBounds!.height * 0.72, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => canvasSignature(seatChart)).not.toBe(seatBeforePan);
  await attachPageScreenshot(page, testInfo, 'market-seat-network-pan.png');

  await page.getByRole('tab', { name: '短线情绪' }).click();
  await expect(page.getByText('炸板率：未知')).toBeVisible();
  const sentimentCard = page.locator('.ant-card').filter({ hasText: '连板情绪天梯' }).last();
  const sentimentCanvas = await chartCanvas(sentimentCard);
  await expect(sentimentCanvas).toBeVisible();
  await sentimentCanvas.scrollIntoViewIfNeeded();
  const sentimentBounds = await sentimentCanvas.boundingBox();
  expect(sentimentBounds).not.toBeNull();
  const sentimentHover = {
    x: sentimentBounds!.x + sentimentBounds!.width * 0.5,
    y: sentimentBounds!.y + sentimentBounds!.height * 0.58,
  };
  await page.mouse.move(sentimentHover.x, sentimentHover.y);
  const sentimentTooltip = sentimentCard.locator('.echarts-for-react div[style*="position: absolute"][style*="display: block"]')
    .filter({ hasText: '2板' });
  await expect(sentimentTooltip).toBeVisible();
  await expect(sentimentTooltip).toContainText('涨停家数');
  await expect(sentimentTooltip).toContainText('昨日晋级率');
  await expect(sentimentTooltip).toContainText('5');

  const sentimentLegendClick = { x: sentimentBounds!.x + sentimentBounds!.width * 0.56, y: sentimentBounds!.y + sentimentBounds!.height * 0.92 };
  await page.mouse.click(sentimentLegendClick.x, sentimentLegendClick.y);
  await page.mouse.move(sentimentHover.x, sentimentHover.y);
  await expect(sentimentTooltip).toBeVisible();
  await expect(sentimentTooltip.getByText('昨日晋级率', { exact: true })).toHaveCount(0);
  await expect(sentimentTooltip.getByText('涨停家数', { exact: true })).toBeVisible();

  expect(requestedMarketPaths).toContain('/api/market/sector-treemap');
  expect(requestedMarketPaths).toContain('/api/market/dragon-tiger-network');
  expect(requestedMarketPaths).toContain('/api/market/sentiment-ladder');
  expect(browserErrors.pageErrors).toEqual([]);
  expect(browserErrors.consoleErrors).toEqual([]);
  await attachPageScreenshot(page, testInfo, 'browser-final-state.png');
});
