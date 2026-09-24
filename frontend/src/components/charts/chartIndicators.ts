import type { Time } from 'lightweight-charts';

export interface OHLCVPoint {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LinePoint {
  time: Time;
  value: number;
}

export interface HistogramPoint extends LinePoint {
  color?: string;
}

export interface MACDResult {
  dif: LinePoint[];
  dea: LinePoint[];
  macd: HistogramPoint[];
}

export interface BOLLResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

export interface KDJResult {
  k: LinePoint[];
  d: LinePoint[];
  j: LinePoint[];
}

function validPeriod(period: number): number {
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive integer');
  return period;
}

function emaValues(values: number[], period: number): Array<number | null> {
  validPeriod(period);
  const result: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) return result;
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    previous += alpha * (values[index] - previous);
    result[index] = previous;
  }
  return result;
}

export function calculateMA(bars: readonly OHLCVPoint[], period = 20): LinePoint[] {
  validPeriod(period);
  const result: LinePoint[] = [];
  let rolling = 0;
  for (let index = 0; index < bars.length; index += 1) {
    rolling += bars[index].close;
    if (index >= period) rolling -= bars[index - period].close;
    if (index >= period - 1) result.push({ time: bars[index].time, value: rolling / period });
  }
  return result;
}

export function calculateEMA(bars: readonly OHLCVPoint[], period = 20): LinePoint[] {
  const values = emaValues(bars.map((bar) => bar.close), period);
  return values.flatMap((value, index) => value === null ? [] : [{ time: bars[index].time, value }]);
}

export function calculateMACD(
  bars: readonly OHLCVPoint[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  validPeriod(fastPeriod);
  validPeriod(slowPeriod);
  validPeriod(signalPeriod);
  if (fastPeriod >= slowPeriod) throw new RangeError('fastPeriod must be less than slowPeriod');
  const closes = bars.map((bar) => bar.close);
  const fast = emaValues(closes, fastPeriod);
  const slow = emaValues(closes, slowPeriod);
  const firstIndex = slowPeriod - 1;
  const difValues = bars.map((_bar, index) => (
    fast[index] === null || slow[index] === null ? null : (fast[index] as number) - (slow[index] as number)
  ));
  const dif = difValues.flatMap((value, index) => value === null ? [] : [{ time: bars[index].time, value }]);
  const signalValues = emaValues(
    difValues.slice(firstIndex).map((value) => value as number),
    signalPeriod,
  );
  const dea: LinePoint[] = [];
  const macd: HistogramPoint[] = [];
  signalValues.forEach((value, offset) => {
    if (value === null) return;
    const index = firstIndex + offset;
    dea.push({ time: bars[index].time, value });
    const difference = (difValues[index] as number) - value;
    macd.push({ time: bars[index].time, value: difference * 2 });
  });
  return { dif, dea, macd };
}

export function calculateBOLL(bars: readonly OHLCVPoint[], period = 20, multiplier = 2): BOLLResult {
  validPeriod(period);
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new RangeError('multiplier must be non-negative');
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1).map((bar) => bar.close);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance);
    const time = bars[index].time;
    upper.push({ time, value: mean + multiplier * deviation });
    middle.push({ time, value: mean });
    lower.push({ time, value: mean - multiplier * deviation });
  }
  return { upper, middle, lower };
}

export function calculateKDJ(bars: readonly OHLCVPoint[], period = 9): KDJResult {
  validPeriod(period);
  const k: LinePoint[] = [];
  const d: LinePoint[] = [];
  const j: LinePoint[] = [];
  let previousK = 50;
  let previousD = 50;
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((bar) => bar.high));
    const lowest = Math.min(...window.map((bar) => bar.low));
    const rsv = highest === lowest ? 50 : ((bars[index].close - lowest) / (highest - lowest)) * 100;
    previousK = (2 * previousK + rsv) / 3;
    previousD = (2 * previousD + previousK) / 3;
    const currentJ = 3 * previousK - 2 * previousD;
    const time = bars[index].time;
    k.push({ time, value: previousK });
    d.push({ time, value: previousD });
    j.push({ time, value: currentJ });
  }
  return { k, d, j };
}

export function calculateRSI(bars: readonly OHLCVPoint[], period = 14): LinePoint[] {
  validPeriod(period);
  if (bars.length <= period) return [];
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  const value = () => averageLoss === 0
    ? (averageGain === 0 ? 50 : 100)
    : 100 - 100 / (1 + averageGain / averageLoss);
  const result: LinePoint[] = [{ time: bars[period].time, value: value() }];
  for (let index = period + 1; index < bars.length; index += 1) {
    const change = bars[index].close - bars[index - 1].close;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result.push({ time: bars[index].time, value: value() });
  }
  return result;
}
