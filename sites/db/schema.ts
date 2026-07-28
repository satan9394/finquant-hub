import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const researchGroups = sqliteTable("research_groups", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  symbol: text("symbol").notNull(),
  displayName: text("display_name").notNull(),
  market: text("market").notNull().default(""),
  reportCount: integer("report_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("research_groups_owner_symbol_unique").on(table.ownerId, table.symbol),
]);

export const researchReports = sqliteTable("research_reports", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  groupId: text("group_id").notNull().references(() => researchGroups.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  title: text("title").notNull(),
  query: text("query").notNull().default(""),
  contentMd: text("content_md").notNull(),
  evidenceJson: text("evidence_json").notNull().default("[]"),
  snapshotJson: text("snapshot_json").notNull(),
  aiEnhanced: integer("ai_enhanced").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("research_reports_group_idx").on(table.ownerId, table.groupId, table.createdAt),
  index("research_reports_symbol_idx").on(table.ownerId, table.symbol, table.createdAt),
]);

export const quantBacktests = sqliteTable("quant_backtests", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  paramsJson: text("params_json").notNull(),
  resultJson: text("result_json").notNull(),
  provider: text("provider").notNull(),
  dataAsOf: text("data_as_of").notNull(),
  timezone: text("timezone").notNull(),
  currency: text("currency").notNull(),
  adjustment: text("adjustment").notNull(),
  frequency: text("frequency").notNull(),
  saved: integer("saved").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("quant_backtests_saved_idx").on(table.ownerId, table.saved, table.updatedAt),
]);
