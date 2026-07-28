import { describe, expect, test } from "bun:test";
import { buildBaseReport } from "../lib/research";
import type { MarketSnapshot } from "../lib/types";

const snapshot: MarketSnapshot = {
  symbol: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  currency: "USD",
  price: 200,
  previousClose: 190,
  dailyChange: 10,
  dailyChangePercent: 5.263157,
  periodReturn: 0.5,
  periodReturnPercent: 50,
  fiftyTwoWeekHigh: 210,
  fiftyTwoWeekLow: 120,
  metrics: { return20d: 4, return60d: 10, volatility20d: 20, ma20: 195, ma60: 180, rsi14: 60, maxDrawdown1y: -15 },
  history: [],
  source: "fixture",
  asOf: "2026-07-27T00:00:00Z",
};

describe("research question contract", () => {
  test("does not substitute technical indicators for unsupported fundamental questions", () => {
    const report = buildBaseReport(snapshot, [], "现金流与产品周期");
    expect(report).toContain("## 对用户问题的直接回答");
    expect(report).toContain("**UNKNOWN**");
    expect(report).toContain("不能用价格指标替代现金流、产品周期");
  });

  test("labels supported market observations as facts and inferences", () => {
    const report = buildBaseReport(snapshot, [], "当前趋势和主要风险");
    expect(report).toContain("**FACT**");
    expect(report).toContain("**INFERENCE**");
    expect(report).toContain("| 日涨跌幅 | +5.26% |");
  });
});
