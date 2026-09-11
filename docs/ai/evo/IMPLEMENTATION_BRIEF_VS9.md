# IMPLEMENTATION_BRIEF — Vertical Slice 9：备份必须是"一致且完整"的快照

> Orchestrator 第五阶段产物，2026-09-13。来源：**R2 可靠性审计 D2 的 P1**（`RELIABILITY_REPORT_R2.md`），**编排者已用真实数据目录复核**。

## 目标
让启动自动备份产出的文件是**一致且完整**的数据库快照——包含 WAL 中已提交的事务，使"从备份恢复"不会静默丢数据。

## 用户场景
用户正常使用一段时间后，发现数据异常，按 `QUICKSTART` 的恢复步骤从 `backend/data/backups/` 取最近一份备份覆盖回 `finquant.db`，启动——**一切正常，没有任何报错**，但最近若干天的自选股、组合、研究记录**凭空消失了**。他不会知道原因，只会认为"这软件会丢数据"。

## 当前问题（已核实，证据充分）
1. **备份只复制单个 `.db`**：`start.bat:98-99` 的 PowerShell 用 `Copy-Item -LiteralPath 'backend\data\finquant.db' -Destination ...`，**不包含 `finquant.db-wal` / `finquant.db-shm`**。
2. **WAL 模式确证**：`backend/app/database.py:335` `PRAGMA journal_mode=WAL`。
3. **实测对照（编排者在真实数据上复现，只读副本、未改动源库）**：把真实 `backend\data` 分别以"只 `finquant.db`"与"`finquant.db` + `-wal` + `-shm`"两种方式复制到临时目录后查询，**两者的逻辑状态不同**：

   | 指标 | 只复制 `.db` | 含 `-wal` |
   | --- | --- | --- |
   | 全库总行数 | 331 | **334** |
   | `schema_version` | **24** | **26** |
   | `user_credentials` | **0** | **1** |
   | `model_configs` | 2 | 1 |

   ⇒ 当前代码产出的"备份"还原后会是**一个 schema v24、且用户模型凭据为空的旧状态数据库**：v25/v26 两次迁移的成果与那条凭据只存在于 WAL 中。副本本身仍是**合法数据库**，恢复不报错、只是数据与结构悄悄退回旧版本，属**静默数据丢失/静默回退**。
4. **原注释的判断不成立**：`start.bat:95` 写"服务未启动时 WAL 已落盘，安全"——真实 WAL 实存 **135,992 字节**且服务未运行，即为反证。
5. **实现方向可行性已确认**：本项目 venv 的 `sqlite3.sqlite_version = 3.50.4`，**支持 `VACUUM INTO`**（需 ≥ 3.27）。

## 理想行为
- 备份产出**单一、自洽**的数据库文件，其内容等于"当前逻辑数据库"（含 WAL 中已提交数据）。
- 备份失败**不得**产出"看起来成功但内容缺失"的文件：宁可明确失败并提示（保持 VS-2 已确立的诚实语义）。
- 失败不阻塞启动（VS-2 既有语义不变）。

## 涉及模块
- `start.bat` 的 `:backup` 段（改备份实现）
- `docs/QUICKSTART.md` 的「自动备份与如何恢复」段（若恢复步骤需随之说明；仅在必要时改）

## 不能破坏
- **失败不阻塞启动**（`start.bat:100-106` 的 `:backup_failed` 语义）；不新增依赖；不改后端；不改前端。
- 回滚保留"最新 7 份、只提示不自动删除"的策略（删除铁律：一律回收站）与既有文件名模式 `finquant-backup-<yyyyMMdd-HHmmss>.db`。
- `start.bat` 保持 **CRLF**（LF-only = 0）与有效 UTF-8；无删除调用；不加新依赖。

## 验收标准（可判定）
1. **含 WAL 数据（核心判据）**：备份产出后，**独立打开备份文件**应满足：`schema_version` 与源库含 WAL 时的值一致（当前真实环境即 **26**）、`user_credentials` 行数一致（当前为 **1**）、全库总行数一致（当前为 **334**）。等价表述：备份文件的逻辑状态 **等于**"`finquant.db` + `-wal` + `-shm`"三件套打开后的状态。
2. **一致性**：备份文件 `PRAGMA integrity_check` 返回 `ok`；`PRAGMA journal_mode` 为 `delete` 或 `wal` 均可，但备份必须是单一自洽文件（恢复只需覆盖 `finquant.db`）。
3. **不产出伪成功**：备份失败时**不得**留下内容不完整的 `finquant-backup-*.db`；应走 `:backup_failed` 分支（或把残件移入回收站——**删除必须走回收站**）。
4. **无回归**：启动流程、端口、Ctrl+C、7 份滚动提示、`:backup_failed` 语义均不变；`start.bat` CRLF（LF-only = 0）与 UTF-8 校验通过；`git diff --check` 干净。
5. 若改动恢复文档：`QUICKSTART` 的恢复步骤与新的备份产物形态一致（恢复仍是"覆盖 `finquant.db`"，无需用户处理 `-wal`）。

## 错误场景
- 无 `.venv`（首次运行未建好）→ 应能降级到"复制 `.db` + `-wal` + `-shm` 三件套"或明确失败，**绝不静默产出不完整快照**。
- 磁盘空间不足 / 目标不可写 → `:backup_failed` 诚实提示，不阻塞启动。
- 源库不存在 → 保持既有"跳过备份直接启动"。

## 测试要求
bat 无自动化测试框架，采用**实测**：
- 用 Python `sqlite3` 造一个"WAL 中有未 checkpoint 的已提交事务"的库，跑备份，**独立打开备份文件查询该批行**（须能查到）；同时给出"旧实现（只 Copy-Item）读不到该批行"的对照。
- `PRAGMA integrity_check` 结果。
- 失败路径实测（如把目标目录设为不可写）。
- 字节级 CRLF/UTF-8 校验。
由独立 Evaluator 复核核心判据（备份文件能否读到 WAL 中数据）与"伪成功"防线。

## 建议实现方向（**已实测，优先对齐项目既有约定**）
**首选：`sqlite3.Connection.backup()`** —— 这**已是本项目的既有约定，全仓共 3 处**在用：
1. `backend/app/database.py:1854-1863`（迁移前备份，产出 `finquant.db.pre-v10.bak`）
2. `backend/app/database.py:1866-1875`（schema v12 前备份，产出 `pre-v12.bak`）
3. `backend/scripts/audit_database_recovery.py`（备份/还原演练，"non-overwriting SQLite backup/restore drill"）
4. `scripts/verify_local_install.ps1:203`（Docker 命名卷持久化演练：`s=sqlite3.connect(src); b=reserve(bak); s.backup(b)`）

它是 SQLite **官方在线备份 API**，产出一致快照且天然包含 WAL 内容，Python stdlib 自带、零新依赖。
⇒ **VS-2 在 `start.bat` 里用 `Copy-Item` 复制单文件，是全仓唯一的异类做法**；本卡应把它拉回同一约定（这也是 Evaluator 可核对的"架构一致性"点）。

次选：`VACUUM INTO '<目标>'`（同样可用，实测等价）。

**编排者在真实数据上的四路实测（只读源库、临时目录操作）**：

| 方案 | schema_version | user_credentials | 全库总行数 | integrity_check |
| --- | --- | --- | --- | --- |
| A 旧：只 `Copy-Item` `.db` | **24** | **0** | **331** | ok |
| **B `Connection.backup()`** | **26** | **1** | **334** | ok |
| C `VACUUM INTO` | 26 | 1 | 334 | ok |
| D 基准：三件套(`.db`+`-wal`+`-shm`) | 26 | 1 | 334 | ok |

⇒ A≠D（旧方式确实丢数据），**B=C=D**（两条修复路径都正确）。实现时选 B 或 C 均可，但**不得**回到 A。
