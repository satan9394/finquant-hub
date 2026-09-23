export type StrategyGoal = 'trend' | 'mean_reversion' | 'risk_control';
export type StrategyPresetKey = 'steady' | 'standard' | 'active';

export const STRATEGY_GOALS: Array<{
  key: StrategyGoal;
  title: string;
  description: string;
  available: boolean;
  defaultPreset?: StrategyPresetKey;
}> = [
  { key: 'trend', title: '趋势跟随', description: '用快慢均线确认方向，适合持续性行情。', available: true, defaultPreset: 'standard' },
  { key: 'mean_reversion', title: '均值回归', description: '当前没有均值回归引擎；不会用双均线结果替代。', available: false },
  { key: 'risk_control', title: '风险控制', description: '使用更慢均线与回撤退出，优先控制换手和深度回撤。', available: true, defaultPreset: 'steady' },
];

export const STRATEGY_PRESETS: Record<StrategyPresetKey, {
  label: string;
  parameters: string;
  purpose: string;
  tradeoff: string;
  values: { short_window: number; long_window: number; max_drawdown_stop_pct: number };
}> = {
  steady: {
    label: '稳健', parameters: 'MA30 / MA90 · 回撤止损 12%',
    purpose: '减少换手并限制深度回撤。', tradeoff: '信号更慢，可能错过趋势早段。',
    values: { short_window: 30, long_window: 90, max_drawdown_stop_pct: 0.12 },
  },
  standard: {
    label: '标准', parameters: 'MA20 / MA50 · 不设止损',
    purpose: '平衡响应速度与信号噪声。', tradeoff: '横盘期仍可能反复交易。',
    values: { short_window: 20, long_window: 50, max_drawdown_stop_pct: 0 },
  },
  active: {
    label: '进取', parameters: 'MA10 / MA30 · 回撤止损 8%',
    purpose: '更快捕捉趋势并更早退出。', tradeoff: '换手与假突破风险更高。',
    values: { short_window: 10, long_window: 30, max_drawdown_stop_pct: 0.08 },
  },
};
