import { runMaCrossover, validateBacktestParams } from "@/lib/backtest";
import { listBacktests, saveBacktest } from "@/lib/database";
import { getSnapshot } from "@/lib/market";
import type { BacktestParams, BacktestRun } from "@/lib/types";

function parseBody(body: Record<string, unknown>): BacktestParams {
  const params: BacktestParams = {
    symbol: String(body.symbol ?? "").trim(),
    startDate: String(body.startDate ?? ""),
    endDate: String(body.endDate ?? ""),
    shortWindow: Number(body.shortWindow ?? 20),
    longWindow: Number(body.longWindow ?? 50),
    initialCapital: Number(body.initialCapital ?? 100_000),
    commissionBps: Number(body.commissionBps ?? 3),
    slippageBps: Number(body.slippageBps ?? 2),
    benchmark: "buy_and_hold",
  };
  if (!params.symbol || params.symbol.length > 80) throw new Error("请输入有效股票代码或公司名称");
  if (![params.shortWindow, params.longWindow, params.initialCapital, params.commissionBps, params.slippageBps].every(Number.isFinite)) {
    throw new Error("回测参数必须是有效数字");
  }
  validateBacktestParams(params);
  return params;
}

export async function GET(request: Request) {
  try {
    const savedOnly = new URL(request.url).searchParams.get("saved_only") === "true";
    return Response.json({ items: await listBacktests(savedOnly) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "回测历史加载失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const params = parseBody(await request.json() as Record<string, unknown>);
    const snapshot = await getSnapshot(params.symbol);
    params.symbol = snapshot.symbol;
    const result = runMaCrossover(snapshot, params);
    const now = new Date().toISOString();
    const run: BacktestRun = {
      id: crypto.randomUUID(), symbol: snapshot.symbol, name: snapshot.name, status: "completed", params, result,
      provider: snapshot.source, dataAsOf: snapshot.asOf, timezone: snapshot.exchange.includes("Hong Kong") ? "Asia/Hong_Kong" : snapshot.symbol.endsWith(".SS") || snapshot.symbol.endsWith(".SZ") ? "Asia/Shanghai" : "America/New_York",
      currency: snapshot.currency, adjustment: "split_dividend_adjusted", frequency: "1d", saved: false, createdAt: now, updatedAt: now,
    };
    await saveBacktest(run);
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "回测失败" }, { status: 422 });
  }
}
