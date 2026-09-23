# RAW R2 A2-UX audit findings (salvaged from transcript; agent died at 429)


--- finding 1 ---
Now read start.bat, Dashboard.tsx, Research.tsx, App.tsx, and grep zh.ts. Budget 8 files. Already used 2. Let me read start.bat, Dashboard.tsx, Research.tsx, App.tsx = 6 total. Then maybe a couple more if needed.

Let me check sizes first? Just read them.

--- finding 2 ---
Now Dashboard.tsx and Research.tsx. Research.tsx might be large. Let me read Dashboard.tsx and check the file size of Research.tsx.

Actually the task said `frontend/src/pages/Research.tsx` (近期改了报告降级提示). Let me read it with limit.

Budget: 4 files used. Let me read Dashboard.tsx and Research.tsx (limit maybe 400 lines then continue if needed — but reads count? "最多读 8 个文件" — files, not calls. So multiple read calls of the same file count as one file). Good.

Let's read Dashboard.tsx fully and Research.tsx partially.

--- finding 3 ---
Note: The task mentions `frontend/src/pages/Research.tsx` (528 lines) — but is Research.tsx still routed? App.tsx routes: `/research` → ResearchWorkspace, `/research/reports` → LegacyResearchRedirect. Research.tsx isn't in App.tsx routes! Let me check if Research.tsx is still imported anywhere. That's a potential finding: dead page. Let me grep.

Also I should read ResearchWorkspace.tsx (851 lines) since it's the actual research page with report degradation hint. Let me grep for the degradation hint in ResearchWorkspace first.

Budget so far: PROJECT_BRIEF.md, QUICKSTART.md, start.bat, App.tsx, Dashboard.tsx = 5 files. I can read 3 more: Research.tsx, ResearchWorkspace.tsx, zh.ts (grep). That's 8.

Let me do grep operations (grep doesn't count as file reads necessarily, but let's be efficient).

Key observations so far:

1. **start.bat hardcodes a maintainer-machine fallback path** `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe` (line 15). QUICKSTART line 119 says "脚本先找 PATH，再尝试维护者电脑的备用路径；其他电脑不需要创建这个备用目录。" For a non-technical user on another machine, this is harmless but confusing; more important: **if Bun isn't in PATH for the user**, error message says install bun. OK-ish.

2. **start.bat opens browser BEFORE the server is ready** (line 108 `start "" "http://127.0.0.1:8000"` then line 110 uvicorn). QUICKSTART line 40 acknowledges "浏览器可能比服务更早打开，暂时显示无法连接时，等启动窗口出现 Uvicorn running 后刷新一次即可". For a non-technical user, first-run experience = "This site can't be reached" error page. That's a real first-use friction: user sees a browser error page. P1/P2.

3. **start.bat does not install Python deps if .venv already exists** — line 34: `if exist "backend\.venv\Scripts\python.exe" goto frontend`. So if requirements.txt changes (update via git pull), a returning user's venv is stale → uvicorn import error. QUICKSTART line 143 tells git users to manually pip install. That's a documented but real gap. Evidence: start.bat:34 vs QUICKSTART:143-146. Medium.

4. **Frontend build staleness**: start.bat:53-60 only compares package.json mtime vs dist/index.html. Source changes won't rebuild. QUICKSTART:151 documents. But for ZIP downloaders of a new version, dist is included? If dist/index.html included in ZIP and package.json same... Actually if the ZIP ships with dist built, fine. Hmm — but "不要从旧目录复制 frontend/dist". For a fresh ZIP download, dist might be stale relative to code — likely built at release. Documented in QUICKSTART:151. Moderate.

5. **Navigation: `/chat`, `/discussion`, `/thesis`, `/research/reports` redirect**. Dashboard line 94 `navigate('/chat')` → LegacyResearchRedirect mode=fast → `/research?mode=fast`. Line 109 `/discussion` → `/research?mode=review`. Line 125 buttons "开始聊天" → /chat (redirect), "创建讨论" → /discussion, "继续研究" → /research. So the dashboard's "最近对话"/"最近讨论" cards link to redirect targets. Works but the page titles change. Key UX issue: **the navigation menu and dashboard use different vocabularies than the pages they lead to** — user clicks "最近讨论" card → lands on research workspace in "review" mode. Not verified beyond code.

6. **App.tsx navigationGroups has `today` group with child `/` named nav.today.home** — plus a group-per-single-child structure: 8 top-level groups each with exactly ONE child. That means the sidebar has 8 expandable groups, each containing a single item — double-click navigation for a non-technical user. E.g. clicking "研究" expands to "研究工作区". That's a genuine UX gap: one-item groups. Evidence App.tsx:60-120. Note `nav.today.home` for `/`. Hmm, so the left nav is: 今日 → 今日首页; 研究 → 研究工作区; 发现 → 标的发现 / 涨跌停池; 策略 → 策略实验室; 组合 → 组合与风险; 监控 → 预警; 资料库 → 知识库; 设置 → 设置/模型/MCP. Most groups have 1 child. That is friction. P2.

7. **AuthGate**: even in local mode, AuthGate redirects to /login if not authenticated (App.tsx:386-388). In LOCAL_ONLY_MODE backend returns local owner. If the /auth/me call fails (backend not ready), user goes to login page. QUICKSTART says "此入口使用本机单人模式，不需要邮箱登录" (line 50). Need to verify login page handles local mode. Can't verify without reading Login.tsx. Might be worth noting as 未验证.

8. **Dashboard `MarketSignalAvailability` shows hardcoded UNKNOWN tag** (line 44) — on the landing page, a non-technical user sees a permanent "UNKNOWN" tag with text. That's alarming/confusing on first use. Actually it's rendered inside... let me check: MarketSignalAvailability is exported but is it used in Dashboard? Looking at the Dashboard default export render — I see TodayNeedAttention, TodayUniverse, TodayMarketPulse... I don't see MarketSignalAvailability used in the main return. It might be used elsewhere. Let me grep for usage.

9. **Terminal/CLI exposure**: start.bat prints instructions to run pip/bun commands (lines 112-113, 121-125, 129-132) — target user is non-technical and "avoid CLI/terminal". On failure, the ONLY recovery path presented is terminal commands. That's arguably the biggest gap: **失败无自助恢复路径** (no in-UI / no guided recovery; error paths dump terminal commands). Evidence start.bat:119-132. High priority for "other people can deploy it".

10. **`docs/QUICKSTART.md` requires knowing GitHub ZIP download** and stating Python 3.12 + Bun install — a non-technical user must install two runtimes. That's inherent.

11. **AI key config requires editing backend/.env in Notepad** (QUICKSTART:65-68) — target user non-technical, and there IS a Models page in-UI (`/models`). The QUICKSTART steers to Notepad rather than the in-app 模型管理. Inconsistency: UI has model provider management (PROJECT_BRIEF mentions 供应商管理), but quickstart tells users to edit .env with Notepad. For a non-technical Chinese investor that's the single biggest first-use barrier to the core AI feature. Evidence QUICKSTART:63-68 vs App.tsx:116 `/models` route + Dashboard:125 "管理模型" button. P0 candidate.

Also the reverse: if the user configures in the UI with encrypted credentials, MASTER_KEY persistence issue (QUICKSTART:70).

12. **Port conflict**: start.bat exits with error if 8000 occupied (line 28). User must run netstat. Non-technical user → dead end (well, QUICKSTART:94-101 explains netstat + task manager). Terminal again.

13. **The dashboard hero + CommandBar**: first-use guidance exists (task-launchpad with "试一试示例" buttons, progress steps). That's good.

14. **LocalCapabilityBanner**: good — tells whether AI is configured. But "market_data quality_status" default leads to a warning banner shown permanently until a runtime check → possibly noisy on first launch. Evidence Dashboard.tsx:34-38. Worth noting as a "首屏两个黄色警告" issue. Since marketReady only when quality_status === 'OK', and default is RUNTIME_CHECK_REQUIRED → the user always sees a second warning banner on first launch. Could be P2 noise/trust issue.

Let me verify a few things with greps and read a couple more files:
- ResearchWorkspace.tsx (the degradation hint) - 851 lines, read maybe first 200 + grep.
- Check whether MarketSignalAvailability is used.
- Check Login.tsx local mode? Not in budget maybe.

Let me grep across frontend for MarketSignalAvailability and read ResearchWorkspace.

Also check zh.ts for specific keys like 'today.capability.marketPending' to confirm the copy the user sees.

Let me do these in parallel: grep MarketSignalAvailability usage, read ResearchWorkspace.tsx (limit 300 lines around degradation), grep for degradation keys in ResearchWorkspace.

Actually, better: grep "degrad" case-insensitive in frontend/src + backend, and grep 'MarketSignalAvailability'.

File count: I'll read ResearchWorkspace.tsx (file 6), Research.tsx (file 7 - to check whether it's dead code), and one grep of zh.ts (file 8 if I grep... grep isn't a read of the whole file, but let's count conservatively).

Let me first grep.
