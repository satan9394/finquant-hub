export type MarketSnapshot = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
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
  history: Array<{ date: string; close: number; volume: number }>;
  source: string;
  asOf: string;
};

export type Evidence = { title: string; url: string; publisher: string; publishedAt: string | null };

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
