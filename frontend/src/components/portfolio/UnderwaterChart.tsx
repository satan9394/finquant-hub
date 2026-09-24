import { useEffect, useRef } from 'react';
import { ColorType, createChart } from 'lightweight-charts';

import { readChartTokens } from '../../styles/themeTokens';

export type UnderwaterPoint = { time: string; value: number };

function chartOptions() {
  const colors = readChartTokens();
  return {
    autoSize: true,
    height: 240,
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.textPrimary,
      attributionLogo: false,
    },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: false },
  };
}

export default function UnderwaterChart({ data }: { data: UnderwaterPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;
    const chart = createChart(container, chartOptions());
    const colors = readChartTokens();
    const series = chart.addAreaSeries({
      lineColor: colors.down,
      topColor: colors.down,
      bottomColor: colors.background,
      lineWidth: 2,
      priceFormat: { type: 'custom', minMove: 0.001, formatter: (value: number) => `${(value * 100).toFixed(1)}%` },
    });
    series.setData(data.map((point) => ({ time: point.time, value: point.value })));
    chart.timeScale().fitContent();

    const applyTheme = () => {
      const next = readChartTokens();
      chart.applyOptions(chartOptions());
      series.applyOptions({ lineColor: next.down, topColor: next.down, bottomColor: next.background });
    };
    const observer = new MutationObserver(applyTheme);
    const themeRoot = document.querySelector<HTMLElement>('.app-theme');
    for (const target of [document.documentElement, document.body, themeRoot].filter((item): item is HTMLElement => item !== null)) {
      observer.observe(target, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    }
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data]);

  return <div ref={containerRef} data-testid="portfolio-underwater-chart" aria-label="组合水下回撤曲线" style={{ height: 240, minWidth: 0 }} />;
}
