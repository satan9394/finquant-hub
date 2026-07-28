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
        owner_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        display_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT '',
        report_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )`),
      binding.prepare("CREATE UNIQUE INDEX IF NOT EXISTS research_groups_owner_symbol_unique ON research_groups (owner_id, symbol)"),
      binding.prepare(`CREATE TABLE IF NOT EXISTS research_reports (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
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
      binding.prepare("CREATE INDEX IF NOT EXISTS research_reports_group_idx ON research_reports (owner_id, group_id, created_at DESC)"),
      binding.prepare("CREATE INDEX IF NOT EXISTS research_reports_symbol_idx ON research_reports (owner_id, symbol, created_at DESC)"),
      binding.prepare(`CREATE TABLE IF NOT EXISTS quant_backtests (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
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
      binding.prepare("CREATE INDEX IF NOT EXISTS quant_backtests_saved_idx ON quant_backtests (owner_id, saved, updated_at DESC)"),
    ]);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function saveReport(report: ResearchReport, ownerId: string): Promise<ResearchReport> {
  await ensureSchema();
  const binding = db();
  const stored = { ...report, groupId: `${ownerId}:${report.groupId}`, persistence: "account" as const };
  await binding.batch([
    binding.prepare(`INSERT INTO research_groups
      (id, owner_id, symbol, display_name, market, report_count, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        market = excluded.market,
        report_count = research_groups.report_count + 1,
        updated_at = excluded.updated_at`)
      .bind(stored.groupId, ownerId, stored.symbol, stored.name, stored.snapshot.exchange, stored.createdAt),
    binding.prepare(`INSERT INTO research_reports
      (id, owner_id, group_id, symbol, name, title, query, content_md, evidence_json, snapshot_json, ai_enhanced, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        stored.id,
        ownerId,
        stored.groupId,
        stored.symbol,
        stored.name,
        stored.title,
        stored.query,
        stored.contentMd,
        JSON.stringify(stored.evidence),
        JSON.stringify(stored.snapshot),
        stored.aiEnhanced ? 1 : 0,
        stored.createdAt,
      ),
  ]);
  return stored;
}

export async function listGroups(ownerId: string): Promise<ResearchGroup[]> {
  await ensureSchema();
  const rows = await db().prepare(`SELECT
      g.id, g.symbol, g.display_name, g.market, g.report_count, g.updated_at,
      r.id AS latest_report_id, r.title AS latest_title
    FROM research_groups g
    LEFT JOIN research_reports r ON r.id = (
      SELECT id FROM research_reports WHERE owner_id = ? AND group_id = g.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE g.owner_id = ?
    ORDER BY g.updated_at DESC`).bind(ownerId, ownerId).all<Record<string, unknown>>();
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
    persistence: "account",
  };
}

export async function listReports(ownerId: string, groupId: string): Promise<ResearchReport[]> {
  await ensureSchema();
  const rows = await db().prepare("SELECT * FROM research_reports WHERE owner_id = ? AND group_id = ? ORDER BY created_at DESC")
    .bind(ownerId, groupId).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapReport);
}

export async function getReport(ownerId: string, id: string): Promise<ResearchReport | null> {
  await ensureSchema();
  const row = await db().prepare("SELECT * FROM research_reports WHERE owner_id = ? AND id = ?")
    .bind(ownerId, id).first<Record<string, unknown>>();
  return row ? mapReport(row) : null;
}

export async function deleteReport(ownerId: string, id: string): Promise<boolean> {
  await ensureSchema();
  const binding = db();
  const row = await binding.prepare("SELECT group_id FROM research_reports WHERE owner_id = ? AND id = ?")
    .bind(ownerId, id).first<{ group_id: string }>();
  if (!row) return false;
  await binding.prepare("DELETE FROM research_reports WHERE owner_id = ? AND id = ?").bind(ownerId, id).run();
  const remaining = await binding.prepare("SELECT COUNT(*) AS count FROM research_reports WHERE owner_id = ? AND group_id = ?")
    .bind(ownerId, row.group_id).first<{ count: number }>();
  if (!remaining?.count) {
    await binding.prepare("DELETE FROM research_groups WHERE owner_id = ? AND id = ?").bind(ownerId, row.group_id).run();
  } else {
    await binding.prepare(`UPDATE research_groups SET report_count = ?, updated_at = (
      SELECT created_at FROM research_reports WHERE owner_id = ? AND group_id = ? ORDER BY created_at DESC LIMIT 1
    ) WHERE owner_id = ? AND id = ?`).bind(remaining.count, ownerId, row.group_id, ownerId, row.group_id).run();
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
    persistence: "account",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function saveBacktest(run: BacktestRun, ownerId: string): Promise<BacktestRun> {
  await ensureSchema();
  await db().prepare(`INSERT INTO quant_backtests
    (id, owner_id, symbol, name, status, params_json, result_json, provider, data_as_of, timezone, currency, adjustment, frequency, saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      run.id, ownerId, run.symbol, run.name, run.status, JSON.stringify(run.params), JSON.stringify(run.result), run.provider,
      run.dataAsOf, run.timezone, run.currency, run.adjustment, run.frequency, run.saved ? 1 : 0, run.createdAt, run.updatedAt,
    ).run();
  return { ...run, persistence: "account" };
}

export async function listBacktests(ownerId: string, savedOnly = false): Promise<BacktestRun[]> {
  await ensureSchema();
  const sql = `SELECT * FROM quant_backtests WHERE owner_id = ?${savedOnly ? " AND saved = 1" : ""} ORDER BY updated_at DESC LIMIT 50`;
  const rows = await db().prepare(sql).bind(ownerId).all<Record<string, unknown>>();
  return (rows.results ?? []).map(mapBacktest);
}

export async function getBacktest(ownerId: string, id: string): Promise<BacktestRun | null> {
  await ensureSchema();
  const row = await db().prepare("SELECT * FROM quant_backtests WHERE owner_id = ? AND id = ?")
    .bind(ownerId, id).first<Record<string, unknown>>();
  return row ? mapBacktest(row) : null;
}

export async function markBacktestSaved(ownerId: string, id: string): Promise<BacktestRun | null> {
  await ensureSchema();
  await db().prepare("UPDATE quant_backtests SET saved = 1, updated_at = ? WHERE owner_id = ? AND id = ?")
    .bind(new Date().toISOString(), ownerId, id).run();
  return getBacktest(ownerId, id);
}
