"use client";

import { FormEvent, Fragment, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { MarketSnapshot, ResearchGroup, ResearchReport } from "@/lib/types";
import StrategyLab from "./StrategyLab";

type ApiError = { error?: string };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error ?? `请求失败 (${response.status})`);
  return payload;
}

const money = (value: number, currency: string) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, style: currency ? "currency" : "decimal", currency: currency || undefined }).format(value);
const pct = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
const num = (value: number | null) => value == null ? "—" : value.toFixed(2);

function Sparkline({ snapshot }: { snapshot: MarketSnapshot }) {
  const points = useMemo(() => {
    const rows = snapshot.history.slice(-90);
    if (rows.length < 2) return "";
    const values = rows.map((row) => row.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values.map((value, index) => `${(index / (values.length - 1)) * 760},${168 - ((value - min) / span) * 142}`).join(" ");
  }, [snapshot]);
  const positive = snapshot.dailyChangePercent >= 0;
  const rows = snapshot.history.slice(-90);
  return (
    <div className="chart" aria-label={`${snapshot.symbol} 近 90 日价格走势`}>
      <svg viewBox="0 0 760 190" role="img">
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={positive ? "#18b6a4" : "#ef6a77"} stopOpacity=".34" />
            <stop offset="1" stopColor={positive ? "#18b6a4" : "#ef6a77"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 36H760M0 96H760M0 156H760" className="grid-line" />
        <polygon points={`0,190 ${points} 760,190`} fill="url(#chartFill)" />
        <polyline points={points} fill="none" stroke={positive ? "#18b6a4" : "#ef6a77"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>90 个交易日</span>
      <span>数据截至 {snapshot.history.at(-1)?.date}</span>
      <details className="chart-data">
        <summary>查看价格数据表</summary>
        <div className="table-scroll">
          <table><thead><tr><th>日期</th><th>复权收盘价</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.close.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) return <a href={link[2]} key={index} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function markdownCells(line: string): string[] {
  return line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function ReportBody({ markdown }: { markdown: string }) {
  const rows = markdown.split("\n");
  const output: ReactNode[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const line = rows[index];
    if (line.startsWith("|") && rows[index + 1]?.match(/^\|(?:\s*:?-+:?\s*\|)+$/)) {
      const header = markdownCells(line);
      const body: string[][] = [];
      index += 2;
      while (index < rows.length && rows[index].startsWith("|")) {
        body.push(markdownCells(rows[index]));
        index += 1;
      }
      index -= 1;
      output.push(
        <div className="report-table table-scroll" key={`table-${index}`}>
          <table><thead><tr>{header.map((cell) => <th key={cell}>{inlineMarkdown(cell)}</th>)}</tr></thead>
            <tbody>{body.map((cells, rowIndex) => <tr key={rowIndex}>{cells.map((cell, cellIndex) => <td key={cellIndex}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (!line.trim()) output.push(<div className="spacer" key={index} />);
    else if (line.startsWith("# ")) output.push(<h1 key={index}>{inlineMarkdown(line.slice(2))}</h1>);
    else if (line.startsWith("## ")) output.push(<h2 key={index}>{inlineMarkdown(line.slice(3))}</h2>);
    else if (line.startsWith("> ")) output.push(<blockquote key={index}>{inlineMarkdown(line.slice(2).replaceAll("  ", " "))}</blockquote>);
    else if (line.startsWith("- ")) output.push(<p className="bullet" key={index}>• {inlineMarkdown(line.slice(2))}</p>);
    else if (/^\d+\. /.test(line)) output.push(<p className="numbered" key={index}>{inlineMarkdown(line)}</p>);
    else output.push(<p key={index}>{inlineMarkdown(line)}</p>);
  }
  return (
    <article className="report-body">
      {output}
    </article>
  );
}

export default function Home() {
  const [symbol, setSymbol] = useState("AAPL");
  const [question, setQuestion] = useState("当前趋势、主要风险与下一步需要核验什么？");
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [groups, setGroups] = useState<ResearchGroup[]>([]);
  const [reports, setReports] = useState<ResearchReport[]>([]);
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState<"quote" | "research" | "history" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  const loadGroups = useCallback(async () => {
    try {
      const payload = await api<{ groups: ResearchGroup[]; authenticated: boolean }>("/api/research");
      setGroups(payload.groups);
      setAuthenticated(payload.authenticated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "历史加载失败");
    }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const lookup = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy("quote");
    setError(null);
    setSnapshot(null);
    setReport(null);
    setReports([]);
    setActiveGroup(null);
    try {
      const payload = await api<{ snapshot: MarketSnapshot }>(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
      setSnapshot(payload.snapshot);
      setSymbol(payload.snapshot.symbol);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "查询失败");
    } finally {
      setBusy(null);
    }
  };

  const research = async () => {
    setBusy("research");
    setError(null);
    setSnapshot(null);
    setReport(null);
    setReports([]);
    setActiveGroup(null);
    try {
      const payload = await api<{ report: ResearchReport }>("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, query: question }),
      });
      setReport(payload.report);
      setSnapshot(payload.report.snapshot);
      setSymbol(payload.report.symbol);
      setActiveGroup(payload.report.groupId);
      if (payload.report.persistence === "account") {
        await loadGroups();
        const groupPayload = await api<{ reports: ResearchReport[] }>(`/api/research?group=${encodeURIComponent(payload.report.groupId)}`);
        setReports(groupPayload.reports);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "研究失败");
    } finally {
      setBusy(null);
    }
  };

  const openGroup = async (group: ResearchGroup) => {
    setBusy("history");
    setError(null);
    try {
      const payload = await api<{ reports: ResearchReport[] }>(`/api/research?group=${encodeURIComponent(group.id)}`);
      setActiveGroup(group.id);
      setReports(payload.reports);
      setReport(payload.reports[0] ?? null);
      if (payload.reports[0]) {
        setSnapshot(payload.reports[0].snapshot);
        setSymbol(payload.reports[0].symbol);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "历史加载失败");
    } finally {
      setBusy(null);
    }
  };

  const removeReport = async () => {
    if (!report || report.persistence !== "account" || !window.confirm("删除这份研究记录？同一股票的其他记录会保留。")) return;
    try {
      await api<{ ok: true }>(`/api/research/${report.id}`, { method: "DELETE" });
      const next = reports.filter((item) => item.id !== report.id);
      setReports(next);
      setReport(next[0] ?? null);
      await loadGroups();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
    }
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="FinQuant Hub 首页">
          <span className="brand-mark">FQ</span>
          <span><strong>FinQuant Hub</strong><small>全球量化研究台</small></span>
        </a>
        <nav className="topnav"><a href="#top">标的研究</a><a href="#strategy-lab">策略实验室</a></nav>
        <div className="source-status"><i /> 真实行情 · 证据门控 · 账户隔离</div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">RESEARCH, WITH RECEIPTS</p>
          <h1>从一个代码，得到一份<br /><em>有证据的研究记录。</em></h1>
          <p className="lead">支持 A 股、港股、美股及 Yahoo Finance 覆盖市场。行情、指标、新闻来源与历史报告放在同一个工作台里。</p>
        </div>
        <div className="capability-list">
          <span>01 全球代码解析</span><span>02 联网证据检索</span><span>03 D1 持久存储</span><span>04 四格式导出</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="history-panel">
          <div className="panel-heading"><div><small>RESEARCH LIBRARY</small><h2>研究历史</h2></div><span>{groups.length} 个标的</span></div>
          <p className="history-note">{authenticated ? "这里只显示当前账户保存的研究记录。" : "公共演示不读取或保存他人的历史；登录后才启用账户隔离存储。"}</p>
          <div className="group-list">
            {groups.length === 0 && <div className="empty">{authenticated ? "尚无记录。完成第一份研究后会自动归档。" : "公共演示历史为空，且不会读取其他访客记录。"}</div>}
            {groups.map((group) => (
              <button className={activeGroup === group.id ? "group active" : "group"} key={group.id} onClick={() => void openGroup(group)}>
                <span className="ticker-chip">{group.symbol.slice(0, 5)}</span>
                <span><strong>{group.displayName}</strong><small>{group.symbol} · {group.reportCount} 份报告</small></span>
                <b>›</b>
              </button>
            ))}
          </div>
          {activeGroup && reports.length > 0 && (
            <div className="report-list">
              <small>该标的的研究记录</small>
              {reports.map((item) => <button className={report?.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setReport(item); setSnapshot(item.snapshot); }}>{new Date(item.createdAt).toLocaleString("zh-CN")}<span>{item.aiEnhanced ? "AI 增强" : "数据研究"}</span></button>)}
            </div>
          )}
        </aside>

        <div className="main-panel">
          <form className="query-box" onSubmit={(event) => void lookup(event)}>
            <label htmlFor="symbol">股票代码或公司名称</label>
            <div className="query-row">
              <input id="symbol" name="symbol" required aria-describedby={error ? "research-error" : undefined} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="AAPL / 600519 / 0700.HK / Microsoft" autoComplete="off" />
              <button className="secondary" disabled={busy !== null}>{busy === "quote" ? "查询中…" : "查询行情"}</button>
            </div>
            <label htmlFor="question">研究问题</label>
            <textarea id="question" name="question" required aria-describedby={error ? "research-error" : undefined} value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} />
            <button className="primary" type="button" disabled={busy !== null || !symbol.trim()} onClick={() => void research()}>
              {busy === "research" ? "正在获取行情并进行证据门控…" : "开始深度研究"}
            </button>
            {error && <div className="error" id="research-error" role="alert">{error}</div>}
          </form>

          {snapshot ? (
            <section className="snapshot">
              <div className="quote-head">
                <div><span className="market-tag">{snapshot.exchange || "GLOBAL"}</span><h2>{snapshot.name}</h2><p>{snapshot.symbol} · {snapshot.currency}</p></div>
                <div className="price"><strong>{money(snapshot.price, snapshot.currency)}</strong><span className={snapshot.dailyChangePercent >= 0 ? "up" : "down"}>日涨跌 {pct(snapshot.dailyChangePercent)}</span><small>昨收 {money(snapshot.previousClose, snapshot.currency)}</small></div>
              </div>
              <a className="lab-link" href="#strategy-lab">在策略实验室打开 {snapshot.symbol} →</a>
              <Sparkline snapshot={snapshot} />
              <div className="metrics">
                <div><span>20 日收益</span><strong>{pct(snapshot.metrics.return20d)}</strong></div>
                <div><span>60 日收益</span><strong>{pct(snapshot.metrics.return60d)}</strong></div>
                <div><span>RSI (14)</span><strong>{num(snapshot.metrics.rsi14)}</strong></div>
                <div><span>年化波动</span><strong>{pct(snapshot.metrics.volatility20d)}</strong></div>
                <div><span>一年最大回撤</span><strong>{pct(snapshot.metrics.maxDrawdown1y)}</strong></div>
              </div>
            </section>
          ) : (
            <section className="welcome-card"><span>01</span><h2>先输入任意股票代码</h2><p>系统会自动识别市场与标准代码。数字代码自动区分 A 股与港股，英文代码会检索全球交易所。</p><div>AAPL · TSLA · 600519 · 000001 · 0700.HK · 9988.HK</div></section>
          )}

          {report && (
            <section className="report-panel">
              <div className="report-toolbar">
                <div><small>{report.persistence === "account" ? "SAVED RESEARCH" : "EPHEMERAL RESEARCH"}</small><h2>{report.title}</h2></div>
                {report.persistence === "account" ? <div className="actions">
                  <a href={`/api/research/${report.id}/export?format=html`}>HTML</a>
                  <a href={`/api/research/${report.id}/export?format=md`}>MD</a>
                  <a href={`/api/research/${report.id}/export?format=pdf`} target="_blank" rel="noreferrer">PDF</a>
                  <a href={`/api/research/${report.id}/export?format=doc`}>Word</a>
                  <button onClick={() => void removeReport()}>删除</button>
                </div> : <p className="ephemeral-note">公共演示结果仅在当前页面保留；登录后可保存、导出与删除自己的记录。</p>}
              </div>
              <ReportBody markdown={report.contentMd} />
            </section>
          )}
        </div>
      </section>

      <StrategyLab initialSymbol={snapshot?.symbol ?? symbol} />

      <footer><span>FinQuant Hub Sites Edition</span><span>公开数据存在延迟，仅供研究，不构成投资建议。</span></footer>
    </main>
  );
}
