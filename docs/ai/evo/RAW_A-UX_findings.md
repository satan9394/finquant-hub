# RAW A-UX audit findings (extracted from subagent transcript)


--- finding 1 ---
Let me start by understanding my task. I'm SUBAGENT A — PRODUCT_UX_AUDITOR. I need to:
1. Read `docs/ai/evo/PROJECT_BRIEF.md` (read-only)
2. Check `README.md`, `docs/QUICKSTART.md` (if exists), `frontend/src/pages/`, `frontend/src/i18n/zh.ts`, `backend/app/main.py`, `start.bat`
3. Write a report to `docs/ai/evo/PRODUCT_UX_REPORT.md`
4. Send result to parent agent `session-3d7ed6b1-e748-4013-b264-da68ccbe2213`

Let me start by reading the key files. I'll do parallel reads where possible.

--- finding 2 ---
Let me now read the key context files in parallel: README.md, docs/QUICKSTART.md (check if exists), backend/app/main.py, start.bat, and check for i18n files.

--- finding 3 ---
Let me now read the QUICKSTART.md, i18n zh.ts, and backend/app/main.py. Also check the frontend pages structure and app entry. Let me read QUICKSTART and main.py first.

--- finding 4 ---
Now let me look at the frontend structure: the app entry, routing, i18n zh.ts, and key pages. Let me look at the frontend src structure first.

--- finding 5 ---
Now let me look at the App.tsx for routing and the i18n/index.ts + LanguageContext for language default, and Dashboard.tsx (the landing page). Also check the auth flow (Login.tsx) and the api.ts.

Let me read several key files in parallel.



--- finding 6 ---
Now let me look at the Dashboard (first page user sees), Login page, and check for onboarding/empty states. Let me read Dashboard.tsx and Login.tsx.

--- finding 7 ---
Interesting: In LOCAL_ONLY mode, the login page is skipped (auto local owner). Let me check the auth flow: authStore and auth router to see how local mode bypasses login. Also check the api.ts for base URL config.

Let me also read the zh.ts i18n to look at copy for onboarding, empty states. And check the Settings page, Models page for default config. Also check config.py for defaults (DEEPSEEK_API_KEY default etc.).

--- finding 8 ---
Let me now look at the zh.ts i18n to find key user-facing copy (onboarding, settings text, empty states, disclaimer), and check config.py for defaults. The zh.ts file has 2453 keys — I should grep for key sections rather than read the whole file. Let me grep for onboarding-related keys and check pages Settings.tsx, Models.tsx, ResearchWorkspace.tsx briefly.

Actually, given time constraints, let me be strategic. The core question: "Can a complete stranger complete first successful use on their own?"

Key evidence to gather:
1. First install experience — start.bat, QUICKSTART: seems decent. Issues: start.bat falls back to a hardcoded path `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe` — a maintainer-specific machine path that won't exist on other computers (QUICKSTART acknowledges this). Bun requirement is heavy for non-technical users — need to install Bun AND Python with PATH flags. Also start.bat checks Python 3.12 only via `where py` or `python` version check.

2. Understanding of status: LocalCapabilityBanner shows UNCONFIGURED etc.

3. Login: in local mode there's auto local user, no login. Good.

4. Let me check Settings.tsx and Models.tsx for empty states and guidance.

5. Check ResearchWorkspace.tsx entry — the main user journey.

6. Check errors: main.py generic 500 "服务内部错误，请稍后重试".

7. Check the frontend dist exists? For the user journey when downloading from GitHub, start.bat will build. OK.

8. Check favicon, title.

9. Check that there's a first-run onboarding tour? Let me grep for "tour"/"引导"/"onboard" in frontend/src.

10. Check config.py defaults — DEEPSEEK_API_KEY default, HOST, PORT, SERVE_FRONTEND default.

Let me grep for onboarding and check zh.ts keys.

--- finding 9 ---
Interesting — no onboarding tour exists (only a grep for "tour|onboard|引导|上手|欢迎|first run|wizard" found one comment in Dashboard.tsx). So there's no walkthrough. The Dashboard has a "task-launchpad" with 3 core tasks and a progress indicator — that's a light onboarding.

`DEFAULT_MODEL = "deepseek-v4-flash"` — wait, that's odd. The config default model is "deepseek-v4-flash"? That's the model name of this harness. Hmm — that's likely a dev leftover. Actually wait, this is important — a hardcoded default model "deepseek-v4-flash" as the API model default. DeepSeek's real API models are "deepseek-chat" and "deepseek-reasoner". If DEFAULT_MODEL defaults to "deepseek-v4-flash" but the actual DeepSeek API doesn't have that model name, then when a user just fills DEEPSEEK_API_KEY and doesn't set DEFAULT_MODEL, AI calls will fail with model not found error! Let me verify by checking .env.example and the models default.

Let me check backend/.env.example and the models_crud router and where DEFAULT_MODEL is used. Also, README says 需要填写 DEEPSEEK_API_KEY（以及需要时的 DEEPSEEK_BASE_URL、DEFAULT_MODEL）. QUICKSTART says 使用其他兼容模型服务时，还需按供应商信息填写 DEEPSEEK_BASE_URL 和 DEFAULT_MODEL.

But the default model "deepseek-v4-flash" — let me check what model presets exist in frontend modelPresets.ts. The actual DeepSeek API model IDs are deepseek-chat (V3) and deepseek-reasoner (R1). "deepseek-v4-flash" is not a public API model name (as of my knowledge). This could be a critical issue for first AI use — user fills key, chat fails with "model not found". Let me check.

--- finding 10 ---
Very important finding: the default model is `deepseek-v4-flash` (and `deepseek-v4-pro`) in database seed and config default. Let me verify whether DeepSeek's official API has models named "deepseek-v4-flash" / "deepseek-v4-pro". From my knowledge, DeepSeek API offers `deepseek-chat` (V3.x) and `deepseek-reasoner` (R1). "deepseek-v4-flash"/"deepseek-v4-pro" are NOT official API model names — DeepSeek V4 doesn't exist publicly as of my knowledge. Wait — but this project is dated 2026. Maybe DeepSeek V4 exists by then. However, "deepseek-v4-flash" looks like the model name of this harness (deepseek-v4-flash is this agent's own model). This strongly suggests the developer seeded their own private model naming. For the actual DeepSeek API (which the project targets — DEEPSEEK_BASE_URL default is api.deepseek.com), the model "deepseek-v4-flash" would return a "model not found" error.

This is potentially a P0/P1 issue: a user fills in DEEPSEEK_API_KEY per instructions but chat/research fails because the default model doesn't exist on the official API. Let me verify what models the official DeepSeek API currently lists, and check the Models page default selection/UI. But I must be careful about "未验证" — I can't verify the official API from here easily. I could do a web search to check DeepSeek API model names. Let me do a quick web search.

Also I should check how the seed models are created and whether the Models page allows editing model name. Let me check the Models.tsx page and models_crud router quickly. And check what happens when a model is invalid — the LLM client error handling.

Also, let me check the llm_client to see default model selection logic.

--- finding 11 ---
The web search failed due to proxy/key issues. I'll mark the model-name concern as "未验证" (cannot verify from here) but flag it as a risk based on evidence: config.py:24 and database.py seeds use `deepseek-v4-flash`/`deepseek-v4-pro` as default model names against `https://api.deepseek.com`, while the official DeepSeek API (as of my knowledge) exposes `deepseek-chat`/`deepseek-reasoner`. I should present this carefully — it's evidence-backed that the default is a non-standard name, but whether the official API rejects it is unverified. Actually let me try one more search query with different phrasing. Or use web_fetch to api-docs.deepseek.com. Let me not burn too much time. Let me try a quick web_fetch of the DeepSeek docs page listing models.

Actually the instructions say web_search failed with an auth error — the endpoint config issue. Let me instead try web_fetch directly to the DeepSeek API docs: https://api-docs.deepseek.com/quick_start/pricing or similar. Let me try.



--- finding 12 ---
Important! The DeepSeek docs (fetched 2026-09) confirm: Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are STILL ACCEPTED (served by DeepSeek-V4.1-Flash). And `deepseek-v4-pro` will be retired from 2026-09-14, requests routed to V4.1 Flash.

So the default model `deepseek-v4-flash` still works on the official API but is a retired/legacy name. And `deepseek-v4-pro` (seeded as a second model in database.py) is scheduled for retirement — after 2026-09-14 requests are routed to Flash anyway. So it still works, but the warning is that the legacy names are accepted now but will eventually break. This is a P2/P3 finding: default model names are legacy/retired aliases; the docs recommend `deepseek-flash`. Since the doc says legacy names are still accepted, this is not a P0/P1 blocker, but a maturity issue: seeded "DeepSeek Flash"/"DeepSeek Pro" models use legacy names and there are TWO seeded models pointing at the same base URL, which might confuse.

Wait — but the docs say "the corresponding models have been retired, their requests are served by the DeepSeek-V4.1-Flash model". So "deepseek-v4-flash" still works. Good — so not a blocker, but a P2 finding (should migrate to `deepseek-flash`; and `deepseek-v4-pro` retirement means the "DeepSeek Pro" seed will silently become Flash — pricing/behavior mismatch).

Now let me continue gathering evidence efficiently. Key remaining questions:

1. ResearchWorkspace.tsx — first user journey for research. Check empty state, onboarding hints.
2. Settings.tsx and Models.tsx — default config & guidance for AI key.
3. zh.ts — copy quality (I'll grep key sections).
4. The plan is to focus on user journey, not deep dive.

Let me also check the pages that the QUICKSTART recommends: ResearchWorkspace (研究工作区), LimitPool (涨跌停池), Portfolio (组合与风险).

Let me read ResearchWorkspace.tsx (probably long, let me read the first ~150 lines), and check for empty states / guidance.



--- finding 13 ---
Good. Now let me look at some key pages: Settings.tsx, Models.tsx (from user journey). Let me also look at the Discover page and LimitPool for feature discovery. But first, let me be efficient and check Settings/Models.

Also I need to check the stock search UX in the research workspace (how a user searches) and what happens with no AI key — the Chat empty state. Let me read Settings.tsx and Models.tsx quickly (first 150 lines each).



--- finding 14 ---
I have a good picture of the product now. The Settings page has 10 tabs — quite heavy for a non-technical user. The Models page is complex with provider cards, presets, discover etc.

Let me now verify a few user journey details:

1. What does the research page show when a user searches without AI key? Let me look at the search flow in ResearchWorkspace (lines 200-350).

2. What does Chat empty state show? chat.empty = '暂无会话'.

3. Does the system show errors well? main.py: `unhandled_exception_handler` generic 500 "服务内部错误，请稍后重试" — no correlation ID for the user to reference. Logs include exception type but user can't see logs easily. For a non-technical user, error recovery is via QUICKSTART FAQ. Hmm — this is evidence-based: main.py:110-122.

4. Check whether first-run "研究" requires AI key and whether the error is clear when no key. Let me check llm_client / research or chat empty states. Let me grep for "未配置" in backend and check chat/router error handling for missing API key.

5. Startup: start.bat opens browser immediately after `start "" http://127.0.0.1:8000` BEFORE uvicorn starts (line 94 starts browser, line 96 starts uvicorn). The QUICKSTART acknowledges "浏览器可能比服务更早打开" and tells the user to refresh. For a first run, build can take minutes — but wait: the browser opens at :launch, which happens after build completes. Actually the `start ""` happens after `:environment` — build happened before. So at that point, uvicorn hasn't started yet but the browser opens — a race. First-time user sees "无法连接" — the FAQ covers this ("页面打不开" FAQ). But QUICKSTART says "看到错误时窗口会保留原因和处理步骤" — ok.

Also important: on first run, if the user hasn't installed Python/Bun, start.bat shows an error and opens... wait, on bun missing it shows error and pause. That's fine.

Another potential issue: `start.bat` line 15 hardcodes `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe` — a machine-specific path that only exists on the maintainer's machine. On other machines it just falls back to the error message. Minor issue — README covers it. Actually wait, this fallback path is harmless elsewhere (only if PATH doesn't have bun). But QUICKSTART installs Bun via irm bun.sh — that installs to the user profile, so it's in PATH. OK, minor.

6. First-run AI config: user must edit `.env` with 记事本 — non-technical users editing hidden files (.env has no extension; 记事本 may save as .env.txt — QUICKSTART warns about this). This is acknowledged in QUICKSTART. It's a documented P1-ish friction: real onboarding required editing files by hand. There IS an alternative: the Models page lets you save encrypted credentials — but QUICKSTART line 70 says "若在网页中保存加密凭据，未配置持久 MASTER_KEY 时，重启后可能需要重新填写". So the in-app route exists but has a caveat. Does the Models page accept the DeepSeek API key for use? Let me check how the credential store works — migrate_legacy_model_api_keys suggests legacy keys in env are migrated into the DB. Let me check the models_crud router for whether api_key from env is read (api_key_env option exists). The Models page has "api_key_env" placeholder "如 OPENAI_API_KEY；未保存密钥时从环境变量读取" — so you can reference an env var. But DEEPSEEK_API_KEY env var — can you reference it? The placeholder says "如 OPENAI_API_KEY". So probably any env var name works. So the user CAN configure AI from the UI (Models page) — but README/QUICKSTART's primary instruction is editing .env. This dual path can confuse.

Let me check the char flow when no model configured: what happens when user tries chat without any key? Let me check llm_client / chat router.

7. Default landing: Dashboard shows LocalCapabilityBanner — good. Shows capability warnings. Good.

8. Language: default zh — good for target user. en.ts exists with parity. UI is all Chinese via i18n but some strings are hardcoded English: Settings.tsx line 595: `title: 'System Prompt'` and line 708 `label="System Prompt"` — hardcoded English in Chinese UI! Also `role_key` placeholder "value_investor" is fine. Also login placeholder "you@example.com" — acceptable. Let me grep for other hardcoded English strings in pages.

9. Empty states: mostly present with Chinese empty text. Good.

10. Navigating: getMenuKey maps /research, /analysis, /chat, /discussion, /thesis, /compare all to '/research' menu item. The menu has "研究" group with only "研究首页" (ResearchWorkspace). The 4 agent modes (fast/deep/review/analyst/thesis) are modes within /research. But wait — chat is a "single agent chat" — LegacyResearchRedirect mode="fast". So chat is inside research with mode=fast. OK.

11. Feature discovery: the nav has groups: 今日, 研究, 发现, 策略, 组合, 监控, 知识库, 设置. Alpha 研究 is a mode of Discover (`/alpha` redirects to /discover?mode=alpha). Screening too. But do 发现 page tabs expose alpha? Let me check Discover page briefly.

12. First-run onboarding: no tour/wizard. Dashboard hero + task launchpad (3 tasks with progress 首次任务进度) + capability banner — a lightweight onboarding exists. This is decent. But, no video/图文 guide inside the app; QUICKSTART is the onboarding — external doc. Acceptable, P2/P3 suggestions.

13. Recovery: QUICKSTART FAQ covers many errors. But within the app, is there a help link? Let me check if there's any help/关于. The system status indicator navigates to /settings. Is there a link to QUICKSTART in-app? Let me grep for QUICKSTART / docs link in frontend.

14. Upgrade: QUICKSTART has an update section (re-download ZIP, copy data). In-app version display: /api/health returns version; the SystemStatusIndicator shows status. Is there a version display in UI? Let me grep.

Let me check a few of these: hardcoded English in pages, help links, version display.

--- finding 15 ---
Good evidence:
- SystemSettingsPanel shows version "FinQuant Hub {version}" — in-app version exists (settings tab). OK.
- No in-app link to QUICKSTART/help found in the frontend (grep found no QUICKSTART/docs links in components). So help is only external docs. Actually let me check the en.ts / zh.ts for settings.system about version — there is `SystemSettingsPanel` which shows version.

Now let me look at the Discover page quickly (feature discovery entry for Alpha/screening), the Chat page (empty state), and check what happens with no AI key (chat error handling). Let me also verify the chat requires AI key — check the chat router or research empty states.

Let me look at the research workspace search UX (lines 200-400) and check for what happens when user searches without model configured (search is local data, doesn't need AI).

Let me read pages/Research.tsx (the deep research writer) briefly for empty state and error handling with no key. Actually, given time, the more valuable checks:

1. What happens when AI key missing — does chat show a clear message? Check llm_client or chat router. Let me grep backend for "未配置" / "UNCONFIGURED" errors.
2. Discover page: alpha entry visibility.
3. Check ResearchWorkspace search input section quickly (user journey for first research).

--- finding 16 ---
Good — `model_router.py` raises clear messages like "尚未配置任何模型，请先在模型管理页添加" — good error UX. Also "模型「X」未配置 API Key，请在模型管理页粘贴供应商密钥并保存。"

So when no key: the failure message guides user. Good.

Now let me check how LLMError messages surface to the UI (they pass through api.ts detail). OK.

Let me check the Discover page (feature discovery for alpha/screening) and the Chat page empty/input state quickly. Also check where "研究" shows for the first time without symbols — home history empty states exist.

Actually, I should now focus on checking a few remaining key things:

1. What the "analyst" default research mode shows — the ResearchWorkspace with no symbol: search + saved workspaces + history. Good enough.

2. First-run experience: Dashboard loads `/dashboard/stats` — it needs auth. In local mode auth is auto. On a brand-new user with LOCAL_ONLY, is there an issue? auth.authenticated_context dependency — check that it works without login in local mode. ensure_local_user creates the user. Should be fine.

3. The Discover page — how are Alpha/screening exposed? Let me check the Discover.tsx modes.

4. Check empty state of the app on first ever visit: Dashboard "决策收件箱" empty → "今天没有需要复核的对象变化" — fine.

5. Serious check: `axios` timeout 30s for market APIs. Fine.

6. `start.bat` — browser opens before server ready → first-time confusion. Evidence: start.bat:94-96. Also 8000 in use → error message with netstat instructions (technical). OK.

7. The most critical first-use journey: user double-clicks start.bat → needs Python 3.12 + Bun preinstalled. QUICKSTART step: install Python via specific URL (3.12.10 — outdated patch per own doc note) and Bun via `powershell -c "irm bun.sh/install.ps1|iex"`. That's "三者缺一不可" heavy for non-technical users. But the project explicitly targets Docker as the zero-dep path (macOS/Linux) and start.bat for Windows. This is inherent; still the note "该页面提供 3.12.10 传统安装器，并非最新的 3.12 安全版本" — nit.

8. Numeric issue: bun fallback path `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe` — machine-specific. Note that README says "脚本先找 PATH，再尝试维护者电脑的备用路径；其他电脑不需要创建这个备用目录" — documented. Not an issue.

9. What about the case where the user's Windows lacks `py` and has Python 3.13? start.bat:43-46: `python -c "... version_info[:2] == (3, 12)"` — if the user installed Python 3.13 (recent default download), start.bat fails with "Python 环境准备失败" and shows manual steps. QUICKSTART explicitly says install 3.12 and check "Add python.exe to PATH". So a user following the current Python downloads page would get 3.13.x and fail. This is a real first-use blocker risk (P1): the default download on python.org is now 3.13/3.14, not 3.12. QUICKSTART links the 3.12.10 archive page directly, which mitigates. Still a P1/P2.

10. The 8000 port conflict: cooldown when another FinQuant is running; FAQ covers. OK.

11. Frontend build requires network for bun install. OK.

12. First-start shows no explicit "正在安装，可能需要几分钟" before... Actually start.bat line 35 says "正在创建 Python 3.12 环境，首次安装可能需要几分钟" and line 67 "正在安装锁文件中的前端依赖，首次安装需要网络" and line 72 "正在构建前端". Good reassuring messages.

Now, i18n: All UI in Chinese by default. en.ts parity 0. Good.

13. Hardcoded English in UI: Settings.tsx "System Prompt" label at line 595 and 708 (role editor). Let me confirm: line 595 `title: 'System Prompt'` and line 708 `label="System Prompt"`. Yes — hardcoded English string visible in Chinese UI. That's a real i18n leak (P2).

14. Login page: in local mode, login page never shows (auto authenticate). But wait — what happens in LOCAL_ONLY? auth.authenticated_context — let me check security middleware + auth router behavior. Actually in local mode `ensure_local_user` and authenticated_context returns local user. The `/login` route is reachable if user manually navigates, but isAuthenticated redirects to '/'. OK.

15. Error feedback: main.py:122 generic "服务内部错误，请稍后重试" with no correlation id — P2 (hard to report/debug for users and maintainer). Evidence main.py:110-122.

16. api.ts:30s timeout; error message from response detail. Fine.

17. Recovery: after start.bat stops (Ctrl+C), data persists. QUICKSTART covers. Upgrade path documented in QUICKSTART (re-download + copy data). Good.

18. The SystemStatusIndicator + CapabilityBanner make status transparent. Good.

19. What about the "研究 → 研究工作区" recommended flow — the QUICKSTART says click 研究 → 研究工作区. But the nav group "研究" has only one child "研究首页"? Wait — navigationGroupDefinitions: 研究 group has children [{ key: '/research', nameKey: 'nav.research.home' }] — "研究首页". QUICKSTART says "点击左侧 研究 → 研究工作区" — but the menu label is "研究首页"?? Let me check zh.ts nav keys. Let me grep nav.research.

Let me also check the Discover page modes, nav labels in zh.ts, and the Chat page.

--- finding 17 ---
Good. Discover is well-designed: shows examples, failure handling, factor search. Note that discover includes alpha: `/alpha` redirects to `/discover?mode=alpha`, and mode=alpha renders AlphaResearchPanel. But the discovery of alpha: is there a visible entry? The nav "发现" group has only 机会发现 and 涨跌停池. Alpha 研究 is reachable via /alpha redirect (not in menu) — wait, actually let me check if AlphaResearchPanel is accessible from the Discover page UI somehow. There's no /alpha menu item. App.tsx has route `/alpha` → Navigate to /discover?mode=alpha. But no nav entry and no visible link on Discover page? Let me grep for alpha in Discover components or elsewhere. AlphaResearchPanel renders only when mode=alpha via URL. Is there any UI link to enter alpha mode? Let me grep quickly.

Also note: nav.research.home = '研究工作区' — good, matches QUICKSTART instruction ("研究 → 研究工作区").

Also on first-run, this product's core value for a non-technical user: 查行情/看指标/组合 — all non-AI, working without key. QUICKSTART is well-structured. Good.

Now let me check how a first-time user would find Alpha research and check for entry points. Also let me spot-check the Chat page (empty state / input) re: AI key missing, and how errors surface in SSE streaming.

Let me also decide on the P0/P1 assessment. The critical first-success journey:
1. Download ZIP → unzip ✓ (README/QUICKSTART clear)
2. Install Python 3.12 + Bun ✓ (documented; Python 3.12.x archive pin — risk 3.13 default download)
3. Double-click start.bat → builds → opens http://127.0.0.1:8000 ✓
4. First page: Dashboard with capability banner ✓
5. Search 600519 → see quotes/chart ✓ (no AI required)

Potential P0/P1s to verify:
- If Python 3.13+ is installed (the modern default), start.bat venv_failed path — does the error message help? It says install Python 3.12 and勾选 Add python.exe to PATH. OK, but on a normal user's machine, the recommended "Install Now" python.org gives 3.13/3.14 → start.bat refuses. QUICKSTART mitigates by pinning 3.12.10 URL. P1 (very likely first-attempt failure path with a recoverable message; QUICKSTART pins the right link, so maybe P2). Hmm. It's documented and directed to the exact 3.12 page. I'd rate P2 (friction handled by docs) — but wait, the QUICKSTART says "Python 3.12 与 Bun。Windows 双击路径不需要 Docker" — clear. And then步骤1 links 3.12.10. So the risk is mitigated in docs. P2.

- default model names: `deepseek-v4-flash` legacy name still accepted per official docs (I fetched 2026-09). So not a blocker; but the seeded "DeepSeek Pro" model `deepseek-v4-pro` — official docs say from 2026-09-14 it's routed to V4.1 Flash anyway. So both work. P3 (legacy naming, future retirement).

- REALLY important: does the first AI use actually work when user follows QUICKSTART "首次配置 AI"? Path: stop service, edit backend/.env DEEPSEEK_API_KEY, restart. Config.load happens at import; the models are seeded in database.py init (during startup, called from main lifespan → database.init_db). migrate_legacy_model_api_keys() (main.py:79) migrates DEEPSEEK_API_KEY env into the model credentials. So filling .env works. Credential reading: model_router reads credentials from DB with fallback to env? Let me check credential store to be sure the DEEPSEEK_API_KEY from .env is used. migrate_legacy_model_api_keys presumably writes it to the credentials table. OK.

Let me now check the alpha entry point, the Chat page empty state, and check AgentModeSelector labels (fast/deep/analyst/review — how do non-technical users understand these modes?). Also the ResearchWorkspace mode tabs.

Also there's an important UX question: agent modes "快速问答(fast)/深度研究(deep)/讨论(review)/分析师(analyst)" — where is the switcher visible? AgentModeSelector component. Let me check its labels quickly.

--- finding 18 ---
Confirmed: Alpha research has NO visible entry point in the UI. It's only reachable via the URL `/alpha` (or `/discover?mode=alpha`), which is a hidden route (documented only in routes; no nav item, no Discover page link). This is a genuine feature-discovery problem (P2): a mature, complex feature (Alpha 因子研究) is invisible to users. Wait — the navigationGroupDefinitions don't include alpha. Let me double check the nav has "发现" group with only 机会发现 + 涨跌停池, plus maybe there's an 'alpha' route in the old menu? Let me check the zh.ts nav keys again — only nav.discover.home, nav.discover.limitPool. Confirmed: no menu item for Alpha. And the README feature table mentions "Alpha 研究" as a feature. So users can't find it in the menu. P2 (feature discovery).

Similarly the 6 agent modes: fast/analyst/deep/review — visible only via Segmented on research pages; mode=thesis is hidden? `/thesis` redirects to /research?mode=thesis, and ThesisModeSurface is used when mode=thesis. Is thesis selectable in the Segmented? No — Segmented options are only fast/analyst/deep/review. So 投资论文 (Thesis) is another hidden feature. Let me verify how users reach thesis — maybe from the research workspace or dashboard? Let me grep for 'mode=thesis' or thesis references in the UI.

--- finding 19 ---
Thesis is reachable from: Portfolio buttons (portfolio.thesisAction), StockAnalysis, Research continue (Research.tsx). And GlobalTaskEntry (command bar, ⌘K) has thesis action. So it's not fully hidden, but there's no nav entry and no segmented option. Entry from within research flow. OK — P3.

Now let me quickly check the Chat page (fast mode) — empty state and error handling with no key. And check the sse.ts handling. Actually I think I have enough for the chat. Let me quickly check key empty/error handling in Chat by looking at the page briefly.

Actually, priorities: I've gathered a lot. Let me now also verify:
1. The StockAnalysis page (analysis/:ticker) is a legacy route that still exists and is used by Discover results ("点击股票代码可进入该标的的研究页"). Fine.
2. Check the frontend main.tsx for index.html basics (title/favicon) — favicon.svg exists? Let me check quickly.
3. Check index.html title.

Then I should confirm there are no onboarding helpers like a first-run modal. Dashboard has task launchpad (首次任务进度). That's the onboarding. OK.

Also — very important for "首次成功使用" — check what the app shows on very first load when DB is empty and market data is unavailable on a fresh machine (no network?). The capability banner covers it.

One more check: the Dashboard "task-launchpad" progress — does it persist in localStorage? productProgress.ts. Whatever.

Let me quickly check index.html and verify favicon.svg exists, then look at Chat.tsx empty input and Research.tsx quickly (first ~100 lines) to confirm entry UX.

--- finding 20 ---
收到指挥校正。我已有足够的证据写出报告。让我快速检查几个已有证据的关键行号，然后写报告。

关键证据汇总：

**首次安装/启动：**
- start.bat:15 硬编码维护者机器路径 `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe`（README 已说明，P4）
- start.bat:43-46 只接受 Python 3.12 精确版本；用户装 3.13/3.14（python.org 当前默认）会走 venv_failed，报错信息给手动命令（start.bat:105-112）。QUICKSTART:15 用链接固定 3.12.10 缓解，但 3.12.10 并非最新安全版（QUICKSTART 自己注明了）。P2
- start.bat:94-96 浏览器在 uvicorn 启动前打开 → 首次看到"无法连接"；QUICKSTART:40 有说明要刷新。P3（文档已覆盖）
- start.bat:22 8000 端口占用 → 提示 netstat 命令（技术性），QUICKSTART FAQ 有（92-101 行）。P3
- start.bat 需要先手动装 Python 3.12 + Bun 两个工具，QUICKSTART 有步骤。对非技术用户门槛高，但项目定位如此。P4 建议（提供便携包/单文件打包可消除，但属于重大工程）

**首次启动后：**
- 无任何首次运行引导/向导（grep tour|onboard|引导|欢迎|wizard 仅 1 处注释 Dashboard.tsx:84）。有的只是 Dashboard 的 task-launchpad（首次任务进度 0/3）和 LocalCapabilityBanner（Dashboard.tsx:85, 37-38）。学习成本由外部 QUICKSTART 承担 → 缺站内引导。P2
- Dashboard hero: "上次打开后，发生了什么值得注意？"（zh.ts:1074）——对全新用户（本地无数据）理解成本高，但下面有任务启动台。P3
- 首屏能力横幅：模型未配置 warning + 行情待检查 warning（Dashboard.tsx:37-38, 85）——好设计，保留。

**Onboarding / 学习成本：**
- 站内没有任何指向 QUICKSTART/文档的链接（grep frontend/src 无 QUICKSTART/docs/帮助链接；只有 Models.tsx:339-340 供应商文档外链）。用户遇到问题只能靠启动窗口或重读 README。P2
- "设置"页 10 个 tab（Settings.tsx:606-675），含 product-metrics（产品埋点自定义指标面板）、scheduled-research 等拟开发者功能——对非技术用户是噪音。P2
- 设置页有 "System Prompt" 硬编码英文（Settings.tsx:595, 708），还有 placeholder "value_investor"（696）、"you@example.com"（Login.tsx:97）——中文 UI 中的英文泄漏。P2

**语言/主题：**
- 默认中文 zh（i18n/index.ts:9-13 detectLanguage 默认 zh）✓
- 主题默认浅色，有切换按钮（App.tsx:413, 257-263）✓
- i18n 2453 key parity 0（PROJECT_BRIEF:25）✓

**导航/功能发现：**
- 导航 8 组（App.tsx:60-120）：今日/研究/发现/策略/组合/监控/资料库/设置 ✓
- Alpha 因子研究无任何导航入口——仅 /alpha 隐式路由（App.tsx:341 → /discover?mode=alpha），菜单里没有、Discover 页没有链接。README:82 宣称是功能，但用户无法发现。P2
- 投资论文（thesis）无导航/分段选项，仅从 Portfolio/StockAnalysis/命令栏等侧路进入（Portfolio.tsx:477, PortfolioOverview.tsx:68, StockAnalysis.tsx:119, GlobalTaskEntry.tsx:39）。P3
- 6 个 agent 模式中的 4 个在 Segmented 可见（AgentModeSelector.tsx:8），模式语义对非技术用户抽象（快速/分析师/深度研究/审查）——无明显说明文案。P3

**默认配置：**
- DEFAULT_MODEL 默认 `deepseek-v4-flash`（config.py:24, .env.example:4），数据库种子同时建 "DeepSeek Flash"(`deepseek-v4-flash`) 与 "DeepSeek Pro"(`deepseek-v4-pro`)（database.py:2245-2246, 2312-2313）。官方 DeepSeek 文档确认 legacy 名称 `deepseek-v4-flash` 仍被接受但已退役（被路由到 V4.1-Flash），推荐用 `deepseek-flash`；`deepseek-v4-pro` 自 2026-09-14 起也被路由到 Flash。→ 默认模型名是退役别名，功能可用但名不符实（"DeepSeek Pro"实际是 Flash），且未来可能移除。P3
- 模型管理页有供应商预设（modelPresets.ts 14 个预设带官方文档证据）✓；模型未配置错误信息明确（model_router.py:29,41："尚未配置任何模型，请先在模型管理页添加"）✓

**核心用户路径：**
- 研究工作区搜索：query 空 → message.warning；无结果 → research.search.none；异常 → error（ResearchWorkspace.tsx:232-249）✓
- 标的研究页 7 个并行请求每个失败单独提示（ResearchWorkspace.tsx:299-332），数据不可用有诚实空态（zh.ts:883-995 多个"未用 0 或模型数字替代"）✓——非常专业
- QUICKSTART 三步上手 + 常见问题 FAQ 质量高（QUICKSTART.md 全篇）✓
- 组合页有示例预填（Portfolio: zh.ts:226-229, 262-263 "首次体检"/"贵州茅台"）✓
- Dashboard 任务启动台 3 个核心任务 + 进度（Dashboard.tsx:69-92）✓

**错误反馈：**
- 后端统一 500 处理：generic "服务内部错误，请稍后重试" 无错误 ID（main.py:110-122）——用户无法把问题反馈给维护者，维护者无法对应具体请求（虽然有日志带 event 字段）。P2
- 422 校验错误有中文字段级信息（main.py:31-63）✓

**空状态：**
- 全站空态丰富且中文（zh.ts 大量 empty 键：暂无会话/暂无组合/暂无报告/今天没有需要复核的对象变化等）✓
- Dashboard 决策收件箱空态"今天没有需要复核的用户对象变化"（zh.ts:1078）——对全新用户暗示"你本应有数据"，稍困惑，但低优先级。P3

**恢复/升级：**
- QUICKSTART 有完善的更新章节（备份 data/复制到新文件夹，QUICKSTART:129-153）✓
- 关闭窗口不丢数据（QUICKSTART:155-159）✓
- 浏览器先于服务打开需手动刷新（QUICKSTART:40）——恢复路径文档完整。P4

**好体验清单：**
1. LocalCapabilityBanner 能力引导（Dashboard.tsx:28-40）：模型/行情状态诚实标注，UNCONFIGURED/CONFIGURED_UNVERIFIED/RUNTIME_CHECK_REQUIRED 语义清楚，一键跳转配置
2. 数据诚实性文化：空态明确"未用 0 或模型数字替代"（zh.ts:883+），UNKNOWN/PARTIAL/UPSTREAM_ERROR 三态如实保留（QUICKSTART:109-113）
3. 默认中文 + i18n 全量（parity 0），非技术用户语言舒适
4. 模型未配置错误提示带行动指引（model_router.py:29,41）
5. 首页任务启动台 + 首次任务进度（Dashboard.tsx:69-92）轻量 onboarding
6. 15 个模型供应商预设全部有官方文档证据（modelPresets.ts + BACKLOG-043 纪律）
7. 表单校验错误中文字段级（main.py:31-63）
8. 发现页示例公司按钮（Discover.tsx:132-137，不引导用户盲搜）
9. 后端异常日志带 event/http_method/http_path（main.py:112-121）
10. 研究页七路请求失败按模块独立提示，不互相干扰（ResearchWorkspace.tsx:299-332）

优先级定级：
- P0（阻碍首次成功使用）：没有真正的 P0——初次成功路径（双击 start.bat → 搜索 600519 → 看行情）在文档齐全时可行。
- P1（明显破坏核心体验）：我需要想一下有没有 P1。潜在 P1 候选：
  - Python 3.12 严格要求 + 默认下载是 3.13/3.14 → 新用户按 python.org 默认安装大概率失败。但这个被 QUICKSTART 固定链接缓解了 → P2。
  - 首次浏览器先于服务打开显示"无法连接" → 文档说明。P3。
  - 其实最接近 P1 的是：**站内完全无帮助/文档入口** + **无首次引导**，用户卡住时无从求助（唯一途径是重新看外部文档或启动窗口）。对"非技术用户"这是核心体验破坏。P1 还是 P2？用户旅程核心问题"能否自己完成第一次成功使用"——受阻碍点主要是配置 AI（需手编 .env，用记事本编辑隐藏文件，QUICKSTART 提醒过 .env.txt 陷阱）。非技术用户手编 .env 是真实高摩擦：QUICKSTART 说"用记事本打开 .env"——Windows 资源管理器默认不显示无扩展名文件？其实 .env 文件在文件夹里可见（没有隐藏属性）。但记事本"另存为".txt 的陷阱 QUICKSTART 提了。模型管理页可以避免手编 env（模型管理 UI 可以存加密凭据），但 QUICKSTART 主推的还是 .env 路径，且 UI 保存需要 MASTER_KEY 持久化否则重启失效（QUICKSTART:70）——这里有一条真实的 UX 裂缝：**网页内配置 AI 的路径存在但不被主文档引导，且重启后凭据可能丢失**。非技术用户最可能走 .env 手编路径。这个是"首次成功使用 AI 功能"的核心障碍——但对"首次成功使用"（非 AI 功能）不是障碍。定 P1：**AI 配置对非技术用户是隐藏文件手编 + 重启语义不清，UI 内配置不稳定（无 MASTER_KEY 时重启失效）**。嗯，这算"明显破坏核心体验"吗？AI 投研是核心卖点。算 P1 合理。

  另外还有一个 P1 候选：**Docker 路径与 Windows 路径数据不互通**（README/QUICKSTART:86 "两条路径的数据位置不同，切换不会自动搬迁记录"）——这是文档明确的设计选择，不算问题。

  还有一个值得考虑的 P1：**start.bat 首次构建"几分钟或更久"无进度可视化**，窗口只有"C:\... 正在构建前端"；QUICKSTART 说清楚了。不算。

  好，P1 定为："AI 能力首次配置路径对非技术用户摩擦大；网页保存凭据在无 MASTER_KEY 时重启失效（QUICKSTART:70），唯一可靠路径是手编隐藏 .env 文件——而该路径要求用户先理解 `.env` 不是 `.txt`（QUICKSTART:67 提醒），无任何 GUI 引导完成"。证据：QUICKSTART.md:63-70, start.bat:86。

  另一个更强的 P1 候选：**零引导 + 站内无帮助**。用户第一次打开只有 Dashboard + 一段"上次打开后发生了什么值得注意"的 hero 文案（zh.ts:1074），这对首次用户既不说明"这是什么"也不说明"下一步做什么"；QUICKSTART 在站外。无站内帮助/FAQ/版本说明链接。综合为 P1：首次使用无站内引导与求助入口。

  我把这两个都算 P1？让我克制：P1=明显破坏核心体验。我认为最稳妥的 P1 是"站内无引导+无帮助入口"，因为核心问题"陌生人能否自己完成首次成功使用"直接取决于它——虽然有 QUICKSTART，但用户跳过了 README 直接双击 start.bat 是常见行为（QUICKSTART 自己就是为这种人写的，说明意识到这个问题），站内完全不给指引的话，非技术用户在 10 个 tab 的设置页面前会迷失。

  AI 配置摩擦算 P1 还是 P2？首日用户体验中 AI key 配置会很快遇到（用户想看 AI 投研）。手编 .env + 重启语义+`.env.txt` 陷阱 → 我自己定 P1 有点重，但结合"非技术个人投资者"目标人群，这确实是核心体验门槛。折中：AI key 双路径问题定 P1（主要因为 .env 手编路径有真实的 .txt 化陷阱 + 无 GUI 指引，且这是 AI 核心功能的唯一可靠入口）。

  好，最终：P1 x 2-3 个。让我再想想第三个 P1："浏览器先于服务打开→无法连接"——不，文档解决，P3。

- P2：Python 3.12 精确版本/默认 3.13 问题；Alpha 无入口；设置页 10 tab 过载 + 开发者功能混入；System Prompt 硬编码英文；站内无版本更新提示（更新需读外部文档，无版本检查/公告）；500 错误无 ID。
- P3：deepeek 旧模型名；thesis 隐藏入口；agent 模式语义；hero 文案对首次用户；空态文案"今天没有需要复核的用户对象变化"；40s 超时？（不，30s 超时，不算）；模型名 "DeepSeek Pro" 名不符实。
- P4：start.bat 维护者路径硬编码；启动窗口无进度条；离线场景文档体系好所以最低；"已安装 3.12.10 非最新安全版"（文档自注）。

问题总数：数一下：
P1: 
1. 站内零首次引导 + 无帮助入口
2. AI 首次配置双路径摩擦（.env 手编 + UI 凭据重启失效）

P2:
3. Python 3.12 精确版本门禁（3.13+ 默认安装失败路径）
4. Alpha 研究无导航入口
5. 设置页 10 tab 过载、开发者向功能（产品埋点/定时研究）混入
6. "System Prompt" 等硬编码英文泄漏
7. 500 错误无错误 ID，用户无法反馈/检索
8. 站内无更新/版本提示

P3:
9. 默认模型名 deepseek-v4-flash 为退役别名 + "DeepSeek Pro" 名不符实
10. 投资论文无入口
11. agent 模式（快速/分析师/深度研究/审查）无解释
12. hero 文案对首次用户不友好
13. 决策收件箱空态暗示性文案

P4:
14. start.bat 硬编码维护者路径（有文档兜底）
15. 启动窗口无进度可视化（文档兜底）
16. Docker/Windows 双路径数据不互通（设计决策，文档有说明）

16 个问题。这个数量合理（P0=0, P1=2, P2=6, P3=5, P4=3）。

等等，还要检查"首次成功使用"是否真的没有 P0。让我再想想：
- 用户下载 ZIP → start.bat → 成功。首次使用非 AI 功能成功（行情需网络）。在离线/无网络环境下，行情全挂但页面仍可用，能力横幅会说明。无 P0。
- 有没有可能 start.bat 在全新机器上直接失败？缺 Bun → 明确错误+官网链接（start.bat:16-19）。缺 Python 3.12 → 明确错误+手动命令（105-112）。文档 QUICKSTART 也覆盖。无 P0。
- 结论：没有 P0。最高优先级 = P1 × 2。

我需要确认几个行号引用准确性：
- Dashboard.tsx:84-85 (capability banner), 37-38 (banner 内容), 69-92 (task launchpad)
- zh.ts:1074 hero 文案
- Settings.tsx:595, 708 System Prompt 硬编码
- Settings.tsx:606-675 tab 列表（含 product-metrics 664-673? 实际是 649-663 和 664-674）。让我定位：tabItems 从 606 开始，'product-metrics' 在 659-663，'scheduled-research' 654-658。设置页 tab 列表：preferences 608, system 613, credentials 618, mcp 623, fundamentals 628, agents 633, usage 650, scheduled-research 654, product-metrics 659, appearance 664。10 个 tab。
- main.py:110-122 500 handler
- model_router.py:29,41 错误信息
- config.py:24 DEFAULT_MODEL
- database.py:2245-2246, 2312-2313 种子
- App.tsx:341 /alpha 路由；App.tsx:60-120 导航定义
- GlobalTaskEntry.tsx:39 thesis action
- Portfolio.tsx:477, PortfolioOverview.tsx:68, StockAnalysis.tsx:119 thesis 入口
- ResearchWorkspace.tsx:232-249 搜索；299-332 并行失败
- start.bat:43-46 (python 3.12 check), 15 (bun 硬编码路径), 94-96 (浏览器先开), 22 (端口检查)
- QUICKSTART.md:15 (3.12.10 非最新), 40 (刷新), 63-70 (AI 配置), 67 (.env.txt 陷阱), 86 (双路径数据不互通), 129-153 (更新)
- i18n/index.ts:9-13 默认 zh
- zh.ts:883-995 诚实空态/未用 0 替代
- zh.ts:1078 决策收件箱空态
- 未验证项目：实际浏览器渲染效果、E2E、真实网络下的行情可用性 — 标注未验证。

关于"无帮助入口"证据：我在 frontend/src grep 'QUICKSTART|帮助|docs|文档' 只找到 Models.tsx:339-340 的供应商 docsUrl 外链，以及版本显示 SystemSettingsPanel.tsx:59。没有站内帮助/FAQ 链接。✓

关于"站内无更新提示"：SystemSettingsPanel 显示版本号（59），但没有版本检查/更新通知。P3 更合适。嗯，我都放 P3 了。

模型名问题：官方文档 2026-09 fetch 确认 "deepseek-v4-flash" 是 legacy 但仍被接受（路由到 V4.1-Flash），"deepseek-v4-pro" 从 2026-09-14 起也路由到 Flash。所以功能可用，P3。

现在写报告。要求每条一行格式：
```
## 发现的问题（每条：问题 / 证据[文件:行] / 用户影响 / 建议 / 优先级[P0-P4]）
```

"每条问题一行一条"——严格按模板，每条可能跨行但建议保持紧凑。我用每行一条的紧凑格式（用斜杠分隔字段）。为可读性，每条一行（长行）。这让报告可 grep。好。

先写文件，然后 present，然后 send_message 给父 agent，最后回复一句话摘要。

报告文件：docs/ai/evo/PRODUCT_UX_REPORT.md

注意我没有看到真实的浏览器渲染，主题/布局体验未验证。标注。

写吧。
