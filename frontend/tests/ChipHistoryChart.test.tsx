// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChipHistoryChart from '../src/components/ChipHistoryChart';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import type { ChipDistributionItem } from '../src/types/research';
import type { ChipSeriesField } from '../src/utils/chipChart';

const chart = vi.hoisted(() => ({ switchToArea: vi.fn(), useLightweightCharts: vi.fn() }));

vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: (...args: unknown[]) => {
    chart.useLightweightCharts(...args);
    return { switchToArea: chart.switchToArea };
  },
}));

const items: ChipDistributionItem[] = [{
  date: '2026-08-31', profit_ratio: 0.625, average_cost: 1480.25,
  cost_90: { low: 1400, high: 1600, concentration: 0.1 },
  cost_70: { low: 1450, high: 1550, concentration: 0.05 }, chip_peak: null,
}];

function content(data = items, field: ChipSeriesField = 'profit_ratio', height?: number) {
  return <LanguageProvider><ChipHistoryChart items={data} field={field} height={height} /></LanguageProvider>;
}

describe('ChipHistoryChart', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('renders percentage display data and switches to unscaled costs without changing the source', () => {
    const view = render(content());
    expect(screen.getByTestId('chip-history-chart').style.height).toBe('260px');
    expect(chart.useLightweightCharts).toHaveBeenCalledWith(
      { theme: 'light', autoSize: true, height: 260 }, expect.any(Object),
    );
    expect(chart.switchToArea).toHaveBeenLastCalledWith([{ time: '2026-08-31', value: 62.5 }]);
    expect(screen.getByText('获利比例 (%) · 2026-08-31: 62.50%')).toBeTruthy();

    view.rerender(content(items, 'average_cost'));

    expect(chart.switchToArea).toHaveBeenLastCalledWith([{ time: '2026-08-31', value: 1480.25 }]);
    expect(screen.getByText('平均成本 (CNY) · 2026-08-31: 1480.25 CNY')).toBeTruthy();
    expect(items[0].profit_ratio).toBe(0.625);
  });

  it('passes a custom height through to the shared hook and chart container', () => {
    render(content(items, 'average_cost', 320));
    expect(screen.getByTestId('chip-history-chart').style.height).toBe('320px');
    expect(chart.useLightweightCharts).toHaveBeenCalledWith(
      { theme: 'light', autoSize: true, height: 320 }, expect.any(Object),
    );
  });

  it('shows an honest placeholder without initializing a chart for empty or filtered items', () => {
    const view = render(content([]));
    expect(screen.getByText('暂无筹码历史序列；未用估算值替代')).toBeTruthy();
    view.rerender(content([{ ...items[0], profit_ratio: NaN }]));
    expect(screen.getByText('暂无筹码历史序列；未用估算值替代')).toBeTruthy();
    expect(screen.queryByTestId('chip-history-chart')).toBeNull();
    expect(chart.useLightweightCharts).not.toHaveBeenCalled();
    expect(chart.switchToArea).not.toHaveBeenCalled();
  });

  it('unmounts an empty selected series and creates a chart again when valid data returns', () => {
    const data = [{ ...items[0], average_cost: NaN }];
    const view = render(content(data));
    view.rerender(content(data, 'average_cost'));
    expect(screen.queryByTestId('chip-history-chart')).toBeNull();
    view.rerender(content(data));
    expect(screen.getByTestId('chip-history-chart')).toBeTruthy();
    expect(chart.switchToArea).toHaveBeenLastCalledWith([{ time: '2026-08-31', value: 62.5 }]);
  });
});
