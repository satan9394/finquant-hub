"""SQLite 数据层：aiosqlite 单例连接 + 建表 + 种子数据（WAL 模式）。"""
import json

import aiosqlite

from . import config
from .prompts.roles import PRESET_ROLES

SCHEMA = """
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
    status        TEXT DEFAULT 'completed',
    created_at    TEXT DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS portfolio_groups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      INTEGER,
    ticker        TEXT NOT NULL,
    name          TEXT,
    shares        REAL,
    avg_cost      REAL,
    currency      TEXT DEFAULT 'CNY',
    added_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES portfolio_groups(id)
);

CREATE TABLE IF NOT EXISTS portfolio_trades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER,
    action        TEXT NOT NULL,
    shares        REAL,
    price         REAL,
    total         REAL,
    traded_at     TEXT,
    note          TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES portfolio_items(id)
);
"""

_db: aiosqlite.Connection | None = None


async def init_db() -> None:
    """FastAPI lifespan 启动钩子：建库建表 + WAL + 种子数据。"""
    global _db
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(config.DB_PATH)
    _db.row_factory = aiosqlite.Row
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await _db.executescript(SCHEMA)
    await _seed_models()
    await _seed_agents()
    await _db.commit()


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "数据库未初始化（lifespan 未运行）"
    return _db


async def _seed_models() -> None:
    """首次启动预置 DeepSeek 双模型（api_key 取环境变量名，不存值）。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM model_configs")
    if (await cur.fetchone())["n"] > 0:
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
    if (await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO agent_presets (name, role_key, avatar, system_prompt, is_preset) "
        "VALUES (?, ?, ?, ?, 1)",
        [(r["name"], r["role_key"], r["avatar"], r["system_prompt"]) for r in PRESET_ROLES],
    )


# ------------------------------------------------------------------
# 通用查询辅助
# ------------------------------------------------------------------

async def query_all(sql: str, params: tuple = ()) -> list[dict]:
    cur = await get_db().execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def query_one(sql: str, params: tuple = ()) -> dict | None:
    cur = await get_db().execute(sql, params)
    row = await cur.fetchone()
    return dict(row) if row else None


async def execute(sql: str, params: tuple = ()) -> int:
    """执行写操作并提交，返回 lastrowid。"""
    cur = await get_db().execute(sql, params)
    await get_db().commit()
    return cur.lastrowid


def dumps_participants(items: list[dict]) -> str:
    return json.dumps(items, ensure_ascii=False)
