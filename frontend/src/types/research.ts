export type Instrument = {
  symbol: string;
  name: string;
  market: 'CN' | 'HK' | 'US';
  exchange: string;
  currency: string;
  asset_type: string;
  provider?: string;
};
export type Provenance = {
  provider: string | null;
  as_of: string | null;
  timezone: string | null;
  currency: string | null;
  adjustment: string | null;
  frequency: string | null;
  quality_flags: string[];
};

export type SnapshotResponse = Provenance & {
  instrument: Instrument;
  data: {
    price: number;
    last_close: number;
    open: number | null;
    high: number | null;
    low: number | null;
    volume: number | null;
    amount: number | null;
    change: number;
    change_percent: number;
    turnover_rate: number | null;
    pe: number | null;
    pb: number | null;
    market_cap: number | null;
    amplitude: number | null;
  };
};

export type Bar = {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BarsResponse = Provenance & {
  instrument: Instrument;
  items: Bar[];
  indicators: {
    ma?: Record<string, (number | null)[]>;
    macd?: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] };
    rsi?: Record<string, (number | null)[]>;
  };
};

export type FundamentalItem = {
  metric: string;
  value: number;
  as_of: string | null;
  currency: string | null;
  period_type: string | null;
  provider?: string | null;
  source?: string | null;
  is_ttm?: boolean;
  components?: string[];
  methodology?: string;
  quality_flags?: string[];
};

export type FundamentalsResponse = Provenance & {
  instrument: Instrument;
  items: FundamentalItem[];
};

export type ChipCostRange = {
  low: number;
  high: number;
  concentration: number;
};

export type ChipDistributionItem = {
  date: string;
  profit_ratio: number;
  average_cost: number;
  cost_90: ChipCostRange;
  cost_70: ChipCostRange;
  chip_peak: null;
};

export type ChipDistributionResponse = Provenance & {
  symbol: string;
  source: string;
  methodology: 'akshare_cyq_calculator_120_day_turnover_decay';
  latest: ChipDistributionItem;
  items: ChipDistributionItem[];
};

export type InstrumentSearchResponse = Provenance & { items: Instrument[] };

export type EvidenceItem = {
  label: 'FACT' | 'INFERENCE' | 'ASSUMPTION' | 'MODEL_OUTPUT' | 'UNKNOWN';
  title: string;
  detail: string;
  provider?: string | null;
  as_of?: string | null;
};

export type ResearchWorkspace = {
  id?: number;
  symbol: string;
  name?: string;
  notes: string;
  instrument?: Instrument;
  evidence: EvidenceItem[];
  snapshot?: SnapshotResponse | null;
  saved?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ResearchReportVersion = {
  id: number;
  ticker: string;
  company_name?: string;
  model_id?: number | null;
  status: 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at?: string | null;
};

export type ResearchReportDetail = ResearchReportVersion & {
  report_data: Record<string, unknown>;
  agent_results?: Record<string, unknown>;
};

export type ResearchHistoryGroup = {
  ticker: string;
  company_name?: string;
  run_count: number;
  completed_count: number;
  failed_count: number;
  latest_at: string;
  runs: ResearchReportVersion[];
};

export type ResearchDiscussionSummary = {
  id: number;
  topic: string;
  current_phase: 'active' | 'done' | 'failed';
  summary: string | null;
  created_at: string;
};

export type ResearchThesisSummary = {
  id: number;
  ticker: string;
  title: string;
  status: 'open' | 'closed' | 'invalidated';
  drift_status: 'unknown' | 'stable' | 'drifted';
  updated_at: string;
  source_report_id?: number | null;
};

export type BacktestCreatePayload = {
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
  market_rules?: 'auto' | 'none';
  price_limit_ratio?: number | null;
  validation_samples?: number;
};

export type CurvePoint = { time: string; value: number };
export type BacktestTrade = {
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  entry_fee: number;
  exit_fee: number;
  entry_commission?: number;
  exit_commission?: number;
  entry_stamp_duty?: number;
  exit_stamp_duty?: number;
  pnl: number;
  return: number;
  forced_exit: boolean;
};

export type BacktestRun = {
  id: number;
  symbol: string;
  status: 'queued' | 'loading_data' | 'running' | 'calculating_metrics' | 'completed' | 'failed' | 'cancelled';
  params: BacktestCreatePayload;
  error_message?: string | null;
  is_saved?: boolean;
  provenance?: Provenance;
  metrics?: {
    total_return: number;
    annualized_return: number;
    benchmark_return: number;
    excess_return: number;
    max_drawdown: number;
    sharpe_ratio: number | null;
    sortino_ratio: number | null;
    calmar_ratio: number | null;
    information_ratio: number | null;
    annualized_volatility?: number | null;
    annualized_downside_volatility?: number | null;
    max_drawdown_duration_periods?: number;
    max_drawdown_recovery_periods?: number | null;
    max_drawdown_recovered?: boolean;
    beta?: number | null;
    alpha?: number | null;
    r_squared?: number | null;
    tracking_error?: number | null;
    win_rate: number | null;
    profit_factor: number | null;
    trade_expectancy?: number | null;
    average_win?: number | null;
    average_loss?: number | null;
    average_holding_periods?: number | null;
    market_exposure?: number;
    total_commission_cost?: number;
    total_stamp_duty_cost?: number;
    total_slippage_cost?: number;
    total_trading_cost?: number;
    trading_cost_ratio?: number;
    turnover: number;
    trade_count: number;
  };
  equity_curve?: CurvePoint[];
  benchmark_curve?: CurvePoint[];
  drawdown_curve?: CurvePoint[];
  trades?: BacktestTrade[];
  order_marks?: { time: string; price: number; side: 'buy' | 'sell' }[];
  rejected_orders?: { time: string; side: 'buy' | 'sell'; reason: string }[];
  execution_rules?: {
    market: string;
    t_plus_one: boolean;
    allow_short: boolean;
    price_limit_ratio: number | null;
    assumptions: string[];
    period: string;
  };
  risk_controls?: {
    max_drawdown_stop_pct: number | null;
    trigger_count: number;
    trigger_dates: string[];
    execution: string;
  };
  validation?: {
    bootstrap: {
      confidence_interval: [number, number];
      probability_positive: number;
      samples: number;
    };
    monte_carlo: {
      terminal_return: { p05: number; median: number; p95: number };
      probability_loss: number;
      probability_bust: number;
      samples: number;
      max_drawdown: { worst_confidence_tail: number; median: number };
    };
    walk_forward: {
      status: 'ok' | 'insufficient_data';
      fold_count?: number;
      positive_fold_ratio?: number;
      median_fold_return?: number;
    };
  };
  warnings?: string[];
};

export type SharePreview = {
  schema_version: 'share-preview/v1';
  visibility: 'private';
  published: false;
  publish_action_available: false;
  generated_at: string;
  object: {
    type: 'thesis' | 'strategy_backtest';
    id: number;
    title: string;
    subject_id: string;
    status: string;
    version?: number;
    updated_at?: string | null;
  };
  content: {
    result_kind: 'USER_HYPOTHESIS' | 'COMPUTED_RESULT';
    causal_proof: false;
    judgment?: string;
    confidence?: number | null;
    assumptions?: string[];
    claims?: string[];
    invalidation_conditions?: string[];
    observed_at?: string | null;
    method?: string;
    parameters?: Record<string, unknown>;
    metrics?: Record<string, number>;
  };
  evidence?: Array<{
    evidence_id: string;
    relation: string;
    kind: string;
    data_status: string;
    source?: string | null;
    vendor?: string | null;
    as_of?: string | null;
    retrieved_at?: string | null;
    quality_flags: string[];
    license_scope?: string | null;
    public_reuse_permitted: boolean;
  }>;
  provenance?: {
    provider?: string | null;
    as_of?: string | null;
    timezone?: string | null;
    currency?: string | null;
    adjustment?: string | null;
    frequency?: string | null;
    quality_flags: string[];
    license_scope?: string | null;
    license_status: string;
    public_reuse_permitted: boolean;
  };
  audit: {
    provenance: { status: string; [key: string]: unknown };
    freshness: { status: string; [key: string]: unknown };
    license: { status: string; [key: string]: unknown };
    quality: { status: string };
    redaction: {
      status: 'PASS' | 'FAIL';
      redacted_count: number;
      redacted_field_paths: string[];
      output_scan_passed: boolean;
    };
    disclaimer: { status: 'PRESENT'; text: string };
  };
  publication_gate: { status: 'BLOCKED'; reasons: string[]; requires: string };
};
