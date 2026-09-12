/* ============================================================
 * FinQuant Hub — 全局类型定义
 * 以 API_CONTRACT.md 为唯一事实来源
 * ============================================================ */

import type { UTCTimestamp } from 'lightweight-charts';

// ==================== 图表类型 ====================
export type ThemeMode = 'dark' | 'light';

// ==================== 行情数据 ====================

export interface SearchResult {
  code: string;
  name: string;
  market: string;
  type: string;
}

export interface RealTimeQuote {
  code: string;
  name: string;
  price: number;
  last_close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  change: number;
  change_percent: number;
  turnover_rate: number | null;
  pe: number | null;
  pb: number | null;
  market_cap: number | null;
  amplitude: number | null;
  timestamp: number;
}

export interface MarketMover {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  change_percent: number | null;
  weekly_change_percent: number | null;
  turnover_rate: number | null;
  amount: number | null;
  amplitude: number | null;
  volume_ratio: number | null;
  industry: string | null;
  reason_tags: string[];
}

export interface MarketMoversResponse {
  source: string;
  scope: 'a_share_market' | 'tech_watch_pool';
  as_of: string;
  status: 'ok' | 'partial' | 'stale';
  stale: boolean;
  error?: string;
  note?: string;
  gainers: MarketMover[];
  decliners: MarketMover[];
}

export interface MarketBreadth {
  status: 'ok' | 'unavailable';
  total?: number;
  provider_total?: number;
  advancers?: number;
  decliners?: number;
  unchanged?: number;
  unknown?: number;
  error?: string;
}

export interface MarketSector {
  code: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  turnover_rate: number | null;
  advancers: number | null;
  decliners: number | null;
  leader: string | null;
  leader_change_percent: number | null;
}

export interface CapitalFlowItem {
  code: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  main_net_inflow: number | null;
  main_net_inflow_rate: number | null;
  super_large_net_inflow: number | null;
  super_large_net_inflow_rate: number | null;
  large_net_inflow: number | null;
  large_net_inflow_rate: number | null;
  medium_net_inflow: number | null;
  medium_net_inflow_rate: number | null;
  small_net_inflow: number | null;
  small_net_inflow_rate: number | null;
}

export interface WeeklyMarketMover {
  code: string;
  name: string;
  price: number | null;
  weekly_change_percent: number;
  change_percent: number | null;
  turnover_rate: number | null;
  amount: number | null;
  amplitude: number | null;
  volume_ratio: number | null;
  industry: string | null;
  ths_main_net_inflow: number | null;
  ths_main_net_inflow_unit: 'wan_cny';
  ths_industry: string | null;
  source_status: { eastmoney: boolean; tonghuashun: boolean };
  reason_tags: string[];
  eastmoney_url: string;
  tonghuashun_url: string;
}

export interface MarketPulseResponse {
  as_of: string;
  market: 'cn';
  scope: 'public_market_dimensions';
  status: 'ok' | 'partial';
  sources: string[];
  sections: {
    breadth: MarketBreadth;
    movers: Partial<MarketMoversResponse> & { status: string; error?: string };
    industry: { status?: string; source?: string; items?: MarketSector[]; error?: string };
    concept: { status?: string; source?: string; items?: MarketSector[]; error?: string };
    sector_flow: { status?: string; source?: string; items?: CapitalFlowItem[]; error?: string };
    stock_flow: { status?: string; source?: string; items?: CapitalFlowItem[]; error?: string };
    weekly: {
      status: string;
      threshold_percent?: number;
      coverage?: {
        eastmoney_candidates: number;
        tonghuashun_requested: number;
        tonghuashun_succeeded: number;
        tonghuashun_failed: number;
        tonghuashun_rate: number;
      };
      items?: WeeklyMarketMover[];
      error?: string;
    };
    popular: {
      status?: string;
      items?: Array<{
        rank: number | null;
        code: string;
        name: string;
        price: number | null;
        change_percent: number | null;
      }>;
      error?: string;
    };
  };
}

export type ThemeSort = 'change' | 'weekly' | 'capital' | 'turnover';

export interface ThemeCatalogItem {
  keyword: string;
  category: string;
  expanded_terms: string[];
}

export interface ThemeStock {
  code: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  weekly_change_percent: number | null;
  turnover_rate: number | null;
  amount: number | null;
  amplitude: number | null;
  volume_ratio: number | null;
  industry: string | null;
  main_net_inflow: number | null;
  main_net_inflow_rate: number | null;
  ths_main_net_inflow: number | null;
  ths_main_net_inflow_unit: 'wan_cny';
  ths_industry: string | null;
  source_status: { eastmoney: boolean; tonghuashun: boolean };
  reason_tags: string[];
  theme_names?: string[];
  eastmoney_url: string;
  tonghuashun_url: string;
}

export interface ClassifiedTheme extends MarketSector {
  kind: 'industry' | 'concept';
  match_score: number;
  matched_term: string;
  market_cap: number | null;
  stocks: ThemeStock[];
}

export interface MarketThemesResponse {
  keyword: string;
  category: string;
  expanded_terms: string[];
  sort_by: ThemeSort;
  source: string[];
  scope: 'public_board_catalog_and_constituents';
  as_of: string;
  status: 'ok' | 'partial' | 'empty';
  catalog: ThemeCatalogItem[];
  matched_theme_count: number;
  returned_theme_count: number;
  coverage: {
    industry_boards_scanned: number;
    concept_boards_scanned: number;
    tonghuashun_requested: number;
    tonghuashun_succeeded: number;
    tonghuashun_failed: number;
    tonghuashun_rate: number;
  };
  themes: ClassifiedTheme[];
  candidates: ThemeStock[];
}

export interface KLineDataPoint {
  day: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorData {
  ticker: string;
  days: string[];
  indicators: {
    ma?: { ma5: (number | null)[]; ma10: (number | null)[]; ma20: (number | null)[]; ma30: (number | null)[]; ma60: (number | null)[]; ma120: (number | null)[]; ma250: (number | null)[] };
    macd?: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] };
    rsi?: { rsi6: (number | null)[]; rsi12: (number | null)[]; rsi24: (number | null)[] };
    kdj?: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] };
    boll?: { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] };
    atr?: { atr14: (number | null)[] };
    volma?: { volma5: (number | null)[]; volma10: (number | null)[]; volma20: (number | null)[] };
  };
}

// ==================== 模型管理 ====================

export interface ModelConfig {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  model_name: string;
  api_key_env: string | null;
  has_api_key: boolean;
  credential_source: 'stored' | 'environment' | 'none';
  temperature: number;
  max_tokens: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface ModelTestResult {
  ok: boolean;
  latency_ms: number | null;
  message: string;
  reply?: string;
}

// ==================== 角色管理 ====================

export interface AgentPreset {
  id: number;
  name: string;
  role_key: string;
  avatar: string;
  system_prompt: string;
  model_id: number | null;
  is_preset: number;
  created_at: string;
}

// ==================== 会话与消息 ====================

export interface Session {
  id: number;
  title: string;
  mode: 'single' | 'multi';
  role_preset: string | null;
  model_id: number | null;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'agent' | 'system';
  agent_name: string | null;
  content: string;
  round_number: number;
  token_count: number | null;
  created_at: string;
  /**
   * VS28：该条回答是否因**整轮截止**被提前结束。
   * 实时由 SSE `done.truncated_by_deadline` 写入；回放由
   * `GET /chat/sessions/{id}/messages` 的同一字段写入（后端用写入端同一常量回填）。
   * 只有显式 `true` 才算截断——缺字段 = 未截断/历史数据，不得误报。
   */
  truncated_by_deadline?: boolean;
}

// ==================== 讨论 ====================

export interface DiscussionParticipant {
  role_key: string;
  name: string;
  avatar: string;
}

export interface DiscussionRoom {
  id: number;
  conversation_id: number;
  topic: string;
  participants: DiscussionParticipant[];
  total_rounds: number;
  current_phase: 'active' | 'done' | 'failed';
  summary: string | null;
  created_at: string;
}

export interface DiscussionRoomDetail {
  room: DiscussionRoom;
  messages: Message[];
}

// ==================== 仪表盘 ====================

export interface DashboardStats {
  model_count: number;
  conversation_count: number;
  discussion_count: number;
  message_count: number;
  default_model: { id: number; name: string; model_name: string } | null;
  recent_conversations: Session[];
  recent_rooms: DiscussionRoom[];
  capabilities: {
    contract_version: 'local-capabilities/v1';
    runtime_mode: 'LOCAL_ONLY' | 'AUTHENTICATED';
    local_core: { status: 'AVAILABLE'; quality_status: 'OK' };
    model_ai: {
      status: 'UNCONFIGURED' | 'CONFIGURED_UNVERIFIED';
      quality_status: 'UNKNOWN';
      credential_source: 'stored' | 'environment' | 'none';
      model_id: number | null;
      action_path: '/models';
    };
    market_data: { status: 'RUNTIME_CHECK_REQUIRED'; quality_status: 'UNKNOWN' };
  };
}

// ==================== SSE ====================

export interface SSETokenEvent {
  delta: string;
  agent?: string;
}

export interface SSEDoneEvent {
  message_id?: number;
  token_count?: number;
  user_message_id?: number;
  room_id?: number;
}

export interface SSEErrorEvent {
  message: string;
}

export interface SSERoundStartEvent {
  round: number;
  total_rounds: number;
}

export interface SSEAgentStartEvent {
  agent: string;
  name: string;
  avatar: string;
  round: number;
}

export interface SSEAgentEndEvent {
  agent: string;
  message_id: number;
  token_count: number;
}

export interface SSESummaryEvent {
  content: string;
}

// ==================== 自选股 ====================

export interface WatchlistItem {
  code: string;
  name: string;
  addedAt: number;
}

// ==================== Lightweight Charts ====================

export interface CandleData {
  time: UTCTimestamp | string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AreaChartData {
  time: UTCTimestamp | string;
  value: number;
}

export interface VolumeData {
  time: UTCTimestamp | string;
  value: number;
  color?: string;
}

export interface ChartConfig {
  theme: ThemeMode;
  height?: number;
  autoSize?: boolean;
}

// ==================== 信号系统 ====================

export interface SignalBadge {
  type: 'bullish' | 'bearish' | 'neutral';
  label: string;
  description?: string;
  strength?: number;
}

// ==================== 股票分析 ====================

export interface AnalysisRequest {
  ticker: string;
  force_refresh?: boolean;
}

export interface AnalysisSection {
  title: string;
  content: string;
  order: number;
}

export interface AnalysisResponse {
  ticker: string;
  name: string;
  sections: AnalysisSection[];
  signals: SignalBadge[];
  generated_at: string;
}

// ==================== 投资组合 ====================

export interface PortfolioGroup {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export interface PortfolioHolding {
  id: number;
  group_id: number;
  code: string;
  name: string;
  shares: number;
  cost_price: number;
  current_price?: number;
  market_value?: number;
  cost_value?: number;
  profit?: number;
  profit_percent?: number;
  weight?: number;
  added_at: string;
}

export interface PortfolioSummary {
  total_invested: number;
  total_current: number;
  total_profit: number;
  total_profit_percent: number;
  group_summaries: {
    group_id: number;
    group_name: string;
    invested: number;
    current: number;
    profit: number;
    profit_percent: number;
  }[];
}

export interface PortfolioAllocation {
  group_id: number;
  group_name: string;
  weight: number;
  items: { name: string; weight: number; code?: string }[];
}

export interface PaperPortfolio {
  id: number;
  name: string;
  base_currency: 'CNY' | 'HKD' | 'USD';
  initial_cash: number;
  status: 'ACTIVE' | 'ARCHIVED';
  account_kind: 'PAPER';
  execution_kind: 'SIMULATED';
  ledger_count?: number;
  capabilities: {
    real_account: false;
    real_orders: false;
    automatic_trading: false;
    simulated_ledger: true;
  };
}

export interface PaperValuationPosition {
  symbol: string;
  quantity: number;
  book_cost_base: number;
  data_status: 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR';
  current_price: number | null;
  market_value: number | null;
  quote_currency?: string | null;
  source?: string | null;
  as_of?: string | null;
}

export interface PaperPortfolioValuation extends PaperPortfolio {
  cash: number;
  valuation_status: 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR';
  valuation_reasons: string[];
  total_value: number | null;
  total_return: number | null;
  valuation_positions: PaperValuationPosition[];
}

export interface PaperHypothesisMemory {
  id: number;
  subject_type: string;
  subject_id: string;
  memory_type: 'hypothesis';
  information_kind: string;
  content: Record<string, unknown>;
  status: string;
}

export interface PaperReviewMemory {
  id: number;
  memory_type: 'review_outcome';
  information_kind: 'USER_HYPOTHESIS';
  content: {
    hypothesis_memory_id: number;
    outcome: 'supported' | 'refuted' | 'inconclusive';
    reason: string;
    observed_from: string;
    observed_to: string;
    simulation_result: {
      information_kind: 'COMPUTED_RESULT';
      total_value: number | null;
      total_return: number | null;
      valuation_status: PaperPortfolioValuation['valuation_status'];
    };
    causal_proof: false;
    warning: string;
  };
  created_at: string;
}

export interface PaperReviewContext {
  schema_version: 'paper-portfolio-review-context/v1';
  paper_portfolio: PaperPortfolio;
  hypotheses: PaperHypothesisMemory[];
  reviews: PaperReviewMemory[];
  causal_proof: false;
}

export interface PaperReviewDraft {
  schema_version: 'paper-portfolio-review-draft/v1';
  paper_portfolio_id: number;
  hypothesis: PaperHypothesisMemory;
  simulation_result: {
    information_kind: 'COMPUTED_RESULT';
    initial_cash: number;
    cash: number;
    total_value: number | null;
    total_return: number | null;
    valuation_status: PaperPortfolioValuation['valuation_status'];
    valuation_reasons: string[];
    positions: PaperValuationPosition[];
    formula: string;
    fee_formula: string;
  };
  outcome_options: Array<'supported' | 'refuted' | 'inconclusive'>;
  recommended_outcome: null;
  information_kind: 'USER_HYPOTHESIS';
  causal_proof: false;
  warning: string;
}

export type PortfolioBacktestPayload = {
  assets: Array<{
    symbol: string;
    period: '1d';
    short_window: number;
    long_window: number;
    market_rules: 'auto';
  }>;
  optimizer: 'equal_weight' | 'risk_parity' | 'mean_variance' | 'inverse_volatility';
  optimization_lookback: number;
  count: number;
  initial_capital: number;
  commission_bps: number;
  slippage_bps: number;
};

export type PortfolioBacktestResult = {
  strategy: string;
  optimizer: string;
  optimization_lookback: number;
  weights: Record<string, number>;
  metrics: {
    total_return: number;
    benchmark_return: number;
    excess_return: number;
    max_drawdown: number;
    turnover?: number | null;
    trade_count: number;
    win_rate: number | null;
    profit_factor: number | null;
  };
  equity_curve: Array<{ time: string; value: number }>;
  benchmark_curve: Array<{ time: string; value: number }>;
  assets: Array<{
    asset_id: string;
    symbol: string;
    period: string;
    weight: number;
    provenance: {
      provider?: string | null;
      as_of?: string | null;
      market?: string | null;
      currency?: string | null;
      quality_flags?: string[];
    };
  }>;
  risk_xray: {
    concentration: {
      hhi: number;
      effective_asset_count: number;
      largest_weight: number;
      top3_weight: number;
      level: string;
    };
    drawdown: { max: number; current: number };
    tail_risk: {
      status: string;
      observations: number;
      minimum_required?: number;
      confidence: number;
      var: number | null;
      expected_shortfall: number | null;
      var_amount: number | null;
      expected_shortfall_amount: number | null;
    };
    diversification: {
      status: string;
      observations?: number;
      average_correlation: number | null;
      benefit: number | null;
      correlation_matrix?: {
        status: string;
        observations?: number | null;
        asset_ids: string[];
        values: number[][] | null;
      };
      risk_contribution?: {
        status: string;
        observations?: number | null;
        minimum_required: number;
        method: string;
        portfolio_volatility: number | null;
        items: Array<{ asset_id: string; weight: number; contribution: number }>;
      };
    };
  };
  warnings: string[];
};

// ==================== 深度研究 ====================

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ResearchAgent {
  name: string;
  role: string;
  status: AgentStatus;
  progress?: string;
}

export interface ResearchReport {
  ticker: string;
  name: string;
  title: string;
  content: string;
  sections: { title: string; content: string }[];
  generated_at: string;
  agents: ResearchAgent[];
}

export interface ResearchSSEAgentStarted {
  type: 'agent_started';
  agent: string;
  name: string;
  role: string;
}

export interface ResearchSSEAgentCompleted {
  type: 'agent_completed';
  agent: string;
  name: string;
}

export interface ResearchSSEStatus {
  type: 'status';
  agent: string;
  message: string;
}

export interface ResearchSSEReportProgress {
  type: 'report_progress';
  content: string;
}

export interface ResearchSSEDone {
  type: 'done';
  report: ResearchReport;
}

export type ResearchSSEEvent =
  | ResearchSSEAgentStarted
  | ResearchSSEAgentCompleted
  | ResearchSSEStatus
  | ResearchSSEReportProgress
  | ResearchSSEDone;

// ==================== 选股器 ====================

export interface ScreenRequest {
  condition: string;
  page?: number;
  page_size?: number;
}

export interface ScreenResult {
  code: string;
  name: string;
  price: number;
  change_percent: number;
  reason: string;
}

// ==================== 实时报价（精简行情条） ====================

export interface PriceStats {
  price: number;
  open: number;
  high: number;
  low: number;
  last_close: number;
  change: number;
  change_percent: number;
  volume: number;
  amount: number;
  turnover_rate: number;
  amplitude: number;
  pe: number;
  pb: number;
  market_cap: number;
}
