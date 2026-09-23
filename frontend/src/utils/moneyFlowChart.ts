import type { AreaChartData } from '../types';
import type { MoneyFlowItem } from '../types/research';

export type MoneyFlowPeriod = 'minute' | '120d';

const MONEY_FLOW_MINUTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function moneyFlowTimeToEpoch(time: string): number | null {
  const match = MONEY_FLOW_MINUTE_PATTERN.exec(time);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    localUtc.getUTCFullYear() !== year
    || localUtc.getUTCMonth() !== month - 1
    || localUtc.getUTCDate() !== day
    || localUtc.getUTCHours() !== hour
    || localUtc.getUTCMinutes() !== minute
  ) return null;

  return (localUtc.getTime() - SHANGHAI_OFFSET_MS) / 1000;
}

export function moneyFlowToAreaData(
  items: MoneyFlowItem[],
  period: MoneyFlowPeriod,
): AreaChartData[] {
  const data: AreaChartData[] = [];

  for (const item of items) {
    const value = item.main_net ?? null;
    if (value === null || !Number.isFinite(value)) continue;

    if (period === 'minute') {
      const time = item.time ? moneyFlowTimeToEpoch(item.time) : null;
      if (time !== null) data.push({ time: time as AreaChartData['time'], value });
      continue;
    }

    const date = item.date;
    if (date && moneyFlowTimeToEpoch(`${date} 00:00`) !== null) {
      data.push({ time: date, value });
    }
  }

  return data;
}
