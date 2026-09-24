import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

import { fulfillSSE, mockApi, type MockValue } from './helpers';

test.describe.configure({ mode: 'serial' });

const chatSession = {
  id: 58,
  title: '遥测回归会话',
  mode: 'single',
  role_preset: 'value_investor',
  model_id: null,
  status: 'active',
  created_at: '2026-09-23T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z',
  message_count: 0,
};

const chatAgents = [{
  id: 1,
  name: '价值投资官',
  role_key: 'value_investor',
  avatar: 'value',
  system_prompt: 'deterministic E2E fixture',
  model_id: null,
  is_preset: 1,
  created_at: '2026-09-23T00:00:00Z',
}];

const reportedMetrics = {
  model: 'deepseek-e2e',
  ttft_ms: 321,
  speed_tps: 45.5,
  prompt_tokens: 1500,
  cached_tokens: 600,
  cache_hit_rate: 40,
  completion_tokens: 220,
  reasoning_tokens: 80,
  context_used: 1720,
  role_key: 'value_investor',
};

const settingsSystem = {
  settings: {
    scheduler_enabled: false,
    scheduler_concurrency: 2,
    scheduler_max_targets: 20,
    scheduler_hour: 18,
    scheduler_minute: 0,
  },
  metadata: {
    app_version: 'e2e',
    editable_keys: ['scheduler_enabled', 'scheduler_hour'],
    secrets_exposed: false,
  },
};

const usageTotals = {
  prompt_tokens: 1500,
  completion_tokens: 320,
  total_tokens: 1820,
  request_count: 2,
};

const usageCostTotal = {
  ...usageTotals,
  priced_models: 1,
  unpriced_models: 0,
  unpriced_model_names: [],
  unpriced_total_tokens: 0,
  cost_by_currency: { USD: 0.42 },
  currency: 'USD',
  mixed_currency: false,
  estimated_cost: 0.42,
  cost_status: 'priced',
};

const usageStatsTotal = {
  ...usageTotals,
  cached_tokens: 600,
  cache_hit_rate: 40,
  avg_speed_tps: 45.5,
  avg_ttft_ms: 321,
  priced_models: 1,
  unpriced_models: 0,
  unpriced_total_tokens: 0,
  cost_by_currency: { USD: 0.42 },
  currency: 'USD',
  mixed_currency: false,
  estimated_cost: 0.42,
  cost_status: 'priced',
};

type RequestedRange = { path: string; params: Record<string, string> };

function recordRange(route: Route, requestedRanges: RequestedRange[]) {
  const url = new URL(route.request().url());
  requestedRanges.push({
    path: url.pathname,
    params: Object.fromEntries(url.searchParams.entries()),
  });
  return url;
}

function usageRange(url: URL) {
  const params = url.searchParams;
  const start = params.get('start') ?? '2026-08-25';
  const end = params.get('end') ?? '2026-09-23';
  const days = params.has('days')
    ? Number(params.get('days'))
    : Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return { start, end, days };
}

function usageStatsResponse(route: Route, requestedRanges: RequestedRange[]) {
  const url = recordRange(route, requestedRanges);
  const { start, end, days } = usageRange(url);
  const dimension = url.searchParams.get('dimension') === 'session_type' ? 'session_type' : 'model';
  const isMixedWindow = url.searchParams.get('days') === '30';
  const efficiency = isMixedWindow
    ? {
      avg_speed_tps: 45.5,
      avg_ttft_ms: 321,
      overall_cache_hit_rate: 40,
      total_saved_cost: null,
      currency: 'MIXED',
    }
    : {
      avg_speed_tps: 45.5,
      avg_ttft_ms: 321,
      overall_cache_hit_rate: 40,
      total_saved_cost: 0.125,
      currency: 'USD',
    };
  const item = {
    key: dimension === 'model' ? 'claude-sonnet-e2e' : 'research',
    request_count: usageTotals.request_count,
    prompt_tokens: usageTotals.prompt_tokens,
    completion_tokens: usageTotals.completion_tokens,
    total_tokens: usageTotals.total_tokens,
    cached_tokens: 600,
    cache_hit_rate: 40,
    avg_speed_tps: 45.5,
    avg_ttft_ms: 321,
    priced_models: 1,
    unpriced_models: 0,
    unpriced_total_tokens: 0,
    cost_by_currency: { USD: 0.42 },
    currency: 'USD',
    mixed_currency: false,
    estimated_cost: 0.42,
    cost_status: 'priced',
  };
  return {
    dimension,
    days,
    start,
    end,
    session_type: null,
    items: [item],
    total: usageStatsTotal,
    ...(dimension === 'model' ? { efficiency } : {}),
  };
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
  await testInfo.attach('browser-final-state.png', {
    path,
    contentType: 'image/png',
  });
}

test('Chat streams telemetry, opens its detail popover, and updates the context budget', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  let sentBody: Record<string, unknown> | undefined;

  await mockApi(page, {
    'GET /api/agents': { items: chatAgents },
    'GET /api/chat/sessions': { items: [chatSession] },
    'GET /api/chat/sessions/58/messages': { items: [] },
    'POST /api/chat/sessions/58/messages': async (route) => {
      sentBody = route.request().postDataJSON() as Record<string, unknown>;
      await fulfillSSE(route, [
        `event: llm_metrics\ndata: ${JSON.stringify(reportedMetrics)}`,
        'event: token\ndata: {"delta":"遥测可见"}',
        'event: done\ndata: {"message_id":5801,"token_count":1800}',
        '',
      ].join('\n\n'));
    },
  });

  await page.goto('/research?mode=fast');
  await page.getByText(chatSession.title, { exact: true }).click();
  const input = page.getByLabel('输入消息…（Shift+Enter 换行）');
  const budget = page.locator('[role="progressbar"][aria-valuetext]');

  await input.fill('中国市场');
  await expect(budget).toHaveAttribute('aria-valuenow', '4');
  await page.getByRole('button').filter({ hasText: /^发送$/ }).click();

  await expect(page.getByText('遥测可见', { exact: true })).toBeVisible();
  await expect(page.getByText(/45\.5 tok\/s/)).toBeVisible();
  await expect(page.getByText('321ms')).toBeVisible();
  await expect(page.getByText('40.0%')).toBeVisible();
  expect(sentBody).toEqual({ content: '中国市场' });

  const badge = page.getByRole('button', { name: /deepseek-e2e/ });
  await expect(badge).toBeVisible();
  expect(await badge.getAttribute('style')).toContain('--fq-border');
  await badge.hover();
  const detail = page.locator('.ant-popover:visible').last();
  await expect(detail).toContainText('1,500');
  await expect(detail).toContainText('600');
  await expect(detail).toContainText('220');
  await expect(detail).toContainText('80');
  await badge.click();
  await expect(detail).toBeVisible();

  await input.fill('中'.repeat(12_000));
  await expect(budget).toHaveAttribute('aria-valuenow', '12000');
  await expect(budget).toHaveAttribute('aria-valuetext', /75%/);
  expect(await budget.locator(':scope > div').getAttribute('style')).toContain('--fq-system-warning');

  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});

test('Research renders distinct per-agent telemetry and keeps unavailable speed unknown', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const researchMetrics = {
    model: 'claude-sonnet-e2e',
    ttft_ms: 215,
    speed_tps: 31.2,
    prompt_tokens: 640,
    cached_tokens: 64,
    cache_hit_rate: 10,
    completion_tokens: 120,
    reasoning_tokens: 0,
    context_used: 760,
    role_key: 'business_analyst',
  };
  const unpricedMetrics = {
    ...researchMetrics,
    model: 'unknown-price-e2e',
    ttft_ms: null,
    speed_tps: null,
    role_key: 'risk_assessor',
  };
  let requestedTicker = '';

  await mockApi(page, {
    'GET /api/research/history': { items: [] },
    'POST /api/research': async (route) => {
      requestedTicker = String(route.request().postDataJSON().ticker);
      await fulfillSSE(route, [
        'event: report_started\ndata: {"report_id":581}',
        `event: llm_metrics\ndata: ${JSON.stringify(researchMetrics)}`,
        'event: agent_started\ndata: {"agent":"business_analyst"}',
        `event: llm_metrics\ndata: ${JSON.stringify(unpricedMetrics)}`,
        'event: agent_completed\ndata: {"agent":"business_analyst"}',
        'event: agent_started\ndata: {"agent":"risk_assessor"}',
        'event: agent_completed\ndata: {"agent":"risk_assessor"}',
        'event: done\ndata: {"report":{"company_name":"贵州茅台","ticker":"600519","executive_summary":"确定性研究样例"},"quality":"audited","agent_results":{}}',
        '',
      ].join('\n\n'));
    },
  });

  await page.goto('/research?mode=deep');
  await page.getByLabel('输入股票代码，如 600519').fill('600519');
  await page.getByRole('button', { name: '开始研究' }).click();

  const businessMetrics = page.getByTestId('research-agent-telemetry-business_analyst');
  const riskMetrics = page.getByTestId('research-agent-telemetry-risk_assessor');
  await expect(businessMetrics.getByRole('button', { name: /claude-sonnet-e2e/ })).toBeVisible();
  await expect(businessMetrics).toContainText('31.2 tok/s');
  await expect(businessMetrics).toContainText('215ms');
  await expect(riskMetrics.getByRole('button', { name: /unknown-price-e2e/ })).toBeVisible();
  await expect(riskMetrics).toContainText('— tok/s');
  await expect(riskMetrics).not.toContainText('0 tok/s');
  await expect(riskMetrics).not.toContainText('0ms');
  await expect(page.getByText('确定性研究样例')).toBeVisible();
  expect(requestedTicker).toBe('600519');
  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});

test('Settings usage ranges refresh telemetry totals, savings, and mixed-currency state', async ({ page }, testInfo) => {
  const browserErrors = watchBrowserErrors(page);
  const requestedRanges: RequestedRange[] = [];

  const responses: Record<string, MockValue> = {
    'GET /api/agents': { items: [] },
    'GET /api/settings/system': settingsSystem,
    'GET /api/model-pricing': { items: [] },
    'GET /api/usage/records': { items: [], total: 0 },
    'GET /api/usage': (route) => {
      const url = recordRange(route, requestedRanges);
      const { start, end, days } = usageRange(url);
      return {
        days,
        start,
        end,
        session_type: null,
        items: [{ day: end, ...usageTotals }],
        total: usageTotals,
        by_session_type: [{ session_type: 'research', total_tokens: usageTotals.total_tokens, request_count: 2 }],
      };
    },
    'GET /api/usage/cost': (route) => {
      const url = recordRange(route, requestedRanges);
      const { start, end, days } = usageRange(url);
      return {
        days,
        start,
        end,
        session_type: null,
        items: [{
          model_name: 'claude-sonnet-e2e',
          ...usageTotals,
          priced: true,
          currency: 'USD',
          input_per_1m: 3,
          output_per_1m: 15,
          price_source: 'manual',
          estimated_cost: 0.42,
        }],
        total: usageCostTotal,
      };
    },
    'GET /api/usage/stats': (route) => usageStatsResponse(route, requestedRanges),
  };
  await mockApi(page, responses);
  await page.goto('/settings');
  await page.getByRole('tab', { name: /用量/ }).click();

  const hero = page.getByTestId('usage-hero');
  await expect(hero).toBeVisible();
  await page.getByTestId('usage-range-preset-7').click();
  await expect(page.getByTestId('usage-hero-window-days')).toHaveText('7');
  await expect(page.getByTestId('usage-hero-cache-savings')).toContainText('USD 0.125');
  await expect.poll(() => requestedRanges.some(({ path, params }) => path === '/api/usage' && params.days === '7')).toBe(true);

  await page.getByTestId('usage-range-preset-30').click();
  await expect(page.getByTestId('usage-hero-window-days')).toHaveText('30');
  await expect(page.getByTestId('usage-hero-cache-savings')).toContainText('多币种，无法合计');

  const start = '2026-09-01';
  const end = '2026-09-15';
  await page.getByTestId('usage-range-custom-toggle').click();
  await page.getByTestId('usage-range-start').fill(start);
  await page.getByTestId('usage-range-end').fill(end);
  await page.getByTestId('usage-range-apply').click();
  await expect(page.getByTestId('usage-range-window')).toContainText(start);
  await expect(page.getByTestId('usage-range-window')).toContainText(end);
  await expect.poll(() => requestedRanges.some(({ path, params }) => (
    path === '/api/usage/cost' && params.start === start && params.end === end
  ))).toBe(true);
  await expect(page.getByTestId('usage-hero-cache-savings')).toContainText('USD 0.125');

  expect(browserErrors).toEqual([]);
  await attachScreenshot(page, testInfo);
});
