import { describe, expect, test } from "bun:test";
import { runMaCrossover } from "../lib/backtest";
import type { BacktestParams, MarketSnapshot } from "../lib/types";

function fixture(closes: number[]): MarketSnapshot {
  return {
    symbol: "TEST", name: "Test", exchange: "Test", currency: "USD", price: closes.at(-1)!,
    previousClose: closes.at(-2)!, dailyChange: closes.at(-1)! - closes.at(-2)!, dailyChangePercent: 0,
    periodReturn: closes.at(-1)! / closes[0] - 1, periodReturnPercent: (closes.at(-1)! / closes[0] - 1) * 100,
    fiftyTwoWeekHigh: Math.max(...closes), fiftyTwoWeekLow: Math.min(...closes),
    metrics: { return20d: null, return60d: null, volatility20d: null, ma20: null, ma60: null, rsi14: null, maxDrawdown1y: null },
    history: closes.map((close, index) => ({ date: `2026-01-${String(index + 1).padStart(2, "0")}`, open: close, high: close * 1.01, low: close * .99, close, volume: 1000 })),
    source: "fixture", asOf: "2026-01-12T00:00:00Z",
  };
}

const params: BacktestParams = {
  symbol: "TEST", startDate: "2026-01-01", endDate: "2026-01-31", shortWindow: 2, longWindow: 3,
  initialCapital: 10_000, commissionBps: 0, slippageBps: 0, benchmark: "buy_and_hold",
};

describe("MA crossover", () => {
  test("returns aligned curves and completed trades", () => {
    const result = runMaCrossover(fixture([10, 9, 8, 9, 10, 11, 12, 11, 10, 9, 8, 9]), params);
    expect(result.equityCurve).toHaveLength(12);
    expect(result.benchmarkCurve).toHaveLength(12);
    expect(result.drawdownCurve).toHaveLength(12);
    expect(result.metrics.tradeCount).toBeGreaterThan(0);
    expect(result.metrics.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.warnings).toContain(`仅 ${result.metrics.tradeCount} 笔交易，胜率与盈亏比不具备稳定统计意义`);
    expect(result.warnings.some((warning) => warning.includes("样本不足一个完整交易年"))).toBe(true);
  });

  test("commissions and slippage reduce returns", () => {
    const snapshot = fixture([10, 9, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9]);
    const free = runMaCrossover(snapshot, params);
    const costly = runMaCrossover(snapshot, { ...params, commissionBps: 25, slippageBps: 25 });
    expect(costly.metrics.totalReturn).toBeLessThan(free.metrics.totalReturn);
    expect(costly.trades.reduce((sum, trade) => sum + trade.entryFee + trade.exitFee, 0)).toBeGreaterThan(0);
  });

  test("rejects insufficient data and invalid windows", () => {
    expect(() => runMaCrossover(fixture([10, 11, 12]), params)).toThrow("K线数据不足");
    expect(() => runMaCrossover(fixture([10, 11, 12, 13, 14, 15]), { ...params, shortWindow: 3, longWindow: 3 })).toThrow("长均线");
  });
});
