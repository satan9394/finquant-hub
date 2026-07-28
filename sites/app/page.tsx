"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { MarketSnapshot, ResearchGroup, ResearchReport } from "@/lib/types";

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
  const positive = snapshot.changePercent >= 0;
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
    </div>
  );
}

function ReportBody({ markdown }: { markdown: string }) {
  const rows = markdown.split("\n");
  return (
    <article className="report-body">
      {rows.map((line, index) => {
        if (!line.trim()) return <div className="spacer" key={index} />;
        if (line.startsWith("# ")) return <h1 key={index}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
        if (line.startsWith("> ")) return <blockquote key={index}>{line.slice(2).replaceAll("  ", " ")}</blockquote>;
        if (line.startsWith("- ")) return <p className="bullet" key={index}>• {line.slice(2).replaceAll("**", "")}</p>;
        if (/^\d+\. /.test(line)) return <p className="numbered" key={index}>{line}</p>;
        if (line.startsWith("|")) return <code className="table-row" key={index}>{line}</code>;
        return <p key={index}>{line.replaceAll("**", "")}</p>;
      })}
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

  const loadGroups = useCallback(async () => {
    try {
      const payload = await api<{ groups: ResearchGroup[] }>("/api/research");
      setGroups(payload.groups);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "历史加载失败");
    }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  const lookup = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy("quote");
    setError(null);
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
      await loadGroups();
      const groupPayload = await api<{ reports: ResearchReport[] }>(`/api/research?group=${encodeURIComponent(payload.report.groupId)}`);
      setReports(groupPayload.reports);
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
    if (!report || !window.confirm("删除这份研究记录？同一股票的其他记录会保留。")) return;
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
        <div className="source-status"><i /> 真实行情 · 持久化记录 · 多 API 兼容</div>
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
          <p className="history-note">同一股票的多次研究会合并在一个标的下，不再拆成重复会话。</p>
          <div className="group-list">
            {groups.length === 0 && <div className="empty">尚无记录。完成第一份研究后会自动归档。</div>}
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
              <input id="symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="AAPL / 600519 / 0700.HK / Microsoft" autoComplete="off" />
              <button className="secondary" disabled={busy !== null}>{busy === "quote" ? "查询中…" : "查询行情"}</button>
            </div>
            <label htmlFor="question">研究问题</label>
            <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} />
            <button className="primary" type="button" disabled={busy !== null || !symbol.trim()} onClick={() => void research()}>
              {busy === "research" ? "正在获取行情、联网检索并保存…" : "开始深度研究"}
            </button>
            {error && <div className="error" role="alert">{error}</div>}
          </form>

          {snapshot ? (
            <section className="snapshot">
              <div className="quote-head">
                <div><span className="market-tag">{snapshot.exchange || "GLOBAL"}</span><h2>{snapshot.name}</h2><p>{snapshot.symbol} · {snapshot.currency}</p></div>
                <div className="price"><strong>{money(snapshot.price, snapshot.currency)}</strong><span className={snapshot.changePercent >= 0 ? "up" : "down"}>{pct(snapshot.changePercent)}</span></div>
              </div>
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
                <div><small>SAVED RESEARCH</small><h2>{report.title}</h2></div>
                <div className="actions">
                  <a href={`/api/research/${report.id}/export?format=html`}>HTML</a>
                  <a href={`/api/research/${report.id}/export?format=md`}>MD</a>
                  <a href={`/api/research/${report.id}/export?format=pdf`} target="_blank" rel="noreferrer">PDF</a>
                  <a href={`/api/research/${report.id}/export?format=doc`}>Word</a>
                  <button onClick={() => void removeReport()}>删除</button>
                </div>
              </div>
              <ReportBody markdown={report.contentMd} />
            </section>
          )}
        </div>
      </section>

      <footer><span>FinQuant Hub Sites Edition</span><span>公开数据存在延迟，仅供研究，不构成投资建议。</span></footer>
    </main>
  );
}
