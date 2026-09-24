import { useEffect, useRef } from 'react';
import { ColorType, createChart } from 'lightweight-charts';

import { readChartTokens } from '../../styles/themeTokens';

export type RollingRiskPoint = { time: string; sharpe: number | null; volatility: number };

function chartOptions() {
  const colors = readChartTokens();
  return {
    autoSize: true,
    height: 250,
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.textPrimary,
      attributionLogo: false,
    },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    leftPriceScale: { visible: true, borderColor: colors.grid },
    rightPriceScale: { visible: true, borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: false },
  };
}

export default function RollingRiskChart({ data }: { data: RollingRiskPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;
    const chart = createChart(container, chartOptions());
    const colors = readChartTokens();
    const sharpeSeries = chart.addLineSeries({
      color: colors.primary,
      lineWidth: 2,
      priceScaleId: 'left',
      title: '滚动夏普',
      lastValueVisible: true,
    });
    const volatilitySeries = chart.addLineSeries({
      color: colors.secondary,
      lineWidth: 2,
      priceScaleId: 'right',
      title: '滚动年化波动率',
      lastValueVisible: true,
    });
    sharpeSeries.setData(data.flatMap((point) => point.sharpe == null ? [] : [{ time: point.time, value: point.sharpe }]));
    volatilitySeries.setData(data.map((point) => ({ time: point.time, value: point.volatility })));
    chart.timeScale().fitContent();

    const applyTheme = () => {
      const next = readChartTokens();
      chart.applyOptions(chartOptions());
      sharpeSeries.applyOptions({ color: next.primary });
      volatilitySeries.applyOptions({ color: next.secondary });
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

  return <div ref={containerRef} data-testid="portfolio-rolling-risk-chart" aria-label="60日滚动夏普与波动率" style={{ height: 250, minWidth: 0 }} />;
}
