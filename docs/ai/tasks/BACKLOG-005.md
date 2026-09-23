# BACKLOG-005 — E2E 扩面：SSE 交互管线（Chat/Discussion）+ 系统与知识页

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：现有 16 个 Playwright E2E 覆盖 research / strategy / portfolio / discover 四条主链。**/chat（单 Agent SSE 对话）、/discussion（多 Agent SSE 讨论）、/knowledge、/models、/mcp-market、/alerts、/thesis、/settings、/compare、/analysis/:ticker 均无 E2E**。其中 Chat 与 Discussion 是 SSE 流式交互管线（项目核心 AI 能力），最值得补；其余为系统/知识页，补基础渲染与交互回归。
>
> 本任务 = **SSE 交互管线 E2E（主）** + **系统/知识页 E2E（次）**，二合一。

---

## 允许修改

- `frontend/e2e/chat-paths.spec.ts`（新建）
- `frontend/e2e/discussion-paths.spec.ts`（新建）
- `frontend/e2e/system-pages.spec.ts`（新建：knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 任一页的渲染 + 关键交互）
- `frontend/e2e/` 既有 spec（如需共享 helper，优先新建 `helpers.ts` 或在新文件内复制，避免大改既有文件）
- `docs/ai/tasks/BACKLOG-005.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- 后端代码、schema、认证、依赖
- `frontend/src/` 业务组件（**除非** E2E 暴露真实缺陷——此时记录缺陷并最小修复，标注原因）
- `reference/`、`docs/ui-current/`

---

## 完成标准

### 目标 1：Chat SSE 交互管线（`frontend/e2e/chat-paths.spec.ts`）

复用 `core-paths.spec.ts` 的 `mockApi` 模式（`page.route('**/api/**')` + shell + SSE 流 mock）。**Chat 页面用原生 `fetch('/api/chat/sessions/{id}/messages')` POST**，SSE 响应体 mock 契约参考 `frontend/src/services/sse.ts`（`event:` + `data:` + 空行分隔，见参考节）。

**SSE 帧契约（POST /api/chat/sessions/{id}/messages，Content-Type: text/event-stream）**：
```text
event: token
data: {"delta":"贵州茅台"}

event: token
data: {"delta":"今日收涨"}

event: done
data: {"message_id":11,"token_count":245}
```

用例（≥6 个）：
1. **空状态**：无会话时显示创建入口，`GET /api/chat/sessions` 返回 `{items: []}` → 页面显示空态（非报错）
2. **创建会话**：输入内容 → `POST /api/chat/sessions` 返回新会话 → 页面切换当前会话
3. **SSE 流式回复**：发消息 → mock 上述 SSE 帧 → 断言流式文本逐步出现（token 累加）、结束后消息完整落定（message_id 事件后内容保留）
4. **SSE error 事件**：mock 返回 `event: error / data: {"error":"上游失败"}` → 页面显示错误提示、流结束不挂起
5. **校验失败**：空内容发送 → 不发请求或前端拦截（断言无 fetch 或显示提示，按实际行为）
6. **旧路由 /chat → Research fast 模式**：`GET /chat` 重定向到 `/research?mode=fast`（查 App.tsx LegacyResearchRedirect 的实际行为，按实际断言）

### 目标 2：Discussion SSE 交互管线（`frontend/e2e/discussion-paths.spec.ts`）

Discussion 用 `fetch('/api/discussion/rooms/{id}/start')` 拉 SSE（POST）。**房间创建是 axios POST /api/discussion/rooms**。SSE 帧契约（参考 API_CONTRACT.md §多 Agent 讨论）：
```text
event: agent_start
data: {"agent":"value_investor","name":"价值投资官","round":1}

event: token
data: {"delta":"我认为..."}

event: agent_end
data: {"agent":"value_investor","message_id":31,"token_count":320}

event: done
data: {"room_id":1}
```

用例（≥5 个）：
1. **空状态**：无房间时 `GET /api/discussion/rooms` 返回 `{items: []}` → 空态
2. **创建房间**：POST /api/discussion/rooms 返回新房间 → 进入房间详情
3. **SSE 讨论流**：start → mock agent_start/token/agent_end/done 帧 → 断言轮次标签出现、token 文本累加、最终 done 后时间线完整
4. **SSE error 事件**：mock error 帧 → 页面错误提示、流结束
5. **旧路由 /discussion → Research review 模式**：按 LegacyResearchRedirect 实际行为断言

### 目标 3：系统/知识页（`frontend/e2e/system-pages.spec.ts`）

对以下路径各补**至少 1 个"渲染 + 关键交互"用例**（mock 对应 API，参考既有 shell；先跑 `bun run dev` 看实际 API 调用，再写 mock）：

| 路径 | 关键断言建议 |
|------|------------|
| `/knowledge` | 知识库列表渲染（mock 其 API）；条目可点开 |
| `/models` | 模型列表渲染；空态或增删改入口存在 |
| `/mcp-market` | MCP 服务器列表渲染；启用/停用开关交互（mock） |
| `/alerts` | 预警规则列表渲染；信号类型展示 |
| `/settings` | 设置表单渲染；保存交互（mock PATCH，断言请求体） |
| `/compare` | 比较工作区空态/来源选择交互 |
| `/thesis` | Thesis 列表渲染（mock GET /api/thesis） |
| `/analysis/AAPL` | 个股页：mock quote/kline → 行情卡渲染（mock 数据） |

**最少 8 个用例（每路径 1 个），若某些路径交互复杂可合并为"渲染 + 主要动作"单用例。**

### 目标 4：验证

- `cd frontend && bun run build` 通过
- `bun run test`（Vitest）全绿
- `bun run test:e2e`（Playwright）全绿——**16 + 新增 ≥ 19 个用例**（chat 6 + discussion 5 + system 8）；注意 e2e 需真实起 dev server（baseURL 4173），确认端口未占用
- 新增 spec 单独跑一遍确认确定性（API 全 mock，不依赖真实网络）
- `git diff --check` 通过

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 本任务标记 `[DONE]`（证据段记录：用例数、build/test/e2e 结果、SSE mock 契约确认）
- `task/CHANGELOG.md` 追加一条（What/Why/Docs/Verification/Risk）

---

## 参考

- `frontend/e2e/core-paths.spec.ts`：mockApi shell 模式（L14-42）、tabTo/expectVisibleFocus 键盘断言、overflow 断言（L270+）
- `frontend/e2e/discover-paths.spec.ts`：SSE 流 mock（notifications/stream）与 URL 重定向断言模式
- `frontend/src/services/sse.ts`：SSE 解析（`event:` / `data:` / 空行分帧）
- `frontend/src/pages/Chat.tsx`：SSE 消费（fetch POST + readSSE，token/done/error 事件，L199-245）
- `frontend/src/pages/Discussion.tsx`：房间创建（POST rooms）+ start fetch SSE（L95-127）
- `docs/API_CONTRACT.md` §多 Agent 讨论：discussion SSE 事件契约

## 验证命令

```powershell
cd frontend
bun run build
bun run test
bun run test:e2e
bun run test:e2e -- --grep "chat|discussion|system"   # 新增 spec 单独跑
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单：新增 `frontend/e2e/helpers.ts`、`chat-paths.spec.ts`、`discussion-paths.spec.ts`、`system-pages.spec.ts`；同步本任务卡、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`。未修改 `frontend/src`、后端、schema、认证、依赖或 `reference/`。
- 用例数：chat / discussion / system = 6 / 5 / 8，共新增 19 个确定性 Chromium E2E；所有 `/api/**` 均由共享 helper 拦截，未声明请求固定返回 404，不依赖真实网络。
- E2E 总结果：新增 3 个 spec 聚焦运行 19 passed（14.1s）；完整 Playwright 为既有 16 + 新增 19 = 35 passed（33.4s）。
- SSE mock 契约确认：Chat 使用 `token(贵州茅台)` → `token(今日收涨)` → `done(message_id=11, token_count=245)` 及 `error(上游失败)`；Discussion 使用 `agent_start(round=1)` → `token(我认为...)` → `agent_end(message_id=31, token_count=320)` → `done(room_id=9)` 及 `error(讨论上游失败)`。全部使用 `event:` + `data:` + 空行分帧，并返回 `Content-Type: text/event-stream; charset=utf-8`。
- 其余验证：Bun 不在当前 PATH，已逐项运行 `bun run build` 的等价脚本：OpenAPI TypeScript freshness 59 schemas、`tsc -b`、Vite production build（4,237 modules）均通过；全量 Vitest 63 files / 198 tests passed（509.23s）；`git diff --check` 与修改白名单检查通过。
- 发现的真实缺陷或未完成项（只记录，业务 bug 不修）：当前 Discussion 消费 `token` / `agent_end` 帧并可由 `done` 正常结束，但 `InvestmentCommittee` 未渲染讨论中的 token 文本、轮次标签或 agent_end 时间线；本任务按约束仅以“事件被消费、状态不挂起、done/error 正常收束”建立回归合同，未修改业务组件。
