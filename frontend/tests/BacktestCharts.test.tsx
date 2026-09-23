// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../src/charts/echartsSetup';
import BacktestCharts from '../src/components/research/BacktestCharts';
import { LanguageProvider } from '../src/i18n/LanguageContext';

localStorage.setItem('finquant_lang', 'zh');

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="echart" /> }));

const run = {
  id: 1, symbol: '600519', status: 'completed',
  params: {}, provenance: { provider: 'sina' },
  metrics: { total_return: 0.1, benchmark_return: 0.04, max_drawdown: -0.05 },
  equity_curve: [{ time: '2026-01-01', value: 100 }, { time: '2026-01-02', value: 110 }],
  benchmark_curve: [{ time: '2026-01-01', value: 100 }, { time: '2026-01-02', value: 104 }],
  drawdown_curve: [{ time: '2026-01-01', value: 0 }, { time: '2026-01-02', value: -0.02 }],
  order_marks: [{ time: '2026-01-02', price: 105, side: 'buy' }],
} as any;
const bars = [{ day: '2026-01-01', open: 100, close: 101, low: 99, high: 102, volume: 10 }];

describe('BacktestCharts', () => {
  it('renders three mocked chart boundaries with financial text equivalents', async () => {
    render(<LanguageProvider><BacktestCharts run={run} bars={bars} /></LanguageProvider>);

    expect(screen.getByRole('img', { name: /策略期末净值 110.00/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最大回撤 -5.00%/ })).toBeTruthy();
    expect((await screen.findAllByTestId('echart')).length).toBe(3);
  });

  it('keeps missing curves and bars UNKNOWN instead of inventing values', () => {
    render(<LanguageProvider><BacktestCharts run={{ ...run, metrics: undefined, equity_curve: [], drawdown_curve: [] }} bars={[]} /></LanguageProvider>);

    expect(screen.getByRole('img', { name: /没有可用权益曲线/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /最大回撤 UNKNOWN%/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /没有可用价格观察/ })).toBeTruthy();
  });
});
