export type MarketSnapshot = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  dailyChange: number;
  dailyChangePercent: number;
  periodReturn: number | null;
  periodReturnPercent: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  metrics: {
    return20d: number | null;
    return60d: number | null;
    volatility20d: number | null;
    ma20: number | null;
    ma60: number | null;
    rsi14: number | null;
    maxDrawdown1y: number | null;
  };
  history: Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>;
  source: string;
  asOf: string;
};

export type Evidence = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  relevanceScore: number;
  matchedTerms: string[];
};

export type ResearchReport = {
  id: string;
  groupId: string;
  symbol: string;
  name: string;
  title: string;
  query: string;
  contentMd: string;
  evidence: Evidence[];
  snapshot: MarketSnapshot;
  createdAt: string;
  aiEnhanced: boolean;
  persistence: "account" | "ephemeral";
};

export type ResearchGroup = {
  id: string;
  symbol: string;
  displayName: string;
  market: string;
  reportCount: number;
  updatedAt: string;
  latestReportId: string | null;
  latestTitle: string | null;
};

export type BacktestParams = {
  symbol: string;
  startDate: string;
  endDate: string;
  shortWindow: number;
  longWindow: number;
  initialCapital: number;
  commissionBps: number;
  slippageBps: number;
  benchmark: "buy_and_hold";
};

export type BacktestTrade = {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryFee: number;
  exitFee: number;
  entrySlippageCost: number;
  exitSlippageCost: number;
  pnl: number;
  return: number;
  forcedExit: boolean;
};

export type BacktestResult = {
  metrics: {
    totalReturn: number;
    annualizedReturn: number;
    benchmarkReturn: number;
    excessReturn: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
    sortinoRatio: number | null;
    winRate: number | null;
    profitFactor: number | null;
    turnover: number;
    tradeCount: number;
  };
  equityCurve: Array<{ time: string; value: number }>;
  benchmarkCurve: Array<{ time: string; value: number }>;
  drawdownCurve: Array<{ time: string; value: number }>;
  trades: BacktestTrade[];
  orderMarks: Array<{ time: string; price: number; side: "buy" | "sell" }>;
  warnings: string[];
};

export type BacktestRun = {
  id: string;
  symbol: string;
  name: string;
  status: "completed" | "failed";
  params: BacktestParams;
  result: BacktestResult;
  provider: string;
  dataAsOf: string;
  timezone: string;
  currency: string;
  adjustment: string;
  frequency: string;
  saved: boolean;
  persistence: "account" | "ephemeral";
  createdAt: string;
  updatedAt: string;
};
