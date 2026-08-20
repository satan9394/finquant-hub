# AIOS-080 - Local OSS v1 产品层级与发布合同重置

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

项目近期目标明确为 GitHub 可开源、个人电脑可安装自用的 local-first 研究系统；不再用公网分享、社区增长、作者市场或 SaaS 运营能力阻塞本地可用版本。

## 允许修改

- `docs/ai/PROJECT_CONTRACT.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-080.md`
- `docs/ai/tasks/AIOS-081.md`

## 禁止修改

- 业务代码、依赖、数据库、Docker/runtime 配置、README、CI、`reference/`
- commit、push、release、部署或任何外部写操作

## 完成标准

- 明确目标用户、运行位置、支持边界和 Local OSS v1 可验证退出门槛。
- 公开分享、Remix、作者/模板市场、多租户 SaaS 和增长任务改为 PARKED，不删除既有设计成果。
- 盘点当前本地安装、Docker、README、CI、许可和发布缺口，并形成按依赖排序的 AIOS-081～085。
- 下一项 AIOS-081 是唯一 READY；不得把静态文档核对描述成 clean-clone 或真实安装验证。

## 完成证据

- 当前已有 `docker-compose.local.yml`、`scripts/local.ps1`、loopback 端口、named SQLite volume 与 GitHub Actions，可直接复用。
- 当前 README 的 134 operations/schema v11 等信息已落后于运行时 168 operations/schema v23；只提供 PowerShell 启动器、没有 doctor；根目录没有 LICENSE。
- `docker compose --env-file .env.local -f docker-compose.local.yml config --quiet` 当前通过，Docker client/server 均为 29.1.3；这只证明现有工作树 Compose 可解析，不是 clean-clone 构建或启动证据。
- `PROJECT_CONTRACT.md`、长期计划与 `EXEC_PLAN.md` 已同步 Local OSS v1，并将 AIOS-071～073 标为 PARKED。

## 回退

撤销本任务文档修改即可；没有 runtime、数据库或外部状态需要回滚。

## 验证声明

本任务是范围与事实审计，不证明陌生用户已经可以安装、Docker image 可以重新构建、外部数据源可用或项目已具备开源许可证。
