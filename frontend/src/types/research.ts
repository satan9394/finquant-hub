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
  as_of: string;
  currency: string | null;
  period_type: string | null;
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
  saved: boolean;
  created_at?: string;
  updated_at?: string;
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
    win_rate: number | null;
    profit_factor: number | null;
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
