# BACKLOG-024 — 依赖卫生：显式声明 pro-layout、移除死依赖 pro-components

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-03 ｜ 执行者：Codex
> 背景：BACKLOG-022 证据记录"pro-components 疑似死依赖 + pro-layout 疑似传递依赖，留待授权"。维护者已调研确认：`package.json` 声明 `@ant-design/pro-components`（^2.8.5）但**全库零 import**（真死依赖）；而 `App.tsx` L9 实际 `import ProLayout from '@ant-design/pro-layout'`（**未在 package.json 直接声明**，是 pro-components 的传递依赖 @7.22.7）。本任务做依赖卫生：**显式声明真正在用的 `@ant-design/pro-layout`，移除死依赖 `@ant-design/pro-components`**，并用 `bun install` 更新 lock，清理 pro-components 独占的子包（pro-card/pro-form/pro-table/pro-list/pro-descriptions/pro-field/pro-skeleton 等，经调研全库零使用）。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **依赖关系已确认**：`pro-components@2.8.10` 依赖 `@ant-design/pro-layout@7.22.7`（还依赖 pro-card/pro-descriptions/pro-field/pro-form/pro-list/pro-provider/pro-skeleton/pro-table/pro-utils）。`pro-layout@7.22.7` 自身依赖 cssinjs/icons/pro-provider/pro-utils/rc-util 等。App.tsx 只用 `ProLayout`（`<ProLayout ...>` L217-320）。
> 2. **改动**：`frontend/package.json` 的 dependencies 中**删除** `"@ant-design/pro-components": "^2.8.5"`、**新增** `"@ant-design/pro-layout": "^7.22.7"`（版本以 node_modules 实际安装的 7.22.7 为准）；然后 `bun install` 更新 `bun.lock`。**这是本任务唯一允许的依赖变更**，理由充分（移除零使用死依赖 + 显式声明实际使用），写入证据。
> 3. **验证不破坏**：`App.tsx` 的 `import ProLayout from '@ant-design/pro-layout'` 不需要改（pro-layout 变成直接依赖后 import 路径不变）；`bun run build`/`bun run test`/`bun run test:e2e` 全绿证明无隐性依赖缺失。
> 4. **测试浏览器要求（用户指定）**：E2E 用 **Playwright 内置 Chromium**（保持 `frontend/playwright.config.ts` 的 `name: 'chromium'`，**不得设置 `channel: 'chrome'` 调用系统 Google Chrome**）；如需真机冒烟用 Windows 内置 Edge（msedge）或 Playwright 内置浏览器，**不打开 Google Chrome**。Codex 环境内置浏览器优先。
> 5. **风险**：改动 `bun.lock` 是较高影响操作；`bun install` 需在 `frontend/` 下执行且可能联网；若安装失败，卡片允许的降级是"仅改 package.json + 保留旧 lock 并说明"，但**首选完整 install**。
> 6. **量化收益（可记录）**：移除 pro-components 会从 `vendor-antd`（当前 1529KB）清掉其独占子包；记录 build 后 vendor-antd 与总 JS 字节前后对比（参考 BACKLOG-023 手法）。

---

## 允许修改

- `frontend/package.json`（**唯一**：删 `@ant-design/pro-components`、加 `@ant-design/pro-layout`）
- `frontend/bun.lock`（由 `bun install` 重新生成）
- `docs/ai/tasks/BACKLOG-024.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部
- `frontend/src/` 全部（App.tsx 及一切源码只读——import 路径不变无需改）
- `frontend/vite.config.ts`、`frontend/playwright.config.ts`（**保持内置 Chromium，禁 channel: chrome**）
- 除 pro-components/pro-layout 外的**任何其他依赖**（不新增/删除/升级其他包）
- 测试文件、其他配置
- **不删除任何文件**

---

## 完成标准

### 目标 1：package.json 依赖卫生

- `frontend/package.json` dependencies：移除 `@ant-design/pro-components`，新增 `@ant-design/pro-layout`（^7.22.7）
- 其余依赖项零变化

### 目标 2：bun.lock 更新与安装验证

- `cd frontend && bun install`（或项目约定的 lock 更新命令）成功，`bun.lock` 中 pro-components 移除、pro-layout 成为顶层依赖
- 若安装需联网且失败，记录并降级（见必读 5），但首选完整成功

### 目标 3：验证（内置浏览器）

- `cd frontend && bun run build` 通过（记录 modules 数 + `vendor-antd`/总 JS 字节前后对比，量化收益）
- `bun run test` 全量（基线 121 files/346 tests）全绿
- `bun run test:e2e` 全量（50 基线）全绿，**确认 playwright 用内置 Chromium（配置未加 channel: chrome）**，workers:2/retries:1 不变
- 后端不受影响（如跑一次 `cd backend && .\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider` 应仍 798/798）
- `git diff --check` 通过；确认 package.json 除目标 1 外无其他 diff

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：依赖前后/vendor-antd 字节/测试数/内置浏览器确认）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

---

## 参考

- `frontend/package.json`（dependencies 现状）、`frontend/bun.lock`
- `frontend/src/App.tsx` L9/L217-320（ProLayout 唯一使用处）
- BACKLOG-022 证据（依赖卫生留待授权记录）、BACKLOG-023 证据（字节对比手法）
- 用户要求：测试用内置浏览器（Playwright 自带 Chromium / 系统 Edge），不用 Google Chrome

## 验证命令

```powershell
cd frontend
# package.json 改后更新 lock
$env:Path = "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0;$env:Path"
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" install
# 量化 + 全量门禁
Get-ChildItem dist\assets -Filter '*.js' | Sort-Object Length -Descending | Select-Object -First 5 | ForEach-Object { "$([math]::Round($_.Length/1KB))KB $($_.Name)" }
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- package.json 依赖前后（移除/新增项）
- bun.lock 更新结果（pro-components 消失、pro-layout 顶层）
- vendor-antd / 总 JS 字节前后对比（量化收益）
- 全量测试结果（build/Vitest/E2E）；**内置 Chromium 确认**（playwright 配置无 channel: chrome）
- 依赖变更理由与授权确认（唯一变更项）
- 无删除、无其他文件改动确认
