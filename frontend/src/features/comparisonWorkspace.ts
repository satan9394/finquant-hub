import type { BacktestRun, ResearchWorkspace } from '../types/research';

export const COMPARISON_SELECTION_KEY = 'finquant_comparison_selection_v1';
const PORTFOLIO_REVIEWS_KEY = 'finquant_portfolio_risk_reviews_v1';
export const MAX_COMPARISON_ITEMS = 4;

export type ComparisonKind = 'research' | 'strategy' | 'portfolio';

export type ComparisonContract = {
  period: string;
  parameters: string;
  costs: string;
  benchmark: string;
  source: string;
  complete: boolean;
};

export type ComparisonCandidate = {
  id: string;
  kind: ComparisonKind;
  title: string;
  object: string;
  asOf: string;
  source: string;
  quality: string;
  evidence: string;
  href: string;
  missingFields?: string[];
  contract?: ComparisonContract;
  metrics?: {
    totalReturn: number;
    excessReturn: number;
    maxDrawdown: number;
    annualizedVolatility: number | null;
    tradeCount: number;
  };
};

export type PortfolioReview = {
  id: string;
  portfolio: string;
  summary: string;
  createdAt: string;
  dueAt: string;
  completed: boolean;
};

export type ComparisonAssessment = {
  status: 'insufficient' | 'cross_type' | 'metadata_only' | 'incompatible' | 'comparable';
  message: string;
  differences: string[];
};

function text(value: unknown, fallback = 'UNKNOWN'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function readComparisonSelection(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(COMPARISON_SELECTION_KEY) || 'null') as unknown;
    if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return [];
    const ids = (value as { ids?: unknown }).ids;
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 160))]
      .slice(0, MAX_COMPARISON_ITEMS);
  } catch {
    return [];
  }
}

export function saveComparisonSelection(ids: string[]): string[] {
  const saved = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 160))]
    .slice(0, MAX_COMPARISON_ITEMS);
  localStorage.setItem(COMPARISON_SELECTION_KEY, JSON.stringify({ version: 1, ids: saved }));
  return saved;
}

export function clearComparisonSelection() {
  localStorage.removeItem(COMPARISON_SELECTION_KEY);
}

export function readPortfolioReviews(): PortfolioReview[] {
  try {
    const value = JSON.parse(localStorage.getItem(PORTFOLIO_REVIEWS_KEY) || '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is PortfolioReview => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<PortfolioReview>;
      return typeof candidate.id === 'string'
        && typeof candidate.portfolio === 'string'
        && typeof candidate.summary === 'string'
        && typeof candidate.createdAt === 'string'
        && typeof candidate.dueAt === 'string'
        && typeof candidate.completed === 'boolean';
    });
  } catch {
    return [];
  }
}

function researchCandidate(workspace: ResearchWorkspace): ComparisonCandidate | null {
  if (workspace.saved === false || typeof workspace.symbol !== 'string' || !workspace.symbol.trim()) return null;
  const snapshot = workspace.snapshot;
  const identifier = workspace.id ?? workspace.symbol.toUpperCase();
  return {
    id: `research:${identifier}`,
    kind: 'research',
    title: workspace.name?.trim() || snapshot?.instrument?.name || workspace.symbol.toUpperCase(),
    object: workspace.symbol.toUpperCase(),
    asOf: text(snapshot?.as_of ?? workspace.updated_at),
    source: text(snapshot?.provider),
    quality: snapshot?.quality_flags?.length ? snapshot.quality_flags.join(', ') : 'UNKNOWN',
    evidence: `${workspace.evidence?.length ?? 0} 条已保存证据 · 研究快照`,
    href: `/research/${encodeURIComponent(workspace.symbol)}`,
  };
}

function strategyCandidate(run: BacktestRun): ComparisonCandidate | null {
  if (!run.is_saved || run.status !== 'completed' || !run.metrics || !run.params) return null;
  const provenance = run.provenance;
  const requiredNumbers = [
    run.params.short_window, run.params.long_window, run.params.initial_capital,
    run.params.commission_bps, run.params.slippage_bps, run.params.sell_stamp_duty_bps,
    run.params.minimum_commission_cny, run.params.max_drawdown_stop_pct, run.params.validation_samples,
  ];
  const missingFields = [
    ['params.short_window', run.params.short_window],
    ['params.long_window', run.params.long_window],
    ['params.initial_capital', run.params.initial_capital],
    ['params.commission_bps', run.params.commission_bps],
    ['params.slippage_bps', run.params.slippage_bps],
    ['params.sell_stamp_duty_bps', run.params.sell_stamp_duty_bps],
    ['params.minimum_commission_cny', run.params.minimum_commission_cny],
    ['params.max_drawdown_stop_pct', run.params.max_drawdown_stop_pct],
    ['params.validation_samples', run.params.validation_samples],
    ['params.market_rules', run.params.market_rules],
    ['params.price_limit_ratio', run.params.price_limit_ratio === undefined ? undefined : 'present'],
    ['params.benchmark', run.params.benchmark],
    ['provenance.provider', provenance?.provider],
    ['provenance.as_of', provenance?.as_of],
    ['provenance.frequency', provenance?.frequency],
    ['provenance.adjustment', provenance?.adjustment],
    ['provenance.currency', provenance?.currency],
    ['provenance.timezone', provenance?.timezone],
  ].filter(([, value]) => value === undefined || value === null || value === '').map(([field]) => String(field));
  const contractComplete = requiredNumbers.every((value) => typeof value === 'number' && Number.isFinite(value))
    && typeof run.params.market_rules === 'string'
    && run.params.price_limit_ratio !== undefined
    && Boolean(run.params.benchmark)
    && Boolean(
    provenance?.provider && provenance.as_of && provenance.frequency
    && provenance.adjustment && provenance.currency && provenance.timezone,
  );
  const show = (value: unknown) => value === undefined ? 'UNKNOWN' : String(value ?? 'auto');
  return {
    id: `strategy:${run.id}`,
    kind: 'strategy',
    title: `${run.symbol.toUpperCase()} · MA${run.params.short_window}/${run.params.long_window}`,
    object: run.symbol.toUpperCase(),
    asOf: text(provenance?.as_of ?? run.params.end_date),
    source: text(provenance?.provider),
    quality: provenance?.quality_flags?.length ? provenance.quality_flags.join(', ') : '无质量标记',
    evidence: `已保存实验 #${run.id} · ${run.metrics.trade_count} 笔交易`,
    href: `/strategy-lab/ma-crossover?symbol=${encodeURIComponent(run.symbol)}`,
    missingFields,
    contract: {
      period: `${run.params.start_date} → ${run.params.end_date}`,
      parameters: `MA${show(run.params.short_window)}/${show(run.params.long_window)} · 资金 ${show(run.params.initial_capital)} · 回撤止损 ${show(run.params.max_drawdown_stop_pct)} · 市场规则 ${show(run.params.market_rules)} · 涨跌停 ${show(run.params.price_limit_ratio)} · 验证 ${show(run.params.validation_samples)}`,
      costs: `佣金 ${show(run.params.commission_bps)}bps · 滑点 ${show(run.params.slippage_bps)}bps · 印花税 ${show(run.params.sell_stamp_duty_bps)}bps · 最低佣金 ${show(run.params.minimum_commission_cny)}`,
      benchmark: run.params.benchmark,
      source: `${provenance?.provider ?? 'UNKNOWN'} · ${provenance?.as_of ?? 'UNKNOWN'} · ${provenance?.frequency ?? 'UNKNOWN'} · ${provenance?.adjustment ?? 'UNKNOWN'} · ${provenance?.currency ?? 'UNKNOWN'} · ${provenance?.timezone ?? 'UNKNOWN'}`,
      complete: contractComplete,
    },
    metrics: {
      totalReturn: run.metrics.total_return,
      excessReturn: run.metrics.excess_return,
      maxDrawdown: run.metrics.max_drawdown,
      annualizedVolatility: run.metrics.annualized_volatility ?? null,
      tradeCount: run.metrics.trade_count,
    },
  };
}

function portfolioCandidate(review: PortfolioReview): ComparisonCandidate {
  return {
    id: `portfolio:${review.id}`,
    kind: 'portfolio',
    title: review.portfolio,
    object: review.portfolio,
    asOf: text(review.createdAt),
    source: '本机派生风险摘要',
    quality: review.completed ? '已完成复盘' : '待复盘',
    evidence: `${review.summary} · 复查 ${review.dueAt.slice(0, 10)}`,
    href: '/portfolio',
  };
}

export function buildComparisonCandidates(
  workspaces: ResearchWorkspace[],
  backtests: BacktestRun[],
): ComparisonCandidate[] {
  return [
    ...workspaces.map(researchCandidate).filter((item): item is ComparisonCandidate => item != null),
    ...backtests.map(strategyCandidate).filter((item): item is ComparisonCandidate => item != null),
    ...readPortfolioReviews().map(portfolioCandidate),
  ];
}

export function assessComparison(items: ComparisonCandidate[]): ComparisonAssessment {
  if (items.length < 2) {
    return { status: 'insufficient', message: '至少选择两个来源记录后再比较。', differences: [] };
  }
  const kinds = new Set(items.map((item) => item.kind));
  if (kinds.size > 1) {
    return {
      status: 'cross_type',
      message: '跨类型只核对对象、时间、来源和证据，不计算数值差或综合排名。',
      differences: ['对象类型不同'],
    };
  }
  if (items[0].kind !== 'strategy') {
    return {
      status: 'metadata_only',
      message: '当前来源没有共同且同口径的数值合同，只展示元数据与原始证据。',
      differences: [],
    };
  }
  const contracts = items.map((item) => item.contract);
  if (contracts.some((contract) => !contract?.complete)) {
    return {
      status: 'incompatible',
      message: '至少一个实验缺少完整期间、参数、成本、基准或来源口径，数值保持不可比。',
      differences: ['合同字段不完整'],
    };
  }
  const fields: Array<[keyof ComparisonContract, string]> = [
    ['period', '期间'], ['parameters', '参数/资金/风控'], ['costs', '成本'], ['benchmark', '基准'], ['source', '来源口径'],
  ];
  const differences = fields
    .filter(([field]) => contracts.some((contract) => contract?.[field] !== contracts[0]?.[field]))
    .map(([, label]) => label);
  if (differences.length) {
    return {
      status: 'incompatible',
      message: `以下口径不同：${differences.join('、')}；不展示数值差或排序。`,
      differences,
    };
  }
  return {
    status: 'comparable',
    message: '期间、参数、成本、基准和来源口径一致，可并排查看后端原始指标；不生成推荐。',
    differences: [],
  };
}
