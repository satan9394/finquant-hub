# TASK-026 全系统真实用户级 E2E 验证

验证日期：2026-08-06（America/Los_Angeles）  
结论：**通过，可以进入部署配置验收；未授权公网发布。**

## 1. 隔离环境

- 后端：从当前工作区构建 `finquant-hub-e2e-backend` Docker 镜像，监听 `127.0.0.1:18000`。
- 数据库：容器 `/app/backend/data` 绑定到 Windows 临时目录
  `finquant-task026-8f88b8d477164f2ca34679f423d10063`；未挂载、复制或修改
  `backend/data/finquant.db`。
- 前端：Vite `127.0.0.1:5173`，代理到隔离后端。
- 用户：`userA@test.local`（首用户/admin）与 `userB@test.local`。
- 邮件：development 模式未配置 SMTP，验证码只写结构化本地日志；符合任务卡要求。
- 外部调用：真实行情源与已配置的 DeepSeek 端点，没有替换为测试桩。

## 2. 验证清单

### 2.1 认证

- [x] 未登录访问 `/` 显示登录页。
- [x] userA 请求本地日志验证码并登录；`GET /api/auth/me` 刷新会话成功。
- [x] userB 独立注册、登录。
- [x] 错误验证码连续 5 次均为 401；随后提交原正确码仍为 401（验证码已锁定）。
- [x] userA 登出后 `GET /api/auth/me` 为 401。
- [x] 22 个业务 router 统一要求会话；仅 auth 与 health 保持公开。

### 2.2 userA 核心功能

- [x] Dashboard：统计卡片、大屏概览、实时组合排行、自选导入入口均可见。
- [x] 行情：`600519` 搜索、实时报价、120 根 K 线、技术指标均返回真实数据。
- [x] 组合：创建 `A E2E Portfolio`，加入贵州茅台 10 股，实时市值/盈亏成功展示。
- [x] 投研：四大师 SSE 完成，共收到 40 个事件；持久化报告含 13 章。
- [x] 报告查看/导出：详情 200；Markdown 导出 8,271 bytes。
- [x] 论文：从报告一键创建，列表/详情可见，生成 5 条 claims 状态。
- [x] Chat 回测：v1 `ma_cross` 完成并返回权益曲线。
- [x] StrategyLab：v2 双均线后台状态到 `completed`，权益曲线可见。
- [x] 选股：`600519`、`000001` 两阶段筛选均得到 2 条结果。
- [x] 预警：创建均线金叉规则、列表可见、成功停用。
- [x] Alpha：字段检索返回结果；浏览器显示 4,367 个字段目录。
- [x] 讨论：创建三角色、1 轮讨论，SSE 完成并持久化 3 条 Agent 消息。
- [x] 智能导入：剪贴板文本导入 2 条；CSV 导入 1 条。
- [x] 设置：角色创建成功；模型创建成功并显示“已安全保存”。
- [x] 凭据：Tushare/Tavily 测试密钥写入成功；PUT、列表与浏览器 DOM 均不含明文。

### 2.3 双向数据隔离

| 资源 | 列表隔离 | userB 访问 userA ID | userA 访问 userB ID |
|---|---|---:|---:|
| 组合 | 通过 | 404 | 404 |
| 研究报告 | 通过 | 404 | 404 |
| 投资论文 | 通过 | 404 | 404 |
| 预警规则 | 通过 | PUT 404 | PUT 404 |

补充：userA/userB 分别通过真实 API 创建上述资源；任何跨用户响应均未返回资源内容。

## 3. Router 与 SQL 归属审计

- `main.py` 的 22 个业务 router 统一挂载 `authenticated_context`，防止单个 router
  漏写认证依赖。
- `database._OWNER_TABLES` 的 25 张业务表逐项扫描；`user_credentials` 单独以
  `user_id + UNIQUE(user_id, service)` 约束，合计 26 张 user-owned 表。
- 扫描所有 `query_one/query_all/execute/executemany` 调用后，业务读写均显式带
  `user_id` 或使用从 `user_id` 初始化的动态 `WHERE`：
  - `backtests.list_backtests`：`clauses = ["user_id=?"]`；
  - `usage.get_usage`：共享 `where` 固定含 `user_id=?`；
  - `alerts.list_triggers`：`clauses = ["user_id=?"]`。
- 无 `user_id` 的命中仅为 schema/migration、首次 admin 认领前的模型 seed、FTS 索引同步；
  FTS 查询通过 `messages.user_id` 与 `conversations.user_id` 双重过滤。

## 4. 发现与修复

1. **P0：部分业务 API 未认证**
   - 现象：`/api/agents`、`/api/mcp`、`/api/screening`、`/api/wq` 可匿名访问。
   - 修复：auth router 单独公开；其余 22 个业务 router 在注册点统一增加认证上下文。
   - 回归：逐 router 匿名请求必须返回 401；旧 Alpha/MCP 测试显式注入测试用户。

2. **P0：Vite 代理破坏 CSRF 同源判断**
   - 现象：浏览器可读，但保存凭据返回 403“跨站请求已拒绝”；Vite 的
     `changeOrigin: true` 把后端 Host 改为目标端口，与浏览器 Origin 不一致。
   - 修复：开发代理保留浏览器 Host（`changeOrigin: false`），不放宽服务端 CSRF。
   - 回归：配置测试锁定代理行为；浏览器在 5173 成功保存 Tavily 凭据且不回显明文。

3. **E2E 契约漂移**
   - 现象：Dashboard Playwright 未模拟 `/api/auth/me`，并仍期望旧的补零 KPI。
   - 修复：增加正确的 `{user: ...}` 响应并同步当前 KPI 文本；Playwright 1/1 通过。

4. **论文重复 key 警告**
   - 现象：两个相同的 unknown 假设产生 React duplicate-key 警告。
   - 修复：假设行使用稳定的索引+内容 key，避免重复节点被省略。

5. **登录恢复 Spin 警告**
   - 现象：Ant Design `Spin tip` 未使用 nested/fullscreen 模式，导致浏览器 E2E 报错。
   - 修复：恢复会话 loading 只显示标准 Spin，不过滤 console error。

## 5. 最终门禁与变化

| 检查 | 结果 |
|---|---|
| Backend pytest | 369 passed |
| Backend coverage | 83.45%（门槛 80%） |
| Ruff | All checks passed |
| mypy | 107 source files，0 issues |
| Frontend Vitest | 11 files / 30 tests passed |
| Frontend Playwright | 1 passed |
| Frontend build | 4,147 modules transformed，成功 |
| `git diff --check` | 通过（仅 Windows LF/CRLF 提示） |

变化：backend 368 → 369（+1 router 认证回归），coverage 83.45% → 83.45%
（+0.00pp）；frontend 29 → 30（+1 Vite/CSRF 配置回归）。既有 Playwright 用例修复，
数量仍为 1。生产构建保留既有 >500 kB chunk 警告，不影响本任务验收。

## 6. 部署前仍需运营配置

- 生成并离线备份固定 `MASTER_KEY`；本次隔离环境使用 development 临时 key。
- 配置并实测 SMTP、TLS 证书、`APP_ENV=production` 与 Secure Cookie。
- 按 `docs/DEPLOY.md` 完成公网健康检查与备份/恢复演练后再发布。

