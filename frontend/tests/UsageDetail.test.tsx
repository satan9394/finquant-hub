// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UsageDateRangePicker from '../src/components/settings/UsageDateRangePicker';
import UsageHero from '../src/components/settings/UsageHero';
import UsageStatsTable from '../src/components/settings/UsageStatsTable';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import Settings from '../src/pages/Settings';
import type {
  UsageCostResponse,
  UsageStatsResponse,
  UsageSummaryResponse,
} from '../src/services/usageApi';
import {
  DEFAULT_USAGE_RANGE,
  isValidUsageDate,
  usageRangeDays,
  usageRangeError,
  usageRangeParams,
  type UsageRange,
} from '../src/utils/usageRange';
import {
  buildUsageHero,
  buildUsageStatsRows,
  sortUsageStatsRows,
  type UsageStatsRow,
} from '../src/utils/usageStats';

vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: () => ({ switchToArea: vi.fn(), clearAllSeries: vi.fn(), fitContent: vi.fn() }),
}));

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));

vi.mock('../src/services/api', () => ({ default: api }));

vi.mock('../src/services/settingsApi', () => ({
  getSystemSettings: vi.fn().mockResolvedValue({
    settings: { scheduler_enabled: false },
    metadata: { app_version: '1.0.0', editable_keys: ['scheduler_enabled'], secrets_exposed: false },
  }),
  updateSystemSettings: vi.fn(),
}));

vi.mock('../src/services/mcpApi', () => ({
  listMCPServerConfigs: vi.fn().mockResolvedValue([]),
  createMCPServerConfig: vi.fn(),
  updateMCPServerConfig: vi.fn(),
  deleteMCPServerConfig: vi.fn(),
  connectMCPServer: vi.fn(),
  disconnectMCPServer: vi.fn(),
}));

function wrap(node: React.ReactNode) {
  return <LanguageProvider>{node}</LanguageProvider>;
}

const summary: UsageSummaryResponse = {
  days: 3,
  start: '2026-09-01',
  end: '2026-09-03',
  session_type: null,
  items: [
    { day: '2026-09-01', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, request_count: 2 },
  ],
  total: { prompt_tokens: 300, completion_tokens: 150, total_tokens: 450, request_count: 6 },
  by_session_type: [{ session_type: 'research', total_tokens: 450, request_count: 6 }],
};

function statsItem(overrides: Partial<UsageStatsResponse['items'][number]> = {}) {
  return {
    key: 'model-a',
    request_count: 2,
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    cached_tokens: 25,
    cache_hit_rate: 25,
    avg_speed_tps: 10,
    avg_ttft_ms: 200,
    priced_models: 1,
    unpriced_models: 0,
    unpriced_total_tokens: 0,
    cost_by_currency: { CNY: 0.0004 },
    currency: 'CNY',
    mixed_currency: false,
    estimated_cost: 0.0004,
    cost_status: 'priced' as const,
    ...overrides,
  };
}

const stats: UsageStatsResponse = {
  dimension: 'model',
  days: 3,
  start: '2026-09-01',
  end: '2026-09-03',
  session_type: null,
  items: [
    statsItem(),
    statsItem({
      key: 'model-b', request_count: 1, prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
      priced_models: 0, unpriced_models: 1, unpriced_total_tokens: 15, cost_by_currency: {},
      currency: null, estimated_cost: null, cost_status: 'unpriced',
    }),
    statsItem({ key: 'model-c', request_count: 3, total_tokens: 300, estimated_cost: 0.001, cost_by_currency: { CNY: 0.001 } }),
  ],
  total: {
    request_count: 6, prompt_tokens: 410, completion_tokens: 205, total_tokens: 465,
    priced_models: 2, unpriced_models: 1, unpriced_total_tokens: 15,
    cost_by_currency: { CNY: 0.0014 }, currency: 'CNY', mixed_currency: false,
    estimated_cost: 0.0014, cost_status: 'partial',
  },
  efficiency: {
    avg_speed_tps: 20,
    avg_ttft_ms: 300,
    overall_cache_hit_rate: 41.7,
    total_saved_cost: 0.0027,
    currency: 'CNY',
  },
};

function costResponse(overrides: Partial<UsageCostResponse['total']> = {}): UsageCostResponse {
  return {
    days: 3,
    start: '2026-09-01',
    end: '2026-09-03',
    session_type: null,
    items: [],
    total: {
      prompt_tokens: 300, completion_tokens: 150, total_tokens: 450, request_count: 6,
      priced_models: 1, unpriced_models: 0, unpriced_model_names: [], unpriced_total_tokens: 0,
      cost_by_currency: { CNY: 0.0012 }, currency: 'CNY', mixed_currency: false,
      estimated_cost: 0.0012, cost_status: 'priced',
      ...overrides,
    },
  };
}

describe('usageRange helpers', () => {
  it('sends presets through the legacy days parameter and custom ranges as dates', () => {
    expect(usageRangeParams(DEFAULT_USAGE_RANGE)).toEqual({ days: 30 });
    expect(usageRangeParams({ kind: 'preset', days: 7 })).toEqual({ days: 7 });
    expect(usageRangeParams({ kind: 'custom', start: '2026-09-01', end: '2026-09-10' })).toEqual({
      start: '2026-09-01',
      end: '2026-09-10',
    });
  });

  it('accepts only real calendar dates and reports invalid custom ranges honestly', () => {
    expect(isValidUsageDate('2026-02-28')).toBe(true);
    expect(isValidUsageDate('2026-02-30')).toBe(false);
    expect(isValidUsageDate('2026-9-1')).toBe(false);
    expect(isValidUsageDate('')).toBe(false);

    expect(usageRangeError({ kind: 'custom', start: '2026-02-30', end: '2026-03-01' })).toBe(
      'settings.usage.range.invalidDate',
    );
    expect(usageRangeError({ kind: 'custom', start: '2026-03-05', end: '2026-03-01' })).toBe(
      'settings.usage.range.invalidOrder',
    );
    expect(usageRangeError({ kind: 'custom', start: '2026-03-01', end: '2026-03-05' })).toBeNull();
    expect(usageRangeError({ kind: 'preset', days: 7 })).toBeNull();
  });

  it('counts a custom range inclusively and refuses to invent days for a broken one', () => {
    expect(usageRangeDays({ kind: 'custom', start: '2026-03-01', end: '2026-03-01' })).toBe(1);
    expect(usageRangeDays({ kind: 'custom', start: '2026-03-01', end: '2026-03-05' })).toBe(5);
    expect(usageRangeDays({ kind: 'custom', start: '2026-03-05', end: '2026-03-01' })).toBeNull();
    expect(usageRangeDays({ kind: 'preset', days: 90 })).toBe(90);
  });
});

describe('buildUsageHero', () => {
  it('derives totals, window days and the daily average from the queried window', () => {
    const hero = buildUsageHero({ usage: summary, cost: costResponse(), stats });
    expect(hero).not.toBeNull();
    expect(hero!.totalTokens).toBe(450);
    expect(hero!.promptTokens).toBe(300);
    expect(hero!.completionTokens).toBe(150);
    expect(hero!.requestCount).toBe(6);
    expect(hero!.windowDays).toBe(3);
    expect(hero!.dailyAverageTokens).toBe(150);
  });

  it('picks the most active model by tokens rather than by array order', () => {
    const hero = buildUsageHero({ usage: summary, cost: costResponse(), stats });
    expect(hero!.topModelKey).toBe('model-c');
    expect(hero!.topModelTokens).toBe(300);
  });

  it('keeps unpriced and mixed-currency cost honest instead of inventing an amount', () => {
    const unpriced = buildUsageHero({
      usage: summary,
      cost: costResponse({
        currency: null, estimated_cost: null, cost_by_currency: {}, priced_models: 0,
        unpriced_models: 2, unpriced_total_tokens: 450, cost_status: 'unpriced',
      }),
      stats,
    });
    expect(unpriced!.costStatus).toBe('unpriced');
    expect(unpriced!.estimatedCost).toBeNull();
    expect(unpriced!.unpricedTotalTokens).toBe(450);

    const mixed = buildUsageHero({
      usage: summary,
      cost: costResponse({
        currency: null, estimated_cost: null, mixed_currency: true,
        cost_by_currency: { CNY: 1, USD: 2 }, cost_status: 'mixed_currency',
      }),
      stats,
    });
    expect(mixed!.costStatus).toBe('mixed_currency');
    expect(mixed!.estimatedCost).toBeNull();
  });

  it('returns null until the window is known instead of fabricating zeros', () => {
    expect(buildUsageHero({ usage: null, cost: null, stats: null })).toBeNull();
  });
});

describe('usage stats rows', () => {
  it('computes window shares and never divides by an empty window', () => {
    const rows = buildUsageStatsRows(stats);
    expect(rows.map((row) => row.rawKey)).toEqual(['model-a', 'model-b', 'model-c']);
    expect(rows[2].tokenShare).toBeCloseTo(300 / 465);
    expect(rows[0].requestShare).toBeCloseTo(2 / 6);

    const empty = buildUsageStatsRows({
      ...stats,
      items: [statsItem({ total_tokens: 0, request_count: 0 })],
      total: { ...stats.total, total_tokens: 0, request_count: 0 },
    });
    expect(empty[0].tokenShare).toBeNull();
    expect(empty[0].requestShare).toBeNull();
    expect(buildUsageStatsRows(null)).toEqual([]);
  });

  it('sorts deterministically without mutating the input and sinks unknown costs last', () => {
    const rows = buildUsageStatsRows(stats);
    const ascending = sortUsageStatsRows(rows, 'totalTokens', 'ascend');
    expect(ascending.map((row) => row.rawKey)).toEqual(['model-b', 'model-a', 'model-c']);
    expect(rows.map((row) => row.rawKey)).toEqual(['model-a', 'model-b', 'model-c']);

    const byCost = sortUsageStatsRows(rows, 'estimatedCost', 'ascend');
    expect(byCost[byCost.length - 1].rawKey).toBe('model-b');
    expect(byCost[byCost.length - 1].estimatedCost).toBeNull();

    const byCostDesc = sortUsageStatsRows(rows, 'estimatedCost', 'descend');
    expect(byCostDesc[byCostDesc.length - 1].rawKey).toBe('model-b');
  });
});

describe('UsageDateRangePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('emits the preset window immediately and shows the backend-resolved window', () => {
    const onChange = vi.fn();
    render(wrap(
      <UsageDateRangePicker
        value={DEFAULT_USAGE_RANGE}
        onChange={onChange}
        windowStart="2026-08-15"
        windowEnd="2026-09-13"
      />,
    ));

    fireEvent.click(screen.getByTestId('usage-range-preset-7'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', days: 7 });
    fireEvent.click(screen.getByTestId('usage-range-preset-90'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', days: 90 });
    expect(screen.getByTestId('usage-range-window').textContent).toContain('2026-08-15');
  });

  it('applies a valid custom range and reports an inverted one without emitting', () => {
    const onChange = vi.fn();
    const value: UsageRange = { kind: 'custom', start: '2026-09-01', end: '2026-09-10' };
    render(wrap(<UsageDateRangePicker value={value} onChange={onChange} />));

    fireEvent.change(screen.getByTestId('usage-range-start'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('usage-range-end'), { target: { value: '2026-09-05' } });
    fireEvent.click(screen.getByTestId('usage-range-apply'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'custom', start: '2026-09-01', end: '2026-09-05' });

    onChange.mockClear();
    fireEvent.change(screen.getByTestId('usage-range-end'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByTestId('usage-range-apply'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('usage-range-error').textContent).toContain('开始日期不能晚于结束日期');
  });
});

describe('UsageHero', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('renders totals, daily average, most active model and the derived cost', () => {
    render(wrap(<UsageHero data={buildUsageHero({ usage: summary, cost: costResponse(), stats })} />));

    expect(screen.getByTestId('usage-hero-total-tokens').textContent).toContain('450');
    expect(screen.getByTestId('usage-hero-requests').textContent).toContain('6');
    expect(screen.getByTestId('usage-hero-daily-average').textContent).toContain('150');
    expect(screen.getByTestId('usage-hero-window-days').textContent).toContain('3');
    expect(screen.getByTestId('usage-hero-top-model').textContent).toContain('model-c');
    expect(screen.getByTestId('usage-hero-cost').textContent).toContain('CNY 0.0012');
    expect(screen.getByTestId('usage-hero-average-speed').textContent).toContain('20.0 tok/s');
    expect(screen.getByTestId('usage-hero-average-ttft').textContent).toContain('300 ms');
    expect(screen.getByTestId('usage-hero-cache-hit-rate').textContent).toContain('41.7%');
    expect(screen.getByTestId('usage-hero-cache-savings').textContent).toContain('CNY 0.0027');
  });

  it('labels unpriced usage instead of showing a fake zero amount', () => {
    const hero = buildUsageHero({
      usage: summary,
      cost: costResponse({
        currency: null, estimated_cost: null, cost_by_currency: {}, priced_models: 0,
        unpriced_models: 1, unpriced_total_tokens: 450, cost_status: 'unpriced',
      }),
      stats,
    });
    render(wrap(<UsageHero data={hero} />));

    expect(within(screen.getByTestId('usage-hero-cost')).getByText('未配置单价')).toBeTruthy();
    expect(screen.queryByText('CNY 0')).toBeNull();
    expect(screen.getByTestId('usage-hero-unpriced-tokens').textContent).toContain('450');
  });

  it('shows an honest empty state when the window has no usage at all', () => {
    const hero = buildUsageHero({
      usage: { ...summary, total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, request_count: 0 } },
      cost: costResponse({ currency: null, estimated_cost: null, cost_status: 'none' }),
      stats: { ...stats, items: [] },
    });
    render(wrap(<UsageHero data={hero} />));
    expect(screen.getByTestId('usage-hero-empty')).toBeTruthy();
  });

  it('shows the empty state before any response arrives', () => {
    render(wrap(<UsageHero data={null} />));
    expect(screen.getByTestId('usage-hero-empty')).toBeTruthy();
  });
});

describe('UsageStatsTable', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
  });

  it('renders model rows with share and derived cost, and switches dimension on request', async () => {
    const onDimensionChange = vi.fn();
    render(wrap(
      <UsageStatsTable
        dimension="model"
        onDimensionChange={onDimensionChange}
        response={stats}
      />,
    ));

    expect(await screen.findByText('model-a')).toBeTruthy();
    expect(screen.getByText('CNY 0.0004')).toBeTruthy();
    expect(screen.getByText('未配置单价')).toBeTruthy();
    expect(screen.getByText('32.3%')).toBeTruthy();
    expect(screen.getAllByText('10.0 tok/s')).toHaveLength(3);
    expect(screen.getAllByText('200 ms')).toHaveLength(3);
    expect(screen.getAllByText('25.0%')).toHaveLength(3);

    fireEvent.click(screen.getByText('按会话类型'));
    expect(onDimensionChange).toHaveBeenCalledWith('session_type');
  });

  it('sorts rows by tokens when the column header is clicked', async () => {
    render(wrap(
      <UsageStatsTable dimension="model" onDimensionChange={vi.fn()} response={stats} />,
    ));
    await screen.findByText('model-a');

    const headers = Array.from(document.querySelectorAll('thead th'));
    const tokenHeader = headers.find((th) => th.textContent?.trim() === 'Token');
    expect(tokenHeader).toBeTruthy();
    fireEvent.click(tokenHeader as HTMLElement);

    await waitFor(() => {
      const rows = document.querySelectorAll('tbody tr.ant-table-row');
      expect(rows[0].textContent).toContain('model-b');
    });
  });

  it('shows an honest empty state and surfaces load errors', () => {
    const { unmount } = render(wrap(
      <UsageStatsTable
        dimension="model"
        onDimensionChange={vi.fn()}
        response={{ ...stats, items: [], total: { ...stats.total, total_tokens: 0, request_count: 0 } }}
      />,
    ));
    expect(screen.getByTestId('usage-stats-empty')).toBeTruthy();
    unmount();

    render(wrap(
      <UsageStatsTable
        dimension="model"
        onDimensionChange={vi.fn()}
        response={null}
        error="统计读取失败"
      />,
    ));
    expect(screen.getByText('统计读取失败')).toBeTruthy();
  });
});

describe('Settings usage panel window wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    api.get.mockReset();
  });

  it('re-queries every usage endpoint with the window chosen in the picker', async () => {
    api.get.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/usage') {
        return Promise.resolve({ data: summary });
      }
      if (url === '/usage/cost') {
        return Promise.resolve({ data: costResponse() });
      }
      if (url === '/usage/stats') {
        return Promise.resolve({
          data: { ...stats, dimension: config?.params?.dimension ?? 'model' },
        });
      }
      return Promise.resolve({ data: { items: [], total: 0 } });
    });

    render(<Settings />);
    fireEvent.click(screen.getByRole('tab', { name: 'LLM 用量' }));

    expect(await screen.findByTestId('usage-hero')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/usage', { params: { days: 30 } });
    expect(api.get).toHaveBeenCalledWith('/usage/cost', { params: { days: 30 } });
    expect(api.get).toHaveBeenCalledWith('/usage/stats', { params: { days: 30, dimension: 'model' } });
    expect(api.get).toHaveBeenCalledWith('/usage/stats', {
      params: { days: 30, dimension: 'session_type' },
    });
    // The pre-existing panels keep working inside the new layout.
    expect(screen.getByTestId('usage-trend-chart')).toBeTruthy();

    fireEvent.click(screen.getByTestId('usage-range-preset-7'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/usage', { params: { days: 7 } }));
    expect(api.get).toHaveBeenCalledWith('/usage/cost', { params: { days: 7 } });
    expect(api.get).toHaveBeenCalledWith('/usage/stats', { params: { days: 7, dimension: 'model' } });
  }, 20_000);
});
