# BACKLOG-010 — Chat 深交互 E2E + 后端残余薄点攻坚（综合）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-08-31 ｜ 执行者：Codex
> 背景：现有 `chat-paths.spec.ts` 6 个用例覆盖 Chat 基础（空态/创建/SSE 流式/error/空消息/旧路由重定向），但 **Chat 的会话管理交互零浏览器覆盖**：角色切换（`handleChangeRole` → `PUT /chat/sessions/{id}`）、删除会话（`handleDeleteSession`）、历史会话恢复（多会话列表切换）、角色预选（agents 列表首项默认选中）。后端覆盖率 90.6% 后仍有残余薄点：`routers/analysis.py` 61.7%（SSE 路由）、`services/instruments.py` 63.4%、`services/alpha_service.py` 70.6%、`agent/tools_definitions.py` 74.5%（246 语句）、`services/chip_distribution.py` 73.8%。
>
> 本任务 = **Chat 深交互 E2E（主，用户价值）** + **后端残余薄点攻坚（次，覆盖率）**，二合一。

---

## 允许修改

- `frontend/e2e/chat-paths.spec.ts`（增强：新增深交互用例）
- `frontend/e2e/helpers.ts`（如需扩展 mock）
- `backend/tests/*.py`（残余薄点确定性补测）
- `docs/ai/tasks/BACKLOG-010.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `frontend/src/`、`backend/app/` 业务代码——**纯测试**，发现 bug 只记录
- 数据库、schema、认证、依赖、锁文件、`reference/`

---

## 完成标准

### 目标 1：Chat 深交互 E2E（主，≥5 个新用例）

在 `frontend/e2e/chat-paths.spec.ts` 新增（参考既有 mock 模式与 `frontend/src/pages/Chat.tsx` 的交互实现）：

1. **角色切换**：`GET /api/agents` 返回多个预设 → 切换角色下拉 → 断言 `PUT /api/chat/sessions/{id}` 请求体 `{ role_preset: '新角色' }` + 成功提示（mock PUT）
2. **删除会话**：多会话列表 → 删除当前会话 → 断言 `DELETE /api/chat/sessions/{id}` 发出 + 列表移除/空态
3. **历史会话恢复**：`GET /api/chat/sessions` 返回 2+ 会话 → 切换会话 → 断言 `GET /api/chat/sessions/{id}/messages` 请求了正确的 id + 历史消息渲染
4. **角色默认预选**：agents 列表首项 → 新会话请求体 `role_preset` 等于首项 role_key（`frontend/src/pages/Chat.tsx` L83 逻辑：`setSelectedRole(res.data.items[0].role_key)`）
5. **多会话并发状态隔离**（可选加分）：会话 A 有流式回复、切到会话 B 再切回 A → A 的消息保留（store 按 sessionId 隔离）

**要求**：
- 所有 API mock 确定性（复用 helpers.ts 的 mockApi/fulfillSSE）
- 断言落到**请求体/请求方法/路由参数**（如 `PUT /api/chat/sessions/7` 的 body），不只 UI 可见
- 若 Chat 交互实现有真实缺陷（如角色切换没调 PUT），**只记录不修**

### 目标 2：后端残余薄点攻坚（覆盖率 90.6% → ≥ 92%）

用 `pytest --cov=app --cov-report=term-missing` 测量，`TOTAL` ≥ 92%。优先攻克：

| 靶点 | 当前 | 建议方向（Missing 行号参考） |
|------|------|------------------------------|
| `routers/analysis.py` | 61.7%（103 语句/35 未覆盖） | SSE 全量分析端点（analyze_stock）的成功/失败分支、indicators/chart-data 各分支 |
| `services/instruments.py` | 63.4% | 统一标的接口：workspace 读写、元数据溯源、snapshot/bars/fundamentals 各分支 |
| `services/alpha_service.py` | 70.6% | 字段搜索、模板、coverage、缺失目录降级 |
| `agent/tools_definitions.py` | 74.5%（246 语句/54 未覆盖） | 工具 run 分支：各工具的校验失败/成功路径（多数已 mock MarketDataService 可测） |
| `services/chip_distribution.py` | 73.8% | 筹码分布计算：获利比例/集中度/边界 |
| `routers/agents.py` / `credentials.py` / `models_crud.py` | 75-79% | 各路由分支、错误态 |

**硬性要求**：
- 确定性（mock 所有外部 I/O，参考 `test_market_data_degradation.py` / `test_sse_error_paths_backlog004.py` / `test_backlog007_targets.py` 既有模式）
- 开/关代理双环境结果一致
- 每个靶点补测后聚焦 + 全量回归

### 目标 3：验证

- 前端：`cd frontend && bun run build` 通过；`bun run test` 全绿（116 files 基线 + 新增）；`bun run test:e2e` 全绿（36 基线 + 新增 ≥5）
- 后端：`backend\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider` 全绿（710 + 新增）
- 覆盖率：`--cov=app --cov-report=term-missing` → `TOTAL ≥ 92%`
- 确定性：开/关代理各跑新增后端测试一致
- `backend\.venv\Scripts\python.exe -m ruff check backend/tests` 通过；`git diff --check` 通过

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：Chat E2E 用例清单、覆盖率前后对比、双环境确定性）
- `task/CHANGELOG.md` 追加一条

---

## 参考

- `frontend/e2e/chat-paths.spec.ts`（既有 6 用例 + mock 模式）
- `frontend/src/pages/Chat.tsx`：handleChangeRole L132-137（PUT /chat/sessions/{id}）、handleDeleteSession L121、handleNewSession L107、角色预选 L83
- `backend/tests/test_sse_error_paths_backlog004.py`（路由级确定性 SSE 测试）
- `backend/tests/test_backlog007_targets.py`（router/service direct call + SimpleNamespace mock）

## 验证命令

```powershell
# 前端
cd frontend
bun run build
bun run test
bun run test:e2e
cd ..
# 后端
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（前端 E2E / 后端测试）：
- Chat 深交互用例清单（断言了什么请求体/路由）：
- 覆盖率 TOTAL 90.6% → ?%；后端新增测试数；完整套件结果
- 开/关代理确定性验证：
- 前端 Vitest / E2E 总结果：
- 备注（发现的真实业务缺陷，只记录）：
