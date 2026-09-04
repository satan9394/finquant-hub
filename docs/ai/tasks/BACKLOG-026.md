# BACKLOG-026 — 8000 单进程真实入口 E2E（生产托管验收）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-04 ｜ 完成：— ｜ 执行者：Codex
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

```
- 新增文件清单（config/spec/helpers）与行数
- 8000 真实入口启动方式（命令）与 / 首页 / /api/health / favicon / SPA 深层刷新实测结果
- 用例清单（≥10）与每条对应 016-020 哪个交付物
- 夹具形状来源（对齐哪个既有 mock / 后端结构）
- 全量验证：test:e2e（4173）xx/xx、test:e2e:8000 xx/xx 连跑 3 次、bun run build、Vitest、backend pytest + ruff
- 代理开/关两环境结果、git diff --check、删除 0、依赖锁零变化
- 记录的缺陷（如有）
- 未 commit/push
```
