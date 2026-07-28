import { describe, expect, mock, test } from "bun:test";

type Row = Record<string, unknown>;

const reportRow: Row = {
  id: "report-a",
  group_id: "owner-a:group-a",
  symbol: "AAPL",
  name: "Apple Inc.",
  title: "Apple research",
  query: "trend",
  content_md: "# Report",
  evidence_json: "[]",
  snapshot_json: "{}",
  ai_enhanced: 0,
  created_at: "2026-07-28T00:00:00.000Z",
};

const backtestRow: Row = {
  id: "backtest-a",
  symbol: "AAPL",
  name: "Apple Inc.",
  status: "completed",
  params_json: "{}",
  result_json: "{}",
  provider: "Yahoo Finance",
  data_as_of: "2026-07-28T00:00:00.000Z",
  timezone: "America/New_York",
  currency: "USD",
  adjustment: "split-adjusted",
  frequency: "1d",
  saved: 1,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
};

const mutations: Array<{ sql: string; values: unknown[] }> = [];

class FakeStatement {
  values: unknown[] = [];

  constructor(readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.includes("FROM research_reports") && this.sql.includes("id = ?")) {
      return this.values[0] === "owner-a" && this.values[1] === "report-a" ? reportRow : null;
    }
    if (this.sql.includes("FROM quant_backtests") && this.sql.includes("id = ?")) {
      return this.values[0] === "owner-a" && this.values[1] === "backtest-a" ? backtestRow : null;
    }
    return null;
  }

  async all() {
    return { results: [] };
  }

  async run() {
    mutations.push({ sql: this.sql, values: this.values });
    return { success: true };
  }
}

const fakeDb = {
  prepare(sql: string) {
    return new FakeStatement(sql);
  },
  async batch() {
    return [];
  },
};

mock.module("cloudflare:workers", () => ({ env: { DB: fakeDb } }));

const { deleteReport, getBacktest, getReport, markBacktestSaved } = await import("../lib/database");

describe("database ownership boundary", () => {
  test("does not expose a report or backtest to another account", async () => {
    expect((await getReport("owner-a", "report-a"))?.id).toBe("report-a");
    expect(await getReport("owner-b", "report-a")).toBeNull();
    expect((await getBacktest("owner-a", "backtest-a"))?.id).toBe("backtest-a");
    expect(await getBacktest("owner-b", "backtest-a")).toBeNull();
  });

  test("does not delete or save another account's record", async () => {
    mutations.length = 0;
    expect(await deleteReport("owner-b", "report-a")).toBeFalse();
    expect(await markBacktestSaved("owner-b", "backtest-a")).toBeNull();
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.sql).toContain("WHERE owner_id = ? AND id = ?");
    expect(mutations[0]?.values.slice(1)).toEqual(["owner-b", "backtest-a"]);
  });
});
