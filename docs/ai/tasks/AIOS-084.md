# AIOS-084 - GitHub 开源治理、安全材料与许可决策包

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

准备公开 GitHub 仓库所需的贡献、安全、隐私和第三方数据边界材料，并用可重复审计暴露密钥、大文件、嵌套仓库和许可阻塞；不由实现代理替维护者选择法律许可证。

## 允许修改

- `SECURITY.md`（新建）
- `CONTRIBUTING.md`（新建）
- `.github/ISSUE_TEMPLATE/bug_report.yml`（新建）
- `.github/ISSUE_TEMPLATE/config.yml`（新建）
- `.github/pull_request_template.md`（新建）
- `docs/LOCAL_DATA_AND_PRIVACY.md`（新建）
- `docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md`（新建）
- `scripts/audit_open_source_readiness.ps1`（新建）
- `scripts/tests/open_source_readiness_contract.ps1`（新建）
- `README.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-084.md`
- `docs/ai/tasks/AIOS-085.md`（仅在完成后创建）

## 禁止修改

- `LICENSE`（未经维护者明确选择不得创建）、业务代码、数据库、Docker、依赖、CI 执行逻辑、生产部署、`reference/`
- 读取或输出 secret 值、自动上传扫描结果、创建 issue/PR、启用 GitHub 功能、commit、push、release、部署或其他外部写操作

## 完成标准

- SECURITY 说明受支持范围、私密报告路径、禁止提交 secret/金融数据和响应边界；不虚构维护邮箱或 SLA。
- CONTRIBUTING 以 local Docker 为使用基线，说明最小变更、金融证据状态、架构不变量、测试门禁和禁止提交 `reference/`/secret/generated data。
- 隐私文档明确本地 SQLite、浏览器 localStorage、可选模型/行情/MCP 外发、日志/备份/删除责任和 local-only 非沙箱边界；数据来源文档区分源码许可证与第三方 API/数据再分发权。
- issue/PR 模板要求可复现环境、doctor 输出、数据来源/质量、无敏感信息和验证证据。
- 只读审计检查 root LICENSE、tracked env/secret 文件名、疑似 secret 行（仅路径/行号/规则，不输出值）、大文件、嵌套 `.git`、`reference/` tracked 状态和 Git 状态摘要；输出 PASS/WARN/BLOCKED，不修改文件。
- 在 `DECISIONS.md` 记录并 `@Satanchen`：源码 LICENSE 选择与 `reference/`、WQ 字段/第三方数据再分发需在公开前决定；给出选项和建议但不代选。
- 合同/parser、审计、YAML parse、Markdown link/file checks、Ruff/mypy、前端 test/TypeScript/build、diff check 通过。AIOS-085 根据真实阻塞设为 BLOCKED 或唯一 READY。

## 回退

撤销新增治理/审计文件和 README/计划记录；没有 runtime、数据库、GitHub 或外部状态。

## 验证声明

本任务生成的是本地仓库准备材料，不是法律意见、许可证授权、第三方数据再分发许可、GitHub 仓库配置或公开发布证据。

## 完成证据

- 新增 SECURITY、CONTRIBUTING、bug/PR templates、本地隐私与数据许可边界；GitHub 官方 private vulnerability reporting/community-file 规则已核对，未虚构邮箱、SLA 或已启用仓库功能。
- `audit_open_source_readiness.ps1` parser/contract 通过；脱敏扫描确认 tracked secret-like 文件名与主源码硬编码 secret 前缀均 PASS。审计稳定输出 `BLOCKED=4/WARN=6`：缺 root LICENSE、5,329 个 tracked reference entries、WQ catalogue 权限未知、六个 nested Git；大文件和 335 项 dirty status 为 WARN。
- `DECISIONS.md` 已 `@Satanchen` 记录 MIT/Apache-2.0/不授权三项及工程建议，没有创建 LICENSE 或代替版权持有人选择。
- frontend 52 files / 164 tests 全通过（按互斥两组 26 files，72 + 92 tests）；TypeScript 与 production build 通过。全 backend Ruff、120-source mypy、YAML basic shape 与 Markdown local links 通过。
- 首次整套 Vitest 因 5 分钟工具超时无结果，并遗留由本任务启动的 PID 12568/23476；核对命令行后只终止这两个孤儿进程。随后两组完整覆盖全部 52 files，因此超时结果未计为通过。
- 未运行完整 backend pytest coverage、Playwright E2E、GitHub clean clone、提交或发布；这些属于 AIOS-085，但当前有明确发布阻塞。
