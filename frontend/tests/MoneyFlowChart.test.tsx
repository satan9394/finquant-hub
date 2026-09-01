// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MoneyFlowChart from '../src/components/MoneyFlowChart';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const chart = vi.hoisted(() => ({
  switchToArea: vi.fn(),
  useLightweightCharts: vi.fn(),
}));

vi.mock('../src/hooks/useLightweightCharts', () => ({
  useLightweightCharts: (...args: unknown[]) => {
    chart.useLightweightCharts(...args);
    return { switchToArea: chart.switchToArea };
  },
}));

function renderChart(items: Parameters<typeof MoneyFlowChart>[0]['items']) {
  return render(
    <LanguageProvider>
      <MoneyFlowChart items={items} period="minute" />
    </LanguageProvider>,
  );
}

describe('MoneyFlowChart', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finquant_lang', 'zh');
    vi.clearAllMocks();
  });

  it('renders the chart container and sends mapped area data to the shared hook', async () => {
    renderChart([{
      time: '2026-08-31 14:59',
      main_net: 120_000,
      super_large_net: 80_000,
      large_net: 30_000,
      medium_net: 20_000,
      small_net: -10_000,
    }]);

    expect(screen.getByTestId('money-flow-chart')).toBeTruthy();
    await waitFor(() => expect(chart.switchToArea).toHaveBeenCalledWith([
      { time: 1_788_159_540, value: 120_000 },
    ]));
  });

  it('renders an honest placeholder without creating a chart for empty items', () => {
    renderChart([]);

    expect(screen.getByText('暂无资金流序列；未用估算值替代')).toBeTruthy();
    expect(screen.queryByTestId('money-flow-chart')).toBeNull();
    expect(chart.useLightweightCharts).not.toHaveBeenCalled();
  });
});
