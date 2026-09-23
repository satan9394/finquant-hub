# AIOS-086 - 可分发 Alpha starter catalogue 与公开源码树

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

个人维护者不必删除私有开发树里的参考仓库或许可未知 WQ catalogue，也能生成一份不含这些内容的独立公开源码树；该树仍可本地启动并使用五个核心 Alpha 模板，同时明确目录只是 PARTIAL starter，不冒充 4,367 字段完整目录。

## 允许修改

- `backend/app/services/alpha_service.py`
- `backend/app/routers/wq.py`
- `backend/tests/test_alpha_service.py`
- `backend/tests/test_alpha_search.py`
- `backend/tests/test_alpha_templates.py`
- `frontend/src/services/alphaApi.ts`
- `frontend/src/pages/AlphaResearch.tsx`
- `frontend/tests/AlphaResearch.test.tsx`
- `scripts/export_public_source.ps1`（新建）
- `scripts/tests/public_source_export_contract.ps1`（新建）
- `README.md`
- `docs/PUBLICATION_BOUNDARY.md`（新建）
- `docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-085.md`
- `docs/ai/tasks/AIOS-086.md`

## 禁止修改

- `reference/`、`backend/app/data/wq_fields.json`、LICENSE、数据库/schema、Docker/Compose、依赖、CI、生产部署
- 将 starter 字段描述成 WorldQuant 官方/完整数据，补造 coverage/region/许可，或把文件存在描述成再分发授权
- 修改 Git index、commit、push、创建远程仓库/Release、部署或其他外部写操作
- 自动删除导出树、证据 volume 或临时文件

## 完成标准

- 项目自有 starter catalogue 只包含五个既有模板所需的通用字段 ID 与项目编写说明；coverage 保持 null，source/quality/redistribution 状态明确。
- 完整 JSON 存在且可解析时返回 `BUNDLED_EXTERNAL/OK/UNKNOWN`；缺失或无效时返回 `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`，五个模板仍可用。
- `/wq/search|fields|categories|templates` 返回版本化 catalogue metadata；前端显式展示 PARTIAL 或再分发 UNKNOWN，不把配置/文件存在冒充许可或上游验证。
- 公开源码导出器要求目标不存在且位于项目外；从当前 worktree allowlist 复制，排除 `.git`、`reference/`、完整 WQ JSON、env/DB、依赖、构建/测试产物和私有工作目录；生成含 SHA256 与排除计数的 manifest，不输出 secret。
- 实际导出树中 `reference/`、WQ JSON、`.git`、env/DB 为 0；运行 backend focused、frontend focused、Ruff/mypy/TypeScript/build、导出合同/manifest/diff check。
- 从导出树真实执行隔离 Docker build/start，验证 health、local-only、Alpha metadata 为 PARTIAL、五模板、持久化/backup/restore；不称为 GitHub commit clean clone。
- 完成后将 AIOS-085 的 reference/WQ 阻塞改为已验证公开导出边界；LICENSE 与候选 commit 授权仍保持 BLOCKED。

## 回退

撤销 starter/status/UI/导出器和文档；私有完整 WQ JSON、`reference/`、数据库与默认 Docker 栈均未修改。导出证据按安全规则保留，不自动删除。

## 验证声明

starter catalogue 是 FinQuant Hub 自有的最小字段合同，不是 WorldQuant 数据、真实 coverage 或 BRAIN 可用性证据。公开源码树来自 dirty worktree 的 allowlisted snapshot，不是已提交 SHA、GitHub clone 或法律许可完成证明。

## 完成证据

- backend focused 18 passed（含缺失与无效 JSON 降级）；frontend focused 5 passed；Ruff 通过；mypy 120 个源文件通过；TypeScript 与生产 build 通过。
- public export contract 通过并逐文件复核 SHA256；最终验证快照 605 文件，tree SHA256 `84b944b7bc960ec74e83e68d1d4b2a9ae70dd98936e6385caf36c831c82267a9`，`reference`/WQ 排除计数分别为 14,246/2，实际禁入文件为 0。
- 从项目外快照真实 Docker build/start；health、frontend、local-only/no-key、schema v23/52 表、down/up 持久化、non-overwrite backup/restore 全通过。运行时 `/api/wq/templates|fields` 返回 `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`、8 字段、5 模板、coverage 全为 null。
- 最终证据目录 `C:\Users\Satanchen\AppData\Local\Temp\finquant-hub-public-source-20260813131827-700f80` 与 volume `finquant-hub-aios083-20260813131837-dce432_finquant-local-data` 均保留；隔离容器已停止。默认 Docker 栈与 `reference/` 未修改。
