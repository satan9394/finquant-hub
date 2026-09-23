import type { AreaChartData } from '../types';
import type { ChipDistributionItem } from '../types/research';

export type ChipSeriesField = 'profit_ratio' | 'average_cost';

export function chipToAreaData(items: ChipDistributionItem[], field: ChipSeriesField): AreaChartData[] {
  return items
    .filter((item) => item.date.trim() && Number.isFinite(item[field]))
    .map((item) => ({ time: item.date, value: item[field] }));
}
