# AIOS-085 - Local OSS v1 发布候选门禁

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

从一个明确许可、可合法分发且已提交的 SHA，在隔离 clean clone 中完成安装、迁移、持久化、完整质量门禁和发布说明；只生成本地候选证据，不自动推送或发布。

## 已解除阻塞

2026-08-13 @Satanchen 已明确授权创建许可证、版权主体和范围受控的本地候选 commit。按既有决策包的工程推荐，采用 Apache-2.0，版权声明为 `Copyright 2026 Satanchen`；候选 commit 仅在独立公开源码树中创建，不修改私有开发仓库 index，不 push、不发布。

## 已解除的工程阻塞

候选 `a880ddd7cd09060f0f7ef715eb7eeba5bd218824` 的真实 clean-clone 全量 pytest 曾为 529 passed/7 failed、coverage 84.16%。AIOS-087 已修正私有 WQ catalogue 与未发布公网 Compose 的旧测试假设，私有/公开 focused 双模式通过；现重新生成候选并运行全门禁。

AIOS-086 已解除原第三方发布物阻塞：公开源码采用 allowlisted export，明确排除 `reference/`、完整 WQ JSON/summary、用户数据与构建产物；无扩展文件时项目自有 starter 以 `PARTIAL` 维持五模板。私有文件许可仍为 `UNKNOWN`，但不会进入候选发布树。

## 解除后允许修改

- 维护者明确指定内容的 `LICENSE`
- `README.md`、`CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`
- `.gitattributes`、`.gitignore`、`.dockerignore`（只用于已决定的发布边界，不修改 `reference/` 内容）
- `scripts/verify_local_install.ps1` 及 release audit/manifest 脚本与测试
- `docs/LOCAL_DATA_AND_PRIVACY.md`
- `docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-085.md`

## 禁止修改

- 未经明确决定的 LICENSE/版权、`reference/` 内容、业务代码/数据库/架构/依赖
- 自动 push、GitHub Release、部署、包发布或其他外部写操作
- 把当前 dirty-worktree build、fixture、mock、静态检查或本地 migration test 描述为 GitHub clean clone/真实上游/生产升级

## 完成标准

- root LICENSE 与第三方分发清单无 BLOCKED；readiness audit PASS 或只有已接受 WARN。
- 从维护者授权的候选 SHA 建立真实隔离 clean clone，运行 doctor、build/start、local-only/no-key、持久化、backup/restore 和旧 schema upgrade。
- 完整 backend pytest coverage、Ruff、mypy、frontend tests、TypeScript/build、Playwright E2E 与 Markdown/YAML/security scans 全通过。
- 发布说明包含安装、升级、备份、回退、数据/模型/行情 UNKNOWN 边界、已知限制、支持范围和校验 SHA；不编造真实上游可用性。
- 只生成本地证据并停止候选容器；未经额外明确授权不 push、不创建 GitHub Release、不部署。

## 验证声明

2026-08-13 在独立公开源码候选 `18bca55a2ba6be5b55d27401afd324d15e61ccff` 的真实 clean clone 完成工程门禁：readiness `PASS/BLOCKED=0/WARN=0`；backend 535 passed/1 explicit skip、coverage 84.16%、Ruff 与 mypy 120 files；frontend 52/52 test files（时间敏感用例隔离重试通过）、TypeScript/production build、Playwright 串行 11/11；YAML 6、Markdown links 11；PowerShell/Bash doctor PASS。真实隔离 Compose 演练通过 build/start、health、HTTP 200、local-only/no-key、schema v23/52 表、down/up 持久化与非覆盖 backup/restore，候选容器已停止，证据 volume 保留；旧 schema migration/recovery focused 18/18 通过，属于本地隔离验证而非真实生产升级。最终状态同步后会从同一 allowlisted export 生成新的本地候选 SHA 并重跑门禁；不 push、不发布、不部署。

原私有开发仓库 index 保持 staged=0，未修改或导出 `reference/`；当前仅剩显式 `[BLOCKED]` ADR/第三方 PoC 与 `[PARKED]` 公网运营任务，不创建新的 `[READY]` 来绕过这些决定。
