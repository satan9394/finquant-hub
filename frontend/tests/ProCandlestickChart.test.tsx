// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProCandlestickChart, { buildResearchMarkers } from '../src/components/charts/ProCandlestickChart';
import {
  calculateBOLL,
  calculateEMA,
  calculateKDJ,
  calculateMA,
  calculateMACD,
  calculateRSI,
} from '../src/components/charts/chartIndicators';
import type { OHLCVPoint } from '../src/components/charts/chartIndicators';
import type { ResearchReportDetail } from '../src/types/research';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const chartMocks = vi.hoisted(() => ({
  get: vi.fn(),
  createChart: vi.fn(),
  instances: [] as Array<Record<string, any>>,
}));

vi.mock('../src/services/api', () => ({ default: { get: chartMocks.get } }));
vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Magnet: 1 },
  LineStyle: { Dashed: 2 },
  createChart: chartMocks.createChart,
}));

function makeChart() {
  const clicks = new Set<(event: { hoveredObjectId?: unknown }) => void>();
  const ranges = new Set<(range: { from: number; to: number } | null) => void>();
  const crosshairs = new Set<(event: { time?: unknown }) => void>();
  const series = () => ({ setData: vi.fn(), setMarkers: vi.fn(), priceScale: vi.fn(() => ({ applyOptions: vi.fn() })) });
  const timeScale = {
    subscribeVisibleLogicalRangeChange: vi.fn((handler) => ranges.add(handler)),
    unsubscribeVisibleLogicalRangeChange: vi.fn((handler) => ranges.delete(handler)),
    setVisibleLogicalRange: vi.fn(), fitContent: vi.fn(),
  };
  const chart = {
    addCandlestickSeries: vi.fn(series), addLineSeries: vi.fn(series), addHistogramSeries: vi.fn(series),
    timeScale: vi.fn(() => timeScale),
    subscribeClick: vi.fn((handler) => clicks.add(handler)), unsubscribeClick: vi.fn((handler) => clicks.delete(handler)),
    subscribeCrosshairMove: vi.fn((handler) => crosshairs.add(handler)), unsubscribeCrosshairMove: vi.fn((handler) => crosshairs.delete(handler)),
    setCrosshairPosition: vi.fn(), clearCrosshairPosition: vi.fn(), applyOptions: vi.fn(), remove: vi.fn(), removeSeries: vi.fn(),
    fireClick: (event: { hoveredObjectId?: unknown }) => clicks.forEach((handler) => handler(event)),
    fireCrosshair: (event: { time?: unknown }) => crosshairs.forEach((handler) => handler(event)),
    fireRange: (range: { from: number; to: number } | null) => ranges.forEach((handler) => handler(range)),
    timeScaleApi: timeScale,
  };
  chartMocks.instances.push(chart);
  return chart;
}

function report(id: number, verdict: unknown, createdAt = '2026-09-22T10:00:00Z'): ResearchReportDetail {
  return {
    id, ticker: '600519', status: 'completed', created_at: createdAt,
    report_data: { verdict, executive_summary: `报告摘要 ${id}` }, events: [],
  };
}

function renderChart(reports: ResearchReportDetail[] = []) {
  localStorage.setItem('finquant_lang', 'zh');
  return render(<LanguageProvider><ProCandlestickChart symbol="600519" reports={reports} /></LanguageProvider>);
}

describe('ProCandlestickChart', () => {
  beforeEach(() => {
    chartMocks.get.mockReset();
    chartMocks.createChart.mockReset().mockImplementation(() => makeChart());
    chartMocks.instances.length = 0;
    chartMocks.get.mockResolvedValue({ data: { items: [
      { day: '2026-09-21', open: 100, high: 104, low: 99, close: 102, volume: 1000, source: 'sina' },
      { day: '2026-09-22', open: 102, high: 106, low: 101, close: 105, volume: 1200, source: 'sina' },
    ] } });
  });

  it('loads the selected market period and renders synchronized chart panels', async () => {
    renderChart();
    await waitFor(() => expect(chartMocks.get).toHaveBeenCalledWith('/market/kline', expect.objectContaining({
      params: { symbol: '600519', period: 'day', count: 300 },
    })));
    expect(await screen.findByTestId('pro-chart-main')).toBeTruthy();
    expect(screen.getByTestId('pro-chart-volume')).toBeTruthy();
    expect(screen.getByTestId('pro-chart-indicator')).toBeTruthy();
    await waitFor(() => expect(chartMocks.instances[0].addCandlestickSeries.mock.results[0].value.setData).toHaveBeenCalled());
    const [mainChart, volumeChart] = chartMocks.instances;
    mainChart.fireRange({ from: 0, to: 1 });
    expect(volumeChart.timeScaleApi.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 1 });
    mainChart.fireCrosshair({ time: '2026-09-22' });
    expect(volumeChart.setCrosshairPosition).toHaveBeenCalledWith(
      1200, '2026-09-22', volumeChart.addHistogramSeries.mock.results[0].value,
    );

    fireEvent.click(screen.getByText('周 K'));
    await waitFor(() => expect(chartMocks.get).toHaveBeenLastCalledWith('/market/kline', expect.objectContaining({
      params: { symbol: '600519', period: 'week', count: 300 },
    })));
  });

  it('maps only explicit verdicts and visibly keeps unknown report verdicts unknown', async () => {
    const reports = [report(7, 'buy'), report(8, 'not enough evidence')];
    const markers = buildResearchMarkers([
      { day: '2026-09-22', open: 100, high: 102, low: 99, close: 101, volume: 10 },
    ], reports, '600519', 'day', 'zh');
    expect(markers.map((item) => item.verdict)).toEqual(['buy', 'unknown']);
    expect(markers[1].marker.text).toBe('未知');

    renderChart(reports);
    await waitFor(() => expect(chartMocks.instances.length).toBe(3));
    const markerSeries = chartMocks.instances[0].addCandlestickSeries.mock.results[0]?.value;
    await waitFor(() => expect(markerSeries.setMarkers).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: '7', text: '买' }), expect.objectContaining({ id: '8', text: '未知' }),
    ])));
  });

  it('opens the report drawer from the marker click and from its accessible report action', async () => {
    const selected = report(12, 'mystery signal');
    renderChart([selected]);
    await waitFor(() => expect(chartMocks.instances.length).toBe(3));
    await waitFor(() => {
      const mainCandles = chartMocks.instances[0].addCandlestickSeries.mock.results[0]?.value;
      expect(mainCandles?.setMarkers).toHaveBeenCalledWith([expect.objectContaining({ id: '12', text: '未知' })]);
    });

    chartMocks.instances[0].fireClick({ hoveredObjectId: '12' });
    expect(await screen.findByText('报告摘要 12')).toBeTruthy();
    expect(screen.getByText(/未知结论/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('button', { name: /2026-09-22.*未知.*#12/ })).getByText(/未知/));
    expect(screen.getByText('研究报告 #12')).toBeTruthy();
  });
});

describe('pure chart indicators', () => {
  const bars: OHLCVPoint[] = [1, 3, 5].map((close, index) => ({
    time: `2026-09-2${index + 1}`, open: close, high: close + 1, low: close - 1, close, volume: 10,
  }));

  it('calculates moving averages, EMA, Bollinger bands, MACD, KDJ and RSI from immutable OHLCV', () => {
    const sourceSnapshot = bars.map((bar) => ({ ...bar }));
    expect(calculateMA(bars, 2).map((point) => point.value)).toEqual([2, 4]);
    expect(calculateEMA(bars, 2).map((point) => point.value)).toEqual([2, 4]);
    const boll = calculateBOLL(bars, 2);
    expect(boll.middle[0].value).toBe(2);
    expect(boll.upper[0].value).toBe(4);
    expect(boll.lower[0].value).toBe(0);
    const macd = calculateMACD(bars, 1, 2, 1);
    expect(macd.dif.map((point) => point.value)).toEqual([1, 1]);
    expect(macd.macd.map((point) => point.value)).toEqual([0, 0]);
    expect(calculateKDJ(bars, 2).k[0].value).toBeCloseTo(58.3333, 3);
    expect(calculateRSI(bars, 2)[0].value).toBe(100);
    expect(bars).toEqual(sourceSnapshot);
  });
});
