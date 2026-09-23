import { expect, type ConsoleMessage, type Page, type Route } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:8000';

export type FixtureValue = unknown | ((route: Route) => unknown | Promise<unknown>);

export const instrument = {
  symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE',
  currency: 'CNY', asset_type: 'stock',
};

export const provenance = {
  provider: 'eastmoney', as_of: '2026-08-31T15:00:00+08:00', timezone: 'Asia/Shanghai',
  currency: 'CNY', adjustment: null, frequency: '1d', quality_flags: [],
};

const latestChip = {
  date: '2026-08-31', profit_ratio: 0.625, average_cost: 1480.25,
  cost_90: { low: 1400, high: 1600, concentration: 0.1 },
  cost_70: { low: 1450, high: 1550, concentration: 0.05 }, chip_peak: null,
};

const shellFixtures: Record<string, FixtureValue> = {
  'GET /api/auth/me': { user: { id: 1, email: 'backlog-026@test.local', is_admin: false, local_mode: true } },
  'GET /api/models': { items: [] },
  'GET /api/notifications': { items: [], unread_count: 0 },
  'GET /api/instruments/workspaces': { items: [] },
  'GET /api/research/history': { items: [] },
  'GET /api/thesis': { items: [] },
  'GET /api/discussion/rooms': { items: [] },
  'GET /api/backtests': { items: [] },
  'GET /api/portfolio': { items: [] },
  'GET /api/portfolio/paper': { items: [] },
  'GET /api/alerts/signal-types': { items: [] },
  'GET /api/alerts/rules': { items: [] },
  'GET /api/alerts/triggers': { items: [] },
  'GET /api/dashboard/stats': {
    model_count: 2, conversation_count: 3, discussion_count: 4, message_count: 5,
    recent_conversations: [], recent_rooms: [],
  },
  'GET /api/dashboard/decision-inbox': {
    engine_version: 'decision-inbox/v1', generated_at: '2026-08-31T15:00:00+08:00',
    items: [], total: 0,
  },
  'GET /api/dashboard/news': {
    keyword: '中国 A股 港股 美股 财经', queried_at: '2026-08-31T15:00:00+08:00',
    as_of: '2026-08-31T15:00:00+08:00', providers_attempted: ['google_news'],
    providers_used: ['google_news'], errors: {}, data_status: 'OK',
    news: [{
      title: '财经市场简报', source: '公开来源', published_at: '2026-08-31',
      url: 'https://example.test/news', snippet: '确定性市场摘要', provider: 'google_news',
    }],
  },
  'GET /api/market/pulse': {
    market: 'cn', scope: 'public_market_dimensions', status: 'ok', sources: ['eastmoney'],
    as_of: '2026-08-31T15:00:00+08:00',
    sections: {
      breadth: { status: 'ok', advancers: 3210, decliners: 1800 },
      movers: { status: 'ok', gainers: [], decliners: [] },
      industry: { status: 'ok', items: [] }, concept: { status: 'ok', items: [] },
      sector_flow: { status: 'ok', items: [] }, stock_flow: { status: 'ok', items: [] },
      weekly: { status: 'ok', items: [] }, popular: { status: 'ok', items: [] },
    },
  },
  'GET /api/market/themes': {
    keyword: '', category: '', expanded_terms: [], sort_by: 'change', source: ['eastmoney'],
    scope: 'public_board_catalog_and_constituents', status: 'ok',
    as_of: '2026-08-31T15:00:00+08:00', matched_theme_count: 0, returned_theme_count: 0,
    catalog: [], coverage: {}, themes: [], candidates: [],
  },
};

export const researchFixtures: Record<string, FixtureValue> = {
  'GET /api/instruments/600519/snapshot': {
    ...provenance, instrument,
    data: {
      price: 1500, last_close: 1490, open: 1495, high: 1510, low: 1480,
      volume: 1000, amount: 1_000_000, change: 10, change_percent: 0.67,
      turnover_rate: 0.2, pe: 20, pb: 8, market_cap: 1_000_000_000, amplitude: 2,
    },
  },
  'GET /api/instruments/600519/bars': { ...provenance, instrument, items: [], indicators: {} },
  'GET /api/instruments/600519/fundamentals': { ...provenance, instrument, items: [] },
  'GET /api/instruments/600519/workspace': {
    symbol: '600519', name: '贵州茅台', notes: '', evidence: [], saved: false,
  },
  'GET /api/instruments/600519/chip-distribution': {
    ...provenance, provider: 'akshare', symbol: '600519', source: 'stock_cyq_em',
    methodology: 'akshare_cyq_calculator_120_day_turnover_decay', latest: latestChip,
    items: [{ ...latestChip, date: '2026-08-28', profit_ratio: 0.6, average_cost: 1470 }, latestChip],
  },
  'GET /api/instruments/600519/money-flow': (route) => {
    const period = new URL(route.request().url()).searchParams.get('period') === '120d' ? '120d' : 'minute';
    return {
      ticker: '600519', period, source: period === 'minute' ? 'eastmoney.push2' : 'eastmoney.push2his',
      as_of: period === 'minute' ? '2026-08-31 14:59' : '2026-08-31', quality: 'DIRECT',
      main_net: period === 'minute' ? 120_000 : 150_000, large_net: 30_000,
      medium_net: 20_000, small_net: -10_000,
      items: period === 'minute'
        ? [{ time: '2026-08-31 14:59', main_net: 120_000, super_large_net: 80_000, large_net: 30_000, medium_net: 20_000, small_net: -10_000 }]
        : [{ date: '2026-08-31', main_net: 150_000, super_large_net: 90_000, large_net: 40_000, medium_net: 10_000, small_net: -5_000 }],
    };
  },
  'GET /api/instruments/600519/dragon-tiger': (route) => {
    const date = new URL(route.request().url()).searchParams.get('date');
    const historical = date === '2026-08-20';
    return {
      ticker: '600519', date, source: 'eastmoney.datacenter-web', quality: 'DIRECT',
      items: historical ? [{
        code: '600519', name: '贵州茅台', date: '2026-08-19', reason: '历史上榜原因',
        net: -90, unit: 'CNY_10K', top5_buy: [], top5_sell: [],
      }] : [{
        code: '600519', name: '贵州茅台', date: '2026-08-28', reason: '日涨幅偏离值达7%',
        net: 120, unit: 'CNY_10K',
        top5_buy: [{ name: '机构专用', buy: 300, sell: 100, net: 200, unit: 'CNY_10K' }],
        top5_sell: [],
      }, {
        code: '600519', name: '贵州茅台', date: '2026-08-19', reason: '历史上榜原因',
        net: -90, unit: 'CNY_10K', top5_buy: [], top5_sell: [],
      }],
    };
  },
};

export const limitPoolFixture = (route: Route) => {
  const url = new URL(route.request().url());
  const date = url.searchParams.get('date') ?? '2026-08-31';
  const pool = url.searchParams.get('pool') === 'limit_down' ? 'limit_down' : 'limit_up';
  return {
    date: date.replaceAll('-', ''), pool, source: 'eastmoney.push2ex', quality: 'DIRECT',
    items: [{
      code: pool === 'limit_up' ? '600519' : '000001',
      name: pool === 'limit_up' ? '贵州茅台' : '平安银行',
      limit_up_count: pool === 'limit_up' ? 2 : null, seal_amount: 12_345_678,
      break_times: pool === 'limit_up' ? 1 : null, industry: '金融',
      limit_stat: pool === 'limit_up' ? '3天2板' : '',
    }],
  };
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function mockExternalApi(page: Page, overrides: Record<string, FixtureValue> = {}) {
  const externalRequests: string[] = [];
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('finquant_theme', 'light');
    localStorage.setItem('finquant_lang', 'zh');
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== BASE_URL) {
      externalRequests.push(request.url());
      await route.abort('blockedbyclient');
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    if (url.pathname === '/api/health') {
      await route.continue();
      return;
    }
    if (url.pathname === '/api/notifications/stream') {
      await route.fulfill({
        status: 200,
        headers: { 'cache-control': 'no-cache', 'content-type': 'text/event-stream; charset=utf-8' },
        body: 'event: heartbeat\ndata: {}\n\n',
      });
      return;
    }

    const key = `${request.method()} ${url.pathname}`;
    const value = key in overrides ? overrides[key] : shellFixtures[key];
    if (value !== undefined) {
      const resolved = typeof value === 'function' ? await value(route) : value;
      if (resolved !== undefined) await json(route, resolved);
      return;
    }
    await json(route, { items: [], detail: `Deterministic BACKLOG-026 fixture: ${key}` });
  });
  return externalRequests;
}

export function monitorBrowser(page: Page, includeConsole = false) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (includeConsole) {
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  return errors;
}

export async function expectHealthyPage(page: Page, errors: string[], externalRequests: string[]) {
  await expect(page.locator('.vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveText('');
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
}
