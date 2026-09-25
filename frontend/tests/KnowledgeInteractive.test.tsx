// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Knowledge from '../src/pages/Knowledge';
import { fetchInstrumentBars } from '../src/services/researchApi';

vi.mock('../src/services/researchApi', () => ({
  fetchInstrumentBars: vi.fn(),
  fetchMemories: vi.fn().mockResolvedValue([]),
  actOnMemory: vi.fn(),
  deleteMemory: vi.fn(),
  exportMemories: vi.fn(),
}));

vi.mock('../src/components/LazyEChart', () => ({
  default: ({ option }: { option: { series: Array<{ name: string }> } }) => (
    <div data-testid="knowledge-demo-chart" data-series={option.series.map((series) => series.name).join('|')} />
  ),
}));

const bars = Array.from({ length: 90 }, (_, index) => {
  const close = 100 + Math.sin(index / 4) * 8 + index * 0.12;
  return {
    day: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000 + (index % 9) * 50,
  };
});

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{`${location.pathname}${location.search}`}</output>;
}

function renderKnowledge() {
  return render(
    <MemoryRouter initialEntries={['/knowledge']}>
      <Routes>
        <Route path="/knowledge" element={<Knowledge />} />
        <Route path="/strategy-lab/ma-crossover" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Knowledge interactive strategy demo', () => {
  beforeEach(() => {
    vi.mocked(fetchInstrumentBars).mockResolvedValue({
      instrument: { symbol: '600519', name: '贵州茅台', market: 'CN', exchange: 'SSE', currency: 'CNY', asset_type: 'stock' },
      provider: 'fixture-provider', as_of: '2025-03-31', timezone: 'Asia/Shanghai', currency: 'CNY',
      adjustment: 'qfq', frequency: '1d', quality_flags: [], items: bars, indicators: {},
    });
  });

  it('replaces the old iframe with a themed native demo for all eight strategies', async () => {
    const { container } = renderKnowledge();

    expect(await screen.findByTestId('knowledge-demo-chart')).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
    expect(fetchInstrumentBars).toHaveBeenCalledWith('600519', 180);
    expect(screen.getByText('fixture-provider')).toBeTruthy();
    expect(screen.getByRole('slider', { name: '行情时间轴' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: '短均线周期' })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: '长均线周期' })).toBeTruthy();

    fireEvent.click(screen.getByText('高频交易策略', { exact: true }));
    expect(await screen.findByText(/日线振幅突破作微观结构概念示例/)).toBeTruthy();
    expect(screen.getByText('规则代理')).toBeTruthy();
  });

  it('opens Strategy Lab with the symbol, MA parameters, and selected strategy prompt', async () => {
    renderKnowledge();
    await screen.findByTestId('knowledge-demo-chart');

    fireEvent.click(screen.getByRole('button', { name: '带入策略实验室' }));
    const destination = await screen.findByTestId('destination');
    const [path, queryString] = destination.textContent!.split('?');
    const query = new URLSearchParams(queryString);

    expect(path).toBe('/strategy-lab/ma-crossover');
    expect(query.get('symbol')).toBe('600519');
    expect(query.get('short_window')).toBe('8');
    expect(query.get('long_window')).toBe('24');
    expect(query.get('prompt')).toContain('双均线策略');
  });

  it('does not substitute made-up bars when the market-data request fails', async () => {
    vi.mocked(fetchInstrumentBars).mockRejectedValueOnce(new Error('UPSTREAM_ERROR'));
    const { queryByTestId } = renderKnowledge();

    expect(await screen.findByRole('alert')).toBeTruthy();
    await waitFor(() => expect(queryByTestId('knowledge-demo-chart')).toBeNull());
    expect(screen.getByText(/UPSTREAM_ERROR/)).toBeTruthy();
  });
});
