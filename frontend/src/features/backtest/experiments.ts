import { STRATEGY_PRESETS, type StrategyPresetKey } from './presets';
import type { BacktestCreatePayload, BacktestRun } from '../../types/research';

type ExperimentParams = BacktestCreatePayload | Partial<BacktestCreatePayload>;
type ExperimentField = keyof Pick<BacktestCreatePayload,
  'symbol' | 'start_date' | 'end_date' | 'short_window' | 'long_window' |
  'initial_capital' | 'commission_bps' | 'slippage_bps' | 'sell_stamp_duty_bps' |
  'minimum_commission_cny' | 'max_drawdown_stop_pct' | 'benchmark'>;

const fields: Array<{ key: ExperimentField; label: string; format: (value: unknown) => string }> = [
  { key: 'symbol', label: '标的', format: (value) => String(value ?? '—').trim().toUpperCase() },
  { key: 'start_date', label: '开始日期', format: (value) => String(value ?? '—') },
  { key: 'end_date', label: '结束日期', format: (value) => String(value ?? '—') },
  { key: 'short_window', label: '短均线', format: (value) => String(value ?? '—') },
  { key: 'long_window', label: '长均线', format: (value) => String(value ?? '—') },
  { key: 'initial_capital', label: '初始资金', format: (value) => `¥${Number(value ?? 0).toLocaleString('zh-CN')}` },
  { key: 'commission_bps', label: '手续费', format: (value) => `${Number(value ?? 0)} bps` },
  { key: 'slippage_bps', label: '滑点', format: (value) => `${Number(value ?? 0)} bps` },
  { key: 'sell_stamp_duty_bps', label: '卖出印花税', format: (value) => `${Number(value ?? 0)} bps` },
  { key: 'minimum_commission_cny', label: '最低佣金', format: (value) => `¥${Number(value ?? 0)}` },
  { key: 'max_drawdown_stop_pct', label: '回撤止损', format: (value) => `${(Number(value ?? 0) * 100).toFixed(0)}%` },
  { key: 'benchmark', label: '基准', format: () => '买入并持有' },
];

const strategyKeys = new Set<ExperimentField>(['short_window', 'long_window', 'max_drawdown_stop_pct']);

function comparableValue(params: ExperimentParams, key: ExperimentField) {
  const value = params[key];
  if (key === 'symbol') return String(value ?? '').trim().toUpperCase();
  if (key === 'sell_stamp_duty_bps' || key === 'minimum_commission_cny' || key === 'max_drawdown_stop_pct') return Number(value ?? 0);
  return value;
}

export function assessExperimentChange(baseline: ExperimentParams, candidate: ExperimentParams) {
  const differences = fields.flatMap(({ key, label, format }) => (
    comparableValue(baseline, key) === comparableValue(candidate, key)
      ? []
      : [{ key, label, before: format(baseline[key]), after: format(candidate[key]) }]
  ));
  return {
    status: differences.length === 0 ? 'same' as const : differences.length === 1 ? 'single' as const : 'multiple' as const,
    differences,
  };
}

export function isExperimentContextComparable(left: ExperimentParams, right: ExperimentParams) {
  return fields.every(({ key }) => strategyKeys.has(key) || comparableValue(left, key) === comparableValue(right, key));
}

function matchesPreset(params: ExperimentParams, key: StrategyPresetKey) {
  const values = STRATEGY_PRESETS[key].values;
  return Number(params.short_window) === values.short_window
    && Number(params.long_window) === values.long_window
    && Number(params.max_drawdown_stop_pct ?? 0) === values.max_drawdown_stop_pct;
}

export function findComparablePresetRuns(history: BacktestRun[], context: ExperimentParams) {
  return (Object.keys(STRATEGY_PRESETS) as StrategyPresetKey[]).reduce<Record<StrategyPresetKey, BacktestRun | null>>((matches, key) => {
    matches[key] = history.find((item) => (
      item.is_saved && item.status === 'completed' && Boolean(item.metrics)
      && isExperimentContextComparable(item.params, context) && matchesPreset(item.params, key)
    )) ?? null;
    return matches;
  }, { steady: null, standard: null, active: null });
}

export function compareExperimentMetrics(baseline: BacktestRun, candidate: BacktestRun) {
  if (!baseline.metrics || !candidate.metrics) return null;
  const metricKeys = [
    ['total_return', '总收益', 'percent'],
    ['excess_return', '超额收益', 'percent'],
    ['max_drawdown', '最大回撤', 'percent'],
    ['trade_count', '交易数', 'count'],
  ] as const;
  return metricKeys.map(([key, label, format]) => ({
    key,
    label,
    format,
    baseline: baseline.metrics![key],
    candidate: candidate.metrics![key],
    delta: Math.round((candidate.metrics![key] - baseline.metrics![key]) * 100_000_000) / 100_000_000,
  }));
}
