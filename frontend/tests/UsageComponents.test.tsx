// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UsageRecordsPanel from '../src/components/settings/UsageRecordsPanel';
import UsageTrendChart from '../src/components/settings/UsageTrendChart';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { usageToAreaData, type UsageDayItem } from '../src/utils/usageChart';

const chart = vi.hoisted(() => ({ switchToArea: vi.fn(), useLightweightCharts: vi.fn() }));
const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: (...args: unknown[]) => {
    chart.useLightweightCharts(...args);
    return { switchToArea: chart.switchToArea, clearAllSeries: vi.fn(), fitContent: vi.fn() };
  },
}));

vi.mock('../src/services/api', () => ({ default: { get: api.get } }));

const daily: UsageDayItem[] = [
  { day: '2026-09-01', prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, request_count: 2 },
  { day: '2026-09-02', prompt_tokens: 200, completion_tokens: 50, total_tokens: 250, request_count: 3 },
];

function wrap(node: React.ReactNode) {
  return <LanguageProvider>{node}</LanguageProvider>;
}

describe('usageToAreaData', () => {
  it('maps valid daily totals to area points keyed by UTC date', () => {
    expect(usageToAreaData(daily)).toEqual([
      { time: '2026-09-01', value: 150 },
      { time: '2026-09-02', value: 250 },
    ]);
  });

  it('drops malformed days and non-finite/negative totals without fabricating values', () => {
    const input: UsageDayItem[] = [
      { day: 'nope', prompt_tokens: 0, completion_tokens: 0, total_tokens: 5, request_count: 1 },
      { day: '2026-09-03', prompt_tokens: 0, completion_tokens: 0, total_tokens: Number.NaN, request_count: 1 },
      { day: '2026-09-04', prompt_tokens: 0, completion_tokens: 0, total_tokens: -1, request_count: 1 },
    ];
    expect(usageToAreaData(input)).toEqual([]);
  });
});

describe('UsageTrendChart', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('switches the shared hook to the mapped total-token area series', () => {
    render(wrap(<UsageTrendChart items={daily} />));
    expect(screen.getByTestId('usage-trend-chart').style.height).toBe('260px');
    expect(chart.useLightweightCharts).toHaveBeenCalledWith(
      { theme: 'light', autoSize: true, height: 260 }, expect.any(Object),
    );
    expect(chart.switchToArea).toHaveBeenLastCalledWith([
      { time: '2026-09-01', value: 150 },
      { time: '2026-09-02', value: 250 },
    ]);
  });

  it('shows an honest empty placeholder with no chart when there are no valid points', () => {
    render(wrap(<UsageTrendChart items={[]} />));
    expect(screen.getByText('暂无用量数据')).toBeTruthy();
    expect(screen.queryByTestId('usage-trend-chart')).toBeNull();
    expect(chart.switchToArea).not.toHaveBeenCalled();
  });
});

describe('UsageRecordsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('fetches session-level records and renders grouped columns (time/model/total/conversation)', async () => {
    api.get.mockResolvedValue({
      data: {
        items: [
          {
            id: 1, session_type: 'research', model_name: 'deepseek-test',
            conversation_id: null, prompt_tokens: 10, completion_tokens: 5,
            total_tokens: 15, created_at: '2026-09-02 08:00:00',
          },
          {
            id: 2, session_type: 'chat', model_name: null,
            conversation_id: 42, prompt_tokens: 20, completion_tokens: 10,
            total_tokens: 30, created_at: '2026-09-01 09:30:00',
          },
        ],
        total: 2,
      },
    });

    render(wrap(<UsageRecordsPanel />));

    expect(api.get).toHaveBeenCalledWith('/usage/records', { params: { limit: 50 } });
    expect(await screen.findByText('2026-09-02 08:00:00')).toBeTruthy();
    expect(screen.getByText('deepseek-test')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    // null model_name and null conversation_id both render a "-" placeholder.
    expect(screen.getAllByText('-').length).toBe(2);
    expect(screen.getByText('#42')).toBeTruthy();
    expect(screen.getByText(/共 2 条记录/)).toBeTruthy();
  });

  it('shows an honest empty state when the backend returns no records', async () => {
    api.get.mockResolvedValue({ data: { items: [], total: 0 } });
    render(wrap(<UsageRecordsPanel />));
    expect(await screen.findByText('暂无用量数据')).toBeTruthy();
  });

  it('surfaces a load error without crashing', async () => {
    api.get.mockRejectedValue(new Error('boom'));
    render(wrap(<UsageRecordsPanel />));
    expect(await screen.findByText('boom')).toBeTruthy();
  });
});