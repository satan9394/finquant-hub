import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from 'lightweight-charts';

import { readChartTokens } from '../styles/themeTokens';

export type ProChartPanel = 'main' | 'volume' | 'indicator';
export interface ProChartContainers {
  main: RefObject<HTMLDivElement | null>;
  volume: RefObject<HTMLDivElement | null>;
  indicator: RefObject<HTMLDivElement | null>;
}
export interface ProChartSet {
  main: IChartApi;
  volume: IChartApi;
  indicator: IChartApi;
}

type ProSeries = ISeriesApi<SeriesType, Time>;
type PrimarySeries = { series: ProSeries; values: Map<string, number> };

export function chartTimeKey(time: Time): string {
  if (typeof time === 'object' && time !== null && 'year' in time) {
    const month = String(time.month).padStart(2, '0');
    const day = String(time.day).padStart(2, '0');
    return `${time.year}-${month}-${day}`;
  }
  return String(time);
}

function chartOptions(): DeepPartial<ChartOptions> {
  const colors = readChartTokens();
  return {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.textPrimary,
      fontSize: 12,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: colors.gridStrong, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.surface },
      horzLine: { color: colors.gridStrong, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.surface },
    },
    timeScale: {
      borderColor: colors.grid,
      timeVisible: true,
      secondsVisible: false,
      fixRightEdge: true,
      shiftVisibleRangeOnNewBar: true,
    },
    rightPriceScale: { borderColor: colors.grid },
    handleScroll: { vertTouchDrag: true },
  };
}

export function useProChart(containers: ProChartContainers) {
  const [charts, setCharts] = useState<ProChartSet | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const primarySeriesRef = useRef<Partial<Record<ProChartPanel, PrimarySeries>>>({});

  useEffect(() => {
    const mainContainer = containers.main.current;
    const volumeContainer = containers.volume.current;
    const indicatorContainer = containers.indicator.current;
    if (!mainContainer || !volumeContainer || !indicatorContainer) return;

    const current: ProChartSet = {
      main: createChart(mainContainer, chartOptions()),
      volume: createChart(volumeContainer, chartOptions()),
      indicator: createChart(indicatorContainer, chartOptions()),
    };
    setCharts(current);

    const applyTheme = () => {
      const options = chartOptions();
      current.main.applyOptions(options);
      current.volume.applyOptions(options);
      current.indicator.applyOptions(options);
      setThemeVersion((version) => version + 1);
    };
    const observer = new MutationObserver(applyTheme);
    const themeRoot = document.querySelector<HTMLElement>('.app-theme');
    for (const target of [document.documentElement, document.body, themeRoot].filter((item): item is HTMLElement => item !== null)) {
      observer.observe(target, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    }

    return () => {
      observer.disconnect();
      primarySeriesRef.current = {};
      current.main.remove();
      current.volume.remove();
      current.indicator.remove();
    };
  }, [containers.main, containers.volume, containers.indicator]);

  useEffect(() => {
    if (!charts) return;
    const pairs: Array<[ProChartPanel, IChartApi]> = [
      ['main', charts.main], ['volume', charts.volume], ['indicator', charts.indicator],
    ];
    let syncingRange = false;
    let syncingCrosshair = false;

    const rangeHandlers = pairs.map(([sourceKey, source]) => {
      const handler = (range: LogicalRange | null) => {
        if (!range || syncingRange) return;
        syncingRange = true;
        try {
          for (const [targetKey, target] of pairs) {
            if (targetKey !== sourceKey) target.timeScale().setVisibleLogicalRange(range);
          }
        } finally {
          syncingRange = false;
        }
      };
      source.timeScale().subscribeVisibleLogicalRangeChange(handler);
      return () => source.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
    });

    const crosshairHandlers = pairs.map(([sourceKey, source]) => {
      const handler = (parameter: MouseEventParams<Time>) => {
        if (syncingCrosshair) return;
        syncingCrosshair = true;
        try {
          for (const [targetKey, target] of pairs) {
            if (targetKey === sourceKey) continue;
            const primary = primarySeriesRef.current[targetKey];
            const value = parameter.time === undefined || !primary
              ? undefined
              : primary.values.get(chartTimeKey(parameter.time));
            if (parameter.time !== undefined && primary && value !== undefined) {
              target.setCrosshairPosition(value, parameter.time, primary.series);
            } else {
              target.clearCrosshairPosition();
            }
          }
        } finally {
          syncingCrosshair = false;
        }
      };
      source.subscribeCrosshairMove(handler);
      return () => source.unsubscribeCrosshairMove(handler);
    });

    return () => {
      rangeHandlers.forEach((unsubscribe) => unsubscribe());
      crosshairHandlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [charts]);

  const registerPrimarySeries = useCallback((panel: ProChartPanel, series: ProSeries, values: Map<string, number>) => {
    primarySeriesRef.current[panel] = { series, values };
  }, []);

  const unregisterPrimarySeries = useCallback((panel: ProChartPanel, series: ProSeries) => {
    if (primarySeriesRef.current[panel]?.series === series) delete primarySeriesRef.current[panel];
  }, []);

  return { charts, themeVersion, registerPrimarySeries, unregisterPrimarySeries };
}
