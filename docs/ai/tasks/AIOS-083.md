# AIOS-083 - 隔离发布源安装、持久化与恢复演练

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

维护者可以用一条可重复的本地验证脚本，在不影响现有 FinQuant Hub 容器和数据的独立 Compose project 中构建、启动并检查当前发布源；证据覆盖浏览器入口、SQLite volume 持久化、非覆盖备份/恢复和 schema 升级边界。

## 允许修改

- `scripts/verify_local_install.ps1`（新建）
- `scripts/tests/verify_local_install_contract.ps1`（新建）
- `README.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-083.md`
- `docs/ai/tasks/AIOS-084.md`（仅在完成后创建）

## 禁止修改

- backend/frontend 业务代码、数据库/schema、Compose/Dockerfile、启动器、依赖、CI、生产部署、`reference/`
- 使用当前默认 project/5173/现有 volume、访问真实模型/行情上游、读取或输出业务正文/密钥
- 删除任何 volume/data、自动执行 `down -v`、永久删除临时文件、commit、push、release、部署或外部写操作

## 完成标准

- 验证脚本使用固定 allowlist 的独立 Compose project、自动选择的空闲 loopback 端口、临时 env 和独立 named volume；先核对目标，绝不触碰当前默认栈。
- 真实执行 Docker image build、up 和健康等待；验证 frontend HTTP 200、backend health、local-only 无登录入口以及 `local-capabilities/v1` 的无 key 降级状态。
- 在隔离 SQLite 写入无金融内容的 persistence probe，经 `down`（无 `-v`）和再次 `up` 后仍可读取；记录 schema v23/逻辑表数，不输出用户业务内容。
- 使用 SQLite online backup 生成全新 backup/restore 文件，验证 `integrity_check`、schema version、逻辑 fingerprint 一致和 existing target non-overwrite；volume 及证据保留，不自动删除。
- 复用既有迁移测试验证旧 schema -> v23；明确 fixture/migration test 不是生产升级或 GitHub clean-clone 证据。
- 合同测试、PowerShell parser、focused migration/recovery pytest、Ruff、Compose config、隔离运行脚本、HTTP/DB 证据与 diff check 通过。

## 回退

撤销验证脚本、README 与计划文件；隔离 Compose project 应只执行不带 `-v` 的 `down`，named volume 保留并在报告中给出准确名称，不自动删除。

## 验证声明

由于当前工作树包含未提交修改且用户禁止 commit，本任务验证“当前发布源的隔离安装候选”，不是从 GitHub 已提交 SHA 获得的 clean clone。真实 clean-clone、发布包和 GitHub Release 只能在得到提交/发布授权后于 AIOS-085 形成证据。

## 完成证据

- `scripts/verify_local_install.ps1` 真实构建 backend/frontend images（frontend frozen install + TypeScript/Vite production build），以随机 project 和 55173 loopback 端口启动；health、frontend HTTP 200、local owner、邮箱登录 404 均通过。
- 隔离 API 返回 `local-capabilities/v1`：AI `UNCONFIGURED/UNKNOWN`、行情 `RUNTIME_CHECK_REQUIRED/UNKNOWN`；未调用真实模型或行情上游。
- 隔离 SQLite 为 schema v23/52 张逻辑表；无金融内容的 persistence probe 经不带 `-v` 的 `down`/`up` 后保留。online backup 与 restore 使用 exclusive-create，logical fingerprint、两侧 `integrity_check` 和 schema version 一致，existing target 覆盖被拒绝。
- 最新证据 project `finquant-hub-aios083-20260813122704-d126ae` 已停止且容器数 0；volume `finquant-hub-aios083-20260813122704-d126ae_finquant-local-data` 保留。默认 backend/frontend ID 仍为 `033b64781258`/`b2a2ab7be0c1` 且 healthy。
- verifier contract/parser、Compose config、迁移/恢复 focused 18 passed、全 backend Ruff、diff check 通过。未提交工作树不构成 GitHub clean-clone 证据。
