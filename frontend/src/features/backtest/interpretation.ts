import type { BacktestRun } from '../../types/research';

const pct = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

export type BacktestReason = { title: string; detail: string; severity: 'critical' | 'warning'; rank: number };

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function interpretBacktest(run: BacktestRun, t?: Translate) {
  const metrics = run.metrics;
  if (!metrics) return {
    type: 'warning' as const,
    message: t ? t('strategy.summary.incomplete') : '结果尚不完整',
    description: t ? t('strategy.summary.incompleteDescription') : '等待指标计算完成。',
    reasons: [] as BacktestReason[],
  };

  const reasons: BacktestReason[] = [];
  if (metrics.total_return <= 0) reasons.push({ title: t ? t('strategy.summary.loss') : '策略区间亏损', detail: t ? t('strategy.summary.lossDetail', { value: pct(metrics.total_return) }) : `扣费后总收益 ${pct(metrics.total_return)}。`, severity: 'critical', rank: 1 });
  if (metrics.excess_return <= 0) reasons.push({ title: t ? t('strategy.summary.noExcess') : '未跑赢买入持有', detail: t ? t('strategy.summary.noExcessDetail', { excess: pct(metrics.excess_return), benchmark: pct(metrics.benchmark_return) }) : `超额收益 ${pct(metrics.excess_return)}；同区间基准收益 ${pct(metrics.benchmark_return)}。`, severity: 'critical', rank: 2 });
  if (metrics.max_drawdown < -0.2) reasons.push({ title: t ? t('strategy.summary.drawdownLimit') : '最大回撤超过基础门槛', detail: t ? t('strategy.summary.drawdownLimitDetail', { value: pct(metrics.max_drawdown) }) : `最大回撤 ${pct(metrics.max_drawdown)}，基础门槛为不低于 -20.00%。`, severity: 'critical', rank: 3 });
  if (metrics.trade_count < 5) reasons.push({ title: t ? t('strategy.summary.sampleLimit') : '交易样本不足', detail: t ? t('strategy.summary.sampleLimitDetail', { count: metrics.trade_count }) : `只有 ${metrics.trade_count} 笔完整交易，基础门槛至少 5 笔。`, severity: 'critical', rank: 4 });
  if (run.validation) {
    const robustnessLimits = [];
    if (run.validation.bootstrap.confidence_interval[0] <= 0) {
      robustnessLimits.push(t ? t('strategy.summary.bootstrapLimit', { low: pct(run.validation.bootstrap.confidence_interval[0]), high: pct(run.validation.bootstrap.confidence_interval[1]) }) : `Bootstrap 区间 ${pct(run.validation.bootstrap.confidence_interval[0])} ～ ${pct(run.validation.bootstrap.confidence_interval[1])} 包含非正收益`);
    }
    if (run.validation.monte_carlo.probability_loss > 0.5) {
      robustnessLimits.push(t ? t('strategy.summary.monteCarloLimit', { value: pct(run.validation.monte_carlo.probability_loss) }) : `Monte Carlo 亏损概率 ${pct(run.validation.monte_carlo.probability_loss)} 高于 50%`);
    }
    if (run.validation.walk_forward.status === 'insufficient_data') {
      robustnessLimits.push(t ? t('strategy.summary.walkForwardInsufficient') : 'Walk-forward 样本不足');
    } else if ((run.validation.walk_forward.positive_fold_ratio ?? 0) < 0.5) {
      robustnessLimits.push(t ? t('strategy.summary.walkForwardLimit', { value: pct(run.validation.walk_forward.positive_fold_ratio ?? 0) }) : `Walk-forward 正收益折数占比 ${pct(run.validation.walk_forward.positive_fold_ratio ?? 0)} 低于 50%`);
    }
    if (robustnessLimits.length) reasons.push({ title: t ? t('strategy.summary.robustnessLimit') : '稳健性证据有限', detail: `${robustnessLimits.join(t ? '; ' : '；')}。`, severity: 'warning', rank: 5 });
  }

  const robust = metrics.total_return > 0 && metrics.max_drawdown >= -0.2 && metrics.trade_count >= 5;
  return {
    type: robust ? 'success' as const : 'warning' as const,
    message: robust ? (t ? t('strategy.summary.canValidate') : '可继续验证') : (t ? t('strategy.summary.notTradeReady') : '暂不建议据此交易'),
    description: robust
      ? (t ? t('strategy.summary.canValidateDescription') : '收益为正、回撤受控且交易样本达到基础门槛；仍需查看基准、稳健性和成本。')
      : (t ? t('strategy.summary.notTradeReadyDescription') : '先处理下面按优先级列出的主要限制，再比较预设或延长样本。'),
    reasons: reasons.sort((left, right) => left.rank - right.rank),
  };
}

const warningMeta: Record<string, { label: string; detail: string; rank: number }> = {
  unadjusted_prices: { label: '价格未复权', detail: '分红送转等公司行动可能扭曲收益与信号。', rank: 1 },
  partial_history: { label: '历史长度不足', detail: '提供方返回的样本短于请求区间。', rank: 2 },
  no_trades_in_period: { label: '没有完整交易', detail: '当前参数无法形成可评价的交易样本。', rank: 3 },
  position_open_at_end_due_to_t_plus_one: { label: '期末仓位未平', detail: 'A 股 T+1 阻止期末卖出，结果包含未实现收益。', rank: 4 },
  position_open_at_end_due_to_limit_down: { label: '跌停无法平仓', detail: '期末跌停阻止成交，结果包含未实现收益。', rank: 4 },
  position_forced_closed_at_end: { label: '期末强制平仓', detail: '最后收盘价平仓并计入费用，属于回测约定。', rank: 5 },
  max_drawdown_stop_triggered: { label: '回撤止损触发', detail: '风控规则曾触发退出；请核对触发次数和日期。', rank: 6 },
  profit_factor_undefined_without_losses: { label: '盈亏比不可定义', detail: '样本没有亏损交易，不能把盈亏比显示为无穷大。', rank: 7 },
};

export function rankBacktestWarnings(codes: string[] = [], t?: Translate) {
  return codes.map((code, index) => ({
    code,
    label: t ? t(`strategy.warning.${warningMeta[code] ? code : 'unknown'}.label`) : warningMeta[code]?.label ?? '未识别警告',
    detail: t ? t(`strategy.warning.${warningMeta[code] ? code : 'unknown'}.detail`) : warningMeta[code]?.detail ?? '保留原始代码，当前版本尚无专门解释。',
    rank: warningMeta[code]?.rank ?? 100 + index,
  })).sort((left, right) => left.rank - right.rank);
}

export function explainBacktestFailure(raw: string, t?: Translate) {
  if (/行情|数据|获取|provider|source|loader/i.test(raw)) {
    return {
      category: t ? t('strategy.failure.data') : '数据不可用',
      nextStep: t ? t('strategy.failure.dataNext') : '检查标的代码或稍后重试；不要用其他标的或模拟数据替代。',
      raw,
    };
  }
  if (/参数|日期|均线|输入|必须|范围/.test(raw)) {
    return {
      category: t ? t('strategy.failure.parameter') : '参数不合法',
      nextStep: t ? t('strategy.failure.parameterNext') : '展开高级参数，按字段提示修正后再运行。',
      raw,
    };
  }
  return {
    category: t ? t('strategy.failure.executionCategory') : '执行失败',
    nextStep: t ? t('strategy.failure.executionNext') : '保留当前参数并重试；若重复失败，检查服务日志和数据来源状态。',
    raw,
  };
}
