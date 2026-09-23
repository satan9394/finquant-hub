/* Pure mapping of /api/usage daily aggregates to lightweight-charts area data. */
import type { AreaChartData } from '../types';

export interface UsageDayItem {
  day: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Map daily usage records to area chart points keyed by UTC date string.
 *  Invalid days and non-finite totals are dropped; never fabricates values. */
export function usageToAreaData(items: UsageDayItem[]): AreaChartData[] {
  const data: AreaChartData[] = [];
  for (const item of items) {
    if (!item.day || !DAY_PATTERN.test(item.day)) continue;
    const value = item.total_tokens ?? 0;
    if (!Number.isFinite(value) || value < 0) continue;
    data.push({ time: item.day, value });
  }
  return data;
}