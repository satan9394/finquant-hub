/* ============================================================
 * StockChart — lightweight-charts K 线组件（Dashboard 用）
 * 从 Tech_Stock_Monitor 移植，数据源改为后端 /api/market/*
 * ============================================================ */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Spin, Empty } from 'antd';
import { useLightweightCharts } from '../hooks/useLightweightCharts';
import { fetchKLine, fetchIndicators } from '../services/stockApi';
import type { ThemeMode, KLineDataPoint } from '../types';
import type { UTCTimestamp } from 'lightweight-charts';

interface StockChartProps {
  ticker: string;
  theme: ThemeMode;
  height?: number;
}

const formatPrice = (v?: number) => (v != null ? v.toFixed(2) : '--');
const formatChange = (v?: number) => (v != null ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : '--');
const formatPercent = (v?: number) => (v != null ? (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`) : '--');

export default function StockChart({ ticker, theme, height = 350 }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [priceLegend, setPriceLegend] = useState<{
    open?: number; high?: number; low?: number; close?: number;
    change?: number; changePercent?: number;
  }>({});

  const { switchToCandlestick, clearAllSeries, fitContent } =
    useLightweightCharts({ theme, autoSize: true }, containerRef);

  useEffect(() => {
    setLoading(true);
    setHasError(false);
    setPriceLegend({});
    clearAllSeries();
  }, [ticker, clearAllSeries]);

  const loadData = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    setHasError(false);
    try {
      const klineData = await fetchKLine(ticker, '1d', 120);
      if (klineData.length === 0) {
        setHasError(true);
        return;
      }

      const candles = klineData.map((k: KLineDataPoint) => ({
        time: k.day as UTCTimestamp | string,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
      }));

      const volumes = klineData.map((k: KLineDataPoint) => ({
        time: k.day as UTCTimestamp | string,
        value: Math.round(k.volume / 100),
        color: k.close >= k.open ? 'rgba(242, 54, 69, 0.4)' : 'rgba(8, 153, 137, 0.4)',
      }));

      const last = klineData[klineData.length - 1];
      setPriceLegend({
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        change: last.close - last.open,
        changePercent: last.open ? ((last.close - last.open) / last.open) * 100 : 0,
      });

      switchToCandlestick(candles, volumes);
      setTimeout(() => fitContent(), 50);
    } catch {
      setHasError(true);
    } finally {
      setLoading(false);
    }
  }, [ticker, switchToCandlestick, fitContent]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const priceUp = (priceLegend.changePercent ?? 0) >= 0;

  return (
    <div style={{
      background: theme === 'dark' ? '#1f1f1f' : '#fff',
      border: `1px solid ${theme === 'dark' ? '#333' : '#e8e8e8'}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* 图例 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
        borderBottom: `1px solid ${theme === 'dark' ? '#333' : '#e8e8e8'}`,
        fontSize: 12,
      }}>
        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{ticker.toUpperCase()}</span>
        {priceLegend.close != null && (
          <span style={{
            fontWeight: 700, fontSize: 14, fontFamily: 'monospace',
            color: priceUp ? '#f23645' : '#089981',
          }}>
            {formatPrice(priceLegend.close)}
          </span>
        )}
        <span style={{ color: priceUp ? '#f23645' : '#089981', fontSize: 11 }}>
          {formatChange(priceLegend.change)} ({formatPercent(priceLegend.changePercent)})
        </span>
      </div>

      {/* 图表 */}
      <div style={{ position: 'relative' }}>
        <div ref={containerRef} style={{ width: '100%', height }} />
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
            <Spin />
          </div>
        )}
        {hasError && !loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="暂无数据" />
          </div>
        )}
      </div>
    </div>
  );
}
