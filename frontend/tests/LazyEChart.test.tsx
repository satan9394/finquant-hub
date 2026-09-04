// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import echarts from '../src/charts/echartsSetup';
import LazyEChart from '../src/components/LazyEChart';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

const chartSpy = vi.hoisted(() => vi.fn());
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Record<string, unknown>) => {
    chartSpy(props);
    return <div data-testid="mock-echart" />;
  },
}));

describe('LazyEChart', () => {
  it('loads the mocked ECharts boundary and forwards the option', async () => {
    const option = { series: [{ type: 'line', data: [1, 2] }] };
    render(<LanguageProvider><LazyEChart option={option} /></LanguageProvider>);

    expect(screen.getByRole('status').textContent).toBe('图表加载中…');
    expect(await screen.findByTestId('mock-echart')).toBeTruthy();
    expect(chartSpy).toHaveBeenCalledWith(expect.objectContaining({ option, echarts }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('forwards merge and sizing behavior without creating a real canvas', async () => {
    const onChartReady = vi.fn();
    const onEvents = { click: vi.fn() };
    render(<LanguageProvider><LazyEChart option={{}} notMerge style={{ height: 320 }} onChartReady={onChartReady} onEvents={onEvents} /></LanguageProvider>);

    await screen.findByTestId('mock-echart');
    expect(chartSpy).toHaveBeenCalledWith(expect.objectContaining({ notMerge: true, style: { height: 320 }, onChartReady, onEvents }));
  });
});
