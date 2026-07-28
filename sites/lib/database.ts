import { env } from "cloudflare:workers";
import type { BacktestRun, ResearchGroup, ResearchReport } from "./types";

type RuntimeEnv = { DB?: D1Database };

function db(): D1Database {
  const binding = (env as unknown as RuntimeEnv).DB;
  if (!binding) throw new Error("研究数据库尚未绑定");
  return binding;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const binding = db();
    await binding.batch([
      binding.prepare(`CREATE TABLE IF NOT EXISTS research_groups (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT '',
        report_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`),
      binding.prepare(`CREATE TABLE IF NOT EXISTS research_reports (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        query TEXT NOT NULL DEFAULT '',
        content_md TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '[]',
        snapshot_json TEXT NOT NULL,
        ai_enhanced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (group_id) REFERENCES research_groups(id) ON DELETE CASCADE
      )`),
      binding.prepare("CREATE INDEX IF NOT EXISTS research_reports_group_idx ON research_reports (group_id, created_at DESC)"),
      binding.prepare("CREATE INDEX IF NOT EXISTS research_reports_symbol_idx ON research_reports (symbol, created_at DESC)"),
      binding.prepare(`CREATE TABLE IF NOT EXISTS quant_backtests (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        params_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        provider TEXT NOT NULL,
        data_as_of TEXT NOT NULL,
        timezone TEXT NOT NULL,
        currency TEXT NOT NULL,
        adjustment TEXT NOT NULL,
        frequency TEXT NOT NULL,
        saved INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      binding.prepare("CREATE INDEX IF NOT EXISTS quant_backtests_saved_idx ON quant_backtests (saved, updated_at DESC)"),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function saveReport(report: ResearchReport): Promise<void> {
  await ensureSchema();
  const binding = db();
  await binding.batch([
    binding.prepare(`INSERT INTO research_groups
      (id, symbol, display_name, market, report_count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        display_name = excluded.display_name,
        market = excluded.market,
        report_count = research_groups.report_count + 1,
        updated_at = excluded.updated_at`)
      .bind(report.groupId, report.symbol, report.name, report.snapshot.exchange, report.createdAt),
    binding.prepare(`INSERT INTO research_reports
      (id, group_id, symbol, name, title, query, content_md, evidence_json, snapshot_json, ai_enhanced, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        report.id,
        report.groupId,
        report.symbol,
        report.name,
        report.title,
        report.query,
        report.contentMd,
        JSON.stringify(report.evidence),
        JSON.stringify(report.snapshot),
        report.aiEnhanced ? 1 : 0,
        report.createdAt,
      ),
  ]);
}

export async function listGroups(): Promise<ResearchGroup[]> {
  await ensureSchema();
  const rows = await db().prepare(`SELECT
      g.id, g.symbol, g.display_name, g.market, g.report_count, g.updated_at,
      r.id AS latest_report_id, r.title AS latest_title
    FROM research_groups g
    LEFT JOIN research_reports r ON r.id = (
      SELECT id FROM research_reports WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1
    )
    ORDER BY g.updated_at DESC`).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({
    id: String(row.id),
    symbol: String(row.symbol),
    displayName: String(row.display_name),
    market: String(row.market ?? ""),
    reportCount: Number(row.report_count),
    updatedAt: String(row.updated_at),
    latestReportId: row.latest_report_id ? String(row.latest_report_id) : null,
    latestTitle: row.latest_title ? String(row.latest_title) : null,
  }));
}

function mapReport(row: Record<string, unknown>): ResearchReport {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    symbol: String(row.symbol),
    name: String(row.name),
    title: String(row.title),
    query: String(row.query ?? ""),
    contentMd: String(row.content_md),
    evidence: JSON.parse(String(row.evidence_json ?? "[]")),
    snapshot: JSON.parse(String(row.snapshot_json)),
    createdAt: String(row.created_at),
    aiEnhanced: Number(row.ai_enhanced) === 1,
  };
}

export async function listReports(groupId: string): Promise<ResearchReport[]> {
  await ensureSchema();
  const rows = await db().prepare("SELECT * FROM research_reports WHERE group_id = ? ORDER BY created_at DESC").bind(groupId).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapReport);
}

export async function getReport(id: string): Promise<ResearchReport | null> {
  await ensureSchema();
  const row = await db().prepare("SELECT * FROM research_reports WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return row ? mapReport(row) : null;
}

export async function deleteReport(id: string): Promise<boolean> {
  await ensureSchema();
  const binding = db();
  const row = await binding.prepare("SELECT group_id FROM research_reports WHERE id = ?").bind(id).first<{ group_id: string }>();
  if (!row) return false;
  await binding.prepare("DELETE FROM research_reports WHERE id = ?").bind(id).run();
  const remaining = await binding.prepare("SELECT COUNT(*) AS count FROM research_reports WHERE group_id = ?").bind(row.group_id).first<{ count: number }>();
  if (!remaining?.count) {
    await binding.prepare("DELETE FROM research_groups WHERE id = ?").bind(row.group_id).run();
  } else {
    await binding.prepare(`UPDATE research_groups SET report_count = ?, updated_at = (
      SELECT created_at FROM research_reports WHERE group_id = ? ORDER BY created_at DESC LIMIT 1
    ) WHERE id = ?`).bind(remaining.count, row.group_id, row.group_id).run();
  }
  return true;
}

function mapBacktest(row: Record<string, unknown>): BacktestRun {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    name: String(row.name),
    status: String(row.status) as BacktestRun["status"],
    params: JSON.parse(String(row.params_json)),
    result: JSON.parse(String(row.result_json)),
    provider: String(row.provider),
    dataAsOf: String(row.data_as_of),
    timezone: String(row.timezone),
    currency: String(row.currency),
    adjustment: String(row.adjustment),
    frequency: String(row.frequency),
    saved: Number(row.saved) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveBacktest(run: BacktestRun): Promise<void> {
  await ensureSchema();
  await db().prepare(`INSERT INTO quant_backtests
    (id, symbol, name, status, params_json, result_json, provider, data_as_of, timezone, currency, adjustment, frequency, saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      run.id, run.symbol, run.name, run.status, JSON.stringify(run.params), JSON.stringify(run.result), run.provider,
      run.dataAsOf, run.timezone, run.currency, run.adjustment, run.frequency, run.saved ? 1 : 0, run.createdAt, run.updatedAt,
    ).run();
}

export async function listBacktests(savedOnly = false): Promise<BacktestRun[]> {
  await ensureSchema();
  const sql = `SELECT * FROM quant_backtests${savedOnly ? " WHERE saved = 1" : ""} ORDER BY updated_at DESC LIMIT 50`;
  const rows = await db().prepare(sql).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapBacktest);
}

export async function getBacktest(id: string): Promise<BacktestRun | null> {
  await ensureSchema();
  const row = await db().prepare("SELECT * FROM quant_backtests WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return row ? mapBacktest(row) : null;
}

export async function markBacktestSaved(id: string): Promise<BacktestRun | null> {
  await ensureSchema();
  await db().prepare("UPDATE quant_backtests SET saved = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return getBacktest(id);
}
