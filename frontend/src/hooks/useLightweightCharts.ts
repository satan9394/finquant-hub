/* ============================================================
 * useLightweightCharts — TradingView Lightweight Charts v4 Hook
 * 适配 lightweight-charts v4 API（addCandlestickSeries / addAreaSeries / addHistogramSeries）
 * ============================================================ */

import { useEffect, useRef, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LastPriceAnimationMode,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type AreaData,
  type HistogramData,
  type ChartOptions,
  type DeepPartial,
  type Time,
} from 'lightweight-charts';
import type { ThemeMode, CandleData, AreaChartData, VolumeData, ChartConfig } from '../types';
import { readChartTokens, withAlpha } from '../styles/themeTokens';

// ------------------------------------------------------------------
// 主题调色板（A 股风格：红涨绿跌）
// ------------------------------------------------------------------

function getThemeOptions(_theme: ThemeMode) {
  const colors = readChartTokens();
  return {
    chart: {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textPrimary,
        fontSize: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif",
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
      rightPriceScale: {
        borderColor: colors.grid,
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      handleScroll: { vertTouchDrag: true },
    },
    candlestick: {
      upColor: colors.up,
      downColor: colors.down,
      borderUpColor: colors.up,
      borderDownColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    },
    area: {
      topColor: withAlpha(colors.up, 0.2),
      bottomColor: withAlpha(colors.up, 0),
      lineColor: colors.up,
      lineWidth: 2,
      lineType: LineType.Curved,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: colors.up,
      crosshairMarkerBackgroundColor: colors.background,
      lastPriceAnimation: LastPriceAnimationMode.OnDataUpdate,
      priceLineVisible: true,
      priceLineColor: colors.gridStrong,
    },
    volume: {
      color: colors.secondary,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    },
  };
}

// ------------------------------------------------------------------
// Hook
// ------------------------------------------------------------------

export function useLightweightCharts(
  config: ChartConfig,
  containerRef: React.RefObject<HTMLDivElement | null>
) {
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null);
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  // 初始化（v4 API: addCandlestickSeries/addAreaSeries/addHistogramSeries）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const theme = getThemeOptions(config.theme);
    const chart = createChart(container, {
      ...(theme.chart as DeepPartial<ChartOptions>),
      autoSize: true,
      height: config.height ?? 400,
      localization: {
        locale: 'zh-CN',
        dateFormat: 'yyyy-MM-dd',
      },
    });

    chartRef.current = chart;

    return () => {
      candlestickRef.current = null;
      areaRef.current = null;
      volumeRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // 主题更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const theme = getThemeOptions(config.theme);
    chart.applyOptions(theme.chart as DeepPartial<ChartOptions>);
    candlestickRef.current?.applyOptions(theme.candlestick as any);
    areaRef.current?.applyOptions(theme.area as any);
    volumeRef.current?.applyOptions(theme.volume as any);
  }, [config.theme]);

  // Astra B2：主题切换后重取色。图表创建后 readChartTokens 读的是当时 CSS
  // 变量（.app-theme / .app-theme--dark），App 切换暗色只改 DOM class，不会
  // 触发本 hook 的任何 effect（config.theme 恒为调用方写死的值）。用
  // MutationObserver 监听 .app-theme 的 class 变化，变化即按新 token 重绘，
  // 对 MoneyFlowChart/ChipHistoryChart 等调用方透明。
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || typeof MutationObserver === 'undefined') return;
    const root = document.querySelector<HTMLElement>('.app-theme');
    if (!root) return;
    let reflowPending = false;

    const applyCurrentTheme = () => {
      const theme = getThemeOptions(config.theme);
      chart.applyOptions(theme.chart as DeepPartial<ChartOptions>);
      candlestickRef.current?.applyOptions(theme.candlestick as any);
      areaRef.current?.applyOptions(theme.area as any);
      volumeRef.current?.applyOptions(theme.volume as any);
    };

    const observer = new MutationObserver(() => {
      if (reflowPending) return;
      reflowPending = true;
      // class 切换与样式重算可能同帧：延后到下一帧再读新 CSS 变量。
      requestAnimationFrame(() => {
        reflowPending = false;
        applyCurrentTheme();
      });
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [config.theme]);

  // 高度更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || config.autoSize) return;
    chart.resize(containerRef.current?.clientWidth ?? 600, config.height ?? 400);
  }, [config.height, config.autoSize, containerRef]);

  /** 设置 K 线数据（v4: addCandlestickSeries） */
  const setCandlestickData = useCallback((data: CandleData[]) => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    if (!candlestickRef.current) {
      const theme = getThemeOptions(config.theme);
      candlestickRef.current = chart.addCandlestickSeries(theme.candlestick as any);
    }
    candlestickRef.current.setData(data as CandlestickData<Time>[]);
  }, [config.theme]);

  /** 设置面积图数据（v4: addAreaSeries） */
  const setAreaData = useCallback((data: AreaChartData[]) => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    if (!areaRef.current) {
      const theme = getThemeOptions(config.theme);
      areaRef.current = chart.addAreaSeries(theme.area as any);
    }
    areaRef.current.setData(data as AreaData<Time>[]);
  }, [config.theme]);

  /** 设置成交量数据（v4: addHistogramSeries） */
  const setVolumeData = useCallback((data: VolumeData[]) => {
    const chart = chartRef.current;
    if (!chart || data.length === 0) return;
    if (!volumeRef.current) {
      const colors = readChartTokens();
      volumeRef.current = chart.addHistogramSeries({
        color: colors.secondary,
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    }
    volumeRef.current.setData(data as HistogramData<Time>[]);
  }, [config.theme]);

  /** 切换为 K 线 + 成交量 */
  const switchToCandlestick = useCallback(
    (candles: CandleData[], volumes: VolumeData[]) => {
      const chart = chartRef.current;
      if (areaRef.current && chart) {
        chart.removeSeries(areaRef.current);
        areaRef.current = null;
      }
      setCandlestickData(candles);
      setVolumeData(volumes);
    },
    [setCandlestickData, setVolumeData]
  );

  /** 切换为面积图 */
  const switchToArea = useCallback(
    (data: AreaChartData[]) => {
      const chart = chartRef.current;
      if (candlestickRef.current && chart) {
        chart.removeSeries(candlestickRef.current);
        candlestickRef.current = null;
      }
      if (volumeRef.current && chart) {
        chart.removeSeries(volumeRef.current);
        volumeRef.current = null;
      }
      setAreaData(data);
    },
    [setAreaData]
  );

  /** 清除所有系列 */
  const clearAllSeries = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (candlestickRef.current) { chart.removeSeries(candlestickRef.current); candlestickRef.current = null; }
    if (areaRef.current) { chart.removeSeries(areaRef.current); areaRef.current = null; }
    if (volumeRef.current) { chart.removeSeries(volumeRef.current); volumeRef.current = null; }
  }, []);

  /** 缩放到全部数据 */
  const fitContent = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  return { switchToCandlestick, switchToArea, clearAllSeries, fitContent };
}
