# BACKLOG-026 — 8000 单进程真实入口 E2E（生产托管验收）

> 状态：`[BLOCKED]` ｜ 优先级：P1 ｜ 创建：2026-09-04 ｜ 完成：— ｜ 执行者：Codex
> 背景：目标用户是中文非技术个人投资者，产品目标"他人可本地快速部署使用"，使用入口是双击 `start.bat` → 浏览器打开 `http://127.0.0.1:8000`（BACKLOG-016~019 交付的单进程托管：FastAPI 直接服务 `frontend/dist`，SPA fallback + `/assets` + 根级静态文件）。但现有 E2E（`frontend/e2e/*`，共 50 例）全部跑在 **4173 Vite dev server + API 全 mock** 上（`playwright.config.ts` baseURL=4173），**从不经过 8000 真实单进程入口**——016 的静态托管/SPA fallback/favicon 层、017/018 的"双击即用"入口、019 的静态优先修正，都没有浏览器级验收证据。pytest `test_main_static.py`（21 项）只覆盖单测层，不是真实浏览器。

## 目标

新增**独立于 4173 基线**的一套 Chromium E2E：以 **8000 真实单进程入口**（真实 `frontend/dist` 静态托管 + 真实 FastAPI + 真实 SPA/路由/健康检查）为被测对象，对会访问外网（行情/新闻/LLM/东财/腾讯）的 `/api` 请求用 Playwright `route` 拦截返回**真实 API 形状的确定性夹具**——做到"真实入口层 + 确定性数据"，稳定可重复（符合项目"完整 E2E 连跑 3 次全绿"纪律）。

## 允许修改

- **新建** `frontend/playwright.8000.config.ts`（独立 config：`testDir` 指向 `e2e-8000/`，`baseURL: 'http://127.0.0.1:8000'`，内置 chromium `devices['Desktop Chrome']`，**无 `channel: 'chrome'`**，`workers: 2`/`retries: 1`，`webServer.command` 负责起真实 8000 后端 + SERVE_FRONTEND）
- **新建** `frontend/e2e-8000/` 目录及 spec/helpers（纯新增，见"测试要求"）
- **新建** 或小改 `frontend/package.json` scripts：加 `"test:e2e:8000": "playwright test -c playwright.8000.config.ts"`（不改变既有 `test:e2e`）
- 证据文档：`docs/ai/tasks/BACKLOG-026.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/HANDOVER.md`（如需记录缺陷）

## 禁止修改

- `backend/` 一切业务代码（本次零后端改动；真实后端只被**启动**，不改动）
- 既有 `frontend/e2e/*` 全部 spec、`frontend/playwright.config.ts`（4173 基线零改动）、`frontend/src/`、`frontend/tests/`、既有 package 依赖/锁文件、`reference/`
- **不得让测试依赖真实外网**：凡会打外网的请求（行情/新闻/搜索/LLM/东财/腾讯/DeepSeek）一律在测试内拦截；测试本身不新建真实交易/不写库、不改 `backend/data/finquant.db` 内容（只读；如需写验证用**临时副本 DB**，见完成标准）
- **不得** `channel: 'chrome'`、不得调用真实外部 API 断言、不得删除任何文件、不新增 npm/Python 依赖
- 不改 `playwright.config.ts` 的 4173 `webServer` 行为

## 完成标准

### 目标 1：8000 真实入口可启动（供测试与被测）

- 提供可复现启动方式（config `webServer` 或脚本），等效于 start.bat 的产物路径：`SERVE_FRONTEND=1 LOCAL_ONLY_MODE=1` 下以真实 venv 起 `uvicorn app.main:app --host 127.0.0.1 --port 8000`，且 `frontend/dist` 为**当前最新 build**（必要时先 `bun run build`；4173 基线 config 不动）
- 确认 8000 上：`GET /` 返回真实 `index.html`（title FinQuant Hub、无 Vite overlay 标记）、`/assets/*` 静态 200、`/favicon.svg` 返回 `image/svg+xml`、`/api/health` 真实 200 ok/wal、未知 `/api/*` 404 非 SPA

### 目标 2：016-020 交付物在真实入口的浏览器验收（新增 spec ≥10 用例）

在 8000 真实入口、对必要的行情/AI `/api` 做确定性拦截后：

1. **016 单进程托管（真实 index/assets/favicon/SPA）**：首页加载真实 dist（断言页面出现真实产品文案如六组导航/Dashboard 首屏元素，**非** 4173 mock 专属标记）；直接刷新深层路由（如 `/research`、`/portfolio`、`/discover`、`/strategy-lab/ma-crossover`、`/alerts`、`/knowledge`）不 404（SPA fallback 生效）；`/favicon.svg` 可加载无 404
2. **017/018 入口与导航**：Dashboard 首屏可用；六组一级导航可见可点（今日/研究/发现/策略/组合/监控/知识/系统工具按实际导航结构），点击到对应路由
3. **019 静态优先回归**：根级静态文件（favicon.svg 等）不被当 HTML fallback
4. **020+013+014+015 关键证据页面渲染**（A 股证据卡片/榜单，数据用确定性夹具拦截返回真实形状）：
   - ResearchWorkspace（A 股 6 位代码，如 600519）：筹码卡片含历史走势容器（`chip-history-chart`）、快照保留；资金流走势容器（`money-flow-chart`）
   - `/discover/limit-pool`：涨停池表格渲染、日期/涨跌停切换请求正确
   - ResearchWorkspace 龙虎榜：历史上榜记录列表渲染、日期切换
5. 每页断言无 pageerror（Vite overlay / 白屏 / console error 按需）

> 注：这些 016-020 页面组件级行为已有 4173 mock E2E 覆盖（50 例基线）；026 **不重复**其组件断言细节，聚焦"真实 8000 入口下这些页面能加载、SPA/静态层正确、关键容器出现"。

### 目标 3：数据确定性 + 无外网依赖

- 覆盖走外网的数据请求（至少：行情 quote/kline、资金流/龙虎榜/筹码/涨停池、新闻、模型/LLM 配置类），用 `route.fulfill` 拦截，夹具 JSON **符合对应后端响应真实形状**（可参考既有 `frontend/e2e/helpers.ts` 的 mock 形状 + `test_main_static`/后端返回结构；不得凭空编造违背契约的字段）
- 完整 spec 在**代理关/开两种环境**均可跑（测试自身不发外网请求），无重试下连跑 3 次全绿或记录与 4173 基线一致的真实限制

### 目标 4：基线零回归 + 全量门禁

- 既有 `test:e2e`（4173 50 例）与 `bun run build`、Vitest 121/346、backend 798/798 + ruff **全部保持通过**（026 不改它们，只新增 8000 套）
- `git diff --check` 通过；删除 0；依赖/锁文件零变化

## 参考

- 既有 4173 mock 夹具形状：`frontend/e2e/helpers.ts`、`frontend/e2e/dragon-tiger.spec.ts`、`frontend/e2e/chip-chart.spec.ts`、`frontend/e2e/money-flow.spec.ts`、`frontend/e2e/limit-pool.spec.ts`
- 静态托管单测（真实入口行为参考）：`backend/tests/test_main_static.py`（14 项：SPA fallback/静态优先/favicon/穿越 404/健康）
- 启动脚本：`start.bat`（8000 入口产物路径：dist、venv、SERVE_FRONTEND/LOCAL_ONLY_MODE）
- 页面导航结构：`frontend/src/App.tsx`（navigationGroupDefinitions / systemToolPaths）
- 端口事实：8000 当前空闲（2026-09-04 实测无监听）；若被占按项目规则处理，不换端口

## 完成证据模板（Codex 填写后交维护者复核）

### 2026-09-04 Codex 完成证据

- 新增文件与行数：`frontend/playwright.8000.config.ts` 31 行；`frontend/e2e-8000/helpers.ts` 205 行；`static-entry.spec.ts` 56 行；`product-acceptance.spec.ts` 135 行。`frontend/package.json` 仅新增 1 行 `test:e2e:8000`，既有 `test:e2e` 未改；共 2 个 spec、15 个用例。
- 8000 启动方式：Playwright `webServer` 先执行 `bun run build`，再在 `SERVE_FRONTEND=1 LOCAL_ONLY_MODE=1` 环境从真实 `backend/.venv` 执行 `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`，等待真实 `/api/health`。实测 `/` 200、`<title>FinQuant Hub</title>`、无 `/@vite/client`/Vite overlay 标记；从 index 提取的真实 `/assets/*` 200 且非 HTML；`/favicon.svg` 200 + `image/svg+xml`；真实 `/api/health` 200 + `status=ok/db=wal`；未知 `/api/backlog-026-missing` 404 JSON、非 SPA。
- SPA 深层刷新 6 例：`/research`、`/portfolio`、`/discover`、`/strategy-lab/ma-crossover`、`/alerts`、`/knowledge` 均由真实 8000 返回 200，浏览器 reload 后真实 `<main>` 可见、无白屏/Vite overlay。
- Dashboard/导航 1 例：真实 dist Dashboard 显示“今日”“今天想完成什么？”；今日/研究/发现/策略/组合/监控/资料库/设置八组一级导航均可见，逐一展开并点击到实际子路由，再回到 `/`。
- 013/020 证据页 1 例：`/research/600519` 显示真实响应形状的贵州茅台快照 `1500.00 CNY`，`chip-history-chart` 与 `money-flow-chart` 容器可见。
- 014/015 龙虎榜 2 例：两条历史记录可见，本地选择旧记录不增请求；日期改为 `2026-08-20` 后请求携带 `date=2026-08-20&look_back=30` 并渲染 `2026-08-19` 历史记录。
- 014 涨跌停池 2 例：涨停池表格渲染 `600519/贵州茅台` 与 `eastmoney.push2ex/DIRECT`；切跌停池请求 `pool=limit_down` 并渲染 `000001`，再切日期请求 `date=2026-08-20&pool=limit_down`。
- 016/019 静态与 API 3 例：生产 index + hashed asset、根级 favicon SVG、真实 health + 未知 API 404 分别独立断言。以上合计 15 例，全部使用 Playwright 1.62 内置 Chromium `devices['Desktop Chrome']`，无 `channel: 'chrome'`。
- 夹具形状来源：auth/models/notifications/Dashboard 对齐 `frontend/e2e/helpers.ts` 与 `dashboard.spec.ts`；snapshot/bars/fundamentals/workspace、chip、money-flow、dragon-tiger、limit-pool 对齐 `core-paths.spec.ts`、`chip-chart.spec.ts`、`money-flow.spec.ts`、`dragon-tiger.spec.ts`、`limit-pool.spec.ts`；真实静态/API 边界对齐 `backend/tests/test_main_static.py`。所有非 8000 同源请求被测试内阻断；除真实 `/api/health` 外，`/api/**` 均由确定性 fixture/空响应 fulfill，未写 DB、未调用真实行情/新闻/LLM。
- 8000 三连：显式 `--retries=0`，15/15 ×3，分别 47.9s、55.8s、约 1.1m；无测试重试。第二轮服务日志出现一次 Windows Proactor 客户端断连 `WinError 10054`，测试仍为 15/15 且命令成功退出。
- 代理双环境：清除 HTTP/HTTPS/ALL_PROXY 后 15/15（约 1.1m）；设置 HTTP/HTTPS `127.0.0.1:7897`、ALL_PROXY `socks5://127.0.0.1:7897` 后 15/15（52.6s），均显式 `--retries=0`。
- 全量门禁：既有 `bun run test:e2e` 4173 基线 50/50（52.6s）；`bun run build` OpenAPI 58 schemas fresh、4,242 modules、16.35s；Vitest 121/121 files、346/346 tests、860.39s；backend pytest 798/798、coverage 92.34%、124.62s；Ruff `All checks passed!`。
- 内置浏览器实测：Codex In-app Browser 可见打开 `http://127.0.0.1:8000/`，标题“今日工作台 - FinQuant Hub”，Dashboard/任务入口/导航 accessibility tree 可见，错误日志 `[]`。客户端策略阻止直接打开 JSON `/api/health`，未绕过；该 JSON 由真实 Playwright/API 请求验证。
- 范围证据：首次文档回填前 `git diff --check` 通过；仅新增 config/e2e-8000 与 package script，随后只回填本卡允许的证据文档。最终复核见下方缺陷结论；删除 0，依赖与 `bun.lock` 零变化，既有 `frontend/e2e/*`、`frontend/playwright.config.ts`、`frontend/src/`、`frontend/tests/`、backend 业务代码零变化。
- 真实缺陷 / 阻塞：8000 返回的既有 CSP 含 `frame-ancestors 'none'`，会拦截中文 `/knowledge` 页中的同源 `<iframe src="/knowledge/...">`；Chromium 控制台报告 framing CSP error，子 frame 另触发 `Failed to read the 'localStorage' property from 'Window'` pageerror。主 Knowledge 页面仍 200、可见、可刷新，无白屏/overlay；新增导航测试要求该已知子 frame error 实际出现并只精确隔离它，任何其他 pageerror 仍失败，专项复测 1/1（`--retries=0`）。修复需修改本卡禁止的 `backend/` 安全头或 `frontend/src/pages/Knowledge.tsx`，故严格“每页零 pageerror”完成标准未满足，卡片保持 `[BLOCKED]`；已同步 `docs/HANDOVER.md`。
- 未 commit、未 push；根 `HANDOFF.md` 与 harness handoff-log 因不在本卡允许修改清单而未触碰。
