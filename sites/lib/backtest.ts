import type { BacktestParams, BacktestResult, MarketSnapshot } from "./types";

const round = (value: number, digits = 8) => Number(value.toFixed(digits));

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1));
}

function movingAverage(values: number[], period: number): Array<number | null> {
  let total = 0;
  return values.map((value, index) => {
    total += value;
    if (index >= period) total -= values[index - period];
    return index >= period - 1 ? total / period : null;
  });
}

export function validateBacktestParams(params: BacktestParams): void {
  if (params.shortWindow < 2) throw new Error("短均线必须大于等于 2");
  if (params.longWindow <= params.shortWindow) throw new Error("长均线必须大于短均线");
  if (params.startDate >= params.endDate) throw new Error("开始日期必须早于结束日期");
  if (params.initialCapital <= 0) throw new Error("初始资金必须大于 0");
  if (params.commissionBps < 0 || params.slippageBps < 0) throw new Error("手续费和滑点不能为负数");
}

export function runMaCrossover(snapshot: MarketSnapshot, params: BacktestParams): BacktestResult {
  validateBacktestParams(params);
  const bars = snapshot.history.filter((bar) => bar.date >= params.startDate && bar.date <= params.endDate);
  if (bars.length < params.longWindow + 2) {
    throw new Error(`K线数据不足：需要至少 ${params.longWindow + 2} 条，实际 ${bars.length} 条`);
  }
  for (const [index, bar] of bars.entries()) {
    for (const field of ["open", "high", "low", "close"] as const) {
      if (!Number.isFinite(bar[field]) || bar[field] <= 0) throw new Error(`第 ${index + 1} 条K线的 ${field} 无效`);
    }
  }

  const closes = bars.map((bar) => bar.close);
  const shortMa = movingAverage(closes, params.shortWindow);
  const longMa = movingAverage(closes, params.longWindow);
  const targets = bars.map((_, index) => shortMa[index] != null && longMa[index] != null && shortMa[index]! > longMa[index]! ? 1 : 0);
  const commission = params.commissionBps / 10_000;
  const slippage = params.slippageBps / 10_000;
  let cash = params.initialCapital;
  let shares = 0;
  let turnoverNotional = 0;
  let entry: null | { entryTime: string; entryPrice: number; quantity: number; entryFee: number; entryNotional: number; entrySlippageCost: number } = null;
  const trades: BacktestResult["trades"] = [];
  const orderMarks: BacktestResult["orderMarks"] = [];
  const equityValues: number[] = [];

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const target = index > 0 ? targets[index - 1] : 0;
    if (target === 1 && shares === 0) {
      const fillPrice = bar.open * (1 + slippage);
      shares = cash / (fillPrice * (1 + commission));
      const entryNotional = shares * fillPrice;
      const entryFee = entryNotional * commission;
      cash -= entryNotional + entryFee;
      turnoverNotional += entryNotional;
      entry = { entryTime: bar.date, entryPrice: fillPrice, quantity: shares, entryFee, entryNotional, entrySlippageCost: shares * (fillPrice - bar.open) };
      orderMarks.push({ time: bar.date, price: round(fillPrice, 6), side: "buy" });
    } else if (target === 0 && shares > 0 && entry) {
      const fillPrice = bar.open * (1 - slippage);
      const exitNotional = shares * fillPrice;
      const exitFee = exitNotional * commission;
      cash += exitNotional - exitFee;
      turnoverNotional += exitNotional;
      const pnl = (exitNotional - exitFee) - (entry.entryNotional + entry.entryFee);
      trades.push({
        entryTime: entry.entryTime, exitTime: bar.date, entryPrice: round(entry.entryPrice), exitPrice: round(fillPrice), quantity: round(shares),
        entryFee: round(entry.entryFee), exitFee: round(exitFee), entrySlippageCost: round(entry.entrySlippageCost),
        exitSlippageCost: round(shares * (bar.open - fillPrice)), pnl: round(pnl), return: round(pnl / (entry.entryNotional + entry.entryFee)), forcedExit: false,
      });
      orderMarks.push({ time: bar.date, price: round(fillPrice, 6), side: "sell" });
      shares = 0;
      entry = null;
    }
    equityValues.push(cash + shares * bar.close);
  }

  const warnings: string[] = [];
  if (shares > 0 && entry) {
    const bar = bars.at(-1)!;
    const fillPrice = bar.close * (1 - slippage);
    const exitNotional = shares * fillPrice;
    const exitFee = exitNotional * commission;
    cash += exitNotional - exitFee;
    turnoverNotional += exitNotional;
    const pnl = (exitNotional - exitFee) - (entry.entryNotional + entry.entryFee);
    trades.push({
      entryTime: entry.entryTime, exitTime: bar.date, entryPrice: round(entry.entryPrice), exitPrice: round(fillPrice), quantity: round(shares),
      entryFee: round(entry.entryFee), exitFee: round(exitFee), entrySlippageCost: round(entry.entrySlippageCost),
      exitSlippageCost: round(shares * (bar.close - fillPrice)), pnl: round(pnl), return: round(pnl / (entry.entryNotional + entry.entryFee)), forcedExit: true,
    });
    orderMarks.push({ time: bar.date, price: round(fillPrice, 6), side: "sell" });
    equityValues[equityValues.length - 1] = cash;
    warnings.push("期末持仓已按最后收盘价强制平仓");
  }

  const benchmarkValues = closes.map((close) => params.initialCapital * close / closes[0]);
  let peak = equityValues[0];
  const drawdownValues = equityValues.map((value) => {
    peak = Math.max(peak, value);
    return value / peak - 1;
  });
  const dailyReturns = equityValues.map((value, index) => index === 0 ? 0 : value / equityValues[index - 1] - 1);
  const volatility = sampleStd(dailyReturns);
  const downside = dailyReturns.filter((value) => value < 0);
  const downsideDeviation = sampleStd(downside);
  const totalReturn = equityValues.at(-1)! / params.initialCapital - 1;
  const benchmarkReturn = benchmarkValues.at(-1)! / params.initialCapital - 1;
  const annualizedReturn = (Math.max(equityValues.at(-1)!, 1e-12) / params.initialCapital) ** (252 / Math.max(equityValues.length - 1, 1)) - 1;
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl < 0);
  if (!trades.length) warnings.push("回测区间没有产生交易");
  if (wins.length && !losses.length) warnings.push("没有亏损交易，盈亏比不可定义");
  const curve = (values: number[]) => values.map((value, index) => ({ time: bars[index].date, value: round(value, 6) }));

  return {
    metrics: {
      totalReturn: round(totalReturn), annualizedReturn: round(annualizedReturn), benchmarkReturn: round(benchmarkReturn), excessReturn: round(totalReturn - benchmarkReturn),
      maxDrawdown: round(Math.min(...drawdownValues)), sharpeRatio: volatility > 0 ? round(mean(dailyReturns) / volatility * Math.sqrt(252)) : null,
      sortinoRatio: downsideDeviation > 0 ? round(mean(dailyReturns) / downsideDeviation * Math.sqrt(252)) : null,
      winRate: trades.length ? round(wins.length / trades.length) : null,
      profitFactor: losses.length ? round(wins.reduce((sum, trade) => sum + trade.pnl, 0) / Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0))) : null,
      turnover: round(turnoverNotional / params.initialCapital), tradeCount: trades.length,
    },
    equityCurve: curve(equityValues), benchmarkCurve: curve(benchmarkValues), drawdownCurve: curve(drawdownValues), trades, orderMarks, warnings,
  };
}
