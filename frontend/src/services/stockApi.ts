/* ============================================================
 * stockApi — 行情数据服务（调后端 /api/market/*）
 * ============================================================ */
import apiClient from './api';
import type { SearchResult, RealTimeQuote, KLineDataPoint, IndicatorData } from '../types';

/** 搜索股票代码/名称 */
export async function searchStocks(query: string): Promise<SearchResult[]> {
  const res = await apiClient.get('/market/search', { params: { q: query } });
  return res.data.items;
}

/** 获取实时报价 */
export async function fetchQuote(ticker: string): Promise<RealTimeQuote> {
  const res = await apiClient.get('/market/quote', { params: { ticker } });
  return res.data;
}

/** 获取 K 线数据 */
export async function fetchKLine(ticker: string, period = '1d', count = 100): Promise<KLineDataPoint[]> {
  const res = await apiClient.get('/market/kline', { params: { ticker, period, count } });
  return res.data.items;
}

/** 获取技术指标 */
export async function fetchIndicators(ticker: string, indicators?: string): Promise<IndicatorData> {
  const params: Record<string, string> = { ticker };
  if (indicators) params.indicators = indicators;
  const res = await apiClient.get('/market/indicators', { params });
  return res.data;
}
