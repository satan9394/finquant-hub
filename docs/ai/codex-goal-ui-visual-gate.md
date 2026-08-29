# Codex Goal 引导 — FinQuant Hub UI 视觉验收门禁（接续）

> 用途：直接复制粘贴给 Codex 作为新对话的目标。这是对 `codex-goal-ui-fullchain.md` 的**接续收尾**：代码侧 UI-000~UI-004 已全部完成并提交，只剩视觉截图矩阵验收 + 任务状态收尾。
> 生成日期：2026-08-31 ｜ 前置会话：`C:\Users\Satanchen\.codex\sessions\2026\08\24\rollout-2026-08-24T03-06-38-01a0333c-7e3c-7440-b874-946abad994b1.jsonl`（已 task_complete）

---

## 总目标（Goal）

完成 FinQuant Hub UI 全链路（UI-000~UI-004）的**最终视觉验收**：用你的内置浏览器对 8 个一级页面 × 1440/390 双视口 × light/dark 双主题 × zh/en 双语言生成完整截图矩阵，逐张验收无横向溢出/无 Vite 遮罩/无控制台错误，然后把 5 张任务卡从 `[BLOCKED]` 转为 `[DONE]` 并同步证据。

## 背景（务必先读，避免重复劳动）

- **代码已完成**：UI-000~UI-004 全部实现已提交（commit `8a0be88` + `173867e`），工作树干净。
- **门禁已全绿**：build 4231 modules / Vitest 64 文件 203 测试 / i18n 2202 键 parity / 对比度 58:58 min 4.50:1 / 16 路由无 404 / 20 API 200。
- **唯一剩余硬门禁**：视觉截图矩阵。前置 Codex 会话因内置浏览器 URL policy 连续 3 个 goal turn 被阻断，未能完成。你现在是**新对话 + 新浏览器会话**，应先重新尝试，不沿用旧结论。
- **明确不实现**：Deep Pause/Change scope（后端无 API 合同，目标禁止改后端）——保持控件诚实禁用，**不要**尝试改后端或伪造。

## 关键文件

| 用途 | 路径 |
|------|------|
| 总规划 | `E:\Code_file\Projects\finquant-hub\docs\UI_OPTIMIZATION_PLAN.md` |
| 执行计划 | `E:\Code_file\Projects\finquant-hub\docs\ai\EXEC_PLAN.md` |
| 任务卡 ×5 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-000.md` ~ `UI-004.md` |
| 交接档案 | `E:\Code_file\Projects\finquant-hub\HANDOFF.md` |
| 架构不变量 | `E:\Code_file\Projects\finquant-hub\AGENTS.md` |

## 开工前必读（按顺序）

1. `HANDOFF.md`（当前状态与最近记录）
2. `AGENTS.md`（不变量与门禁命令）
3. `docs/UI_OPTIMIZATION_PLAN.md`（视觉规范与截图要求）
4. `docs/ai/tasks/UI-000.md` ~ `UI-004.md`（各阶段验收标准）
5. `frontend/src/App.tsx`、`frontend/src/app.css`（路由与 tokens）

## 服务启动（固定端口，勿换）

```powershell
# 后端（8000）—— .env 已含 LOCAL_ONLY_MODE=true（单一本地所有者，免邮箱登录）
cd E:\Code_file\Projects\finquant-hub\backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# 前端（5173）
cd E:\Code_file\Projects\finquant-hub\frontend
# bun 不在 PATH，用完整路径：
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe run dev -- --strictPort --port 5173
```

启动后**先验证身份**：`http://localhost:5173/` 标题必须是 `FinQuant Hub`；`http://localhost:8000/openapi.json` 的 title 必须是 `FinQuant Hub`（前置会话曾发现 8000 被无关的"海之子"API 占用、5173 被 Memory Hub 占用——若发现占用者，只停确认是错误服务的进程，不换端口）。

## 截图矩阵（本目标核心）

**8 个一级页面**（路由）：
| 页面 | 路由 |
|------|------|
| Today 今日工作台 | `/` |
| Research 研究 | `/research` |
| Discover 发现 | `/discover` |
| Strategy 策略 | `/strategy-lab/ma-crossover` |
| Portfolio 组合 | `/portfolio` |
| Monitor 监控 | `/monitor` |
| Library 资料库 | `/knowledge` |
| Settings 设置 | `/settings` |

**矩阵规格**：8 页面 × 2 视口（1440×900 / 390×844）× 2 主题（light/dark）× 2 语言（zh/en）= **64 张**。

**命名规范**（与现有文件一致）：
```
docs/ui-current/ui-final-YYYYMMDD-{page}-{viewport}-{theme}-{lang}.png
# 例：ui-final-20260831-today-1440-dark-en.png
# page 用英文小写：today/research/discover/strategy/portfolio/monitor/library/settings
```

**当前已有 26 张（勿重拍，验收即可）**：
- 390 视口 × 6 页面（discover/today/monitor/portfolio/research/strategy）× 4 状态 = 24 张（`ui-final-20260825-*`）
- 1440 视口 × 2 张（`ui-final-today-desktop-light-zh.png`、`ui-final-discover-desktop-light-zh.png`）

**需补齐 38 张**：
- 390：Library、Settings 各 4 状态 = 8 张
- 1440：全部 8 页面 × 4 状态 = 32 张，减去已有 2 张 = 30 张

**验收标准（每张都过）**：
1. 真实 PNG，视口尺寸精确（1440×900 / 390×844），不是 JPEG 改名（前置会话踩过此坑）
2. 无 Vite error-overlay 标记、无加载 spinner 残影、无报错遮罩
3. 无横向溢出：390px 视口下 `document.documentElement.scrollWidth <= innerWidth`（+15px 滚动条余量）
4. 控制台无 error（React/网络错误算失败）
5. 语言切换生效（zh 页中文、en 页英文），主题切换生效
6. 截完的图必须人工（视觉）检查确认渲染完整，不保留纯空白/spinner 帧

**浏览器操作要点**：
- 用内置浏览器打开 `http://localhost:5173/`，通过页面上的语言切换器（LangSwitcher）和主题按钮（Sun/Moon）切换状态，不要用 URL hack 猜状态。
- LOCAL_ONLY_MODE 已开启，应直接进入应用不落邮箱登录页；若落在登录页，读 `AGENTS.md`/`HANDOFF.md` 的本地模式说明，不修改认证代码。
- 若内置浏览器再次被 URL policy 阻断：**尝试一次新标签**，仍失败则停下如实记录（不绕过、不换浏览器、不用旧截图冒充），截图能截多少截多少，其余标 BLOCKED。

## 收尾（截图完成后）

1. 按每张任务卡的验收标准逐张核对截图证据，把 `docs/ai/tasks/UI-000.md` ~ `UI-004.md` 状态从 `[BLOCKED]` 改为 `[DONE]`，填写完成证据（截图路径 + 门禁数字）。
2. 同步 `docs/ai/EXEC_PLAN.md` 对应任务状态与证据。
3. 追加 `HANDOFF.md` 变更日志一条（`python scripts/handoff-log.py --append ...` 或手写，格式照现有条目）。
4. 若截图暴露真实缺陷：只修前端（响应式/i18n/样式），修完重跑门禁后重拍该页；**不改后端/schema/认证，不新增依赖**。
5. 最终汇报格式：结论（全部完成 / 部分完成+阻塞清单）、改动文件、验证结果（build/test 输出 + 截图路径）、截图差异对比、下一步建议。

## 硬性约束（全程不可违反）

- 不 commit / push / publish（除非维护者明确要求）
- 不改后端代码、schema、认证、用户隔离
- 不新增任何 npm/Python 依赖
- 删除文件必须走回收站（`SendToRecycleBin`），禁 rm/del
- 不伪造截图、不把旧图当新证据、不把"HTTP 200"冒充"渲染正确"
- 截图上反映的数据必须真实：缺失字段显示 UNKNOWN，不前端补造数值

## 门禁命令（修改任何前端文件后必跑）

```powershell
cd E:\Code_file\Projects\finquant-hub\frontend
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe run build
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe run test
```

## 最终汇报格式

- **结论**：截图矩阵 64/64 完成 / 部分完成（列出缺口）
- **改动文件**：新增截图清单 + 修改的文档
- **验证结果**：build/test 输出 + 截图路径 + 每张的验收检查结果
- **截图差异对比**：修复前后的页面（如有）
- **下一步建议**
