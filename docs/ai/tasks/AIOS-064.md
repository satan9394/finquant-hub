# AIOS-064 - backup/restore 与 memory/evidence consistency audit

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

维护者可用一条离线本地命令把明确指定的 SQLite 数据库备份到新文件、从备份恢复到另一个新文件，并获得不含金融正文或凭据的机器可读一致性报告；恢复演练能证明 canonical evidence、typed memory 和 scheduled/review 逻辑引用没有悬挂、跨用户或双向链接漂移。

## 允许修改

- `backend/scripts/audit_database_recovery.py`（新建）
- `backend/tests/test_database_recovery_audit.py`（新建）
- `docs/ai/DATABASE_RECOVERY_RUNBOOK.md`（新建）
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 生产 database/service/router/schema/API/frontend、项目数据库或真实用户数据、`reference/`
- 覆盖已有 backup/restore 文件、自动删除失败产物、在线替换权威数据库、修改权限
- PostgreSQL、Redis、Celery、外部存储、第二应用数据库连接、ORM、迁移框架或新依赖
- 输出金融正文、memory content、凭据、token、Cookie、API key 或 session 内容
- 自动修复、删除或重新归属损坏记录；审计只能报告

## 完成标准

- runner 要求显式且互不相同的 source/backup/restore 路径；source 必须存在，两个目标必须不存在且父目录已存在，绝不覆盖。
- 使用 SQLite backup API 取得一致 snapshot，再从 backup 恢复为新文件；source 只读，整个过程不连接真实上游、不启动应用、不修改 source。
- source、backup 和 restore 都运行 `PRAGMA integrity_check`、`PRAGMA foreign_key_check`、schema version 与逻辑内容 fingerprint/row-count 对比。
- memory/evidence audit 至少检查：`evidence_objects.inputs_json` 与 `evidence_input_refs` 等价；scheduled run 的 evidence/memory JSON 引用存在且 owner 一致；Thesis review evidence JSON 引用存在且 owner 一致；scheduled run/report 双向链接一致；JSON 列无重复引用且损坏 JSON 以 FAIL 报告而非崩溃。
- 输出版本化 JSON、逐类计数、有限 issue locator 和 PASS/FAIL；不输出任何业务正文或 secret-bearing 列；任一完整性、引用或 snapshot mismatch 返回非零。
- 测试覆盖成功恢复、source 未变化、拒绝覆盖/路径重叠、跨用户/悬挂/重复/损坏 JSON、report backlink 漂移和失败退出状态。
- 在 deterministic 临时数据库上完成至少一次实际 backup -> restore 演练并记录文件大小、fingerprint/row counts、审计结果；演练产物位于临时目录并在验证后安全回收。
- focused pytest、Ruff、mypy、runner、docs/diff check 通过；作为 Phase 6 最后一个可执行任务，完成后运行完整阶段退出门禁。

## 回退

删除新增 runner、测试和 runbook 即可；本任务不修改 schema、生产服务或用户数据。已有演练产物不由 runner 自动删除，维护者按本地保留策略处理。

## 验证声明

演练仅证明当前机器上一个 deterministic schema v23 SQLite snapshot 可备份、恢复并通过定义的一致性检查；不证明外部存储可靠性、跨机器灾备 RPO/RTO、真实生产容量或云端备份策略。

## 完成证据

- 离线 runner 对三个显式 distinct path 使用 read-only source、exclusive-create backup/restore 和 SQLite backup API；已有目标、路径重叠和缺失父目录均在写入前拒绝。
- source/backup/restore 分别输出 schema、物理 integrity、foreign keys、logical fingerprint/row counts 与 bounded logical issues；不输出 memory/report/evidence 正文或 secret-bearing 字段，不自动修复或替换权威库。
- deterministic schema v23 实演：三份文件均为 823,296 bytes、57 张含 FTS internal 的物理表、43 行、相同 fingerprint；恢复 integrity/logical PASS，issue 0；临时目录随后送入 Windows 回收站。
- focused pytest 5 passed；runner/test Ruff、runner mypy、docs/diff check 通过；无真实 LLM、行情、网络或生产数据调用。
- Phase 6 完整门禁：backend 526 passed / coverage 83.94%，全 Ruff、mypy 119 files；frontend 50 files / 157 tests、TypeScript、production build、E2E 11 passed。首次 frontend full run 的既有 Settings 用例在 5,082 ms 超出 5,000 ms，focused 3 passed 后标准 full rerun 157 passed，未放宽超时。
