# AIOS-088 - 产品运行一致性与信号空状态修复

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

本地首页不再请求不存在的信号摘要端点或把 404 静默伪装成空数据；在没有可审计的跨标的聚合来源时明确显示 `UNKNOWN` 并引导用户运行具体标的分析。Local doctor 能识别运行镜像早于当前业务源码的情况，避免产品化成果再次被旧镜像遮蔽。

## 前置

AIOS-087 已完成；维护者已于 2026-08-16 明确授权自主执行本项维护。当前运行验收发现 `/api/signals/summary` 返回 404，且旧 Docker 镜像曾使 Phase 0 页面覆盖当前源码。

## 允许修改

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/services/analysisApi.ts`
- `frontend/src/types/index.ts`
- `frontend/tests/Dashboard.test.tsx`
- `frontend/e2e/dashboard.spec.ts`
- `scripts/local.ps1`
- `docker/nginx.local.conf`
- `docs/LOCAL_DATA_AND_PRIVACY.md`
- `docs/ai/PRODUCTIZATION_PLAN.md`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-088.md`

## 禁止修改

- backend 业务代码、数据库/schema、依赖、Dockerfile/Compose、认证或架构不变量
- `reference/`、用户数据、外部服务、CI、LICENSE
- 为填充首页而编造市场级信号聚合，或使用未被当前写链路填充的旧表冒充实时信号
- commit、push、发布或部署

## 完成标准

- Dashboard 不再请求 `/api/signals/summary`；删除仅服务该死端点的客户端与类型。
- 市场信号区域明确显示 `UNKNOWN`、不存在可审计的跨标的聚合，并提供进入个股分析的可执行动作。
- `scripts/local.ps1 doctor` 比较当前 frontend/backend 镜像创建时间与各自构建输入的最新修改时间；新鲜镜像为 PASS，旧镜像为 WARN，且 WARN 不阻止 `up --build` 自我修复。
- 本地入口 HTML 使用 `no-cache`，哈希资源继续长期 immutable，后续重建不会因旧入口缓存继续引用上一版 bundle。
- 产品能力矩阵统一为当前六组导航与任务优先 Dashboard，不再同时陈述 Phase 0 旧状态和完成状态。
- focused frontend tests、完整前后端门禁、Local doctor、重建后 E2E 与内置浏览器三任务首屏及 404 回归通过。

## 验证声明

Local doctor 的时间戳比较是本地陈旧镜像检测，不是供应链签名或可复现构建证明。Dashboard 的 `UNKNOWN` 表示当前没有权威跨标的聚合合同，不代表近期没有技术事件。

## 完成证据

- Dashboard 删除 `/api/signals/summary` 客户端、类型、状态、Marquee 和静默 catch；显式显示 `UNKNOWN`、边界说明与 600519 分析入口。focused 5 passed；最终前端 52 files / 166 tests passed。
- E2E 删除伪造的信号摘要 mock，并记录请求路径确认不访问死端点；最终串行 11/11 passed。
- backend 标准命令受现有 `backend/.env` 的 `LOCAL_ONLY_MODE=true` 影响为 528 passed/8 failed、coverage 83.14%；仅对测试进程显式覆盖 `LOCAL_ONLY_MODE=false` 后 536 passed、coverage 84.19%。未修改用户 `.env` 或 backend 文件。
- Ruff、mypy 120 source files、TypeScript 与生产构建通过；Docker 最终构建 4190 modules，Nginx 配置检查通过。
- Local doctor 在修改后/重建前准确报告 frontend stale WARN，重建后 backend/frontend freshness 均 PASS；WARN 不阻断 `up --build`。
- `index.html` 返回 `Cache-Control: no-cache`，哈希入口资源返回 `public, max-age=31536000, immutable`。旧无策略缓存经一次标准 reload 过渡后，内置浏览器再次打开纯 `http://127.0.0.1:5173/` 即显示新 UNKNOWN 状态；旧文案不存在，任务启动台可见，console error/warn 为 0，修复动作进入真实 `/analysis/600519`。
- 未新增端点、schema、依赖或金融数值；未修改 `reference/`，未 commit/push/publish。
