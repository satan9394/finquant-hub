import { expect, test } from '@playwright/test';

import { mockApi } from './helpers';

const model = {
  id: 3,
  name: 'DeepSeek V4 Flash',
  provider: 'deepseek',
  base_url: 'https://api.deepseek.com',
  model_name: 'deepseek-v4-flash',
  api_key_env: 'DEEPSEEK_API_KEY',
  has_api_key: true,
  credential_source: 'environment',
  temperature: 0.2,
  max_tokens: 4096,
  is_default: 1,
  created_at: '2026-08-30T00:00:00Z',
  updated_at: '2026-08-30T00:00:00Z',
};

test('knowledge renders the strategy library and opens an indicator topic', async ({ page }) => {
  await mockApi(page);
  await page.goto('/knowledge');

  await expect(page.getByRole('heading', { name: '策略知识库' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'MACD' }).click();
  await expect(page).toHaveURL(/\/knowledge\?indicator=macd$/);
  await expect(page.getByRole('heading', { name: 'MACD 指数平滑异同移动平均' })).toBeVisible();
});

test('models renders configured rows and exposes the add-model interaction', async ({ page }) => {
  await mockApi(page, { 'GET /api/models': { items: [model] } });
  await page.goto('/models');

  await expect(page.locator('tbody tr:visible').filter({ hasText: 'DeepSeek V4 Flash' })).toBeVisible();
  await page.getByRole('button', { name: '新增模型' }).click();
  await expect(page.getByRole('dialog', { name: '新增模型' })).toBeVisible();
});

test('mcp market renders tools and persists a toggle through the mocked PATCH', async ({ page }) => {
  let patchBody: Record<string, unknown> | undefined;
  const tool = {
    name: '行情查询',
    local_name: 'market.quote',
    description: '读取确定性行情 fixture',
    parameters: { type: 'object', properties: { ticker: { type: 'string' } } },
    enabled: false,
  };
  await mockApi(page, {
    'GET /api/mcp/servers': { items: [{ name: 'FinQuant MCP', transport: 'http', tools: [tool] }] },
    'PATCH /api/mcp/tools/market.quote': async (route) => {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return { ...tool, enabled: Boolean(patchBody.enabled) };
    },
  });
  await page.goto('/mcp-market');

  await expect(page.getByTestId('mcp-market-page')).toContainText('FinQuant MCP');
  const toggle = page.getByRole('switch', { name: '行情查询 工具启用状态' });
  await toggle.click();
  await expect(toggle).toBeChecked();
  expect(patchBody).toEqual({ enabled: true });
});

test('alerts renders signal rules and persists the enabled-state interaction', async ({ page }) => {
  let updateBody: Record<string, unknown> | undefined;
  const rule = {
    id: 1,
    name: '茅台价格突破',
    ticker: '600519',
    signal_type: 'breakout_up',
    direction: 'bullish',
    is_enabled: true,
    created_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
  };
  await mockApi(page, {
    'GET /api/alerts/signal-types': { items: ['breakout_up'] },
    'GET /api/alerts/rules': { items: [rule] },
    'GET /api/alerts/triggers': { items: [] },
    'PUT /api/alerts/rules/1': async (route) => {
      updateBody = route.request().postDataJSON() as Record<string, unknown>;
      return { ...rule, ...updateBody };
    },
  });
  await page.goto('/alerts');

  await expect(page.getByRole('cell', { name: '茅台价格突破', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '向上突破', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: '茅台价格突破启用状态' }).click();
  expect(updateBody).toEqual({ is_enabled: false });
});

test('settings renders the system form and sends the edited PATCH payload', async ({ page }) => {
  const settings = {
    scheduler_enabled: false,
    scheduler_concurrency: 2,
    scheduler_max_targets: 20,
    scheduler_hour: 18,
    scheduler_minute: 0,
  };
  let patchBody: Record<string, unknown> | undefined;
  const response = (next = settings) => ({
    settings: next,
    metadata: { app_version: '1.0.0', editable_keys: Object.keys(settings), secrets_exposed: false },
  });
  await mockApi(page, {
    'GET /api/agents': { items: [] },
    'GET /api/settings/system': response(),
    'PATCH /api/settings/system': async (route) => {
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      return response(patchBody as typeof settings);
    },
  });
  await page.goto('/settings');

  await expect(page.getByTestId('system-settings-panel')).toBeVisible();
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: '保存并应用' }).click();
  await expect(page.getByText('系统配置已保存并应用')).toBeVisible();
  expect(patchBody).toMatchObject({ scheduler_enabled: true, scheduler_hour: 18 });
});

test('compare renders its empty contract and handles a natural-language selection attempt', async ({ page }) => {
  await mockApi(page, {
    'GET /api/instruments/workspaces': { items: [] },
    'GET /api/backtests': { items: [] },
  });
  await page.goto('/compare');

  await expect(page.getByTestId('comparison-workspace')).toBeVisible();
  await expect(page.getByText('没有满足合同的已保存研究、完成策略实验或本地组合复盘')).toBeVisible();
  await page.getByLabel('自然语言比较输入').fill('AAPL vs TSLA');
  await page.getByRole('button', { name: '创建 Compare' }).click();
  await expect(page.getByText('当前已保存记录中不足两个匹配对象；未用示例数据补齐。')).toBeVisible();
});

test('legacy thesis route renders the list and opens the create interaction', async ({ page }) => {
  const thesis = {
    id: 5,
    ticker: '600519',
    title: '贵州茅台长期质量论文',
    thesis: '品牌与现金流支撑长期质量。',
    assumptions: ['高端白酒需求保持稳定'],
    status: 'open',
    source_report_id: null,
    drift_status: 'stable',
    drift_score: 0.1,
    last_checked_at: '2026-08-30T00:00:00Z',
    updated_at: '2026-08-30T00:00:00Z',
    claims: [],
  };
  await mockApi(page, {
    'GET /api/thesis': { items: [thesis] },
    'GET /api/thesis/5': thesis,
    'GET /api/thesis/5/versions': { items: [] },
    'GET /api/thesis/5/reviews': { items: [] },
  });
  await page.goto('/thesis');

  await expect(page).toHaveURL(/\/research\?mode=thesis$/);
  await expect(page.getByText('贵州茅台长期质量论文').first()).toBeVisible();
  await page.getByRole('button', { name: '新建论文' }).click();
  await expect(page.getByRole('dialog', { name: '新建投资论文' })).toBeVisible();
});

test('analysis renders mocked quote data and opens the mocked K-line chart tab', async ({ page }) => {
  const bars = Array.from({ length: 20 }, (_, index) => ({
    day: `2026-08-${String(index + 1).padStart(2, '0')}`,
    open: 220 + index,
    high: 222 + index,
    low: 219 + index,
    close: 221 + index,
    volume: 1_000_000 + index,
  }));
  await mockApi(page, {
    'GET /api/market/quote': {
      code: 'AAPL', name: 'Apple Inc.', price: 229.35, last_close: 226.8, open: 227.1,
      high: 230.2, low: 226.4, volume: 48_000_000, amount: 10_900_000_000,
      change: 2.55, change_percent: 1.12, turnover_rate: null, pe: 31.2, pb: 42.1,
      market_cap: 3_430_000_000_000, amplitude: 1.68, timestamp: 1_788_000_000,
    },
    'GET /api/market/kline': { items: bars },
  });
  await page.goto('/analysis/AAPL');

  await expect(page.getByRole('heading', { name: 'Apple Inc.' })).toBeVisible();
  await expect(page.getByText('229.35').first()).toBeVisible();
  await page.getByRole('tab', { name: '价格' }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
});
