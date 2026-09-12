# PROJECT_BRIEF — FinQuant Hub（产品演进编排·第一阶段产物）

> 由 Product Evolution Orchestrator 生成，2026-09-13。仅作编排依据，供审计子代理使用；不含深度分析结论（避免锚定）。

## 产品是什么

**FinQuant Hub**：个人全栈金融量化研究 Web 系统（本地自用、可开源分发）。A 股/港股/美股多市场行情、技术分析、AI 多 Agent 投研（研究报告生成）、Alpha 因子研究、投资组合管理、策略回测、会话讨论、Token 用量与计价统计、MCP 供应商管理等模块。

## 用户是谁

- 目标用户：**非技术中文个人投资者**（所有 UI 中文，避免 CLI/终端）。
- 部署形态：个人电脑本地安装（Windows `start.bat` → 127.0.0.1:8000 单进程），或 Docker 本地模式（LOCAL_ONLY）。
- 面向"他人可本地快速部署使用"的开源目标（Local OSS v1）。

## 核心任务

1. 行情数据（腾讯/新浪/东方财富/Yahoo 多源链 + 后备/熔断）。
2. AI 投研：4-agent 并行研究 → 主编综合 → 13 章中文报告（DeepSeek 函数调用、13 个本地工具）。
3. 量化研究：Alpha 因子（WQ 4367 字段目录/搜索/相关性/模拟）、指标（SMA 系列 7 个）、策略回测。
4. 组合与风控：组合管理、持仓、策略实验室（IR 自然语言→策略）。
5. 基础设施：模型供应商管理、Token 用量/计价、MCP（http+stdio）、知识库（FTS5 memory）、SSE 实时流。

## 当前成熟阶段

- 已实现：约 23 个 APIRouter / 140 个 /api 路径 / 176 个操作；52+ 表（schema v26）；backend 909 测试 / 92.67% 覆盖；前端 134 文件 / 470 Vitest；4173 E2E 50 + 8000 E2E 21；i18n 2453 key parity 0。
- 近期连续完成：供应商管理、计价模块、用量统计详情（对齐 CC Switch）、Alpha 模拟绩效统计等。EXEC_PLAN 无 [READY] 待办，工作树干净。
- 阶段判断：**功能完备度较高，处于"发布前成熟度"阶段**——发布/上手/长期维护/可靠性方面的打磨应优先于新增功能。

## 已知约束（架构不变量）

- 无 ORM（aiosqlite 裸 SQL）、无连接池、无单独 DAL 层、无 WebSocket（SSE）、无 SSR、无 DI 容器。
- 无新依赖（除非明确批准）；`reference/` 只读；删除一律回收站；E2E 用内置 chromium。
- 数据隔离（用户 owner-scoped）；邮箱免密登录（LOCAL_ONLY 则单本地所有者）。
- 中文数据源 trust_env=False（绕代理）；Yahoo trust_env=True。

## 成熟度更新（2026-09-11 **第四轮**审计基线）

> 机器实际日期为 2026-09-11（此前 `docs/ai/evo/` 内多处误记为 09-13，以本行为准）。

- schema v26；backend 聚焦测试 89+ 全绿、`ruff` 干净；frontend 新增测试 40+ 全绿、`bun run build`（含 `tsc -b`）通过；i18n zh/en parity 保持。
- **自第三轮审计以来已交付（供审计参照，不含审计结论）**——产品自 R3 起已演进 **17 个 Vertical Slice**，下列均为**动过的真实行为**，请把它们当作"可能引入新缺口的改动面"：
  1. **研究失败语义收口**：`node_failed` 改为非致命 `agent_failed`（此前一个 Agent 的非 LLMError 异常会 `break` 掉整轮、丢弃其余已完成 Agent 的成果）；降级判据由**字符串前缀哨兵**改为**读结构**，覆盖工具失败的 5 种形态（工具不存在/未授权/参数校验失败/`success:false`/异常）；新增**空内容**与 `finish_reason == "length"`（截断）判据。
  2. **LLM 调用**：瞬时故障重试 + **尊重上游 `Retry-After`**（整数秒与 HTTP-date，单次上限 30s）+ 退避**抖动**；`Retry-After: 0` 已改为回落退避（原先 0 秒紧循环且绕过抖动）。
  3. **前端失败可见性**：`Research.tsx` 的 SSE switch **新增 `case 'agent_failed'`**（此前崩溃 Agent 的卡片永远停在"运行中"）；抽出纯函数 `applyAgentEvent` 并补**组件级接线测试**（含变异实测证明删掉该 case 会挂）。
  4. **本地模式登录死胡同修复**：`api.ts` 保留 HTTP `status`；`authStore` 新增 `unavailable` 状态与**有限重试**（仅 401/403 判"需要登录"）；`AuthGate` 在服务未就绪时渲染重试提示而**不再跳登录页**。
  5. **启动链**：备份改用 `sqlite3.Connection.backup()`；**"产物疑似过期"不再硬退出**（改为警告后用现有产物启动，仅在产物**确实缺失**时要求装 Bun）；复用路径**打印产物构建时间**。
  6. **用户可见文本与实现对齐**：`:venv_failed` **打印检测到的 Python 版本**；`QUICKSTART` 的备份说明由"滚动保留最近 7 份"改为"**不会自动删除、只提示**"。
  7. **首页入口**：`Dashboard` 的"最近会话/最近讨论"链接**带上记录 id**（会话 `?session=`、讨论 `?room=`），点击后打开**那一条**而不是空白新建界面（VS-16，交付中）。
  8. **仓库行尾**：新增 `*.bat`/`*.cmd text eol=crlf`——此前仓库存 LF，`autocrlf=false` 的克隆者会拿到 **LF-only 的 Windows 双击入口**。
- **提示**：审计应独立判断**当前**最大缺口，不必复述上述条目；**请特别留意这些改动是否引入了新缺口**——尤其①新的事件类型（`agent_failed`）在**所有**消费方是否都被正确处理；②新增的并发/失败分支（备份、重试、启动）在**异常与并发**情形下的行为；③同一功能的**多条路径**（交互 vs 定时、实时 vs 历史、脚本 vs 文档）是否仍一致。
- **第四条（本轮新增）**：**不要只审"新写的代码有没有错"，也要问"这次新增让哪些既有路径的触达面变大、或第一次变得可达"**。
  - 实例 A（触达面变大）：`Discussion` 的 `?room=` 深链效果**一直**缺少"只应用一次"的守卫（依赖 `rooms`，而 `addRoom` 会产生新数组），会把手选房间的用户拽回 URL 里那一条；该路径**此前已可达**（`components/research/ResearchContinuity.tsx:115` 早已产出 `/discussion?room=<id>`，经保留查询串的遗留重定向即达 `?mode=review&room=<id>`），本次首页卡片让它**触达面变大**，遂被实现者发现并修复。**注意**：这类缺陷既不是"新代码有 bug"、也不是"文档与实现不一致"，常规检查清单抓不到。
  - 实例 B（第一次变得可达）：`ResearchWorkspace.tsx:461-466`（Core 落地页的 `AgentModeSelector`）与 `ThesisModeSurface:93-100` **未**剥离 `session`/`room`——当前**应用内没有产出者**，只有手工构造 `/research?session=7` 才可达，属潜在不一致（建议抽公共 `switchMode`）。
  - 请专门用这个问题过一遍上面 8 类改动。

## 给审计子代理的说明

- 审计子代理**只读不改**；可访问代码库（backend/app、frontend/src、docs）。
- 各有独立审计标准（见各自任务书），**不共享彼此结论**。
- **预算纪律**：只读必要文件（≤8 个）、一次性写报告、不漫游；证据不足处标注"未验证"。
- 产出落在各自报告文件，主 Agent 负责综合。
- **环境提示（会直接影响你的结论，务必遵守）**：①`tests/test_api.py` 与**全量 pytest** 在本沙箱会**挂起**，不要运行；如需验证，只跑**聚焦的测试文件**并前置 `$env:no_proxy='localhost,127.0.0.1,::1'`。②用 PowerShell 读 UTF-8 文件（含 `start.bat`）**必须显式指定 UTF-8**（PS 5.1 的 `Get-Content` 默认 ANSI，会损坏中文并让你误判）。③前端 `bun run build` 不要与 `vitest` 并行跑。
- **环境提示**：`tests/test_api.py` 在本沙箱会挂起，不要运行它；读取 UTF-8 文件（含 `start.bat`）时注意 PowerShell 5.1 的 `Get-Content` 默认按 ANSI 解码会损坏中文，请显式指定 UTF-8。