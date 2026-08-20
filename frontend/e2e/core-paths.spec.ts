import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

type MockValue = unknown | ((route: Route) => unknown | Promise<unknown>);

const json = (route: Route, body: unknown, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
const failure = (detail: string, status = 503) => async (route: Route) => {
  await json(route, { detail }, status);
};

async function mockApi(page: Page, responses: Record<string, MockValue>) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const key = `${request.method()} ${path}`;
    const shell: Record<string, unknown> = {
      'GET /api/auth/me': { user: { id: 1, email: 'e2e@test.local', is_admin: false, local_mode: true } },
      'GET /api/models': { items: [] },
      'GET /api/notifications': { items: [], unread_count: 0 },
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
    await json(route, { detail: `Unhandled E2E API route: ${key}` }, 404);
  });
}

async function tabTo(page: Page, target: Locator, limit = 80) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus did not reach target within ${limit} Tab presses`);
}

async function expectVisibleFocus(target: Locator) {
  await expect(target).toBeFocused();
  const focus = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focus.outlineStyle).not.toBe('none');
  expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
}

const instrument = {
  symbol: 'AAPL', name: 'Apple Inc.', market: 'US', exchange: 'NASDAQ',
  currency: 'USD', asset_type: 'stock', provider: 'yahoo',
};
const provenance = {
  provider: 'Yahoo Finance', as_of: '2026-08-08T20:00:00Z', timezone: 'America/New_York',
  currency: 'USD', adjustment: 'split_adjusted', frequency: '1d', quality_flags: [],
};
const bars = Array.from({ length: 80 }, (_, index) => ({
  day: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
  open: 200 + index, high: 202 + index, low: 199 + index, close: 201 + index, volume: 1_000_000 + index,
}));

const researchResponses: Record<string, MockValue> = {
  'GET /api/instruments/workspaces': { items: [] },
  'GET /api/research/history': { items: [] },
  'GET /api/thesis': { items: [] },
  'GET /api/discussion/rooms': { items: [] },
  'GET /api/instruments/search': { ...provenance, items: [instrument] },
  'GET /api/instruments/AAPL/snapshot': {
    ...provenance,
    instrument,
    data: {
      price: 229.35, last_close: 226.8, open: 227.1, high: 230.2, low: 226.4,
      volume: 48_000_000, amount: null, change: 2.55, change_percent: 1.12,
      turnover_rate: null, pe: 31.2, pb: 42.1, market_cap: 3_430_000_000_000, amplitude: 1.68,
    },
  },
  'GET /api/instruments/AAPL/bars': { ...provenance, instrument, items: bars, indicators: {} },
  'GET /api/instruments/AAPL/fundamentals': {
    ...provenance,
    instrument,
    items: [{
      metric: 'revenue', value: 391_035_000_000, as_of: '2025-09-27', currency: 'USD',
      period_type: 'FY', provider: 'Yahoo Finance', source: 'income_statement', quality_flags: [],
    }],
  },
  'GET /api/instruments/AAPL/workspace': { symbol: 'AAPL', name: 'Apple Inc.', notes: '', evidence: [], saved: false },
};

test('research moves from an explicit empty state to sourced instrument evidence', async ({ page }) => {
  await mockApi(page, researchResponses);
  await page.goto('/research');

  await expect(page.getByText('暂无保存记录；同一标的会合并为一条持续更新的研究工作区')).toBeVisible();
  await page.getByLabel('股票代码或公司名称').fill('AAPL');
  await page.getByRole('button', { name: '搜索标的' }).click();
  await expect(page.getByText('Apple Inc.')).toBeVisible();
  await page.getByTestId('instrument-result-AAPL').click();

  await expect(page.getByRole('heading', { name: '标的研究工作区' })).toBeVisible();
  await expect(page.getByText('当前对象：Apple Inc. · AAPL')).toBeVisible();
  await expect(page.getByText('Yahoo Finance').first()).toBeVisible();
  await expect(page.getByText('数据截止 2026-08-08T20:00:00Z')).toBeVisible();
  await expect(page.getByTestId('research-charts').locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /保存研究/ })).toBeVisible();
});

test('research keeps upstream failures visible and does not fabricate a snapshot', async ({ page }) => {
  await mockApi(page, {
    'GET /api/research/history': { items: [] },
    'GET /api/thesis': { items: [] },
    'GET /api/discussion/rooms': { items: [] },
    'GET /api/instruments/AAPL/snapshot': failure('Yahoo snapshot upstream unavailable'),
    'GET /api/instruments/AAPL/bars': failure('Yahoo bars upstream unavailable'),
    'GET /api/instruments/AAPL/fundamentals': failure('Yahoo fundamentals upstream unavailable'),
    'GET /api/instruments/AAPL/workspace': failure('Research workspace unavailable'),
  });
  await page.goto('/research/AAPL');

  await expect(page.getByText('行情：Yahoo snapshot upstream unavailable')).toBeVisible();
  await expect(page.getByText('标的行情不可用')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试' }).first()).toBeVisible();
  await expect(page.getByText(/当前对象：AAPL/)).toBeVisible();
  await expect(page.getByText(/行情与盈亏已更新/)).toHaveCount(0);
});

const strategyBase: Record<string, MockValue> = {
  'GET /api/backtests': { items: [] },
  'GET /api/market/pulse': { sections: { weekly: { items: [] } } },
  'GET /api/instruments/AAPL/bars': { ...provenance, instrument, items: bars, indicators: {} },
};

const completedBacktest = (params: Record<string, unknown>) => ({
  id: 81,
  symbol: 'AAPL',
  status: 'completed',
  params,
  provenance,
  metrics: {
    total_return: 0.12, annualized_return: 0.08, benchmark_return: 0.1, excess_return: 0.02,
    max_drawdown: -0.08, sharpe_ratio: 0.7, sortino_ratio: 0.9, calmar_ratio: 1,
    information_ratio: 0.2, win_rate: 0.5, profit_factor: 1.4, turnover: 1.2, trade_count: 4,
    annualized_volatility: 0.18, annualized_downside_volatility: 0.11,
    max_drawdown_duration_periods: 12, max_drawdown_recovery_periods: 8, max_drawdown_recovered: true,
    beta: 0.8, alpha: 0.01, r_squared: 0.64, tracking_error: 0.05,
    trade_expectancy: 0.03, average_win: 0.08, average_loss: -0.04, average_holding_periods: 10,
    market_exposure: 0.65, total_commission_cost: 18, total_stamp_duty_cost: 0,
    total_slippage_cost: 14, total_trading_cost: 32, trading_cost_ratio: 0.00032,
  },
  equity_curve: [{ time: '2026-01-02', value: 100_000 }, { time: '2026-03-20', value: 112_000 }],
  benchmark_curve: [{ time: '2026-01-02', value: 100_000 }, { time: '2026-03-20', value: 110_000 }],
  drawdown_curve: [{ time: '2026-01-02', value: 0 }, { time: '2026-03-20', value: -0.02 }],
  trades: [], order_marks: [], rejected_orders: [], warnings: [],
  execution_rules: { market: 'US', t_plus_one: false, allow_short: false, price_limit_ratio: null, assumptions: [], period: '1d' },
  risk_controls: { max_drawdown_stop_pct: null, trigger_count: 0 },
});

test('strategy completes a cost-aware backtest and exposes provenance', async ({ page }) => {
  let params: Record<string, unknown> = {};
  await mockApi(page, {
    ...strategyBase,
    'POST /api/backtests': async (route) => {
      params = route.request().postDataJSON() as Record<string, unknown>;
      return { id: 81, symbol: 'AAPL', status: 'queued', params };
    },
    'GET /api/backtests/81': () => completedBacktest(params),
  });
  await page.goto('/strategy-lab/ma-crossover?symbol=AAPL');

  await expect(page.getByText('暂无已保存实验')).toBeVisible();
  await page.getByRole('button', { name: '运行回测' }).click();
  await expect(page.getByRole('heading', { name: '回测结论摘要' })).toBeVisible();
  await expect(page.getByTestId('metric-total-return')).toContainText('+12.00%');
  await expect(page.getByTestId('backtest-results-charts').locator('canvas').first()).toBeVisible();
  await expect(page.getByText('Yahoo Finance').last()).toBeVisible();
  await expect(page.getByRole('button', { name: '保存实验' })).toBeVisible();
});

test('strategy renders a recoverable raw failure instead of a result', async ({ page }) => {
  let failedParams: Record<string, unknown> = {};
  const failed = () => ({
    id: 82, symbol: 'AAPL', status: 'failed', params: failedParams,
    error_message: 'Yahoo upstream timeout; no market bars were returned',
  });
  await mockApi(page, {
    ...strategyBase,
    'POST /api/backtests': async (route) => {
      failedParams = route.request().postDataJSON() as Record<string, unknown>;
      return failed();
    },
    'GET /api/backtests/82': failed,
  });
  await page.goto('/strategy-lab/ma-crossover?symbol=AAPL');
  await page.getByRole('button', { name: '运行回测' }).click();

  await expect(page.getByText('回测未完成')).toBeVisible();
  await expect(page.getByText('Yahoo upstream timeout; no market bars were returned')).toBeVisible();
  await expect(page.getByTestId('backtest-completed')).toHaveCount(0);
});

const portfolioPnl = {
  total_cost: 25_000, total_market_value: 28_000, total_pnl: 3_000, total_pnl_pct: 12,
  positions: [
    { id: 1, ticker: '600519', name: '贵州茅台', shares: 10, avg_cost: 1500, current_price: 1600, market_value: 16_000, cost: 15_000, pnl: 1000, pnl_pct: 6.67 },
    { id: 2, ticker: '000001', name: '平安银行', shares: 1000, avg_cost: 10, current_price: 12, market_value: 12_000, cost: 10_000, pnl: 2000, pnl_pct: 20 },
  ],
};
const portfolioRisk = {
  strategy: 'ma_crossover', optimizer: 'equal_weight', optimization_lookback: 60,
  weights: { '600519.SS@1d': 0.7, '000001.SZ@1d': 0.3 },
  metrics: { total_return: 0.12, benchmark_return: 0.1, excess_return: 0.02, max_drawdown: -0.08, turnover: 1.25, trade_count: 6, win_rate: 0.5, profit_factor: 1.4 },
  equity_curve: [{ time: '2026-01-01', value: 25_000 }, { time: '2026-02-01', value: 28_000 }],
  benchmark_curve: [{ time: '2026-01-01', value: 25_000 }, { time: '2026-02-01', value: 27_500 }],
  assets: [
    { asset_id: '600519.SS@1d', symbol: '600519.SS', period: '1d', weight: 0.7, provenance: { provider: 'akshare', as_of: '2026-02-01', market: 'CN', currency: 'CNY', quality_flags: [] } },
    { asset_id: '000001.SZ@1d', symbol: '000001.SZ', period: '1d', weight: 0.3, provenance: { provider: 'sina', as_of: '2026-02-01', market: 'CN', currency: 'CNY', quality_flags: ['unadjusted_prices'] } },
  ],
  risk_xray: {
    concentration: { hhi: 0.58, effective_asset_count: 1.724, largest_weight: 0.7, top3_weight: 1, level: 'high' },
    drawdown: { max: -0.08, current: -0.02 },
    tail_risk: { status: 'ok', observations: 30, confidence: 0.95, var: 0.025, expected_shortfall: 0.04, var_amount: 700, expected_shortfall_amount: 1120 },
    diversification: {
      status: 'ok', observations: 30, average_correlation: 0.35, benefit: 0.2,
      correlation_matrix: { status: 'ok', observations: 30, asset_ids: ['600519.SS@1d', '000001.SZ@1d'], values: [[1, 0.35], [0.35, 1]] },
      risk_contribution: { status: 'ok', observations: 30, minimum_required: 20, method: 'sample_covariance_component_share', portfolio_volatility: 0.012, items: [{ asset_id: '600519.SS@1d', weight: 0.7, contribution: 0.82 }, { asset_id: '000001.SZ@1d', weight: 0.3, contribution: 0.18 }] },
    },
  },
  warnings: [],
};

test('portfolio reaches sourced read-only risk evidence', async ({ page }) => {
  await mockApi(page, {
    'GET /api/portfolio': { items: [{ id: 1, name: '核心组合', created_at: '2026-01-01' }] },
    'GET /api/portfolio/1/pnl': portfolioPnl,
    'POST /api/backtests/portfolio': portfolioRisk,
  });
  await page.goto('/portfolio');

  await expect(page.getByText('行情与盈亏已更新')).toBeVisible();
  await page.getByRole('button', { name: /运行组合风险模拟/ }).click();
  await expect(page.getByText('首要关注：持仓集中度高')).toBeVisible();
  await expect(page.getByText('市场 2/2 · 币种 2/2 · 行业 0/2')).toBeVisible();
  await expect(page.getByRole('img', { name: /组合与基准权益曲线/ }).locator('canvas')).toBeVisible();
  await expect(page.getByText('akshare')).toBeVisible();
  await expect(page.getByText(/压力测试仍不可用/)).toBeVisible();
});

test('portfolio KPI values remain inside their cards at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, {
    'GET /api/portfolio': { items: [{ id: 1, name: '核心组合', created_at: '2026-01-01' }] },
    'GET /api/portfolio/1/pnl': portfolioPnl,
  });
  await page.goto('/portfolio');
  await expect(page.getByText('行情与盈亏已更新')).toBeVisible();

  const cards = page.locator('.portfolio-summary-card');
  await expect(cards).toHaveCount(4);
  for (let index = 0; index < await cards.count(); index += 1) {
    const cardBox = await cards.nth(index).boundingBox();
    const valueBox = await cards.nth(index).locator('.ant-statistic-content').boundingBox();
    expect(cardBox).not.toBeNull();
    expect(valueBox).not.toBeNull();
    expect((valueBox?.x ?? 0) + (valueBox?.width ?? 0)).toBeLessThanOrEqual((cardBox?.x ?? 0) + (cardBox?.width ?? 0) + 1);
  }
});

test('portfolio identifies each failed source and offers retry', async ({ page }) => {
  await mockApi(page, {
    'GET /api/portfolio': async (route) => {
      await json(route, { detail: '组合接口不可用' }, 503);
      return undefined;
    },
  });
  await page.goto('/portfolio');

  await expect(page.getByText('组合列表：组合接口不可用')).toBeVisible();
  await expect(page.getByText('组合汇总：组合接口不可用')).toBeVisible();
  await expect(page.getByText('资产配置：组合接口不可用')).toBeVisible();
  await expect(page.getByRole('button', { name: /重\s*试/ })).toHaveCount(3);
  await expect(page.getByText('行情与盈亏已更新')).toHaveCount(0);
});

test('core task controls are reachable with a visible keyboard focus', async ({ page }) => {
  await mockApi(page, {
    ...researchResponses,
    ...strategyBase,
    'GET /api/portfolio': { items: [{ id: 1, name: '核心组合', created_at: '2026-01-01' }] },
    'GET /api/portfolio/1/pnl': portfolioPnl,
  });

  await page.goto('/research');
  const researchInput = page.getByLabel('股票代码或公司名称');
  await tabTo(page, researchInput);
  await expectVisibleFocus(researchInput);
  await researchInput.fill('AAPL');
  await page.keyboard.press('Tab');
  const searchButton = page.getByRole('button', { name: '搜索标的' });
  await expectVisibleFocus(searchButton);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('instrument-result-AAPL')).toBeVisible();

  await page.goto('/strategy-lab/ma-crossover?symbol=AAPL');
  const runButton = page.getByRole('button', { name: '运行回测' });
  await tabTo(page, runButton);
  await expectVisibleFocus(runButton);

  await page.goto('/portfolio');
  const createButton = page.getByRole('button', { name: /新建组合/ });
  await tabTo(page, createButton);
  await expectVisibleFocus(createButton);
});

test('core paths do not cover or horizontally overflow at a 200% equivalent viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await mockApi(page, {
    ...researchResponses,
    ...strategyBase,
    'GET /api/portfolio': { items: [{ id: 1, name: '核心组合', created_at: '2026-01-01' }] },
    'GET /api/portfolio/1/pnl': portfolioPnl,
  });

  const paths = ['/research/AAPL', '/strategy-lab/ma-crossover?symbol=AAPL', '/portfolio'];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main, [data-testid="ma-crossover-lab"]').first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  }
});
