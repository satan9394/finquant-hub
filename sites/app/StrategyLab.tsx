"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BacktestRun } from "@/lib/types";

type ApiError = { error?: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error ?? `请求失败 (${response.status})`);
  return payload;
}

const percentage = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const number = (value: number | null) => value == null ? "—" : value.toFixed(3);

function Curve({ run, kind }: { run: BacktestRun; kind: "equity" | "drawdown" }) {
  const paths = useMemo(() => {
    const main = kind === "equity" ? run.result.equityCurve : run.result.drawdownCurve;
    const benchmark = kind === "equity" ? run.result.benchmarkCurve : [];
    const values = [...main.map((point) => point.value), ...benchmark.map((point) => point.value)];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = (items: typeof main) => items.map((point, index) => `${(index / Math.max(items.length - 1, 1)) * 920},${320 - ((point.value - min) / span) * 280}`).join(" ");
    return { main: points(main), benchmark: benchmark.length ? points(benchmark) : "", start: main[0]?.time, end: main.at(-1)?.time };
  }, [kind, run]);
  const tableRows = kind === "equity"
    ? run.result.equityCurve.map((point, index) => ({ time: point.time, value: point.value, benchmark: run.result.benchmarkCurve[index]?.value }))
    : run.result.drawdownCurve.map((point) => ({ time: point.time, value: point.value, benchmark: undefined }));
  return (
    <div className="backtest-chart">
      <svg viewBox="0 0 920 350" role="img" aria-label={kind === "equity" ? "策略净值与基准净值" : "最大回撤曲线"}>
        <path d="M0 40H920M0 180H920M0 320H920" className="grid-line" />
        {paths.benchmark && <polyline points={paths.benchmark} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 7" />}
        <polyline points={paths.main} fill="none" stroke={kind === "equity" ? "#0f766e" : "#dc5261"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{paths.start}</span><span>{paths.end}</span>
      <details className="chart-data">
        <summary>查看图表数据</summary>
        <div className="table-scroll"><table><thead><tr><th>日期</th><th>{kind === "equity" ? "策略净值" : "回撤"}</th>{kind === "equity" && <th>基准净值</th>}</tr></thead>
          <tbody>{tableRows.map((row) => <tr key={row.time}><td>{row.time}</td><td>{row.value.toFixed(4)}</td>{kind === "equity" && <td>{row.benchmark?.toFixed(4) ?? "—"}</td>}</tr>)}</tbody>
        </table></div>
      </details>
    </div>
  );
}

export default function StrategyLab({ initialSymbol }: { initialSymbol: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [symbol, setSymbol] = useState(initialSymbol || "AAPL");
  const [startDate, setStartDate] = useState(yearAgo);
  const [endDate, setEndDate] = useState(today);
  const [shortWindow, setShortWindow] = useState(20);
  const [longWindow, setLongWindow] = useState(50);
  const [initialCapital, setInitialCapital] = useState(100_000);
  const [commissionBps, setCommissionBps] = useState(3);
  const [slippageBps, setSlippageBps] = useState(2);
  const [run, setRun] = useState<BacktestRun | null>(null);
  const [savedRuns, setSavedRuns] = useState<BacktestRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => { if (initialSymbol) setSymbol(initialSymbol); }, [initialSymbol]);
  const loadSaved = async () => {
    const payload = await request<{ items: BacktestRun[]; authenticated: boolean }>("/api/backtests?saved_only=true");
    setSavedRuns(payload.items);
    setAuthenticated(payload.authenticated);
  };
  useEffect(() => { void loadSaved().catch(() => undefined); }, []);

  const execute = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const payload = await request<{ run: BacktestRun }>("/api/backtests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, startDate, endDate, shortWindow, longWindow, initialCapital, commissionBps, slippageBps, benchmark: "buy_and_hold" }),
      });
      setRun(payload.run);
      setSymbol(payload.run.symbol);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "回测失败");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!run || run.persistence !== "account") return;
    const payload = await request<{ run: BacktestRun }>(`/api/backtests/${run.id}/save`, { method: "POST" });
    setRun(payload.run);
    await loadSaved();
  };

  return (
    <section className="strategy-lab" id="strategy-lab">
      <div className="strategy-heading">
        <div><p className="eyebrow">EXECUTABLE STRATEGY</p><h2>双均线策略实验室</h2><p>信号在收盘确认，下一交易日开盘执行；收益已扣除佣金与滑点。</p></div>
        <span>真实日线 · 无未来函数 · 可保存</span>
      </div>
      <div className="strategy-grid">
        <form className="strategy-form" onSubmit={(event) => void execute(event)}>
          <label htmlFor="strategy-symbol">股票代码或公司名称</label><input id="strategy-symbol" name="strategy-symbol" required aria-describedby={error ? "backtest-error" : undefined} value={symbol} onChange={(event) => setSymbol(event.target.value)} />
          <div className="field-pair"><div><label htmlFor="strategy-start">开始日期</label><input id="strategy-start" name="strategy-start" required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div><div><label htmlFor="strategy-end">结束日期</label><input id="strategy-end" name="strategy-end" required type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></div></div>
          <div className="field-pair"><div><label htmlFor="strategy-short">短均线</label><input id="strategy-short" name="strategy-short" required type="number" min="2" max="200" value={shortWindow} onChange={(event) => setShortWindow(Number(event.target.value))} /></div><div><label htmlFor="strategy-long">长均线</label><input id="strategy-long" name="strategy-long" required type="number" min="3" max="250" value={longWindow} onChange={(event) => setLongWindow(Number(event.target.value))} /></div></div>
          <label htmlFor="strategy-capital">初始资金</label><input id="strategy-capital" name="strategy-capital" required type="number" min="1" value={initialCapital} onChange={(event) => setInitialCapital(Number(event.target.value))} />
          <div className="field-pair"><div><label htmlFor="strategy-commission">佣金（bps）</label><input id="strategy-commission" name="strategy-commission" required type="number" min="0" value={commissionBps} onChange={(event) => setCommissionBps(Number(event.target.value))} /></div><div><label htmlFor="strategy-slippage">滑点（bps）</label><input id="strategy-slippage" name="strategy-slippage" required type="number" min="0" value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))} /></div></div>
          <button className="primary" disabled={busy}>{busy ? "正在加载真实行情并计算…" : "运行 MA 回测"}</button>
          {error && <div className="error" id="backtest-error" role="alert">{error}</div>}
          <div className="saved-backtests"><small>SAVED BACKTESTS</small>{savedRuns.length === 0 && <p>{authenticated ? "还没有已保存回测。" : "公共演示不显示任何账户的已保存回测。"}</p>}{savedRuns.map((item) => <button type="button" key={item.id} onClick={() => setRun(item)}><strong>{item.name}</strong><span>MA{item.params.shortWindow}/MA{item.params.longWindow} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</span></button>)}</div>
        </form>

        <div className="strategy-results">
          {!run && <div className="strategy-empty"><strong>等待第一轮回测</strong><p>默认参数为 AAPL、MA20/MA50、10 万初始资金、3 bps 佣金与 2 bps 滑点。</p></div>}
          {run && <>
            <div className="result-toolbar"><div><small>COMPLETED</small><h3>{run.name} · MA{run.params.shortWindow}/MA{run.params.longWindow}</h3></div><button onClick={() => void save()} disabled={run.saved || run.persistence !== "account"}>{run.persistence !== "account" ? "登录后可保存" : run.saved ? "已保存" : "保存结果"}</button></div>
            <div className="backtest-metrics">
              <div><span>总收益</span><strong>{percentage(run.result.metrics.totalReturn)}</strong></div><div><span>年化收益</span><strong>{percentage(run.result.metrics.annualizedReturn)}</strong></div>
              <div><span>基准收益</span><strong>{percentage(run.result.metrics.benchmarkReturn)}</strong></div><div><span>超额收益</span><strong>{percentage(run.result.metrics.excessReturn)}</strong></div>
              <div><span>最大回撤</span><strong>{percentage(run.result.metrics.maxDrawdown)}</strong></div><div><span>Sharpe</span><strong>{number(run.result.metrics.sharpeRatio)}</strong></div>
              <div><span>Sortino</span><strong>{number(run.result.metrics.sortinoRatio)}</strong></div><div><span>胜率</span><strong>{percentage(run.result.metrics.winRate)}</strong></div>
              <div><span>盈亏比</span><strong>{number(run.result.metrics.profitFactor)}</strong></div><div><span>换手（初始资金倍数）</span><strong>{number(run.result.metrics.turnover)}</strong></div>
              <div><span>交易数</span><strong>{run.result.metrics.tradeCount}</strong></div>
            </div>
            <h4>策略净值与买入持有基准</h4><Curve run={run} kind="equity" />
            <h4>回撤曲线</h4><Curve run={run} kind="drawdown" />
            <div className="provenance"><strong>数据来源</strong><span>{run.provider} · 截止 {run.dataAsOf.slice(0, 19)} · {run.currency} · {run.adjustment} · {run.frequency}</span>{run.result.warnings.map((warning) => <em key={warning}>{warning}</em>)}</div>
            <div className="trade-table"><table><thead><tr><th>买入</th><th>卖出</th><th>买入价</th><th>卖出价</th><th>手续费</th><th>滑点成本</th><th>盈亏</th></tr></thead><tbody>{run.result.trades.map((trade, index) => <tr key={`${trade.entryTime}-${index}`}><td>{trade.entryTime}</td><td>{trade.exitTime}</td><td>{trade.entryPrice.toFixed(2)}</td><td>{trade.exitPrice.toFixed(2)}</td><td>{(trade.entryFee + trade.exitFee).toFixed(2)}</td><td>{(trade.entrySlippageCost + trade.exitSlippageCost).toFixed(2)}</td><td className={trade.pnl >= 0 ? "up" : "down"}>{trade.pnl.toFixed(2)}</td></tr>)}</tbody></table></div>
          </>}
        </div>
      </div>
    </section>
  );
}
