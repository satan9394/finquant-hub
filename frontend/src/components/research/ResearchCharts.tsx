import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, type IChartApi, type Time } from 'lightweight-charts';
import type { BarsResponse } from '../../types/research';

const chartBase = (height: number) => ({
  height,
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: '#ffffff' },
    textColor: '#586276',
    fontFamily: "Inter, 'PingFang SC', sans-serif",
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: '#eef2f7' },
    horzLines: { color: '#eef2f7' },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#dbe3ee' },
  timeScale: { borderColor: '#dbe3ee', timeVisible: false },
});

export default function ResearchCharts({ payload }: { payload: BarsResponse }) {
  const priceRef = useRef<HTMLDivElement>(null);
  const macdRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!priceRef.current || !macdRef.current || !rsiRef.current || payload.items.length === 0) return;
    const charts: IChartApi[] = [];
    const priceChart = createChart(priceRef.current, {
      ...chartBase(410),
      rightPriceScale: { borderColor: '#dbe3ee', scaleMargins: { top: 0.06, bottom: 0.23 } },
    });
    charts.push(priceChart);
    const candles = priceChart.addCandlestickSeries({
      upColor: '#d84a4a', downColor: '#0e8b72',
      borderUpColor: '#d84a4a', borderDownColor: '#0e8b72',
      wickUpColor: '#d84a4a', wickDownColor: '#0e8b72',
    });
    candles.setData(payload.items.map((item) => ({
      time: item.day as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    })));
    const volume = priceChart.addHistogramSeries({ priceScaleId: 'volume', priceFormat: { type: 'volume' } });
    priceChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(payload.items.map((item) => ({
      time: item.day as Time,
      value: item.volume,
      color: item.close >= item.open ? 'rgba(216,74,74,.32)' : 'rgba(14,139,114,.32)',
    })));

    const maColors: Record<string, string> = { ma5: '#e59b27', ma20: '#3f6fc9', ma60: '#7c5fc5' };
    Object.entries(maColors).forEach(([key, color]) => {
      const values = payload.indicators.ma?.[key];
      if (!values) return;
      const series = priceChart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      series.setData(values.flatMap((value, index) => value == null ? [] : [{
        time: payload.items[index].day as Time, value,
      }]));
    });
    priceChart.timeScale().fitContent();

    const macdChart = createChart(macdRef.current, chartBase(360));
    charts.push(macdChart);
    const macd = payload.indicators.macd;
    if (macd) {
      const hist = macdChart.addHistogramSeries({ priceLineVisible: false });
      hist.setData(macd.hist.flatMap((value, index) => value == null ? [] : [{
        time: payload.items[index].day as Time,
        value,
        color: value >= 0 ? 'rgba(216,74,74,.68)' : 'rgba(14,139,114,.68)',
      }]));
      ([['dif', '#3f6fc9'], ['dea', '#e59b27']] as const).forEach(([key, color]) => {
        const series = macdChart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        series.setData(macd[key].flatMap((value, index) => value == null ? [] : [{
          time: payload.items[index].day as Time, value,
        }]));
      });
    }
    macdChart.timeScale().fitContent();

    const rsiChart = createChart(rsiRef.current, chartBase(360));
    charts.push(rsiChart);
    const rsiColors: Record<string, string> = { rsi6: '#d84a4a', rsi12: '#3f6fc9', rsi24: '#7c5fc5' };
    Object.entries(rsiColors).forEach(([key, color]) => {
      const values = payload.indicators.rsi?.[key];
      if (!values) return;
      const series = rsiChart.addLineSeries({ color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      series.setData(values.flatMap((value, index) => value == null ? [] : [{
        time: payload.items[index].day as Time, value,
      }]));
    });
    rsiChart.timeScale().fitContent();

    return () => charts.forEach((chart) => chart.remove());
  }, [payload]);

  return (
    <div className="research-charts" data-testid="research-charts">
      <div className="chart-section">
        <div className="chart-label">价格 · 成交量 · MA5 / MA20 / MA60</div>
        <div ref={priceRef} className="chart-canvas" />
      </div>
      <div className="chart-grid-two">
        <div className="chart-section">
          <div className="chart-label">MACD (12, 26, 9)</div>
          <div ref={macdRef} className="chart-canvas" />
        </div>
        <div className="chart-section">
          <div className="chart-label">RSI (6, 12, 24)</div>
          <div ref={rsiRef} className="chart-canvas" />
        </div>
      </div>
    </div>
  );
}
