# IMPLEMENTATION_BRIEF — Vertical Slice 16：首页"最近会话/讨论"点击后打开所指记录

> Orchestrator 第五阶段产物，2026-09-11（机器实际日期）。来源：**A2 的 P2-2**（`PRODUCT_UX_REPORT_R2.md`），**编排者已把整条链路核实到底**（含 id 语义、路由、参数转发）。

## 目标
首页两张卡的列表项**点击后打开的就是那一条记录**，而不是一个空白的新建界面。

## 用户场景
用户在首页看到"最近讨论"里的 **"上周那篇 600519 的讨论"**，点进去——**现状**：落到一个**空白的通用讨论界面**（主题与内容都丢了）。他看到的东西和点进去得到的东西不一致，于是不再相信首页那两张卡。这是**首页**（第一印象）上的信任损耗。

## 当前问题（链路已核实）
- `frontend/src/pages/Dashboard.tsx:100`：最近会话项 `<Link to="/chat">` —— **不带 id**（而 `item.id` 就在同组件 `:101` 的兜底文案里被使用）。
- `frontend/src/pages/Dashboard.tsx:115`：最近讨论项 `<Link to="/discussion">` —— **同样不带 id**。
- `/chat`、`/discussion` 是**遗留重定向**（`App.tsx:323-324`）→ `LegacyResearchRedirect` → `/research?mode=fast|review`；该组件**保留查询串**（`App.tsx:152-153`）。
- 真正的界面由 `ResearchWorkspace` 按 `?mode=` 渲染（`:887-891` → `ResearchModeSurface:80/:82`）：`fast` → `<Chat>`、`review` → `<Discussion>`；但 `ResearchModeSurface` **只从 `subject` 派生 `initialPrompt`/`initialTopic`，从不转发记录 id**。
- **两个目标页其实都支持"打开某条记录"**：
  - `Discussion.tsx:30-32` **已读** `?room=<id>`（→ `requestedRoomId`）；
  - `Chat.tsx` **有会话概念**（`currentSessionId`、`setCurrentSessionId`、`GET /chat/sessions/<id>/messages`），但**只读 `?prompt=`**（`:59-61`），**尚未读会话 id**。
- **id 语义已核实同源**：`dashboard.py:129-132` 的 `recent_conversations` 查 `conversations WHERE mode='single' AND status='active'`；`chat.py:73` 的 `/chat/sessions` **查同一张表同一条件** ⇒ `recent_conversations[].id` **确为 chat session id**，可直接用于 `?session=`。`recent_rooms`（`dashboard.py:133`）来自 `discussion_rooms` ⇒ `?room=` 同源。

## 理想行为
1. 最近**会话**项 → 打开**该会话**（其历史消息被加载），而非空白新会话。
2. 最近**讨论**项 → 打开**该讨论**（主题与消息为该条记录）。
3. 卡片的"**查看全部**"按钮（`Dashboard.tsx:94/:109`）**保持不带 id**——它本来就是"去该功能区"，语义正确。
4. 参数**非法/记录已被删除/不属于当前用户**时 → **优雅回落**（不得白屏、不得抛错、不得静默串到别人的记录）；可回落到该功能区的默认视图。

## 涉及模块
- `frontend/src/pages/Dashboard.tsx`（两个 `<Link>` 带上 id）
- `frontend/src/pages/Chat.tsx`（**新增**：读 `?session=<id>` 并选中该会话）
- （可选）`frontend/src/pages/ResearchWorkspace.tsx`：若发现 `ResearchModeSurface` 需要转发参数才生效，则在其处转发（**先验证 Chat/Discussion 能否直接读同路由的 searchParams**，能则不改）
- 对应前端测试

## 不能破坏
- **`/chat`、`/discussion`、`/thesis`、`/research/reports` 的遗留重定向行为**（`App.tsx:323-324/329/333`）与 `LegacyResearchRedirect` 的**参数保留**语义。
- `?mode=` 的模式切换、`AgentModeSelector`、`ResearchModeSurface` 的既有渲染分支。
- `Chat` 的 `?prompt=` 与 `Discussion` 的 `?room=` **既有行为**（`?prompt=`/`?room=` 仍须生效）。
- `Chat`/`Discussion` 也由 `StockAnalysis.tsx` 使用（`:20-21`）——**不得破坏该用法**。
- i18n 键 zh/en 同步；不加依赖；不改后端；不删文件；不 commit。

## 验收标准（可判定）
1. **会话**：`recent_conversations` 第 1 项的链接为 `/research?mode=fast&session=<其 id>`（或经 `/chat?session=<id>` 重定向后等价）；**点击后该会话的历史消息被加载**（可用 mock 断言 `GET /chat/sessions/<id>/messages` 被调用且 id 正确）。
2. **讨论**：`recent_rooms` 第 1 项的链接为 `/research?mode=review&room=<其 id>`；**点击后打开该 room**（断言选中 id 正确）。
3. **"查看全部"** 仍指向不带 id 的 `/chat` / `/discussion`（或等价的无 id 目标）。
4. **非法 id**（如 `?session=abc` / 不存在的 id）→ 不崩溃、不白屏，回落到该功能区默认视图。
5. **`?prompt=` / `?room=` 既有行为零回归**（既有两个测试文件全绿）。
6. 门禁：相关 vitest 全绿；`bun run build`（含 `tsc -b`）通过；**不要与 vitest 并行跑 build**。

## 错误场景
- `recent_conversations` 为空 → 卡片显示既有空状态（`today.noConversations`），**不产生任何请求**。
- 会话存在但消息为空 → 打开该会话（空会话是合法状态），**不得**因此当成"非法 id"。
- `session` 与 `room` 同时出现 → 以 `mode` 对应的那个为准，互不干扰。
- 切换模式（`AgentModeSelector`）→ 不得把旧记录的 id 带到新模式（避免 `fast` 带 `room`、`review` 带 `session`）。

## 测试要求
- Dashboard：断言两卡的链接**含正确 id**。
- Chat：断言 `?session=<有效 id>` 会选中该会话并拉取其消息；`?session=<无效>` 优雅回落。
- Discussion：断言 `?room=<id>` 既有行为仍生效（回归）。
- `StockAnalysis` 内嵌 `Chat`/`Discussion` 的既有测试零回归。
- 由独立 Evaluator 复核：**点击后是否真的打开了"那一条"**（而非仅链接带了参数）、以及非法 id 是否优雅回落。
