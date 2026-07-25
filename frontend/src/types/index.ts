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
  turnover_rate: number;
  pe: number;
  pb: number;
  market_cap: number;
  amplitude: number;
  timestamp: number;
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
    ma?: { ma5: (number | null)[]; ma10: (number | null)[]; ma20: (number | null)[]; ma30: (number | null)[]; ma60: (number | null)[] };
    macd?: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] };
    rsi?: { rsi6: (number | null)[]; rsi12: (number | null)[]; rsi24: (number | null)[] };
    kdj?: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] };
    boll?: { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] };
    atr?: { atr14: (number | null)[] };
    volma?: { volma5: (number | null)[]; volma20: (number | null)[] };
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
  api_key: string | null;
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
  current_phase: 'active' | 'done';
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

export interface SignalSummary {
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  signals: SignalBadge[];
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
