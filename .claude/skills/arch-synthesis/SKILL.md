---
name: arch-synthesis
description: Deep-analyze reference projects + current codebase to produce comprehensive architecture documentation, cross-reference maps, and tech debt roadmaps for FinQuant Hub
model: opus
---

# arch-synthesis: Architecture Synthesis Analysis Skill

## Trigger Criteria

Load this skill when the user says or implies any of:
- "analyze architecture" / "architecture review" / "architecture analysis"
- "fusion all projects" / "synthesize architecture" / "merge reference"
- "参考项目融合" / "架构分析" / "架构审查" / "融合架构" / "架构合成"
- "generate ARCHITECTURE.md" / "update architecture docs"
- Any task involving extracting patterns from `reference/` directories
- "arch-synthesis" (skill name invocation)

Do NOT load for:
- Simple code edits or feature implementation (use `explore-codebase` first if unfamiliar)
- Bug fixes or debugging (use `analyze-issue` / `fix-issue`)
- PR review (use `analyze-pr` / `review`)

## Overview

This skill reproduces the architecture synthesis analysis process that produced `docs/ARCHITECTURE.md`. It fans out one subagent per reference project, deeply reads the current codebase, cross-references findings, extracts architecture invariants, and generates actionable documentation.

## Step-by-Step Methodology

### Phase 1: Fan Out to Reference Projects (parallel)

Spawn one agent per reference project. Each agent independently analyzes the directory structure, core patterns, reusable design elements, and key files.

**Prompt template** (passed to each agent):

```
你是一位资深软件架构师。请深度分析以下项目目录，提取其核心架构模式、可复用的设计思路、关键代码结构和与金融量化相关的创新点。

项目: {project_name}
路径: {project_dir}
关注要点: {focus}

要求:
1. 先列出该项目的主要目录结构和关键文件
2. 提取核心架构模式（路由注册、工具链、Agent编排、数据流等）
3. 指出哪些设计可以直接复用到 FinQuant Hub 中
4. 指出哪些设计需要改造后借鉴
5. 给出每个可借鉴点的具体位置（文件路径+行范围）和实施建议
6. 最后给出 0-10 的"借鉴价值评分"

请结构化输出 JSON，包含: projectName, summary, corePatterns (array), directlyReusable (array with item/location/detail), adaptedReuse (array with concept/value/adaptation), keyFiles (object), score (number), recommendations
```

**Reference projects to analyze:**

| Project | Directory | Focus |
|---------|-----------|-------|
| ai-berkshire | `reference/ai-berkshire` | 多Agent金融分析框架、价值投资Agent角色设计、工具链架构 |
| Vibe-Trading | `reference/Vibe-Trading` | LoaderRegistry注册模式、Research Goal生命周期、回测引擎架构、MCP集成模式 |
| wq-alpha-research | `reference/wq-alpha-research` | Alpha因子研究框架、WorldQuant BRAIN接口、因子字段管理、增量快照机制 |
| daily_stock_analysis | `reference/daily_stock_analysis` | SkillAgent路由、数据源适配器模式、日报生成管线 |
| stock-analyzer | `reference/stock-analyzer` | 13章报告模板、指标打分体系、分析框架设计 |
| BigDataView | `reference/BigDataView` | 大数据可视化架构、数据管道设计 |

All located under `E:/Code_file/Projects/finquant-hub/reference/`.

### Phase 2: Analyze Current Codebase (parallel)

Spawn three specialist agents in parallel to analyze different slices of the current codebase:

**Agent 2a — Backend Deep Analysis**
Analyze: `backend/app/` — routers/ services/ agent/ backtest/ database.py
Focus: route registration patterns (14 routers), service layer design (market data, LLM client, analytics pipelines, backtest engine), Agent framework (6 tools, ToolRegistry singleton, BaseTool ABC), database schema (15 tables, relationships, data flow), architecture invariants, tech debt

**Agent 2b — Frontend Deep Analysis**
Analyze: `frontend/src/` — pages/ components/ services/ types/ build config
Focus: page map (13 pages), component tree, API client pattern (single `api.ts` axios instance), state management, bundle analysis, routing, invariants, gaps

**Agent 2c — Docs + Tests Analysis**
Analyze: `docs/` directory, test coverage, overall documentation completeness
Focus: existing doc inventory (ARCHITECTURE.md, HANDOVER.md, API_CONTRACT.md), staleness assessment, coverage gaps, recommendations

### Phase 3: Cross-Reference and Dependency Mapping

Synthesize all phase 1 and phase 2 results into a unified view:

1. **Architecture overview** — one-line positioning, system layering diagram (browser → vite proxy → route layer → service layer → agent layer → data layer → external APIs)
2. **Core architecture patterns** — extract from both own code and reference projects. The 7 known patterns are (see below for details):
   - Route Unified Registration Pattern
   - Service Layer Hierarchy Pattern
   - Agent Tool Framework
   - Data Source Adapter Pattern (with fallback chain)
   - SSE Streaming Communication Pattern
   - LLM Client Abstraction Layer
   - Dual-Version Backtest API Pattern
3. **Architecture invariants** — express as "what does NOT exist" (no ORM, no connection pool, no unified table creation, no DAL/Repository, no WebSocket, no auth, no agent-to-agent communication, etc.)
4. **Data flow diagram** — full request lifecycle from user action to DB/external API and back, for both SSE analysis path and portfolio CRUD path
5. **Reference project impact map** — table of which designs from each ref project have been adopted (or should be), with priority and influence path
6. **Component dependency graph** — text-based tree showing `main.py → routers/ → services/ → external APIs`, plus the longest call chain (6 layers for stock analysis SSE)

### Phase 4: Architecture Invariant Extraction

Extract implicit rules from the actual code. Invariants are phrased as "what does NOT exist" — a violation means architecture breach:

**Database layer:**
- No ORM (raw SQL only)
- No connection pool (aiosqlite single connection)
- No unified table creation entry (3 independent paths: database.py + portfolio.py + backtest.py)
- No migration framework (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN` only)

**Service layer:**
- No separate Data Access Layer / Repository (routers call `database.query_one/query_all/execute` directly)
- No unified ticker resolver (3 parallel paths: `resolve_ticker()` / `external_symbol()` / `normalize_code()`)
- No WebSocket (all real-time via SSE through sse-starlette)
- No dependency injection container (MarketDataService via `request.app.state.market`)

**Frontend:**
- No per-service API client (single `api.ts` axios instance)
- No authentication/authorization (no login, session, JWT, or API key)
- No server-side rendering (pure CSR)

**Agent:**
- No agent-to-agent communication (4 agents execute independently, no cross-referencing)
- No tool call persistence (only token_usage recorded, not parameters/results)
- No idempotency guarantee (multiple POST /api/research creates duplicate records)

### Phase 5: Tech Debt Roadmap Generation

Classify tech debt into three tiers with concrete, actionable items:

**Short-term (1-2 days, independently fixable):**
1. Eliminate 3-path ticker resolution — unify to `market_data.normalize_code()`
2. Merge 3 independent table creation paths into `database.py` schema
3. Audit all 4 SSE endpoints for consistent `try/finally` error event coverage
4. Add multi-market PnL tests for HK/US positions in `portfolio.calc_pnl()`

**Medium-term (1-2 weeks, needs design review):**
1. Introduce Data Access Layer (repository classes per domain)
2. Tool call persistence and audit trail (`agent_tool_calls` table)
3. Unified API error response format across all endpoints
4. Research result idempotency (time-window dedup for same ticker+model)
5. Frontend API layer split by domain (chat/market/portfolio/research modules)

**Long-term (architecture-level, phased):**
1. Database migration framework (alembic or version-numbered migrations)
2. Authentication and authorization system (OAuth 2.0 + JWT)
3. WebSocket migration for high-frequency scenarios (backtest progress, real-time quotes)
4. Multi-source unified data provider abstraction (protocol class per source)
5. Inter-agent cross-validation and debate mechanism
6. End-to-end test suite (pytest + respx/pytest-httpx for external API mocking)

## Output Files

After synthesis, write these files:

1. **`docs/ARCHITECTURE.md`** — Complete architecture document (~2000-3000 Chinese characters) covering:
   - One-line positioning
   - System layering diagram (text art)
   - 7 core architecture patterns with code locations and key characteristics
   - Architecture invariants (what does NOT exist)
   - Data flow diagram (request lifecycle)
   - Reference project impact map (table)
   - Component dependency graph (text tree)
   - Tech debt roadmap (short/medium/long-term)

2. **`docs/ARCHITECTURE_ANALYSIS.json`** — Machine-readable output with structured fields:
   - `archInvariants`: string[]
   - `dataFlowSummary`: string
   - `refImpactMap`: {project, influence, priority}[]
   - `techDebtRoadmap`: {immediate, medium, longterm: string[]}
   - `corePatterns`: {name, location, description}[]

3. **`docs/API_CONTRACT.md`** (if outdated) — Updated endpoint inventory:
   - Grouped by router
   - Path, method, brief description per endpoint
   - Mark which are MVP vs new
   - Table format

## The 7 Core Architecture Patterns (Reference)

These patterns are the verified architectural skeleton of FinQuant Hub, extracted during the initial synthesis run:

1. **Route Unified Registration Pattern** — `main.py` lines 31-34: all 14 routers flat-registered in a for loop, no nesting, no auto-discovery, no prefix conflict detection.

2. **Service Layer Hierarchy Pattern** — `backend/app/services/`: three sub-layers (pure logic services with no I/O → I/O services wrapping external APIs → orchestrators coordinating multiple services). Constraint: orchestrators call I/O and logic services; I/O services call logic services; logic services call nothing.

3. **Agent Tool Framework** — `backend/app/agent/`: `BaseTool` ABC + `ToolRegistry` singleton + `ToolResult`. 6 registered tools. Research orchestrator uses `chat_with_tools_loop` for multi-turn tool-use cycles.

4. **Data Source Adapter Pattern** — `backend/app/services/market_data.py`: `MarketDataService` wraps 4 sources (Tencent/Sina/EastMoney/Yahoo) with market-specific fallback chains. Two httpx clients (`trust_env=False` for A-share, `trust_env=True` for HK/US).

5. **SSE Streaming Communication Pattern** — 4 SSE endpoints share: request → DB record → async generator yielding (event, data) → `EventSourceResponse` → frontend consumption. Unified event protocol: token/agent_started/tool_call/done/error. All in `try/finally`.

6. **LLM Client Abstraction Layer** — `backend/app/services/llm_client.py`: depends only on OpenAI Chat Completions protocol. 5 methods from simple `chat()` to full `chat_with_tools_loop()`. Model routing via `model_router.get_client()` with DB-managed provider configs.

7. **Dual-Version Backtest API Pattern** — `backend/app/routers/backtest.py` (v1, synchronous) vs `backtests.py` (v2, async with BackgroundTasks + state machine). Only explicit version evolution trace in the project.

## Quality Checks

Before declaring the synthesis complete, verify:

1. **Invariants are truly verifiable** — each invariant must be checkable by grepping the codebase (e.g., "no ORM" → verify with `grep -r 'sqlalchemy\|SQLAlchemy' backend/`). If you can't write a grep command to prove it, reformulate the invariant.

2. **Debt items are actionable** — each debt item must be a concrete task that can be assigned and estimated (not "improve code quality" or "refactor everything"). It must name files, suggest a specific approach, and have a clear done-condition.

3. **Pattern locations are specific** — each core pattern reference must include the exact file path and approximate line range where the pattern lives, not just a directory name.

4. **Cross-reference claims are backed** — every "project X influenced feature Y" claim must be traceable to specific code similarities, not general impressions. If no code adoption exists, say so explicitly (score 0).

5. **Output files are written, not just announced** — use Write tool to actually create/update the doc files. Verify they exist with a file listing after writing.

6. **Self-check: does the output contradict CLAUDE.md?** — cross-check against the project CLAUDE.md's `## What's actually BROKEN` section and `## Key files to know` to ensure new architecture docs don't contradict known broken items. Flag any contradictions explicitly.
