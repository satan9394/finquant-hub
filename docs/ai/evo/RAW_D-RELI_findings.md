# RAW D-RELI audit findings (extracted from subagent transcript)


--- finding 1 ---
Let me start by understanding my task. I'm SUBAGENT D — RELIABILITY_SECURITY_AUDITOR. I need to:

1. Read `docs/ai/evo/PROJECT_BRIEF.md` first
2. Audit key files (read-only):
   - `backend/app/services/market_data.py`
   - `llm_client.py`
   - `credential_store.py`
   - `research_orch.py`/`research_jobs.py`
   - `scheduler.py`
   - `database.py`
   - `context.py`
   - `provenance.py`
   - `start.bat`
3. Write report to `docs/ai/evo/RELIABILITY_REPORT.md`
4. Send my result to parent agent `session-3d7ed6b1-e748-4013-b264-da68ccbe2213`

Let me start by reading the project brief and taking stock of the file structure. I should use the todo tool to track my work, and start reading files in parallel.



--- finding 2 ---
Now let me locate the key files. Let me glob for the paths mentioned in the task.项目背景已了解。现在定位关键文件。

--- finding 3 ---
File locations confirmed. Let me read the key files. I'll batch reads:
1. `backend/app/services/market_data.py`
2. `backend/app/services/llm_client.py`
3. `backend/app/services/credential_store.py`

Let me check file sizes first, or just read them. Let me read in parallel.

--- finding 4 ---
Two files read. Now let me read credential_store.py, research_orch.py, research_jobs.py.继续读取密钥存储与编排相关文件。

--- finding 5 ---
Now let me read research_orch.py, scheduler.py, database.py, context.py, provenance.py, start.bat.

--- finding 6 ---
Now let me read database.py, context.py, provenance.py, start.bat. Let me also check config.py.

--- finding 7 ---
Now let me read the rest of database.py (from 1173), provenance.py, start.bat, config.py. Also I should check main.py for the lifespan and startup/teardown handling.

--- finding 8 ---
Now let me read the rest of database.py (query helpers, execute), provenance.py, config.py, and main.py (lifespan). Let me finish reading database.py first.

--- finding 9 ---
Now let me read provenance.py, main.py, and check source_health.py (CircuitBreaker), the research router that handles SSE (to examine disconnection handling), and the agent tool with subprocess (mcp_runtime, tools). Let me also check for the SSE handling in a router.

--- finding 10 ---
Now I have a good picture. Let me look at:
1. The SSE research router (`backend/app/routers/research.py`) for disconnection handling
2. `source_health.py` for the CircuitBreaker implementation
3. `auth.py` for session handling
4. `agent/tools.py` for command execution tools (MCP stdio, any subprocess)
5. `mcp_runtime.py` for stdio transport

Let me glob the routers and agent dirs.

--- finding 11 ---
Now I have a good picture of a lot of things. Let me check a couple more critical things:

1. The agent tools — command execution (MCP stdio!), file system risk. Let me read `mcp_runtime.py` and `agent/tools.py` (at least skim). MCP stdio runs arbitrary commands — this is a command execution risk.
2. `auth.py` for session handling.
3. The `middleware/security.py`.
4. Docker entry if exists.
5. Also examine the LLM usage flush — `llm_usage.py` reset context.
6. Check on the scheduler: `scheduler_loop` waits `min(daily_delay, 30)`, then runs `run_due_research_jobs`, and when `daily_delay <= delay + 0.5` runs `run_scheduled_cycle`. Looks OK.

Let me also check `report_export.py` (pdf/docx generation — file system writes?), and check whether the SSE for chat exists (chat router). Given context limits, prioritize:

- mcp_runtime.py (command execution)
- agent/tools.py (tools - subprocess/credentials/fs)
- auth.py + middleware/security.py (session security)

Then quickly scan for subprocess usage across the codebase with grep.

--- finding 12 ---
Interesting: two `eval` calls with `{"__builtins__": {}}` — that's a restricted-eval pattern (still risky but hardened); let me look at those. Also, MCP stdio spawns commands — let me check `backend/app/tools/mcp_bridge.py` to see how the command is executed and whether env could be dangerous.

Let me grep for more potential issues: file writes, `open(`, `write_text`, `Path(` etc. Also llm_usage flush. Let me read the eval contexts and mcp_bridge.

--- finding 13 ---
MCP stdio bridge at `backend/app/tools/mcp_bridge.py` line 90 spawns a subprocess with `env=dict(self.config.env)`. Let me read mcp_bridge.py to see how commands are spawned (create_subprocess_exec presumably, with args from DB config). This is a command execution risk: DB-stored `command` + `args` + `env` will be executed at startup. In a local-only app this is less risky, but is worth noting that the MCP config table can hold arbitrary commands — if a user configures a malicious MCP, it executes with the user's privileges. That's by design (MCP stdio), but flag as a risk + permission note.

Let me also check `financial_rigor.py` eval, `auth.py`, `middleware/security.py`, `llm_usage.py`, and `report_export.py` pdf generation. Also the `swarm_orch.py`/`discussion` SSE disconnect handling, but that might be similar to research. Let me look at llm_usage.py since it's central to token accounting across contexts.



--- finding 14 ---
Now I understand the LLM usage pattern. Let me note a potential issue: `record_llm_usage` spawns a background task per call without dedup, and `_write_usage` runs `database.execute` — if a research SSE has been cancelled (client disconnect) but the LLM response is streaming, usage records may attribute usage to the wrong user context after `reset_usage_context` (ContextVar reset happens on cleanup). Actually, since record is called synchronously within the LLM response handling, the ContextVar will be correct at the time of the call. But a race: `_write_usage` captures `_CURRENT_USAGE.get()` at task creation time (line 102 — `_CURRENT_USAGE.get()` is evaluated when creating the task, before `asyncio.create_task` returns — actually it's evaluated in the current context at call time, so it's correct).

However, there's a subtle issue: when the SSE research stream is cancelled mid-flight, the finally block resets usage context and then the cleanup task runs. If an LLM call is concurrently completing, that's OK because the context was captured synchronously.

Now let me check the `auth.py` and `middleware/security.py` briefly, plus `report_export.py` (pdf generation — subprocess? It uses markdown_to_pdf — is it using a subprocess like weasyprint? No new subprocess found in grep except mcp_bridge.) Let me quickly grep for `weasyprint|reportlab|wkhtmltopdf` and check the export service.

Also key questions for the audit:
1. Credential file `.credential-key` — stored next to the DB in plaintext (line 35-44 credential_store.py). The key is stored in a plain file `.credential-key` with 0o600 perms. On Windows, file permissions 0o600 are basically advisory (Windows NTFS ACLs may not restrict). If attacker has local access to the machine (which is the threat model for a local app — but this is a web app binding on 127.0.0.1), then DB + key are both accessible → encryption is only obfuscation against casual DB copy. This is by design for local mode, but worth flagging: the master key file is stored adjacent to the DB in `backend/data/.credential-key`. If the user backs up/copies only the DB (e.g., shares finquant.db), the credentials cannot be decrypted (good). If they copy the whole data dir, both travel together (bad-ish but same machine). Also — is `.credential-key` gitignored? Let me check the .gitignore. The comment says "ignored database". Let me check .gitignore.

2. `migrate_legacy_model_api_keys` runs at startup and clears `api_key` column in model_configs — good. But wait: schema `model_configs` still has an `api_key` column (line 33 in SCHEMA). `put_credential` uses service key `model:{id}`. There may be plaintext api_key in model_configs for seed models? No — seeds store `api_key_env='DEEPSEEK_API_KEY'` with api_key NULL. OK.

3. Error message in `llm_client._response_error`: `snippet = body.replace(self.api_key, "[已隐藏]")` — masks the key if the provider echoes it. Good. But `LLMError` messages could still leak base URLs. Also, at line 92-93, if the body contains the key with different casing or partial, leak possible — minor.

4. `chat_with_tools_loop` and `_call_agent` — tool executor exceptions are caught and returned as text (tool_failed), good — a tool failure doesn't kill the loop.

5. Scheduler: `scheduler_loop` sleeps `min(daily_delay, 30)` and polls `run_due_research_jobs` every 30s. `run_due_research_jobs` → `recover_stale_research_runs` first, then due jobs. Claim with lease 60s, heartbeat every 20s. On crash, lease expires ≥60s, next poll recovers: if report marked completed → reconcile completed; else mark failed + retryable with pending_idempotency_key to retry. Good robustness. One subtlety: if process crashes mid-run **after** `_run_and_persist_target` completes the report but **before** `finish_research_run` marks run completed — recover_stale marks report_status completed → runs reconciled completed. Good.

But there's a subtle bug possibility in `recover_stale_research_runs`: it sets `scheduled_research_jobs.next_run_at = current` and `pending_idempotency_key = run["idempotency_key"]` for failed runs (line 385-390). Then `run_due_research_jobs` picks up the job again with `idempotency_key=job.get("pending_idempotency_key")`. It re-claims using the same idempotency key: `claim_research_job` checks existing run with same idempotency_key: if status='failed' → proceeds to create attempt+1 (retry). So retry happens on next 30s poll — but wait, `due_research_jobs` requires `next_run_at<=now` AND last_status != 'running'. After recovery, job last_status='failed', next_run_at=current → due. So retry after ~30s. This is a design decision (immediate retry). OK.

Potential risk: **runaway retries** if the job always fails (e.g., LLM API key invalid): a failing scheduled job retries every 30 seconds indefinitely, burning API calls/rate limits and spamming events. There's no retry cap or backoff — `attempt` increments forever. `claim_research_job` has `retry_of_run_id`, events recorded. There's no max attempts. That's a real "assume failure" finding: scheduled jobs with persistent upstream failure will retry forever every 30s. Each attempt creates research_reports row + events + LLM calls. This is P1: resource burn + DB growth. Also `_load_daily_targets` runs a full post-market analysis for every target — that's once a day, fine.

Wait — actually let me reconsider: is there any guarding? Looking at `run_research_job`: it claims with `pending_idempotency_key` and if `run is None` returns False. claim with **same idempotency_key** for a run whose status is 'failed' will create a NEW attempt (retry_of=prior). So yes, infinite retry loop at poll cadence (30 s) for persistently failing jobs. Unless... `pending_idempotency_key` — after job finishes, set NULL. After recovery it's set to run["idempotency_key"]. In `claim_research_job` — the idempotency logic: `existing` is the most recent run with that idempotency key; if 'running' → None (no claim), if 'completed' → idempotent replay. If 'failed' → proceeds to create next attempt. So yes, retry forever with same idempotency key. Only recovered runs set pending key. Hmm, and retries happen in same poll loop? `run_due_research_jobs` only runs once per 30s poll — each retry costs 30s wait. Still infinite.

Actually wait, will it even matter? `due_research_jobs` LIMIT 20, and attempted job is re-due immediately. So single failing job → retry every 30s. This should be flagged: **no retry cap/backoff for scheduled research jobs** — a job failing due to e.g. invalid API key retries every 30 s indefinitely, consuming API quota if the cause was transient-recovering (LLM calls happen, fail, retry). Each attempt inserts research_reports + events. DB bloat + LLM cost. P1.

6. `scheduler_loop` also calls `run_due_research_jobs` every ≤30s **before** the daily cycle even if SCHEDULER_ENABLED. Wait — scheduler task only created if config.SCHEDULER_ENABLED. In start.bat, is SCHEDULER_ENABLED set? start.bat doesn't set it! Let me check .env.example. If .env.example doesn't enable scheduler, scheduled research jobs and alerts never run by default. Let me check.

7. In `run_research` (orchestrator), on `LLMError` in `_call_agent`, the agent returns "【分析失败】" text but run continues; report_lead failure yields "agent_failed" event but no error event → report may still "complete" with garbage. For lead, if `_call_agent` raises LLMError then `lead_content=""`. Report still built with empty lead. The stream yields "done". So a full LLM outage → reports marked completed with empty contents? Wait — `run_research` yields "error" only when `model_router.get_client` fails at the start. If the LLM goes down mid-run after client creation, each agent catches LLMError inside `run_agent` (line 223-225) and returns "【分析失败】{exc}" — the DAG continues, `done` gets yielded with a report that consists of failure texts. The SSE router then marks report `completed`. **An LLM outage mid-research yields "completed" reports full of "【分析失败】" text.** That's a data-quality issue; arguably should be marked failed/partial. Actually in scheduler `_run_and_persist_target` — same: done event persists report_data with failure texts and marks completed. This is a P1/P2 finding: no LLM-circuit-level abort; report completed with degraded content; user-facade shows a full report that's mostly failure messages.

8. `quotes` gather with `return_exceptions=True` filters non-dict results — silent partial failure for batches (OK, by design to keep list pages usable).

9. `quote_enriched` — sends extra requests to fill missing fields; if primary source is OK but the enrich fails, still fine.

10. `search()` function — EastMoney then Yahoo then direct quote fallback. If all fail → MarketError raised with error text. It returns `[]` when keyword empty. Fine.

11. `escaped` path traversal in `main.py frontend_fallback`: `candidate.is_relative_to(frontend_dist.resolve())` — good; but requested-path check `full_path == "api" or startswith("api/")` → 404. But note: `/api` uppercase or `api%2F`? Path is URL-decoded by Starlette. Minor.

12. SecurityMiddleware cookie_name — let me quickly read security.py and auth.py. Also sessions store token_hash (SHA256?) — need to verify hash + expiry & revocation checks. Also login_codes store code_hash, attempts, expiry — need to verify brute-force limiting (AUTH_IP_HOURLY_LIMIT, AUTH_CODE_MAX_ATTEMPTS exist in config).

13. `start.bat`: several issues:
   - `pushd "%~dp0"` fails if errorlevel 1 — fine.
   - Uses bun from specific hardcoded path D:\...v22.19.0\bun.exe as fallback — that's a personal machine path; open-source distribution to "others" would break. But the fallback is only when `where bun` fails. It also hardcodes python 3.12 requirement.
   - Port check: if port busy → exit (doesn't kill). Good.
   - Frontend build staleness check: `frontend/package.json LastWriteTimeUtc > dist/index.html` → rebuild. But: **source changes (src/**) don't trigger rebuild** — noted in comment "源码更新后需手动重建". For distribution that's a packaging concern, not reliability per se.
   - `copy /b backend\.env.example backend\.env` — copies template without config; the .env.example may contain placeholder DEEPSEEK_API_KEY. Fine.
   - No `--workers`... uvicorn default 1 process, fine. Local single process.
   - No check on `backend\.venv` python version mismatch.
   - If the app crashed (Ctrl+C), bat shows error path.
   - It never verifies that `backend\requirements.txt` is up-to-date when .venv exists (`goto frontend` skips pip install). Upgrades: if a new version adds requirements, existing install won't pip install new deps → startup ImportError. That's a "升级迁移" risk: the "if not exist .venv" check means existing venv never re-syncs requirements. windows users who run start.bat after pulling update with a new dependency will get a startup failure with a non-obvious message. P1/P2.

14. DB migrations: `_migrate_schema` uses SAVEPOINT per migration, backtracks on failure and re-raises → startup fails (fail-fast, good). Pre-migration backups for v10+ (each creates `.pre-vN.bak` via `_db.backup`). But: **no backup before migrations < v10** (v1-v9 run without any backup — historical, those DBs are long migrated; still, a v1-v9 migration failure would lose data? savepoint rollback protects). Also: **backups created only if the DB is below the version at startup** — after v26 everything is current so no further backups. And .bak files accumulate 16 copies of the DB (each pre-vN backup is a full copy!) — large storage footprint. Let me verify which backup functions exist: pre-v10..pre-v24 (excluding some). Let me count: pre-v10, pre-v12, pre-v13, pre-v14, pre-v15, pre-v16, pre-v17, pre-v18, pre-v19, pre-v20, pre-v21, pre-v22, pre-v23, pre-v24. That's 14 backups, each a full DB copy. Storage is a minor concern; but also each backup has secrets! The `.pre-v24.bak` files contain user credentials (user_credentials encrypted — with the same master key; if .credential-key also present, decryption possible from backups too). So backups + key in same dir = same risk. And these .bak files are never pruned. Minor.

15. `close_db()` doesn't run `PRAGMA wal_checkpoint` — aiosqlite close does checkpoint implicitly on last connection close? With WAL mode, closing the last connection triggers checkpoint automatically. OK.

16. **No backup/restore tooling for end users**: no documented backup command; start.bat doesn't back up. For "数据恢复" dimension: database.py creates pre-migration .bak snapshots only. There's no user-facing export/restore for the whole DB. But evidence export and memory export endpoints exist (research.py). P2: add a backup/restore (or document copying backend\data while stopped).

17. `init_db` calls `_backup_database_before_*` only when `existing_database and current_version < X`. Then `executescript(SCHEMA)` + `_migrate_schema()`. If startup dies between backup and commit, next start re-runs from user_version (SAVEPOINT atomicity) — OK.

18. `research_orch._call_agent` builds tools list from `tool_registry.list_all()` filtered by allowed_tools; each round passes tools — fine.

19. Context budget: `_prepare_messages` compacts messages with tool_tokens reservation — good. But `compact_messages` summary is heuristic (no LLM summarization); dropping early content could drop important context. Not a reliability bug per se; context exhaustion mitigation exists.

20. In `llm_client.chat_stream`: `record_llm_usage` is called after the async-for loop — if the client disconnects mid-stream, the generator is closed and the `record_llm_usage` at line 367 never executes → usage not recorded for partial streams; minor accounting gap. Also `_payload` always sets stream_options include_usage. If connection drops, httpx.HTTPError raised → LLMError. OK.

21. `chat()` non-streamed — if `data["choices"][0]["message"]["content"]` missing → content "" and no error; empty reply treated as success — could yield empty AI answer marked OK. Minor: no empty-content guard (some providers return empty content with reasoning_content only). For thinking models content may be empty while reasoning_content has text — `content or ""` returns "", losing reasoning text. The `chat_with_tools_safe` retains reasoning_content for tool calls. For the final answer, "content or ''" — DeepSeek reasoning models put final answer in content, OK.

22. `_response_error` truncates to 300 chars and masks key — but the snippet is included in LLMError message which is surfaced to user and stored in DB error fields (research_reports? error stored in scheduled runs). Fine.

23. **API key leakage via error messages**: `_response_error` masks api_key only if the response body contains it fully. Not a big issue.

24. `credential_store._master_key` uses `os.open(path, O_CREAT | O_EXCL | O_WRONLY, 0o600)`. On Windows, `os.open` with mode 0o600 — Windows ignores the mode mostly; the file inherits default ACLs (readable by other local users in some setups). Threat: another local process could read `.credential-key` and decrypt `.credential-key`-encrypted DB values. Combined with `user_credentials` BLOB in DB. Since the service binds 127.0.0.1 and is designed single-user local, the exposure is to local malware/other users on the same Windows box. This is precisely a "key disclosure" scenario: **master key stored in plaintext next to the database is by-design for LOCAL_ONLY, but in production MASTER_KEY env is required — good.** Also: 0o600 on NTFS via Python os.open — Python on Windows sets the file to read/write for the current user only? Actually `os.open(..., 0o600)` on Windows maps to `_wopen` which ignores mode. So no ACL hardening. Flag: master key file world-readable on Windows by default; suggest restricting ACLs at creation or keeping key out of the data dir.

But — this is intentional per design comments ("Local installs keep the encryption key beside the ignored database"). So framing: 受控-but-weak. The real residual risk: anyone with file system access to backend/data can decrypt tushare/API tokens. Mitigation suggestions: Windows ACL, or Windows DPAPI, or at least document threat model.

25. `migrate_legacy_model_api_keys` — if a legacy row fails mid-way? put_credential + clear per row — no transaction wrapping, partial migration on crash is recoverable (idempotent — re-runs each startup; keys already moved are NULL, skipped). OK.

26. SSE for discussion / chat / swarm — I haven't verified their disconnect handling. Given time, I could grep quickly for `EventSourceResponse` and cleanup patterns. The research path is the exemplar (A3 P1 fixed). Let me spot-check chat router quickly.

27. `scheduler._run_and_persist_target` — evidence_id collection `collect(report_data)` — recursive scan of strings starting with "ev_" — fine.

28. post-market cycle: `run_post_market_analysis` — for every known target, potentially 20 targets × 4 agents × LLM calls — a long-running daily job. If the scheduler task is cancelled at shutdown (lifespan finally cancels), CancelledError propagates and reports are marked failed with "盘后研究被取消". Good.

Potential risk: **scheduler asyncio task suppressed exceptions** — `scheduler_loop` catches and logs; loop `while True` never exits — good persistent loop. But `run_scheduled_cycle` runs in the same task; if it takes >1 day? Not an issue.

But wait — one real issue: scheduler_loop polls `run_due_research_jobs` every ≤30 s. `run_due_research_jobs` calls `recover_stale_research_runs` — recovering jobs whose lease expired (running + lease_expires_at <= now). Lease is 60s and heartbeat every 20s. If the LLM call of a run takes longer than 60s between heartbeats (upstream slow, 120s timeout on LLM client!), the heartbeat task `_heartbeat_lease` runs concurrently... wait, is the heartbeat concurrent with the run? In `run_research_job`: `heartbeat_task = asyncio.create_task(_heartbeat_lease(...))` then awaits `_run_and_persist_target`. Heartbeat task runs every 20s independently of the research — heartbeat_research_run acquires `_RUNTIME_LOCK` and updates lease; so the lease stays alive while the process lives. On process crash, lease expires within 60s. But hold on — `_heartbeat_lease` returns (stops) if `heartbeat_research_run` returns False. It can return False if... status not 'running' or lease_expires_at <= now or lease_owner mismatch. During run it's fine.

Concurrency risk: **two scheduler processes** (e.g., user runs start.bat twice, or uvicorn --reload spawns a second process) → both poll due jobs; claim with `WHERE last_status!='running'` + run lease prevents double execution (single claim wins; other gets None → return False). Actually `claim_research_job` idempotency: two processes claim same job with the same idempotency key; first creates 'running' run; second sees existing 'running' → returns None. Good — the claim design handles single-owner, avoids overlap. BUT the lease guard `WHERE last_status!='running'` on the job row: the second process's UPDATE rowcount=0 → return None. Good.

However uvicorn --reload in dev spawns a reloader parent + worker; if both ran schedulers → recover_stale may fight... not our production path.

29. **Interaction: `database.get_db()` asserts single connection; `mcp_runtime` startup `restore_enabled_mcp_servers` is awaited at lifespan — if MCP server hangs (stdio process that doesn't respond), connect times out at 10s — startup blocked up to N×10s for N servers. Startup slow but bounded.

30. `main.py` lifespan: `validate_master_key()` in dev uses `.credential-key`, creates the file at startup — fine.

31. What about `LOCAL_ONLY_MODE`? `ensure_local_user()` — single local owner; auth disabled? "LOCAL_ONLY_MODE=true 仅允许 development；自动使用单一本地所有者，不提供邮箱登录/session" — so in local mode no session auth? But `SecurityMiddleware` and `authenticated_context` still applied... ensure_local_user probably creates a fixed user; `authenticated_context` returns that. OK.

32. `senders.py` line 120 — webhook sending with trust_env=True — fine.

33. `news_search.py` — timeouts 15s etc.

34. The `llm_client._http_client` creates a new httpx.AsyncClient **per call** (`async with self._http_client()`) — no connection pooling across requests; TLS handshake per call. Performance, not reliability. Timeout = 120s default.

35. `LLMClient.chat` — no retry on 5xx/network. `chat_with_tools_loop` doesn't retry individual rounds; a single upstream hiccup fails the whole research agent (caught → 分析失败 text). Combined with #7: no LLM retry/backoff — "模型失败" dimension: **single LLM call failure kills the whole 4-agent research run (no retry)**; for a 5-10 minute pipeline the failure rate is non-trivial. Suggest retry (2-3 attempts, exponential backoff) in LLMClient for 5xx/429/network errors. P1 for user-facing research reliability.

Let me verify auth.py quickly (session security) and middleware/security.py, then check .env.example for SCHEDULER_ENABLED default, and check .gitignore for data/. Also check the chat router SSE disconnect pattern briefly. Then write the report.

--- finding 15 ---
Important findings:
- **SCHEDULER_ENABLED=false by default** — start.bat does NOT set SCHEDULER_ENABLED. So scheduled research jobs & alerts & post-market review never run unless the user manually edits .env. This is a "scheduler feature silently off by default" finding — for distribution, cron jobs are a headline feature; disabling by default means the module is dead out of the box (P2, intentional maybe).

- Auth: verification code only 6 digits (1e6 space) with attempts cap 5 + ip hourly limit — reasonable. Login code is logged in LOGGER.warning in dev mode ("Local login code") — code exposure to log file (dev-only). Sessions: token_hash=sha256(token) — token itself is 32-byte urlsafe (fine), hash comparison via DB lookup. No constant-time issue at DB level. Cookie: HttpOnly set by middleware? Need to check security.py. expires 30 days. Revocation supported.

Note the `_send_login_code` in LOCAL mode logs the code at WARNING — if someone shares the log, codes leak: dev-only, acceptable.

Now the .env.example shows SCHEDULER_ENABLED=false with comment "disabled unless explicitly enabled". start.bat doesn't enable it. Fine.

Now, one more critical scenario to verify: LLM API key storage. `model_configs.api_key` column still exists in schema. `migrate_legacy_model_api_keys` moves them at startup. But is `api_key` still present in seeded configs? `_seed_models` inserts with `api_key_env='DEEPSEEK_API_KEY'` and no api_key. OK.

Let me quickly check the security middleware + chat router SSE, then report_export (fs risk).

--- finding 16 ---
Good picture of SSE handling across routers. The chat router (line 119-246) has its own pattern; let me quickly check chat.py's disconnect handling to see if it has the same shielded-cleanup discipline. Actually, given the task's focus, I've got enough. Let me quickly glance at chat.py's SSE block (lines 110-250) to verify disconnect cleanup.

--- finding 17 ---
The chat SSE doesn't persist assistant message unless the full flow completes (error mid-stream → user message persisted, assistant reply lost — acceptable; user sees error event). On client disconnect, the generator gets cancelled — LLM work stops? The upstream `chat_with_tools_loop` is a non-streaming HTTP call (single await); when the generator is cancelled, the awaited call gets cancelled (httpx call torn down). That's fine — the message just isn't saved and no "done" event. The user message was already persisted though — if disconnect happens right after user message insert, the conversation contains an unanswered user turn (recoverable — user re-sends). Minor.

OK. Also, one more important thing: `chat_with_tools_loop` records usage per upstream request via record_llm_usage (in chat_with_tools_safe). Fine.

Now let me verify a couple of things related to potential secrets in the DB and repo: check .gitignore for `backend/data` and `.credential-key`; and check whether research report export (pdf/docx) does any subprocess (weasyprint?). Let me grep for pdf/docx libs and check .gitignore.

--- finding 18 ---
Export uses pure-Python reportlab/docx — no subprocess. Good, no fs write (returns bytes). 

.gitignore: `backend/data/` ignored, `*.db`, `*.db-wal`, `*.db-shm`, `*.bak` all ignored. And `.env` + `.env.*` ignored, `.env.example` kept. `.credential-key` — is it ignored? `backend/data/` covers it since it's `backend/data/.credential-key`. Good: keys never committed.

Now let me verify a couple of remaining failure scenarios by spot-checking:
1. `model_router.get_client` — how api key is resolved (env vs credential).
2. `alerts.py` scan loop and scheduler task — got the gist.
3. Check `orchestrator/runtime.py` briefly — DAGRuntime with task groups for the 4-agent parallel: if one node's task group is cancelled etc.

Actually let me read model_router quickly since LLM key failure is a core scenario, and orchestrator/runtime.py.

--- finding 19 ---
I now have a comprehensive picture. Let me collect all findings and write the report. Let me also spot-check two remaining small pieces quickly — `alerts.py` scheduler usage of `scan_enabled_rules` (timeout?) and `report_export` pdf font reliability (STSong-Light might not exist on all Windows → export failure). The pdf uses `UnicodeCIDFont("STSong-Light")` — built-in CID font, works without font file in reportlab. OK.

One more check — memory_capture `persist_research_candidates` and `schedule_research_candidates` (fire-and-forget task?) Let me look at those briefly since background tasks completed after SSE may hold user context... Actually `schedule_research_candidates` is called sync inside the event loop mid-stream (research.py line 276) — let me check whether it's a background task. Let me grep quickly.

--- finding 20 ---
Let me look at memory_capture.py lines 83-115 to see the background task (fire-and-forget that writes to DB — potential issue: task created in the SSE respond context; after SSE ends, the task continues; if it's cancelled at shutdown it might be interrupted — best-effort). Let me read that section.

--- finding 21 ---
Good — background candidate writes are drained at shutdown (flush_memory_candidates before close_db). 

Now I have enough evidence. Let me organize the report. I'll also do a final quick sanity check on the "get_db() assert" and WAL. Loss-of-data scenarios:

**最危险 3 个场景：**

1. **master key 与加密凭据同目录存放**（`backend/data/.credential-key` + `finquant.db`）。
   - 证据: credential_store.py:35-44（key 文件写在 DB_PATH.parent/.credential-key），config.py:28 DB_PATH=backend/data/finquant.db。Windows 下 `os.open(..., 0o600)` 不产生 ACL（Python 的 os.open mode 在 Windows 被忽略）→ 本机其他用户/进程可读 key + DB → 解密 tushare/搜索/模型供应商密钥。这是"密钥泄露"顶层场景。
   - 且 .gitignore 忽略了 backend/data/（含 .bak），不会进 git —— 好。
   - pre-vN .bak 备份同样含加密凭据，若泄露整个 data 目录，备份也没用（同样受 key 保护；但 key 也在同目录）。
   - 受控程度：设计上明知（"Local installs keep the encryption key beside the ignored database"），属于「受控但弱」。生产环境强约束 MASTER_KEY（database 报错+validate_master_key）。风险真实：本机多用户/恶意软件场景下无防护。

2. **调度任务无限重试（无上限/无退避）**。
   - 证据: scheduler.py:384-398 `run_due_research_jobs` 每 30s 轮询；research_jobs.py:131-225 `claim_research_job` 对 status='failed' 的 run 无条件建 attempt+1；recover_stale_research_runs 把 pending_idempotency_key 写回（research_jobs.py:385-390）→ 下次轮询立即再次 claim → 同名 key 再次 attempt+1。没有任何 max_attempts/backoff。持续失败（如无效 API key）→ 每 30s 一次完整 4-agent LLM 研究 → 无限消耗 API 配额 + research_reports/events/llm_usage 膨胀。
   - 另：`run_research` 中对单 Agent LLMError 只降级为“【分析失败】”文本（research_orch.py:223-225），最终 `done` 事件照发 → 报告被标记 completed（scheduler.py:171-183 / research.py:274-283）→ **LLM 故障时产出“completed 但全是失败文本”的报告**。用户感知为成功。P1。
   - LLM 调用本身无重试（llm_client.py:111-125 一次失败直接抛 LLMError）→ 5-10 分钟的研究管线任何单次 LLM 抖动即整轮成败（虽降级文本，但**用户拿不到真报告**）。

3. **数据备份/恢复缺失 + 迁移备份只写不清理**。
   - 证据: database.py:1854-2019 只在版本迁移时做 `.pre-vN.bak`（14 个全库快照累积，永不清理，占用磁盘）；日常无自动备份、无恢复工具、无“升级前手动备份”的文档入口（start.bat 全文无备份；.env.example 无备份项）。WAL 单库单文件复制备份需要服务停止或工具支持—— start.bat 没有“在启动前备份 DB”的步骤，升级/损坏后用户无恢复路径。P1（数据恢复维度）。
   - 另外 `_backup_database_before_*` 用 `sqlite3.connect(backup_path)` 同步 backup API 在初始化时执行——如果 DB 很大，启动会卡；本地个人规模可接受。

**其他逐项：**

A. 网络层（多源熔断）：
- quote: tencent→sina→yahoo + CircuitBreaker（3 次失败→open 30s，half-open 单探针）——受控良好。evidence: market_data.py:400-420, source_health.py:9-48。
- kline: sina→tencent(仅日线)→yahoo；分钟级跳过腾讯（market_data.py:615-620）——好。
- search: eastmoney→yahoo→quote 直查（273-394）。
- 疏忽点：`quotes()` 批量 `return_exceptions=True` 静默丢失败项（433-435）——列表页可用性优先，可接受但错误不可见；snapshot_cache 无大小上限（dict 无限增长，key 是字符串 code）——长期运行内存增长（低）。P3。
- `search()` 里 EastMoney count=100 请求、拼音候选循环最多 6 次+1 次直查——单次搜索最多 ~6 HTTP 调用，无并发限制但可接受。

B. 模型/密钥：
- LLMError 消息对用户可读且不含完整密钥（_response_error body.replace(api_key,'[已隐藏]')，llm_client.py:85-93）——好。
- API key 解析：credential > legacy api_key > env（model_router.py:37-40）——好；每次启动 migrate_legacy_model_api_keys 清明文（main.py:79, credential_store.py:156-176）——但注意这个函数在 **每次请求 verify_login_code / ensure_local_user 也会跑**（auth.py:114, 246）——幂等，无碍。
- **疏忽点**：api_key 从 .env 读取后存内存、明文 HTTP 请求头——localhost 上可被本机进程嗅探（本地模型，受控）。
- LLM 无重试、无超时细分：chat 120s 超时，超时即失败（llm_client.py:35, 117-118）。P1 建议：5xx/429/网络重试 2 次+指数退避。

C. 任务中断/SSE：
- research.py:301-332 断连安全清理（shield + 独立任务 + 失败落库），还修了 A3 P1——受控良好，是全文最好的纵深防御样板。
- chat.py:134-245 —— 断连即取消，无 done/error 事件，assistant 消息不落库，用户消息已落库（可能出现未回答的用户消息）——可接受，P3。
- scheduler 把 CancelledError 转 failed 落库（scheduler.py:227-234）——好。
- 编排器 DAGRuntime finally 取消仍在跑的节点（runtime.py:140-144）——好。
- **疏忽点**：`_call_agent` 工具并发 gather 无上限——同一 agent 轮内如 LLM 一次返回多个工具调用全部并发（research_orch.py:138-141 与 llm_client loop 相同），多为 2-3 个，可接受。

D. 迁移/升级：
- SAVEPOINT + pre 备份 + 失败即启动失败（fail-fast）——受控良好。
- **疏忽点**：schema version 用 PRAGMA user_version + schema_version 表双轨；v24 删除 portfolio_groups/items/trades 不重建恢复路径——依赖 pre-v24 备份（仅一次，且不清理）。升级文档缺失（未见 upgrade 脚本/文档化 restore 流程，未验证——标注）。
- start.bat 不重装依赖：`.venv` 存在就跳过 pip install（start.bat:34）→ 升级新增依赖时旧环境直接 ImportError（启动失败，错误信息不够友好）。P2。

E. 上下文耗尽：
- compact_messages 确定性压缩，原子组+预算预留（context.py:36-75）——受控。
- **疏忽点**：压缩是启发式截断而非语义摘要（情报丢失），且 `_prepare_messages` 在 tools 很大的情况下预留；对超长单条消息 trim 后可能只剩截断标记——但兜底逻辑存在。P3。
- `chat_stream` usage 记录只在流正常结束后（llm_client.py:367）——断流部分 token 不计（账目偏差），P3。

F. 命令执行/文件系统：
- 全库唯一的进程创建点：MCP stdio（mcp_bridge.py:87-92）——command/args/env 完全来自 DB（mcp_server_configs），由本地用户在 MCP 管理页配置；一个恶意的 stdio MCP 配置会以应用本地权限执行任意命令。本地单用户模式（LOCAL_ONLY / 127.0.0.1）下风险=用户自己；但若生产部署走网络 → **任意配置任意命令执行面**。已有限制：connect 10s 超时（mcp_runtime.py:19-22）、tool 名称消毒。P2（公开部署前需权限/白名单控制）。
- 两处 eval（tools_definitions.py:365、financial_rigor.py:332）带 `{"__builtins__": {}}` 且先做字符白名单（tools_definitions.py:360-362）——受限 eval，但仍建议换 ast/Decimal 解析：字符白名单允许 `eE` 等，Python 文法里 `__builtins__` 空仍可 `().__class__` 逃逸？在 eval 的 globals 中 `__builtins__` 为 {} 时，`()` 是空元组字面量，没有 builtins 时 `().__class__.__bases__[0].__subclasses__()` 需要 builtins 里的属性访问——不，属性访问不经过 builtins。实际上 `().__class__` 可行（builtins 禁用只挡名称解析，如 `__import__`、`open`，但 `().__class__.__mro__[1].__subclasses__()` 这类纯属性链仍可能逃逸——但需要最终通过 globals 里的名字或字面量构造）。空元组 `. __class__` 在 eval 里：`().__class__` 是 object→ 属性访问链可拿到 object.__subclasses__，不需要 builtins。所以这个“防护”其实是可以被绕过的（无 builtins 仍可属性链逃逸）。但注意字符白名单已把 `._` 排除在 allowed 之外（allowed=数字、+-*/() 空格 eE）！没有 `.` 和 `_` → `().__class__` 无法拼出。所以白名单是第一道闸，eval env 是第二道。表达式不可能含 `.` `_` 或字母除 eE。因此逃逸机率低。仍建议换 ast.parse + 手写求值 以彻底消除 eval——P3。
- 文件系统：export 纯内存（reportlab/docx bytes），无临时文件写入；无 os.remove/unlink 使用；删除铁律由流程保证。数据库写路径 WAL 单连接。
- **疏忽点**：frontend_fallback 路径穿越防护 OK（main.py:163-165），但 SPA 路由把所有非 api 路径回退 index.html——若 dist 不存在只 warning 不退出（SERVE_FRONTEND=1 时 backend 照样启动，页面 404）——P3。

G. 定时任务与事务：
- exclusive_transaction + _TRANSACTION_DEPTH 防止长事务部分提交（database.py:2275-2300）——好。
- scheduler 写锁（_run_tx_lock）串行化短写段——好。
- **疏忽点**：scheduler_loop 是单任务；run_due_research_jobs 里 asyncio.gather 并发多个 run_research_job（并发上限 = due 任务数,无限制,但 claim 串行）——20 个 job 并发 4-agent 研究 → LLM 并发突发；SCHEDULER_CONCURRENCY 只用于 post-market 路径的 semaphore，**cron job 路径没有并发限制**（scheduler.py:389-397 gather 全部 due jobs；run_research_job 无 semaphore）→ 若多个 job 同时到期（cron 相同整点），并发生成 20×4=80 个工具循环，API 风暴 + 单连接 DB 写等待。P1/P2。且 due_research_jobs LIMIT 20。
- **另有**：finish_research_run 成功后 job.last_status='completed'（research_jobs.py:296-304）——下次 next_run_at 到期仍会跑（next_run_at 在 claim 时已推进）。OK。

H. 模型调用失败已谈。API Key 错误：401 场景消息明确（llm_client.py:86-93）——受控。

I. 数据恢复：
- evidence export（research.py:196-199）、memory export（research.py:104-112）——部分数据可导出；**无全库备份/恢复入口**。P1。

J. 启动/升级：
- start.bat 的端口检查、venv 创建、前端重建逻辑完整；**但**：upgrade 无 pip re-install、无备份、解锁逻辑；`bun` 硬编码个人机路径 D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe（发行给他人会失效）——以 `where bun` 优先，OK 但仍建议提示。P3。
- **疏忽点**：重复启动（start.bat 两次）→ 第二个进程 8000 占用检测拦截，好。但 `uvicorn --reload` 开发模式（CLAUDE.md 常用）会 spawn reloader+worker——LOCAL_ONLY ensure_local_user 幂等，无碍。

**已做得好的纵深防御（必须表扬的）：**
1. SSE 断连清理 shield 模式 + 失败落库（research.py:301-332）——行业级样板。
2. 迁移原子性：SAVEPOINT + 失败 fail-fast + pre-N 备份（database.py:373-716）。
3. 定时任务租约：claim/lease/heartbeat/recover 幂等闭环（research_jobs.py:131-397），防重复执行。
4. 凭据加密：Fernet + 元数据只见（credential_store.py），错误消息屏蔽 key。
5. 报告先行落库（research.py:249-251）——中断也留痕，Astra 历史修复。
6. 安全头、CSRF（同源校验）、敏感接口限流（security.py:27-38, 161-176, 111-119）。
7. 数据库 owner-scoped 强制触发器（database.py:2220-2233）——数据隔离纵深。
8. LLM usage 写失败不影响主流程（llm_usage.py:72-83）、flush at shutdown。
9. 工具执行异常不中断 agent 循环（research_orch.py:63-87）。
10. eval 双闸（字符白名单+空 builtins）。

**建议优先修的顺序：**
P0:
1. （建议 P0-P1）调度任务无限重试 → 加 max_attempts/backoff/exponential，失败后挂起并在 UI 提示；同一 job 至少 5 次后进入 backoff 或 disabled。
2. 报告“completed 但全失败文本”→ research_orch/SSE 层：任一 agent 全失败 or lead 失败时标记 PARTIAL/FAILED，并让 done 事件携带 quality 元数据；用户界面可提示。
3. （P0-P1）数据备份/恢复：start.bat 启动前自动备份到 backend/data/backups/finquant-YYYYMMDD.db（或文档化 restore 步骤）；清理过期 pre-N .bak；提供 /api/backup 或 docs 恢复指引。
4. （P1）master key: Windows 上收紧 .credential-key ACL（icacls 仅当前用户），或改用 DPAPI；文档明示威胁模型。
P1:
5. cron 并发无上限 → 加 semaphore（复用 SCHEDULER_CONCURRENCY）。
6. LLM 调用重试（5xx/429/网络，2 次指数退避）。
7. start.bat 升级时重装依赖（requirements 变更检测或强制 pip install -r），失败给出明确提示。
P2:
8. MCP stdio 命令执行面：生产部署需白名单/确认或管理员审批；至少提示“命令会以本机权限执行”。
9. snapshot_cache 无界 → LRU/上限。
10. 迁移 .bak 清理策略 + 文档化恢复流程。
P3:
11. eval 换 ast（可选）。
12. chat SSE 断连后保留未回复用户消息的重试提示。
13. 搜索失败静默问题（quotes() 批量）可加日志。

还有一点：`run_post_market_analysis` 的 `_load_daily_targets` 从 research_reports DISTINCT ticker 来，无上限但 SCHEDULER_MAX_TARGETS=20。

关于“降级/熔断”已受控：market_data 多源+断路器已经很好。

现在关于 P0 场景的精选：用户数据丢失（无备份）、配置损坏（.env 复制单点，scheduler off by default——不算损坏）、密钥泄露（key 同目录）。让我确定三个最危险场景：
1. 无备份/恢复路径 + 迁移后无人工确认 → 用户数据（组合/研报/论题/记忆）在磁盘故障/误操作/升级失败后不可恢复（.bak 只在迁移时且不清理覆盖）——数据丢失。
2. 调度任务失败无限重试 + 失败报告标记 completed——资源与数据质量损坏（也算“配置损坏/任务中断”的放大）。
3. .credential-key 与 DB 同目录明文 —— 本机第二用户/恶意进程可解密所有第三方 token——密钥泄露。

好，写入报告。报告文件路径 docs/ai/evo/RELIABILITY_REPORT.md。

关于发送给父 agent：任务书要求 finish 前 send_message 到 session-3d7ed6b1-e748-4013-b264-da68ccbe2213，self-contained 结果。还要在回复里一句话摘要。

先写报告文件。结构按任务书。用中文。所有“写不出证据”的标注未验证。要引用行号证据。

让我组织报告内容，条目尽量精简但带证据行号。写文件。证据收集完毕。现在撰写审计报告。
