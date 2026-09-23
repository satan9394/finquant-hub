export type BacktestFormValues = {
  symbol: string;
  start_date: string;
  end_date: string;
  short_window: number;
  long_window: number;
  initial_capital: number;
  commission_bps: number;
  slippage_bps: number;
  sell_stamp_duty_bps: number;
  minimum_commission_cny: number;
  max_drawdown_stop_pct: number;
  benchmark: 'buy_and_hold';
};

export type BacktestFormErrors = Partial<Record<keyof BacktestFormValues, string>>;

export function validateBacktestForm(values: BacktestFormValues): BacktestFormErrors {
  const errors: BacktestFormErrors = {};
  if (!values.symbol.trim()) errors.symbol = '请输入股票代码';
  if (values.short_window < 2) errors.short_window = '短均线周期必须大于等于 2';
  if (values.long_window <= values.short_window) errors.long_window = '长均线周期必须大于短均线周期';
  if (!values.start_date || !values.end_date || values.start_date >= values.end_date) {
    errors.end_date = '结束日期必须晚于开始日期';
  }
  if (values.initial_capital <= 0) errors.initial_capital = '初始资金必须大于 0';
  if (values.commission_bps < 0) errors.commission_bps = '手续费不能为负数';
  if (values.slippage_bps < 0) errors.slippage_bps = '滑点不能为负数';
  if (values.sell_stamp_duty_bps < 0) errors.sell_stamp_duty_bps = '印花税不能为负数';
  if (values.minimum_commission_cny < 0) errors.minimum_commission_cny = '最低佣金不能为负数';
  if (values.max_drawdown_stop_pct < 0 || values.max_drawdown_stop_pct >= 1) errors.max_drawdown_stop_pct = '回撤止损必须在 0% 到 100% 之间';
  return errors;
}
