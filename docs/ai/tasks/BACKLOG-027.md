# BACKLOG-027 — CSP 允许同源嵌入：修复 8000 Knowledge iframe 被拦

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-04 ｜ 完成：2026-09-04 ｜ 执行者：Codex
> 背景：BACKLOG-026 新增的 8000 真实入口 E2E 暴露真实缺陷：`SERVE_FRONTEND=1` 的真实 8000 入口会给每个响应附加 `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY`（`backend/app/middleware/security.py` L31/L35，防点击劫持部署安全头）。中文 `/knowledge` 页（`frontend/src/pages/Knowledge.tsx` L137-145）主动用同源 `<iframe src="/knowledge/xxx.html">` 嵌入知识库静态文档（9 个 html，存于 dist 根/知识子路径）。`frame-ancestors 'none'` 表示"本页不允许被**任何**页面 frame 嵌入"，于是同源 html 被自身页面嵌入也被浏览器拒绝——Chromium 报 framing CSP 错误，子 frame 随后触发 `Failed to read the 'localStorage' property from 'Window'` pageerror（子 frame 因被拒无 storage 访问）。这是**配置与自身功能的冲突（自锁）**，不是跨站防护，也不是测试假阳性（4173 dev 无 CSP 头所以一直测不到）。主 Knowledge 页面与 SPA 其余内容仍 200/可见，仅知识库正文 iframe 不可用。BACKLOG-026 禁止改 backend/frontend-src，因此当时保持 `[BLOCKED]` 并记录 `docs/HANDOVER.md`；本轮**单独授权**修复该安全头。

## 目标

在**保持防第三方点击劫持**（仍禁跨站站点 frame 嵌入本应用）的前提下，允许**同源（self）** frame 嵌入，解除自锁；同步收紧 026 的 E2E 门禁从"容忍已知子 frame 错误"恢复为**严格零 pageerror**；更新安全头单测。完成后 026 从 `[BLOCKED]` 转 `[DONE]`。

## 允许修改

- `backend/app/middleware/security.py`：仅改两处安全头取值——
  - `frame-ancestors 'none'` → `frame-ancestors 'self'`（仍禁第三方站 frame 嵌入本应用；允许同源 iframe）
  - `X-Frame-Options: "DENY"` → `"SAMEORIGIN"`（与 `frame-ancestors 'self'` 语义一致：同源可嵌、跨站拒；两者并存无冲突，SAMEORIGIN 为旧浏览器兜底）
  - 其余 CSP 指令与全部其他头**一字不改**
- `backend/tests/test_security.py`：同步 L43 断言（`X-Frame-Options` DENY→SAMEORIGIN），并按需新增 ≥1 断言核对 CSP 含 `frame-ancestors 'self'`（防回归：第三方嵌仍被拒语义由 SAMEORIGIN 覆盖）
- `frontend/e2e-8000/product-acceptance.spec.ts`：删除对已知 localStorage 子 frame pageerror 的"容忍分支"（L36-40 的过滤逻辑），恢复为**所有页面严格零 pageerror** 断言
- 证据文档：`docs/ai/tasks/BACKLOG-027.md`、`docs/ai/tasks/BACKLOG-026.md`（BLOCKED→DONE 证据）、`docs/ai/EXEC_PLAN.md`（026 转 DONE、027 完成）、`docs/HANDOVER.md`（把 🔥 缺陷从 Broken 移到 Verified Working）、`task/CHANGELOG.md`
- `frontend/dist/` 可重新 build（确保被测产物含修复后的后端头——注意安全头由后端响应附加，dist 本身无需改，但 8000 E2E 起服务时须用当前最新 build）

## 禁止修改

- `backend/` 除 `middleware/security.py` 外一切文件（尤其**不新增任何"按路径豁免 CSP"的特殊分支**——安全头必须全局一致）
- `frontend/src/`（Knowledge.tsx 及其 iframe 方案**不改**，保持现有功能）、`frontend/e2e/*`（4173 基线）、`frontend/playwright.config.ts`、`frontend/tests/`、既有 package 依赖/锁文件、`reference/`
- 不得删除文件、不得新增依赖、不得用 `channel: 'chrome'`
- 不得把 CSP 整个移除或放宽到 `frame-ancestors *`（必须保留防跨站点击劫持）

## 完成标准

### 目标 1：后端安全头修复

- `security.py` 两处取值按上述改（其余零改动）；CSP 仍以 `default-src 'self'` 开头，其余指令不变
- `test_security.py` 同步：X-Frame-Options=SAMEORIGIN、CSP 含 `frame-ancestors 'self'`；既有其余安全头断言不回归

### 目标 2：8000 E2E 严格零 pageerror 闭环

- `product-acceptance.spec.ts` 移除 localStorage 子 frame 错误容忍，恢复严格零 pageerror
- 在修复后的真实 8000 入口连跑 `test:e2e:8000`（显式 `--retries=0`）**3 次全绿**；代理关/开两环境各 ≥1 次全绿
- **实测确认**中文 `/knowledge` 的 iframe 能真正加载出知识库正文（如 m1 策略文档内容可见），不再有 framing CSP error / localStorage pageerror（这是修复的直接验收）

### 目标 3：全量门禁零回归 + 026 转 DONE

- 既有 `test:e2e`（4173 50 例）、`bun run build`、Vitest 121/346、backend 798/798 + ruff（含覆盖率不降）全绿
- `git diff --check` 通过；删除 0；依赖/锁文件零变化
- `EXEC_PLAN.md`：026 标 `[DONE]`（引用 027 证据）、027 标完成；`docs/HANDOVER.md` 缺陷条目从 Broken 移至 Verified Working；CHANGELOG 记一条

## 参考

- 缺陷完整证据：`docs/HANDOVER.md`（🔥 8000 Knowledge iframe blocked by production CSP）、`docs/ai/tasks/BACKLOG-026.md` L83
- 安全头来源与现有测试：`backend/app/middleware/security.py` L27-38、`backend/tests/test_security.py`（L34-45 头断言）
- 8000 E2E 与 iframe：`frontend/e2e-8000/product-acceptance.spec.ts`（L36-40 容忍分支待删）、`frontend/src/pages/Knowledge.tsx` L137-151、`frontend/playwright.8000.config.ts`
- 语义参考：CSP `frame-ancestors` 只作用于"本响应能否被嵌入"，`'self'` = 同源可嵌、跨站拒；`X-Frame-Options: SAMEORIGIN` 语义一致（旧浏览器兜底）。防点击劫持对跨站仍生效。

## 完成证据模板（Codex 填写后交维护者复核）

### 2026-09-04 Codex 完成证据

- `backend/app/middleware/security.py` 精确 diff 为 2 增/2 删：仅将 `frame-ancestors 'none'` 改为 `'self'`、`X-Frame-Options: DENY` 改为 `SAMEORIGIN`；CSP 仍以 `default-src 'self'` 开头，其余 CSP 指令与全部其他头逐字不变，没有按路径豁免分支。
- `backend/tests/test_security.py` 将 X-Frame-Options 断言同步为 `SAMEORIGIN`，新增 CSP 包含 `frame-ancestors 'self'` 的断言；聚焦命令加 `--no-cov` 后 8/8 通过（单文件原命令的 8 个断言也全过，仅因全局 coverage fail-under 不适用于聚焦运行而退出 1）。
- `frontend/e2e-8000/product-acceptance.spec.ts` 仅删除已知 localStorage 子 frame 错误的筛选/容忍分支，恢复把完整 `errors` 传给 `expectHealthyPage`，即所有页面严格零 pageerror。
- 真实 8000 中文 `/knowledge` 浏览器实测：主响应 200，CSP 为 `frame-ancestors 'self'`，X-Frame-Options 为 `SAMEORIGIN`；iframe `/knowledge/m1-移动平均策略.html` 可见，正文实际包含“策略 01 · 趋势跟踪”“移动平均策略”与策略说明。独立 Playwright 探针得到 `pageErrors=[]`、`framingOrStorageErrors=[]`；内置浏览器 DOM snapshot 也展开了同一正文。知识 HTML 自带 inline script 仍受未改的 `script-src 'self'` 限制并产生 console 提示，但不是 framing/localStorage 错误、不形成 pageerror，且不影响正文验收。
- `bun run test:e2e:8000 -- --retries=0` 连续三次 15/15，耗时 56.2s、1.0m、53.1s；代理关闭态（清空 HTTP/HTTPS/ALL_PROXY）15/15、43.9s；代理开启态（HTTP/HTTPS 及 SOCKS 均为 127.0.0.1:7897）15/15、43.7s。开启态日志出现一次既有 Windows Proactor `WinError 10054` 客户端断连，命令 exit 0、全部断言通过。
- 全量门禁：4173 `bun run test:e2e` 50/50（58.7s）；`bun run build` OpenAPI 58 schemas fresh、4,242 modules、15.91s；Vitest 121/121 files、346/346 tests、877.35s；backend pytest 798/798、coverage 92.34%（与基线持平）、133.36s；Ruff `All checks passed!`。
- 状态同步：`docs/ai/EXEC_PLAN.md` 中 026/027 均为 `[DONE]`；026 卡由 BLOCKED 转 DONE 并引用本卡闭环证据；`docs/HANDOVER.md` 的 Knowledge CSP 缺陷已从 Broken 移至 Verified Working；`task/CHANGELOG.md` 已记录本轮。
- 最终 `git diff --check` 通过；删除 0；依赖与 `frontend/bun.lock` 零变化；禁止的 backend 业务文件、`frontend/src/`、既有 `frontend/e2e/*`、`frontend/playwright.config.ts`、`frontend/tests/`、`reference/` 均未改；未使用 `channel: 'chrome'`。
- 未 commit、未 push。
