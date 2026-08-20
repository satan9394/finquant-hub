# AIOS-082 - 首次启动与可选能力降级

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

无模型 key 的本地用户可以正常进入系统，并在首页看到哪些本地能力可用、哪些 AI 能力尚未配置、哪些外部数据只能在实际请求时判断；配置项存在不再被误报为真实连通，修复动作直接进入现有模型管理。

## 允许修改

- `backend/app/routers/models_crud.py`
- `backend/app/routers/dashboard.py`
- `backend/tests/test_api.py`
- `frontend/src/types/index.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/tests/Dashboard.test.tsx`
- `frontend/src/pages/Models.tsx`
- `frontend/tests/Models.test.tsx`（新建）
- `README.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-082.md`
- `docs/ai/tasks/AIOS-083.md`（仅在完成后创建）

## 禁止修改

- 数据库/schema、credential 加密实现、LLM/行情执行路径、Docker、依赖、CI、生产部署、`reference/`
- 启动时自动探测外部模型或行情、写入默认凭据、伪造可用状态、回显 key 或把 mock/static check 称为真实连通性
- commit、push、release、部署或外部写操作

## 完成标准

- 模型列表的 `has_api_key` 只在加密凭据确实存在或声明的环境变量当前非空时为 true；仅有 `api_key_env` 名称不得误报。
- Dashboard stats 返回版本化能力摘要，区分本地核心 `AVAILABLE`、模型 `UNCONFIGURED`/`CONFIGURED_UNVERIFIED`、外部行情 `RUNTIME_CHECK_REQUIRED`；不得把 key 存在描述成上游连通。
- 首页对无 key 用户显示非阻塞提示和模型管理入口；有 key 时仍显示“未验证”，引导用户显式测试。模型管理页明确区分已安全保存、环境变量已载入和等待环境变量。
- 不改变无 key 时的启动、认证或非 AI 路径；API 不返回 secret 或内部 credential 值。
- backend focused pytest、frontend focused test、Ruff、mypy、TypeScript、build、OpenAPI 计数、README/任务文档与 diff check 通过。

## 回退

撤销上述 router/UI/type/test/README 与计划文件；不涉及 schema、用户数据或外部状态。

## 验证声明

配置状态只证明本机配置事实；只有用户在模型管理显式执行连通性测试，才可能形成当次真实模型上游证据。行情状态必须由具体请求的来源、时间和质量字段决定。

## 完成证据

- 修正模型公开状态：仅加密凭据存在或对应环境变量当前非空时 `has_api_key=true`，并只返回 `stored/environment/none` 来源；API 响应不包含 key。
- Dashboard `local-capabilities/v1` 明确返回本地核心 `AVAILABLE/OK`、模型 `UNCONFIGURED` 或 `CONFIGURED_UNVERIFIED/UNKNOWN`、行情 `RUNTIME_CHECK_REQUIRED/UNKNOWN`；首页和模型管理复用 `/models` 修复/显式测试入口。
- backend ModelCRUD + Dashboard focused 8 passed；frontend Dashboard + Models focused 5 passed；Ruff 0、全 app mypy 0、TypeScript 与 production build 通过。
- 运行时 OpenAPI 保持 133 个 `/api/*` 路径、168 个 HTTP 操作；README stale count 扫描与 scoped diff check 通过。
- 没有执行模型/行情上游调用；配置、mock 与构建结果不是真实上游连通性证据。当前 Docker image 未在本任务重建，浏览器运行态留给 AIOS-083 的隔离构建。
