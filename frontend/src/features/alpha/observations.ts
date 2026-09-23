import type { AlphaObservation, AlphaSimulationResult } from '../../services/alphaApi';

const requiredColumns = ['date', 'symbol', 'factor', 'forward_return'] as const;

function validateObservations(rows: unknown[]): AlphaObservation[] {
  if (!rows.length) throw new Error('至少需要两条观察记录。');
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`第 ${index + 1} 条记录必须是对象。`);
    const row = raw as Record<string, unknown>;
    const date = String(row.date ?? '').trim();
    const symbol = String(row.symbol ?? '').trim().toUpperCase();
    const factor = Number(row.factor);
    const forwardReturn = Number(row.forward_return);
    if (!date || !symbol || !Number.isFinite(factor) || !Number.isFinite(forwardReturn)) {
      throw new Error(`第 ${index + 1} 条记录需要有效的 date、symbol、factor 与 forward_return。`);
    }
    const key = `${date}/${symbol}`;
    if (seen.has(key)) throw new Error(`重复记录：${key}。`);
    seen.add(key);
    counts.set(date, (counts.get(date) ?? 0) + 1);
    return { date, symbol, factor, forward_return: forwardReturn };
  }).map((row) => {
    if ((counts.get(row.date) ?? 0) < 2) throw new Error(`${row.date} 至少需要两个标的。`);
    return row;
  });
}

export function parseAlphaObservations(raw: string) {
  const text = raw.trim();
  if (!text) throw new Error('请粘贴 CSV 或 JSON 观察数据。');
  let rows: unknown[];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('not array');
      rows = parsed;
    } catch {
      throw new Error('JSON 必须是观察记录数组。');
    }
  } else {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headers = (lines.shift() ?? '').split(',').map((value) => value.trim());
    const missing = requiredColumns.filter((column) => !headers.includes(column));
    if (missing.length) throw new Error(`CSV 缺少列：${missing.join(', ')}。`);
    rows = lines.map((line, index) => {
      const values = line.split(',').map((value) => value.trim());
      if (values.length !== headers.length) throw new Error(`CSV 第 ${index + 2} 行列数不一致。`);
      return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
    });
  }
  const observations = validateObservations(rows);
  return {
    observations,
    summary: {
      rows: observations.length,
      dates: new Set(observations.map((row) => row.date)).size,
      symbols: new Set(observations.map((row) => row.symbol)).size,
    },
  };
}

export function assessAlphaSample(result: AlphaSimulationResult) {
  const periods = result.period_returns.length;
  if (periods < 20) return { status: 'insufficient' as const, periods, message: '样本不足，不主推年化指标' };
  if (periods < 60) return { status: 'limited' as const, periods, message: '样本有限，年化与风险调整指标仅供参考' };
  return { status: 'adequate' as const, periods, message: '样本期数达到基础展示门槛' };
}

export function alignSimulationReturns(left: AlphaSimulationResult, right: AlphaSimulationResult) {
  const leftMap = new Map(left.equity_curve.slice(1).map((point, index) => [point.date, left.period_returns[index]]));
  const rightMap = new Map(right.equity_curve.slice(1).map((point, index) => [point.date, right.period_returns[index]]));
  const dates = [...leftMap.keys()].filter((date) => rightMap.has(date));
  return {
    dates,
    seriesA: dates.map((date) => leftMap.get(date)!),
    seriesB: dates.map((date) => rightMap.get(date)!),
  };
}
