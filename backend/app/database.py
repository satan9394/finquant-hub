"""SQLite 数据层：aiosqlite 单例连接 + 建表 + 种子数据（WAL 模式）。"""
import json
from contextlib import asynccontextmanager
from pathlib import Path
import sqlite3
from typing import Any, AsyncIterator, cast

import aiosqlite

from . import config
from .prompts.roles import PRESET_ROLES

# 活动显式事务深度（BEGIN IMMEDIATE 后为 1）。单连接架构下，aiosqlite 的写
# 操作经同一连接串行执行；此计数用于让 database.execute() 在显式事务内部
# 不隐式 commit——否则 job 等长事务进行中一旦有其他请求 execute，会把 job
# 的部分状态提前提交（Astra A2 P1：rollback 随之失效）。
_TRANSACTION_DEPTH = 0

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version       INTEGER PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    applied_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_configs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    provider      TEXT NOT NULL DEFAULT 'openai',
    base_url      TEXT NOT NULL,
    model_name    TEXT NOT NULL,
    api_key_env   TEXT,
    api_key       TEXT,
    temperature   REAL DEFAULT 0.7,
    max_tokens    INTEGER DEFAULT 4096,
    is_default    INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT,
    mode          TEXT NOT NULL DEFAULT 'single',
    role_preset   TEXT,
    model_id      INTEGER,
    status        TEXT DEFAULT 'active',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL,
    agent_name      TEXT,
    content         TEXT NOT NULL,
    round_number    INTEGER DEFAULT 0,
    token_count     INTEGER,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, round_number, created_at);

CREATE TABLE IF NOT EXISTS agent_presets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    role_key      TEXT NOT NULL UNIQUE,
    avatar        TEXT,
    system_prompt TEXT NOT NULL,
    model_id      INTEGER,
    is_preset     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discussion_rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    topic           TEXT NOT NULL,
    participants    TEXT NOT NULL,
    total_rounds    INTEGER DEFAULT 3,
    current_phase   TEXT DEFAULT 'active',
    summary         TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS research_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    company_name  TEXT,
    report_data   TEXT NOT NULL,
    agent_results TEXT,
    model_id      INTEGER,
    status        TEXT DEFAULT 'completed',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_reports_ticker_created
    ON research_reports(ticker, created_at DESC);

CREATE TABLE IF NOT EXISTS research_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    research_id     INTEGER NOT NULL,
    event_type      TEXT NOT NULL,
    agent_role_key  TEXT,
    payload         TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (research_id) REFERENCES research_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_events_report
    ON research_events(research_id, id);

CREATE TABLE IF NOT EXISTS backtest_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    periods       INTEGER DEFAULT 252,
    params        TEXT,
    result        TEXT NOT NULL,
    status        TEXT DEFAULT 'completed',
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_workspaces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    instrument_json TEXT NOT NULL,
    notes           TEXT NOT NULL DEFAULT '',
    evidence_json   TEXT NOT NULL DEFAULT '[]',
    snapshot_json   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_workspaces_updated
    ON research_workspaces(updated_at DESC);

CREATE TABLE IF NOT EXISTS quant_backtests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    strategy_type   TEXT NOT NULL DEFAULT 'ma_crossover',
    status          TEXT NOT NULL DEFAULT 'queued',
    params_json     TEXT NOT NULL,
    result_json     TEXT,
    error_message   TEXT,
    provider        TEXT,
    data_as_of      TEXT,
    timezone        TEXT,
    currency        TEXT,
    adjustment      TEXT,
    frequency       TEXT,
    quality_flags   TEXT NOT NULL DEFAULT '[]',
    is_saved        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    started_at      TEXT,
    completed_at    TEXT,
    updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quant_backtests_symbol_created
    ON quant_backtests(symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    market        TEXT,
    summary       TEXT,
    score         REAL,
    signals       TEXT,
    indicators_snapshot TEXT,
    chapters      TEXT,
    model_id      INTEGER,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_signals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    signal_type   TEXT NOT NULL,
    direction     TEXT,
    strength      REAL,
    detected_at   TEXT DEFAULT (datetime('now')),
    expiry        TEXT,
    description   TEXT
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    agent_role_key  TEXT NOT NULL,
    tool_calls      TEXT,
    token_usage     INTEGER,
    started_at      TEXT,
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_server_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    url         TEXT NOT NULL,
    is_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
    last_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alpha_fields (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id      INTEGER,
    category      TEXT,
    name          TEXT,
    description   TEXT,
    dataset       TEXT,
    coverage      REAL,
    alpha_count   INTEGER
);

CREATE TABLE IF NOT EXISTS portfolios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    currency      TEXT DEFAULT 'CNY',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id    INTEGER NOT NULL,
    ticker          TEXT NOT NULL,
    name            TEXT DEFAULT '',
    shares          REAL NOT NULL,
    avg_cost        REAL NOT NULL,
    currency        TEXT DEFAULT 'CNY',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);
"""

_db: aiosqlite.Connection = cast(aiosqlite.Connection, None)
_TICKER_NORMALIZATION_VERSION = 1
_MEMORY_FTS_VERSION = 2
_NOTIFICATIONS_VERSION = 3
_ALERTS_VERSION = 4
_MARKET_REVIEWS_VERSION = 5
_SCHEDULED_RESEARCH_VERSION = 6
_LLM_USAGE_VERSION = 7
_THESIS_VERSION = 8
_AUTH_VERSION = 9
_OWNER_ISOLATION_VERSION = 10
_CREDENTIALS_VERSION = 11
_EVIDENCE_FOUNDATION_VERSION = 12
_INVESTMENT_MEMORY_VERSION = 13
_MEMORY_ROLLOUT_VERSION = 14
_THESIS_V2_VERSION = 15
_THESIS_EVIDENCE_VERSION = 16
_THESIS_HISTORY_VERSION = 17
_MONITOR_TARGET_VERSION = 18
_SCHEDULED_RESEARCH_LINKAGE_VERSION = 19
_THESIS_REVIEW_WORKFLOW_VERSION = 20
_PRODUCT_METRICS_VERSION = 21
_PAPER_PORTFOLIO_VERSION = 22
_JOB_RUNTIME_VERSION = 23
_SCHEMA_CLEANUP_VERSION = 24
_SCHEMA_VERSION = _SCHEMA_CLEANUP_VERSION
_OWNER_TABLES = (
    "model_configs", "conversations", "messages", "discussion_rooms",
    "research_reports", "research_events", "research_workspaces",
    "backtest_runs", "quant_backtests", "analysis_reports", "analysis_signals", "agent_runs",
    "portfolios", "positions", "notifications", "alert_rules", "alert_triggers",
    "market_reviews", "scheduled_research_jobs", "llm_usage", "thesis", "thesis_claims",
    "evidence_objects", "evidence_input_refs",
    "memory_records", "memory_rollout_audits", "thesis_versions", "thesis_version_evidence_refs",
    "thesis_claim_evidence_edges", "thesis_claim_status_events",
    "thesis_version_confirmations",
    "scheduled_research_runs",
    "thesis_review_items", "thesis_review_events",
    "product_metric_preferences", "product_metric_events",
    "paper_portfolios", "paper_portfolio_ledger",
    "scheduled_research_run_events",
)
_MIGRATION_NAMES = {
    _TICKER_NORMALIZATION_VERSION: "normalize_legacy_tickers",
    _MEMORY_FTS_VERSION: "install_memory_fts",
    _NOTIFICATIONS_VERSION: "install_notifications",
    _ALERTS_VERSION: "install_alerts",
    _MARKET_REVIEWS_VERSION: "install_market_reviews",
    _SCHEDULED_RESEARCH_VERSION: "install_scheduled_research_jobs",
    _LLM_USAGE_VERSION: "install_llm_usage",
    _THESIS_VERSION: "install_investment_theses",
    _AUTH_VERSION: "install_passwordless_auth",
    _OWNER_ISOLATION_VERSION: "install_user_data_isolation",
    _CREDENTIALS_VERSION: "install_user_credentials",
    _EVIDENCE_FOUNDATION_VERSION: "install_evidence_foundation",
    _INVESTMENT_MEMORY_VERSION: "install_investment_memory",
    _MEMORY_ROLLOUT_VERSION: "install_memory_rollout_audit",
    _THESIS_V2_VERSION: "install_thesis_v2",
    _THESIS_EVIDENCE_VERSION: "install_thesis_evidence",
    _THESIS_HISTORY_VERSION: "install_thesis_history",
    _MONITOR_TARGET_VERSION: "install_monitor_targets",
    _SCHEDULED_RESEARCH_LINKAGE_VERSION: "install_scheduled_research_linkage",
    _THESIS_REVIEW_WORKFLOW_VERSION: "install_thesis_review_workflow",
    _PRODUCT_METRICS_VERSION: "install_product_metrics",
    _PAPER_PORTFOLIO_VERSION: "install_paper_portfolios",
    _JOB_RUNTIME_VERSION: "install_job_runtime",
    _SCHEMA_CLEANUP_VERSION: "install_schema_cleanup",
}


async def init_db() -> None:
    """FastAPI lifespan 启动钩子：建库建表 + WAL + 种子数据。"""
    global _db
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing_database = config.DB_PATH.exists() and config.DB_PATH.stat().st_size > 0
    _db = await aiosqlite.connect(config.DB_PATH)
    _db.row_factory = aiosqlite.Row
    from .services.memory import normalize_for_search

    await _db.create_function("memory_normalize", 1, normalize_for_search, deterministic=True)
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    current_version = int(cast(sqlite3.Row, await (await _db.execute("PRAGMA user_version")).fetchone())[0])
    if existing_database and current_version < _OWNER_ISOLATION_VERSION:
        await _backup_database_before_owner_migration(config.DB_PATH)
    if existing_database and current_version < _EVIDENCE_FOUNDATION_VERSION:
        await _backup_database_before_evidence_migration(config.DB_PATH)
    if existing_database and current_version < _INVESTMENT_MEMORY_VERSION:
        await _backup_database_before_memory_records_migration(config.DB_PATH)
    if existing_database and current_version < _MEMORY_ROLLOUT_VERSION:
        await _backup_database_before_memory_rollout_migration(config.DB_PATH)
    if existing_database and current_version < _THESIS_V2_VERSION:
        await _backup_database_before_thesis_v2_migration(config.DB_PATH)
    if existing_database and current_version < _THESIS_EVIDENCE_VERSION:
        await _backup_database_before_thesis_evidence_migration(config.DB_PATH)
    if existing_database and current_version < _THESIS_HISTORY_VERSION:
        await _backup_database_before_thesis_history_migration(config.DB_PATH)
    if existing_database and current_version < _MONITOR_TARGET_VERSION:
        await _backup_database_before_monitor_target_migration(config.DB_PATH)
    if existing_database and current_version < _SCHEDULED_RESEARCH_LINKAGE_VERSION:
        await _backup_database_before_scheduled_research_linkage_migration(config.DB_PATH)
    if existing_database and current_version < _THESIS_REVIEW_WORKFLOW_VERSION:
        await _backup_database_before_thesis_review_workflow_migration(config.DB_PATH)
    if existing_database and current_version < _PRODUCT_METRICS_VERSION:
        await _backup_database_before_product_metrics_migration(config.DB_PATH)
    if existing_database and current_version < _PAPER_PORTFOLIO_VERSION:
        await _backup_database_before_paper_portfolio_migration(config.DB_PATH)
    if existing_database and current_version < _JOB_RUNTIME_VERSION:
        await _backup_database_before_job_runtime_migration(config.DB_PATH)
    if existing_database and current_version < _SCHEMA_CLEANUP_VERSION:
        await _backup_database_before_schema_cleanup_migration(config.DB_PATH)
    await _db.executescript(SCHEMA)
    await _migrate_schema()
    await _seed_models()
    await _seed_agents()
    await _db.commit()


async def _migrate_schema() -> None:
    """Keep existing local databases compatible without destructive resets."""
    await _ensure_column("research_reports", "model_id", "model_id INTEGER")
    await _ensure_column("research_reports", "updated_at", "updated_at TEXT")
    row = cast(sqlite3.Row, await (await _db.execute("PRAGMA user_version")).fetchone())
    version = int(row[0])

    if version < _TICKER_NORMALIZATION_VERSION:
        await _db.execute("SAVEPOINT normalize_legacy_tickers")
        try:
            await _normalize_legacy_tickers()
            await _db.execute(f"PRAGMA user_version={_TICKER_NORMALIZATION_VERSION}")
            await _record_schema_version(_TICKER_NORMALIZATION_VERSION)
            await _db.execute("RELEASE SAVEPOINT normalize_legacy_tickers")
            version = _TICKER_NORMALIZATION_VERSION
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT normalize_legacy_tickers")
            await _db.execute("RELEASE SAVEPOINT normalize_legacy_tickers")
            raise

    if version < _MEMORY_FTS_VERSION:
        await _db.execute("SAVEPOINT install_memory_fts")
        try:
            await _install_memory_fts()
            await _db.execute(f"PRAGMA user_version={_MEMORY_FTS_VERSION}")
            await _record_schema_version(_MEMORY_FTS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_memory_fts")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_memory_fts")
            await _db.execute("RELEASE SAVEPOINT install_memory_fts")
            raise
        version = _MEMORY_FTS_VERSION

    if version < _NOTIFICATIONS_VERSION:
        await _db.execute("SAVEPOINT install_notifications")
        try:
            await _install_notifications()
            await _db.execute(f"PRAGMA user_version={_NOTIFICATIONS_VERSION}")
            await _record_schema_version(_NOTIFICATIONS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_notifications")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_notifications")
            await _db.execute("RELEASE SAVEPOINT install_notifications")
            raise
        version = _NOTIFICATIONS_VERSION

    if version < _ALERTS_VERSION:
        await _db.execute("SAVEPOINT install_alerts")
        try:
            await _install_alerts()
            await _db.execute(f"PRAGMA user_version={_ALERTS_VERSION}")
            await _record_schema_version(_ALERTS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_alerts")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_alerts")
            await _db.execute("RELEASE SAVEPOINT install_alerts")
            raise
        version = _ALERTS_VERSION

    if version < _MARKET_REVIEWS_VERSION:
        await _db.execute("SAVEPOINT install_market_reviews")
        try:
            await _install_market_reviews()
            await _db.execute(f"PRAGMA user_version={_MARKET_REVIEWS_VERSION}")
            await _record_schema_version(_MARKET_REVIEWS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_market_reviews")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_market_reviews")
            await _db.execute("RELEASE SAVEPOINT install_market_reviews")
            raise
        version = _MARKET_REVIEWS_VERSION

    if version < _SCHEDULED_RESEARCH_VERSION:
        await _db.execute("SAVEPOINT install_scheduled_research_jobs")
        try:
            await _install_scheduled_research_jobs()
            await _db.execute(f"PRAGMA user_version={_SCHEDULED_RESEARCH_VERSION}")
            await _record_schema_version(_SCHEDULED_RESEARCH_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_jobs")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_scheduled_research_jobs")
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_jobs")
            raise
        version = _SCHEDULED_RESEARCH_VERSION

    if version < _LLM_USAGE_VERSION:
        await _db.execute("SAVEPOINT install_llm_usage")
        try:
            await _install_llm_usage()
            await _db.execute(f"PRAGMA user_version={_LLM_USAGE_VERSION}")
            await _record_schema_version(_LLM_USAGE_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_llm_usage")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_llm_usage")
            await _db.execute("RELEASE SAVEPOINT install_llm_usage")
            raise
        version = _LLM_USAGE_VERSION

    if version < _THESIS_VERSION:
        await _db.execute("SAVEPOINT install_investment_theses")
        try:
            await _install_investment_theses()
            await _db.execute(f"PRAGMA user_version={_THESIS_VERSION}")
            await _record_schema_version(_THESIS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_investment_theses")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_investment_theses")
            await _db.execute("RELEASE SAVEPOINT install_investment_theses")
            raise
        version = _THESIS_VERSION

    if version < _AUTH_VERSION:
        await _db.execute("SAVEPOINT install_passwordless_auth")
        try:
            await _install_passwordless_auth()
            await _db.execute(f"PRAGMA user_version={_AUTH_VERSION}")
            await _record_schema_version(_AUTH_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_passwordless_auth")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_passwordless_auth")
            await _db.execute("RELEASE SAVEPOINT install_passwordless_auth")
            raise
        version = _AUTH_VERSION

    if version < _OWNER_ISOLATION_VERSION:
        await _db.execute("SAVEPOINT install_user_data_isolation")
        try:
            await _install_user_data_isolation()
            await _db.execute(f"PRAGMA user_version={_OWNER_ISOLATION_VERSION}")
            await _record_schema_version(_OWNER_ISOLATION_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_user_data_isolation")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_user_data_isolation")
            await _db.execute("RELEASE SAVEPOINT install_user_data_isolation")
            raise
        version = _OWNER_ISOLATION_VERSION

    if version < _CREDENTIALS_VERSION:
        await _db.execute("SAVEPOINT install_user_credentials")
        try:
            await _install_user_credentials()
            await _db.execute(f"PRAGMA user_version={_CREDENTIALS_VERSION}")
            await _record_schema_version(_CREDENTIALS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_user_credentials")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_user_credentials")
            await _db.execute("RELEASE SAVEPOINT install_user_credentials")
            raise
        version = _CREDENTIALS_VERSION

    if version < _EVIDENCE_FOUNDATION_VERSION:
        await _db.execute("SAVEPOINT install_evidence_foundation")
        try:
            await _install_evidence_foundation()
            await _db.execute(f"PRAGMA user_version={_EVIDENCE_FOUNDATION_VERSION}")
            await _record_schema_version(_EVIDENCE_FOUNDATION_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_evidence_foundation")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_evidence_foundation")
            await _db.execute("RELEASE SAVEPOINT install_evidence_foundation")
            raise
        version = _EVIDENCE_FOUNDATION_VERSION

    if version < _INVESTMENT_MEMORY_VERSION:
        await _db.execute("SAVEPOINT install_investment_memory")
        try:
            await _install_investment_memory()
            await _db.execute(f"PRAGMA user_version={_INVESTMENT_MEMORY_VERSION}")
            await _record_schema_version(_INVESTMENT_MEMORY_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_investment_memory")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_investment_memory")
            await _db.execute("RELEASE SAVEPOINT install_investment_memory")
            raise
        version = _INVESTMENT_MEMORY_VERSION

    if version < _MEMORY_ROLLOUT_VERSION:
        await _db.execute("SAVEPOINT install_memory_rollout_audit")
        try:
            await _install_memory_rollout_audit()
            await _db.execute(f"PRAGMA user_version={_MEMORY_ROLLOUT_VERSION}")
            await _record_schema_version(_MEMORY_ROLLOUT_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_memory_rollout_audit")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_memory_rollout_audit")
            await _db.execute("RELEASE SAVEPOINT install_memory_rollout_audit")
            raise
        version = _MEMORY_ROLLOUT_VERSION

    if version < _THESIS_V2_VERSION:
        await _db.execute("SAVEPOINT install_thesis_v2")
        try:
            await _install_thesis_v2()
            await _db.execute(f"PRAGMA user_version={_THESIS_V2_VERSION}")
            await _record_schema_version(_THESIS_V2_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_thesis_v2")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_thesis_v2")
            await _db.execute("RELEASE SAVEPOINT install_thesis_v2")
            raise
        version = _THESIS_V2_VERSION

    if version < _THESIS_EVIDENCE_VERSION:
        await _db.execute("SAVEPOINT install_thesis_evidence")
        try:
            await _install_thesis_evidence()
            await _db.execute(f"PRAGMA user_version={_THESIS_EVIDENCE_VERSION}")
            await _record_schema_version(_THESIS_EVIDENCE_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_thesis_evidence")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_thesis_evidence")
            await _db.execute("RELEASE SAVEPOINT install_thesis_evidence")
            raise
        version = _THESIS_EVIDENCE_VERSION

    if version < _THESIS_HISTORY_VERSION:
        await _db.execute("SAVEPOINT install_thesis_history")
        try:
            await _install_thesis_history()
            await _db.execute(f"PRAGMA user_version={_THESIS_HISTORY_VERSION}")
            await _record_schema_version(_THESIS_HISTORY_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_thesis_history")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_thesis_history")
            await _db.execute("RELEASE SAVEPOINT install_thesis_history")
            raise
        version = _THESIS_HISTORY_VERSION

    if version < _MONITOR_TARGET_VERSION:
        await _db.execute("SAVEPOINT install_monitor_targets")
        try:
            await _install_monitor_targets()
            await _db.execute(f"PRAGMA user_version={_MONITOR_TARGET_VERSION}")
            await _record_schema_version(_MONITOR_TARGET_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_monitor_targets")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_monitor_targets")
            await _db.execute("RELEASE SAVEPOINT install_monitor_targets")
            raise
        version = _MONITOR_TARGET_VERSION

    if version < _SCHEDULED_RESEARCH_LINKAGE_VERSION:
        await _db.execute("SAVEPOINT install_scheduled_research_linkage")
        try:
            await _install_scheduled_research_linkage()
            await _db.execute(f"PRAGMA user_version={_SCHEDULED_RESEARCH_LINKAGE_VERSION}")
            await _record_schema_version(_SCHEDULED_RESEARCH_LINKAGE_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_linkage")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_scheduled_research_linkage")
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_linkage")
            raise
        version = _SCHEDULED_RESEARCH_LINKAGE_VERSION

    if version < _THESIS_REVIEW_WORKFLOW_VERSION:
        await _db.execute("SAVEPOINT install_thesis_review_workflow")
        try:
            await _install_thesis_review_workflow()
            await _db.execute(f"PRAGMA user_version={_THESIS_REVIEW_WORKFLOW_VERSION}")
            await _record_schema_version(_THESIS_REVIEW_WORKFLOW_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_thesis_review_workflow")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_thesis_review_workflow")
            await _db.execute("RELEASE SAVEPOINT install_thesis_review_workflow")
            raise
        version = _THESIS_REVIEW_WORKFLOW_VERSION

    if version < _PRODUCT_METRICS_VERSION:
        await _db.execute("SAVEPOINT install_product_metrics")
        try:
            await _install_product_metrics()
            await _db.execute(f"PRAGMA user_version={_PRODUCT_METRICS_VERSION}")
            await _record_schema_version(_PRODUCT_METRICS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_product_metrics")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_product_metrics")
            await _db.execute("RELEASE SAVEPOINT install_product_metrics")
            raise
        version = _PRODUCT_METRICS_VERSION

    if version < _PAPER_PORTFOLIO_VERSION:
        await _db.execute("SAVEPOINT install_paper_portfolios")
        try:
            await _install_paper_portfolios()
            await _db.execute(f"PRAGMA user_version={_PAPER_PORTFOLIO_VERSION}")
            await _record_schema_version(_PAPER_PORTFOLIO_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_paper_portfolios")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_paper_portfolios")
            await _db.execute("RELEASE SAVEPOINT install_paper_portfolios")
            raise
        version = _PAPER_PORTFOLIO_VERSION

    if version < _JOB_RUNTIME_VERSION:
        await _db.execute("SAVEPOINT install_job_runtime")
        try:
            await _install_job_runtime()
            await _db.execute(f"PRAGMA user_version={_JOB_RUNTIME_VERSION}")
            await _record_schema_version(_JOB_RUNTIME_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_job_runtime")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_job_runtime")
            await _db.execute("RELEASE SAVEPOINT install_job_runtime")
            raise
        version = _JOB_RUNTIME_VERSION

    if version < _SCHEMA_CLEANUP_VERSION:
        await _db.execute("SAVEPOINT install_schema_cleanup")
        try:
            await _install_schema_cleanup()
            await _db.execute(f"PRAGMA user_version={_SCHEMA_CLEANUP_VERSION}")
            await _record_schema_version(_SCHEMA_CLEANUP_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_schema_cleanup")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_schema_cleanup")
            await _db.execute("RELEASE SAVEPOINT install_schema_cleanup")
            raise
        version = _SCHEMA_CLEANUP_VERSION

    # Existing databases already tracked only PRAGMA user_version; backfill their audit trail.
    for applied_version in range(1, min(version, _SCHEMA_VERSION) + 1):
        await _record_schema_version(applied_version)


async def _record_schema_version(version: int) -> None:
    await _db.execute(
        "INSERT OR IGNORE INTO schema_version(version, name) VALUES (?, ?)",
        (version, _MIGRATION_NAMES[version]),
    )


async def _normalize_legacy_tickers() -> None:
    """Upgrade records written before internal US tickers gained the ``us`` prefix."""
    from .services.market_data import normalize_code

    # ponytail: a versioned one-time scan is sufficient for the two local tables.
    for table in ("research_reports", "backtest_runs"):
        rows = await (await _db.execute(f"SELECT id, ticker FROM {table}")).fetchall()
        for row in rows:
            try:
                normalized = normalize_code(row["ticker"])
            except ValueError:
                continue
            if normalized != row["ticker"]:
                await _db.execute(f"UPDATE {table} SET ticker=? WHERE id=?", (normalized, row["id"]))


async def _install_memory_fts() -> None:
    """建立消息全文索引、回填历史记录，并由触发器持续同步。"""
    await _db.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
            content UNINDEXED,
            search_text,
            conversation_id UNINDEXED,
            message_id UNINDEXED,
            role UNINDEXED,
            created_at UNINDEXED,
            tokenize='unicode61 remove_diacritics 2'
        )
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO memory_fts(rowid, content, search_text, conversation_id, message_id, role, created_at)
            VALUES (
                new.id, new.content, memory_normalize(new.content),
                new.conversation_id, new.id, new.role, new.created_at
            );
        END
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_au
        AFTER UPDATE OF content, conversation_id, role, created_at ON messages BEGIN
            DELETE FROM memory_fts WHERE rowid=old.id;
            INSERT INTO memory_fts(rowid, content, search_text, conversation_id, message_id, role, created_at)
            VALUES (
                new.id, new.content, memory_normalize(new.content),
                new.conversation_id, new.id, new.role, new.created_at
            );
        END
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_ad AFTER DELETE ON messages BEGIN
            DELETE FROM memory_fts WHERE rowid=old.id;
        END
        """
    )
    # ponytail: one idempotent INSERT OR REPLACE covers every pre-FTS message.
    await _db.execute(
        """
        INSERT OR REPLACE INTO memory_fts(
            rowid, content, search_text, conversation_id, message_id, role, created_at
        )
        SELECT id, content, memory_normalize(content), conversation_id, id, role, created_at
        FROM messages
        """
    )


async def _install_notifications() -> None:
    """建立可按递增 ID 重放的持久化通知表。"""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'success', 'warning', 'error')),
            source_type TEXT,
            source_id   TEXT,
            payload     TEXT NOT NULL DEFAULT '{}',
            dedupe_key  TEXT UNIQUE,
            is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_unread_id "
        "ON notifications(is_read, id DESC)"
    )


async def _install_alerts() -> None:
    """建立信号预警规则及其不可重复的触发账本。"""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS alert_rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            ticker      TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            direction   TEXT CHECK (direction IS NULL OR direction IN ('bullish', 'bearish', 'neutral')),
            is_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_match "
        "ON alert_rules(ticker, signal_type, COALESCE(direction, ''))"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled_ticker "
        "ON alert_rules(is_enabled, ticker)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS alert_triggers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id         INTEGER,
            rule_name       TEXT NOT NULL,
            ticker          TEXT NOT NULL,
            signal_type     TEXT NOT NULL,
            direction       TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
            confidence      TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
            signal_date     TEXT NOT NULL,
            description     TEXT NOT NULL,
            notification_id INTEGER,
            dedupe_key      TEXT NOT NULL UNIQUE,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_alert_triggers_rule_created "
        "ON alert_triggers(rule_id, id DESC)"
    )


async def _install_market_reviews() -> None:
    """Persist evidence snapshots and the LLM synthesis as separate JSON documents."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS market_reviews (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            markets_json    TEXT NOT NULL,
            trading_date    TEXT NOT NULL,
            snapshot_json   TEXT NOT NULL DEFAULT '{}',
            report_json     TEXT NOT NULL DEFAULT '{}',
            model_id        INTEGER,
            model_name      TEXT,
            token_count     INTEGER,
            status          TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'failed')),
            error_message   TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_market_reviews_date_id "
        "ON market_reviews(trading_date DESC, id DESC)"
    )


async def _install_scheduled_research_jobs() -> None:
    """Persist five-field cron schedules and their last/next execution state."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS scheduled_research_jobs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            ticker        TEXT NOT NULL,
            company_name  TEXT NOT NULL,
            cron_expr     TEXT NOT NULL,
            model_id      INTEGER,
            is_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            next_run_at   TEXT,
            last_run_at   TEXT,
            last_status   TEXT NOT NULL DEFAULT 'idle'
                          CHECK (last_status IN ('idle', 'queued', 'running', 'completed', 'failed')),
            last_error    TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_research_due "
        "ON scheduled_research_jobs(is_enabled, next_run_at)"
    )


async def _install_llm_usage() -> None:
    """Persist request-level model token usage without coupling to domain tables."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_usage (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            session_type      TEXT NOT NULL,
            conversation_id   INTEGER,
            model_name        TEXT,
            prompt_tokens     INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
            completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
            total_tokens      INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_llm_usage_created_session "
        "ON llm_usage(created_at, session_type)"
    )


async def _install_investment_theses() -> None:
    """Persist investment theses and separately checkable claims."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker            TEXT NOT NULL,
            title             TEXT NOT NULL,
            thesis            TEXT NOT NULL,
            assumptions       TEXT NOT NULL DEFAULT '[]',
            status            TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'closed', 'invalidated')),
            source_report_id  INTEGER UNIQUE,
            baseline_json     TEXT NOT NULL DEFAULT '{}',
            last_check_json   TEXT NOT NULL DEFAULT '{}',
            drift_status      TEXT NOT NULL DEFAULT 'unknown'
                              CHECK (drift_status IN ('unknown', 'stable', 'drifted')),
            drift_score       REAL,
            last_checked_at   TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (source_report_id) REFERENCES research_reports(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_status_updated "
        "ON thesis(status, updated_at DESC)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_claims (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            thesis_id     INTEGER NOT NULL,
            claim         TEXT NOT NULL,
            kind          TEXT NOT NULL DEFAULT 'manual'
                          CHECK (kind IN ('manual', 'price', 'position', 'fundamental', 'report')),
            status        TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (status IN ('holding', 'confirmed', 'violated', 'unknown')),
            baseline_json TEXT NOT NULL DEFAULT '{}',
            checked_at    TEXT,
            note          TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (thesis_id) REFERENCES thesis(id) ON DELETE CASCADE
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claims_thesis "
        "ON thesis_claims(thesis_id, id)"
    )


async def _install_passwordless_auth() -> None:
    """Install passwordless-email users, one-time codes, and revocable sessions."""
    statements = (
        """CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
            is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
            is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            last_login_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS login_codes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL COLLATE NOCASE,
            code_hash   TEXT NOT NULL,
            request_ip  TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            used_at     TEXT,
            attempts    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_login_codes_email_created ON login_codes(email, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_login_codes_ip_created ON login_codes(request_ip, created_at DESC)",
        """CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            token_hash  TEXT NOT NULL UNIQUE,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at  TEXT NOT NULL,
            revoked_at  TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, expires_at, revoked_at)",
    )
    # ponytail: execute statements individually so migration savepoint semantics remain intact.
    for statement in statements:
        await _db.execute(statement)


async def _install_user_credentials() -> None:
    """Install encrypted per-user service credentials without plaintext columns."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_credentials (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            service         TEXT NOT NULL,
            encrypted_value BLOB NOT NULL,
            provider        TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, service)
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id)"
    )


async def _install_evidence_foundation() -> None:
    """Install canonical evidence records and owner-scoped computed input edges."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS evidence_objects (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            evidence_id        TEXT NOT NULL,
            schema_version     TEXT NOT NULL DEFAULT 'canonical-provenance-envelope-v1'
                               CHECK (schema_version = 'canonical-provenance-envelope-v1'),
            kind               TEXT NOT NULL
                               CHECK (kind IN ('observed_fact', 'computed_result', 'document_excerpt')),
            data_status        TEXT NOT NULL
                               CHECK (data_status IN ('OK', 'UNKNOWN', 'PARTIAL', 'UPSTREAM_ERROR')),
            subject_type       TEXT NOT NULL
                               CHECK (subject_type IN ('instrument', 'portfolio', 'strategy', 'market', 'document')),
            subject_id         TEXT NOT NULL CHECK (length(subject_id) > 0),
            metric             TEXT,
            value_json         TEXT NOT NULL CHECK (json_valid(value_json)),
            unit               TEXT,
            source             TEXT,
            vendor             TEXT,
            document_id        TEXT,
            as_of              TEXT,
            published_at       TEXT,
            retrieved_at       TEXT NOT NULL CHECK (length(retrieved_at) > 0),
            period_type        TEXT,
            market             TEXT,
            currency           TEXT,
            adjustment         TEXT,
            frequency          TEXT,
            inputs_json        TEXT NOT NULL DEFAULT '[]'
                               CHECK (json_valid(inputs_json) AND json_type(inputs_json) = 'array'),
            formula            TEXT,
            method_version     TEXT,
            quality_flags_json TEXT NOT NULL DEFAULT '[]'
                               CHECK (json_valid(quality_flags_json)
                                      AND json_type(quality_flags_json) = 'array'),
            confidence         REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
            license_scope      TEXT NOT NULL CHECK (length(license_scope) > 0),
            created_at         TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, evidence_id),
            CHECK (evidence_id GLOB 'ev_*' AND length(evidence_id) BETWEEN 11 AND 123),
            CHECK (data_status NOT IN ('UNKNOWN', 'UPSTREAM_ERROR')
                   OR json_type(value_json) = 'null'),
            CHECK (kind != 'observed_fact'
                   OR (source IS NOT NULL AND length(source) > 0
                       AND metric IS NOT NULL AND length(metric) > 0)),
            CHECK ((kind = 'computed_result'
                    AND json_array_length(inputs_json) > 0
                    AND formula IS NOT NULL AND length(formula) > 0
                    AND method_version IS NOT NULL AND length(method_version) > 0)
                   OR (kind != 'computed_result'
                       AND json_array_length(inputs_json) = 0
                       AND formula IS NULL AND method_version IS NULL))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_objects_user_id ON evidence_objects(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_objects_subject_as_of "
        "ON evidence_objects(user_id, subject_type, subject_id, as_of DESC)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_objects_metric_retrieved "
        "ON evidence_objects(user_id, metric, retrieved_at DESC)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS evidence_input_refs (
            user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            derived_evidence_id TEXT NOT NULL,
            input_evidence_id   TEXT NOT NULL,
            created_at          TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, derived_evidence_id, input_evidence_id),
            CHECK (derived_evidence_id != input_evidence_id),
            FOREIGN KEY (user_id, derived_evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, input_evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_input_refs_user_id "
        "ON evidence_input_refs(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_evidence_input_refs_input "
        "ON evidence_input_refs(user_id, input_evidence_id)"
    )


async def _install_investment_memory() -> None:
    """Install typed, owner-scoped memory records with retained supersession history."""
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_workspaces_owner_id "
        "ON research_workspaces(user_id, id)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_records (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workspace_id       INTEGER,
            subject_type       TEXT NOT NULL CHECK (length(subject_type) > 0),
            subject_id         TEXT NOT NULL CHECK (length(subject_id) > 0),
            memory_type        TEXT NOT NULL CHECK (memory_type IN (
                'preference', 'research_interest', 'hypothesis', 'decision',
                'evidence_reference', 'risk_concern', 'invalidation_condition',
                'workflow_state', 'review_outcome'
            )),
            information_kind   TEXT NOT NULL CHECK (information_kind IN (
                'FACT', 'AI_INFERENCE', 'USER_HYPOTHESIS', 'USER_PREFERENCE', 'WORKFLOW_STATE'
            )),
            content_json       TEXT NOT NULL CHECK (json_valid(content_json)),
            source_kind        TEXT NOT NULL CHECK (source_kind IN ('user', 'ai', 'evidence', 'workflow')),
            source_id          TEXT,
            evidence_id        TEXT,
            valid_from         TEXT,
            valid_to           TEXT,
            observed_at        TEXT,
            status             TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
                'candidate', 'confirmed', 'superseded', 'invalidated', 'deleted'
            )),
            confidence         REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
            quality_flags_json TEXT NOT NULL DEFAULT '[]' CHECK (
                json_valid(quality_flags_json) AND json_type(quality_flags_json) = 'array'
            ),
            supersedes_id      INTEGER,
            created_by         TEXT NOT NULL CHECK (created_by IN ('user', 'ai', 'system')),
            created_at         TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, id),
            CHECK (supersedes_id IS NULL OR supersedes_id != id),
            CHECK (information_kind != 'FACT' OR status != 'confirmed' OR evidence_id IS NOT NULL),
            FOREIGN KEY (user_id, evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE RESTRICT,
            FOREIGN KEY (user_id, supersedes_id)
                REFERENCES memory_records(user_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (user_id, workspace_id)
                REFERENCES research_workspaces(user_id, id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_records_user_id ON memory_records(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_records_subject_status "
        "ON memory_records(user_id, subject_type, subject_id, status, updated_at DESC)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_records_workspace "
        "ON memory_records(user_id, workspace_id, updated_at DESC)"
    )


async def _install_memory_rollout_audit() -> None:
    """Install metadata-only audit rows for reversible typed-memory rollout."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_rollout_audits (
            id                       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            surface                  TEXT NOT NULL CHECK (surface IN ('chat', 'research')),
            mode                     TEXT NOT NULL CHECK (mode IN ('shadow', 'opt_in')),
            query_hash               TEXT NOT NULL CHECK (length(query_hash) = 64),
            response_hash            TEXT CHECK (response_hash IS NULL OR length(response_hash) = 64),
            native_candidate_count   INTEGER NOT NULL CHECK (native_candidate_count >= 0),
            typed_candidate_count    INTEGER NOT NULL CHECK (typed_candidate_count >= 0),
            typed_status_counts_json TEXT NOT NULL DEFAULT '{}' CHECK (
                json_valid(typed_status_counts_json)
                AND json_type(typed_status_counts_json) = 'object'
            ),
            assembled_chars          INTEGER NOT NULL DEFAULT 0 CHECK (assembled_chars >= 0),
            estimated_tokens         INTEGER NOT NULL DEFAULT 0 CHECK (estimated_tokens >= 0),
            outcome                  TEXT NOT NULL CHECK (outcome IN (
                'prepared', 'completed', 'fallback', 'upstream_error'
            )),
            error_code               TEXT,
            created_at               TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at             TEXT,
            UNIQUE (user_id, id)
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_rollout_audits_user_id "
        "ON memory_rollout_audits(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_rollout_audits_owner_created "
        "ON memory_rollout_audits(user_id, created_at DESC, id DESC)"
    )
    await _install_required_owner_guards("memory_rollout_audits")


async def _install_thesis_v2() -> None:
    """Install immutable Thesis v2 snapshots without replacing legacy current-view tables."""
    await _ensure_column("thesis_claims", "version", "version INTEGER NOT NULL DEFAULT 1")
    await _ensure_column("thesis_claims", "retired_at", "retired_at TEXT")
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_owner_id ON thesis(user_id, id)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_versions (
            id                       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id                INTEGER NOT NULL,
            version                  INTEGER NOT NULL CHECK (version >= 1),
            judgment                 TEXT NOT NULL CHECK (length(judgment) > 0),
            judgment_kind            TEXT NOT NULL CHECK (
                judgment_kind IN ('USER_HYPOTHESIS', 'AI_INFERENCE')
            ),
            assumptions_json         TEXT NOT NULL DEFAULT '[]' CHECK (
                json_valid(assumptions_json) AND json_type(assumptions_json) = 'array'
            ),
            claims_json              TEXT NOT NULL DEFAULT '[]' CHECK (
                json_valid(claims_json) AND json_type(claims_json) = 'array'
            ),
            invalidation_json        TEXT NOT NULL DEFAULT '[]' CHECK (
                json_valid(invalidation_json) AND json_type(invalidation_json) = 'array'
            ),
            confidence               REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
            change_reason            TEXT NOT NULL CHECK (length(change_reason) > 0),
            created_by               TEXT NOT NULL CHECK (created_by IN ('user', 'ai', 'system')),
            created_at               TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, thesis_id, version),
            UNIQUE (user_id, id),
            FOREIGN KEY (user_id, thesis_id)
                REFERENCES thesis(user_id, id) ON DELETE CASCADE
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_versions_user_id ON thesis_versions(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_versions_current "
        "ON thesis_versions(user_id, thesis_id, version DESC)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_version_evidence_refs (
            user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_version_id INTEGER NOT NULL,
            evidence_id      TEXT NOT NULL,
            stance           TEXT NOT NULL CHECK (stance IN ('supporting', 'opposing')),
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, thesis_version_id, evidence_id, stance),
            FOREIGN KEY (user_id, thesis_version_id)
                REFERENCES thesis_versions(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_version_evidence_refs_user_id "
        "ON thesis_version_evidence_refs(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_version_evidence_refs_version "
        "ON thesis_version_evidence_refs(user_id, thesis_version_id)"
    )
    legacy = await (await _db.execute(
        "SELECT id, user_id, thesis, assumptions, source_report_id FROM thesis "
        "WHERE user_id IS NOT NULL AND NOT EXISTS ("
        "SELECT 1 FROM thesis_versions v WHERE v.user_id=thesis.user_id AND v.thesis_id=thesis.id)"
    )).fetchall()
    for row in legacy:
        claims = await (await _db.execute(
            "SELECT claim FROM thesis_claims WHERE thesis_id=? AND user_id=? "
            "AND kind='manual' AND retired_at IS NULL ORDER BY id",
            (row["id"], row["user_id"]),
        )).fetchall()
        assumptions = row["assumptions"] if isinstance(row["assumptions"], str) else "[]"
        try:
            parsed_assumptions = json.loads(assumptions)
        except json.JSONDecodeError:
            parsed_assumptions = []
        if not isinstance(parsed_assumptions, list):
            parsed_assumptions = []
        await _db.execute(
            "INSERT INTO thesis_versions "
            "(user_id, thesis_id, version, judgment, judgment_kind, assumptions_json, "
            "claims_json, invalidation_json, change_reason, created_by) "
            "VALUES (?, ?, 1, ?, ?, ?, ?, '[]', 'legacy_backfill', 'system')",
            (
                row["user_id"], row["id"], row["thesis"],
                "AI_INFERENCE" if row["source_report_id"] is not None else "USER_HYPOTHESIS",
                json.dumps(parsed_assumptions, ensure_ascii=False),
                json.dumps([claim["claim"] for claim in claims], ensure_ascii=False),
            ),
        )
    for table in ("thesis_versions", "thesis_version_evidence_refs"):
        await _install_required_owner_guards(table)
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_versions_immutable_update "
        "BEFORE UPDATE ON thesis_versions BEGIN "
        "SELECT RAISE(ABORT, 'thesis_versions are immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_versions_immutable_delete "
        "BEFORE DELETE ON thesis_versions BEGIN "
        "SELECT RAISE(ABORT, 'thesis_versions are immutable'); END"
    )


async def _install_thesis_evidence() -> None:
    """Install temporal claim/evidence edges and append-only status events."""
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_claims_owner_id "
        "ON thesis_claims(user_id, id)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_claim_evidence_edges (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id      INTEGER NOT NULL,
            claim_id       INTEGER NOT NULL,
            evidence_id    TEXT NOT NULL,
            stance         TEXT NOT NULL CHECK (stance IN ('supporting', 'opposing')),
            valid_from     TEXT,
            valid_to       TEXT,
            observed_at    TEXT,
            created_source TEXT NOT NULL CHECK (created_source IN ('user', 'automatic', 'migration')),
            status         TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'superseded', 'invalidated')),
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, id),
            CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
            FOREIGN KEY (user_id, thesis_id)
                REFERENCES thesis(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, claim_id)
                REFERENCES thesis_claims(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claim_evidence_edges_user_id "
        "ON thesis_claim_evidence_edges(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claim_evidence_edges_claim "
        "ON thesis_claim_evidence_edges(user_id, claim_id, status, id DESC)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_claim_status_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id    INTEGER NOT NULL,
            claim_id     INTEGER NOT NULL,
            from_status  TEXT CHECK (from_status IS NULL OR from_status IN (
                'holding', 'confirmed', 'violated', 'unknown'
            )),
            to_status    TEXT NOT NULL CHECK (to_status IN (
                'holding', 'confirmed', 'violated', 'unknown'
            )),
            actor        TEXT NOT NULL CHECK (actor IN ('user', 'system')),
            trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
                'manual', 'deterministic_check', 'initial_create', 'legacy_backfill'
            )),
            reason       TEXT NOT NULL,
            evidence_id  TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, id),
            CHECK (trigger_kind != 'deterministic_check'
                   OR to_status = 'unknown' OR evidence_id IS NOT NULL),
            FOREIGN KEY (user_id, thesis_id)
                REFERENCES thesis(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, claim_id)
                REFERENCES thesis_claims(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, evidence_id)
                REFERENCES evidence_objects(user_id, evidence_id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claim_status_events_user_id "
        "ON thesis_claim_status_events(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claim_status_events_claim "
        "ON thesis_claim_status_events(user_id, claim_id, id DESC)"
    )
    await _db.execute(
        "INSERT INTO thesis_claim_status_events "
        "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason) "
        "SELECT c.user_id, c.thesis_id, c.id, NULL, c.status, 'system', 'legacy_backfill', "
        "'legacy claim status backfill' FROM thesis_claims c WHERE c.user_id IS NOT NULL "
        "AND NOT EXISTS (SELECT 1 FROM thesis_claim_status_events e "
        "WHERE e.user_id=c.user_id AND e.claim_id=c.id)"
    )
    for table in ("thesis_claim_evidence_edges", "thesis_claim_status_events"):
        await _install_required_owner_guards(table)
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_claim_evidence_edges_no_delete "
        "BEFORE DELETE ON thesis_claim_evidence_edges BEGIN "
        "SELECT RAISE(ABORT, 'thesis claim evidence history cannot be deleted'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_claim_status_events_immutable_update "
        "BEFORE UPDATE ON thesis_claim_status_events BEGIN "
        "SELECT RAISE(ABORT, 'thesis claim status events are immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_claim_status_events_immutable_delete "
        "BEFORE DELETE ON thesis_claim_status_events BEGIN "
        "SELECT RAISE(ABORT, 'thesis claim status events are immutable'); END"
    )


async def _install_thesis_history() -> None:
    """Install append-only explicit user decisions for immutable Thesis versions."""
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_versions_owner_thesis_id "
        "ON thesis_versions(user_id, thesis_id, id)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_version_confirmations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id         INTEGER NOT NULL,
            thesis_version_id INTEGER NOT NULL,
            decision          TEXT NOT NULL CHECK (decision IN ('acknowledged', 'disputed')),
            reason            TEXT NOT NULL CHECK (length(trim(reason)) > 0),
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, id),
            FOREIGN KEY (user_id, thesis_id, thesis_version_id)
                REFERENCES thesis_versions(user_id, thesis_id, id) ON DELETE CASCADE
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_version_confirmations_user_id "
        "ON thesis_version_confirmations(user_id)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_version_confirmations_version "
        "ON thesis_version_confirmations(user_id, thesis_version_id, id)"
    )
    await _install_required_owner_guards("thesis_version_confirmations")
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_version_confirmations_immutable_update "
        "BEFORE UPDATE ON thesis_version_confirmations BEGIN "
        "SELECT RAISE(ABORT, 'thesis version confirmations are immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_version_confirmations_immutable_delete "
        "BEFORE DELETE ON thesis_version_confirmations BEGIN "
        "SELECT RAISE(ABORT, 'thesis version confirmations are immutable'); END"
    )


async def _install_monitor_targets() -> None:
    """Bind confirmed native monitor targets to existing technical alert rules."""
    await _ensure_column("alert_rules", "target_type", "target_type TEXT CHECK (target_type IS NULL OR target_type IN ('thesis', 'portfolio', 'strategy'))")
    await _ensure_column("alert_rules", "target_id", "target_id INTEGER")
    await _ensure_column("alert_rules", "confirmation_key", "confirmation_key TEXT")
    await _ensure_column("alert_rules", "confirmed_at", "confirmed_at TEXT")
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_confirmation_key "
        "ON alert_rules(user_id, confirmation_key) WHERE confirmation_key IS NOT NULL"
    )


async def _install_scheduled_research_linkage() -> None:
    """Install owner-scoped idempotent scheduled research run linkage."""
    await _ensure_column("research_reports", "scheduled_run_id", "scheduled_run_id INTEGER")
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_research_jobs_owner_id "
        "ON scheduled_research_jobs(user_id, id)"
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_reports_owner_id "
        "ON research_reports(user_id, id)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS scheduled_research_runs (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            job_id                 INTEGER NOT NULL,
            run_key                TEXT NOT NULL CHECK (length(run_key) = 64),
            attempt                INTEGER NOT NULL CHECK (attempt >= 1),
            retry_of_run_id        INTEGER,
            report_id              INTEGER,
            status                 TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
            evidence_status        TEXT NOT NULL DEFAULT 'UNKNOWN'
                                   CHECK (evidence_status IN ('OK', 'PARTIAL', 'UNKNOWN', 'UPSTREAM_ERROR')),
            evidence_ids_json      TEXT NOT NULL DEFAULT '[]'
                                   CHECK (json_valid(evidence_ids_json) AND json_type(evidence_ids_json)='array'),
            memory_record_ids_json TEXT NOT NULL DEFAULT '[]'
                                   CHECK (json_valid(memory_record_ids_json) AND json_type(memory_record_ids_json)='array'),
            error                  TEXT,
            started_at             TEXT NOT NULL,
            completed_at           TEXT,
            created_at             TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, run_key),
            UNIQUE (user_id, id),
            FOREIGN KEY (user_id, job_id)
                REFERENCES scheduled_research_jobs(user_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (user_id, retry_of_run_id)
                REFERENCES scheduled_research_runs(user_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (user_id, report_id)
                REFERENCES research_reports(user_id, id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_research_runs_job "
        "ON scheduled_research_runs(user_id, job_id, id DESC)"
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_reports_scheduled_run "
        "ON research_reports(user_id, scheduled_run_id) WHERE scheduled_run_id IS NOT NULL"
    )
    await _install_required_owner_guards("scheduled_research_runs")
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_alert_rules_target "
        "ON alert_rules(user_id, target_type, target_id)"
    )


async def _install_job_runtime() -> None:
    """Add owner-scoped leases and an immutable scheduler event log."""
    await _ensure_column(
        "scheduled_research_runs", "idempotency_key",
        "idempotency_key TEXT CHECK (idempotency_key IS NULL OR length(idempotency_key) = 64)",
    )
    await _ensure_column(
        "scheduled_research_runs", "lease_owner",
        "lease_owner TEXT CHECK (lease_owner IS NULL OR length(lease_owner) BETWEEN 1 AND 100)",
    )
    await _ensure_column("scheduled_research_runs", "lease_expires_at", "lease_expires_at TEXT")
    await _ensure_column("scheduled_research_runs", "heartbeat_at", "heartbeat_at TEXT")
    await _ensure_column(
        "scheduled_research_jobs", "pending_idempotency_key",
        "pending_idempotency_key TEXT CHECK "
        "(pending_idempotency_key IS NULL OR length(pending_idempotency_key) = 64)",
    )
    await _db.execute(
        "UPDATE scheduled_research_runs SET idempotency_key=run_key WHERE idempotency_key IS NULL"
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_research_run_attempt_identity "
        "ON scheduled_research_runs(user_id, job_id, idempotency_key, attempt) "
        "WHERE idempotency_key IS NOT NULL"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_research_run_lease "
        "ON scheduled_research_runs(status, lease_expires_at)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS scheduled_research_run_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            job_id       INTEGER NOT NULL,
            run_id       INTEGER NOT NULL,
            event_type   TEXT NOT NULL CHECK (
                event_type IN (
                    'claimed', 'heartbeat', 'recovered', 'retry_started',
                    'completed', 'failed', 'cancelled'
                )
            ),
            payload_json TEXT NOT NULL DEFAULT '{}'
                         CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id, job_id)
                REFERENCES scheduled_research_jobs(user_id, id) ON DELETE RESTRICT,
            FOREIGN KEY (user_id, run_id)
                REFERENCES scheduled_research_runs(user_id, id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_research_run_events_run "
        "ON scheduled_research_run_events(user_id, run_id, id)"
    )
    await _install_required_owner_guards("scheduled_research_run_events")
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS scheduled_research_run_events_immutable_update "
        "BEFORE UPDATE ON scheduled_research_run_events "
        "BEGIN SELECT RAISE(ABORT, 'scheduled research run events are immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS scheduled_research_run_events_immutable_delete "
        "BEFORE DELETE ON scheduled_research_run_events "
        "BEGIN SELECT RAISE(ABORT, 'scheduled research run events are immutable'); END"
    )


async def _install_thesis_review_workflow() -> None:
    """Install the owner-scoped persisted Thesis review projection and event log."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_review_items (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id          INTEGER NOT NULL,
            thesis_version_id  INTEGER,
            idempotency_key    TEXT NOT NULL CHECK (length(idempotency_key) = 64),
            status             TEXT NOT NULL
                               CHECK (status IN ('pending', 'acknowledged', 'disputed', 'failed')),
            quality_status     TEXT NOT NULL
                               CHECK (quality_status IN ('OK', 'PARTIAL', 'UNKNOWN', 'UPSTREAM_ERROR')),
            engine_version     TEXT,
            changes_json       TEXT NOT NULL DEFAULT '[]'
                               CHECK (json_valid(changes_json) AND json_type(changes_json)='array'),
            evidence_ids_json  TEXT NOT NULL DEFAULT '[]'
                               CHECK (json_valid(evidence_ids_json) AND json_type(evidence_ids_json)='array'),
            error              TEXT,
            created_at         TEXT NOT NULL DEFAULT (datetime('now')),
            resolved_at        TEXT,
            UNIQUE (user_id, idempotency_key),
            UNIQUE (user_id, id),
            UNIQUE (user_id, thesis_id, id),
            FOREIGN KEY (user_id, thesis_id)
                REFERENCES thesis(user_id, id) ON DELETE CASCADE,
            FOREIGN KEY (user_id, thesis_id, thesis_version_id)
                REFERENCES thesis_versions(user_id, thesis_id, id) ON DELETE RESTRICT
        )
        """
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_review_events (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            thesis_id         INTEGER NOT NULL,
            review_id         INTEGER NOT NULL,
            event_type        TEXT NOT NULL
                              CHECK (event_type IN ('created', 'acknowledged', 'disputed', 'check_failed')),
            reason            TEXT NOT NULL,
            confirmation_key  TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id, thesis_id, review_id)
                REFERENCES thesis_review_items(user_id, thesis_id, id) ON DELETE CASCADE
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_review_items_thesis "
        "ON thesis_review_items(user_id, thesis_id, id DESC)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_review_events_review "
        "ON thesis_review_events(user_id, review_id, id)"
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_thesis_review_events_confirmation "
        "ON thesis_review_events(user_id, confirmation_key) WHERE confirmation_key IS NOT NULL"
    )
    for table in ("thesis_review_items", "thesis_review_events"):
        await _install_required_owner_guards(table)
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_review_events_immutable_update "
        "BEFORE UPDATE ON thesis_review_events BEGIN "
        "SELECT RAISE(ABORT, 'thesis review events are immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS thesis_review_events_immutable_delete "
        "BEFORE DELETE ON thesis_review_events BEGIN "
        "SELECT RAISE(ABORT, 'thesis review events are immutable'); END"
    )


async def _install_product_metrics() -> None:
    """Install opt-in owner-local product metrics without business identifiers."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS product_metric_preferences (
            user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            enabled     INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS product_metric_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_name   TEXT NOT NULL
                         CHECK (event_name IN (
                             'first_value', 'result_saved',
                             'workflow_continued', 'repeat_research'
                         )),
            value        INTEGER,
            occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK (
                (event_name='first_value' AND value BETWEEN 0 AND 86400000)
                OR (event_name='repeat_research' AND value BETWEEN 0 AND 365)
                OR (event_name IN ('result_saved', 'workflow_continued') AND value IS NULL)
            )
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_product_metric_events_owner_time "
        "ON product_metric_events(user_id, occurred_at DESC, id DESC)"
    )
    for table in ("product_metric_preferences", "product_metric_events"):
        await _install_required_owner_guards(table)


async def _install_paper_portfolios() -> None:
    """Install owner-scoped simulated portfolios without touching user portfolios."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_portfolios (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name             TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
            base_currency    TEXT NOT NULL CHECK (base_currency IN ('CNY', 'HKD', 'USD')),
            initial_cash     REAL NOT NULL CHECK (initial_cash > 0),
            status           TEXT NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'ARCHIVED')),
            created_at       TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (user_id, id)
        )
        """
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_portfolio_ledger (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            portfolio_id      INTEGER NOT NULL,
            idempotency_key   TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 100),
            request_hash      TEXT NOT NULL CHECK (length(request_hash) = 64),
            side              TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
            symbol            TEXT NOT NULL CHECK (length(symbol) BETWEEN 1 AND 20),
            quantity          REAL NOT NULL CHECK (quantity > 0),
            simulation_price  REAL NOT NULL CHECK (simulation_price > 0),
            fee               REAL NOT NULL CHECK (fee >= 0),
            currency          TEXT NOT NULL CHECK (currency IN ('CNY', 'HKD', 'USD')),
            simulation_as_of  TEXT NOT NULL,
            simulation_source TEXT NOT NULL CHECK (length(trim(simulation_source)) BETWEEN 1 AND 200),
            cash_delta        REAL NOT NULL,
            fx_rate_to_base   REAL NOT NULL CHECK (fx_rate_to_base > 0),
            fx_source         TEXT NOT NULL CHECK (length(trim(fx_source)) BETWEEN 1 AND 200),
            fx_as_of          TEXT NOT NULL,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id, portfolio_id)
                REFERENCES paper_portfolios(user_id, id) ON DELETE RESTRICT,
            UNIQUE (user_id, portfolio_id, idempotency_key)
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_paper_portfolios_owner_status "
        "ON paper_portfolios(user_id, status, updated_at DESC)"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_paper_ledger_owner_portfolio "
        "ON paper_portfolio_ledger(user_id, portfolio_id, id)"
    )
    for table in ("paper_portfolios", "paper_portfolio_ledger"):
        await _install_required_owner_guards(table)
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS paper_portfolio_ledger_immutable_update "
        "BEFORE UPDATE ON paper_portfolio_ledger BEGIN "
        "SELECT RAISE(ABORT, 'paper portfolio ledger is immutable'); END"
    )
    await _db.execute(
        "CREATE TRIGGER IF NOT EXISTS paper_portfolio_ledger_immutable_delete "
        "BEFORE DELETE ON paper_portfolio_ledger BEGIN "
        "SELECT RAISE(ABORT, 'paper portfolio ledger is immutable'); END"
    )


async def _backup_database_before_owner_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before the ownership migration."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v10.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_evidence_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v12."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v12.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_memory_records_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v13."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v13.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_memory_rollout_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v14."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v14.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_thesis_v2_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v15."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v15.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_thesis_evidence_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v16."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v16.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_thesis_history_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v17."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v17.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_monitor_target_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v18."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v18.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_scheduled_research_linkage_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v19."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v19.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_thesis_review_workflow_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v20."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v20.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_product_metrics_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v21."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v21.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_paper_portfolio_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before schema v22."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v22.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_job_runtime_migration(path: Path) -> None:
    """Keep one recoverable pre-v23 image before scheduler durability changes."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v23.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _backup_database_before_schema_cleanup_migration(path: Path) -> None:
    """Keep one recoverable pre-v24 image before legacy portfolio table removal."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v24.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _install_user_data_isolation() -> None:
    """Add explicit ownership columns and indexes to every user-data table."""
    for table in _OWNER_TABLES:
        exists = await (
            await _db.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            )
        ).fetchone()
        if exists is None:
            continue
        await _ensure_column(table, "user_id", "user_id INTEGER REFERENCES users(id)")
        await _db.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)")
    await _rebuild_research_workspaces_for_owner_unique()
    await _rebuild_notification_tables_for_owner_unique()
    await _db.execute("DROP INDEX IF EXISTS idx_alert_rules_match")
    await _db.execute(
        "CREATE UNIQUE INDEX idx_alert_rules_match "
        "ON alert_rules(user_id, ticker, signal_type, COALESCE(direction, ''))"
    )


async def _rebuild_research_workspaces_for_owner_unique() -> None:
    """Replace the legacy global symbol uniqueness with per-owner uniqueness."""
    await _db.execute(
        """
        CREATE TABLE research_workspaces_v10 (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol          TEXT NOT NULL,
            name            TEXT NOT NULL,
            instrument_json TEXT NOT NULL,
            notes           TEXT NOT NULL DEFAULT '',
            evidence_json   TEXT NOT NULL DEFAULT '[]',
            snapshot_json   TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            user_id         INTEGER REFERENCES users(id),
            UNIQUE(user_id, symbol)
        )
        """
    )
    await _db.execute(
        "INSERT INTO research_workspaces_v10 "
        "(id, symbol, name, instrument_json, notes, evidence_json, snapshot_json, created_at, updated_at, user_id) "
        "SELECT id, symbol, name, instrument_json, notes, evidence_json, snapshot_json, created_at, updated_at, user_id "
        "FROM research_workspaces"
    )
    await _db.execute("DROP TABLE research_workspaces")
    await _db.execute("ALTER TABLE research_workspaces_v10 RENAME TO research_workspaces")
    await _db.execute(
        "CREATE INDEX idx_research_workspaces_updated ON research_workspaces(user_id, updated_at DESC)"
    )
    await _db.execute("CREATE INDEX idx_research_workspaces_user_id ON research_workspaces(user_id)")


async def _rebuild_notification_tables_for_owner_unique() -> None:
    """Scope notification and trigger idempotency keys to one owner."""
    await _db.execute("ALTER TABLE alert_triggers RENAME TO alert_triggers_v10_legacy")
    await _db.execute("ALTER TABLE notifications RENAME TO notifications_v10_legacy")
    await _db.execute(
        """
        CREATE TABLE notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'success', 'warning', 'error')),
            source_type TEXT,
            source_id   TEXT,
            payload     TEXT NOT NULL DEFAULT '{}',
            dedupe_key  TEXT,
            is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            user_id     INTEGER REFERENCES users(id),
            UNIQUE(user_id, dedupe_key)
        )
        """
    )
    await _db.execute(
        "INSERT INTO notifications "
        "(id, event_type, title, body, severity, source_type, source_id, payload, dedupe_key, "
        "is_read, created_at, user_id) "
        "SELECT id, event_type, title, body, severity, source_type, source_id, payload, dedupe_key, "
        "is_read, created_at, user_id FROM notifications_v10_legacy"
    )
    await _db.execute(
        """
        CREATE TABLE alert_triggers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id         INTEGER,
            rule_name       TEXT NOT NULL,
            ticker          TEXT NOT NULL,
            signal_type     TEXT NOT NULL,
            direction       TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
            confidence      TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
            signal_date     TEXT NOT NULL,
            description     TEXT NOT NULL,
            notification_id INTEGER,
            dedupe_key      TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            user_id         INTEGER REFERENCES users(id),
            UNIQUE(user_id, dedupe_key),
            FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "INSERT INTO alert_triggers "
        "(id, rule_id, rule_name, ticker, signal_type, direction, confidence, signal_date, "
        "description, notification_id, dedupe_key, created_at, user_id) "
        "SELECT id, rule_id, rule_name, ticker, signal_type, direction, confidence, signal_date, "
        "description, notification_id, dedupe_key, created_at, user_id FROM alert_triggers_v10_legacy"
    )
    await _db.execute("DROP TABLE alert_triggers_v10_legacy")
    await _db.execute("DROP TABLE notifications_v10_legacy")
    await _db.execute(
        "CREATE INDEX idx_notifications_unread_id ON notifications(user_id, is_read, id DESC)"
    )
    await _db.execute("CREATE INDEX idx_notifications_user_id ON notifications(user_id)")
    await _db.execute(
        "CREATE INDEX idx_alert_triggers_rule_created ON alert_triggers(user_id, rule_id, id DESC)"
    )
    await _db.execute("CREATE INDEX idx_alert_triggers_user_id ON alert_triggers(user_id)")


async def _install_schema_cleanup() -> None:
    """Drop the legacy zero-read portfolio_groups/items/trades tables (schema v24).

    These three tables were created early in the project, were never read or
    written by any router/service (verified by grep over backend/app), and had
    no user_id guard until v10 migration added the column only if present.
    Active portfolio data lives in portfolios/positions and paper_portfolios.
    The pre-v24 backup is created before this migration runs.
    """
    await _db.execute("DROP TABLE IF EXISTS portfolio_trades")
    await _db.execute("DROP TABLE IF EXISTS portfolio_items")
    await _db.execute("DROP TABLE IF EXISTS portfolio_groups")


async def claim_unowned_data(user_id: int) -> None:
    """Assign legacy rows to the first admin, then reject future ownerless writes."""
    for table in _OWNER_TABLES:
        await _db.execute(f"UPDATE {table} SET user_id=? WHERE user_id IS NULL", (user_id,))
        await _install_required_owner_guards(table)
    await _db.commit()


async def _install_required_owner_guards(table: str) -> None:
    await _db.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)"
    )
    await _db.execute(
        f"CREATE TRIGGER IF NOT EXISTS require_{table}_owner_insert "
        f"BEFORE INSERT ON {table} WHEN NEW.user_id IS NULL "
        f"BEGIN SELECT RAISE(ABORT, '{table}.user_id is required'); END"
    )
    await _db.execute(
        f"CREATE TRIGGER IF NOT EXISTS require_{table}_owner_update "
        f"BEFORE UPDATE OF user_id ON {table} WHEN NEW.user_id IS NULL "
        f"BEGIN SELECT RAISE(ABORT, '{table}.user_id is required'); END"
    )


async def seed_models_for_user(user_id: int) -> None:
    existing = await query_one("SELECT id FROM model_configs WHERE user_id=? LIMIT 1", (user_id,))
    if existing:
        return
    await get_db().executemany(
        "INSERT INTO model_configs "
        "(name, provider, base_url, model_name, api_key_env, is_default, user_id) "
        "VALUES (?, 'openai', ?, ?, 'DEEPSEEK_API_KEY', ?, ?)",
        [
            ("DeepSeek Flash", config.DEEPSEEK_BASE_URL, "deepseek-v4-flash", 1, user_id),
            ("DeepSeek Pro", config.DEEPSEEK_BASE_URL, "deepseek-v4-pro", 0, user_id),
        ],
    )
    await get_db().commit()


async def _ensure_column(table: str, column: str, definition: str) -> None:
    rows = await (await _db.execute(f"PRAGMA table_info({table})")).fetchall()
    if column not in {row["name"] for row in rows}:
        await _db.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = cast(aiosqlite.Connection, None)


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "数据库未初始化（lifespan 未运行）"
    return _db


def in_transaction() -> bool:
    """是否有显式写事务正在活动（供 execute 决定是否隐式提交）。"""
    return _TRANSACTION_DEPTH > 0


@asynccontextmanager
async def exclusive_transaction() -> AsyncIterator[None]:
    """BEGIN IMMEDIATE 写事务：提交/回滚与隐式提交隔离由本上下文统一负责。

    修复 Astra A2 P1：此前 job 用 `_RUNTIME_LOCK`+BEGIN IMMEDIATE，但共享连接
    上的其他 `database.execute()` 每次隐式 commit，可在 job 事务中途把其部分
    状态提前落盘，使后续 rollback 失效（且取消异常不在回滚范围）。
    使用本上下文后：事务期间 execute() 不再隐式 commit（见 execute()），
    成功统一 commit，任意异常/取消统一 rollback，杜绝部分提交。
    """
    global _TRANSACTION_DEPTH
    db = get_db()
    if _TRANSACTION_DEPTH == 0:
        await db.execute("BEGIN IMMEDIATE")
    _TRANSACTION_DEPTH += 1
    try:
        yield
    except BaseException:
        # 统一回滚到事务开始处（含 CancelledError/KeyboardInterrupt）
        _TRANSACTION_DEPTH = 0
        await db.rollback()
        raise
    else:
        _TRANSACTION_DEPTH -= 1
        if _TRANSACTION_DEPTH == 0:
            await db.commit()


async def _seed_models() -> None:
    """首次启动预置 DeepSeek 双模型（api_key 取环境变量名，不存值）。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM model_configs")
    if cast(sqlite3.Row, await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO model_configs (name, provider, base_url, model_name, api_key_env, is_default) "
        "VALUES (?, 'openai', ?, ?, 'DEEPSEEK_API_KEY', ?)",
        [
            ("DeepSeek Flash", config.DEEPSEEK_BASE_URL, "deepseek-v4-flash", 1),
            ("DeepSeek Pro", config.DEEPSEEK_BASE_URL, "deepseek-v4-pro", 0),
        ],
    )


async def _seed_agents() -> None:
    """首次启动播种 6 个预置角色。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM agent_presets")
    if cast(sqlite3.Row, await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO agent_presets (name, role_key, avatar, system_prompt, is_preset) "
        "VALUES (?, ?, ?, ?, 1)",
        [(r["name"], r["role_key"], r["avatar"], r["system_prompt"]) for r in PRESET_ROLES],
    )


# ------------------------------------------------------------------
# 通用查询辅助
# ------------------------------------------------------------------

async def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cur = await get_db().execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    cur = await get_db().execute(sql, params)
    row = await cur.fetchone()
    return dict(row) if row else None


async def execute(sql: str, params: tuple[Any, ...] = ()) -> int:
    """执行写操作并提交，返回 lastrowid。

    显式事务活动时（exclusive_transaction 内）不隐式提交——提交/回滚由
    事务上下文统一负责，避免把长事务的部分状态提前落盘（Astra A2 P1）。
    """
    cur = await get_db().execute(sql, params)
    if not in_transaction():
        await get_db().commit()
    return cast(int, cur.lastrowid)


def dumps_participants(items: list[dict[str, Any]]) -> str:
    return json.dumps(items, ensure_ascii=False)
