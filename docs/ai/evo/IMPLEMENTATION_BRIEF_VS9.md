# IMPLEMENTATION_BRIEF — Vertical Slice 9：备份必须是"一致且完整"的快照

> Orchestrator 第五阶段产物，2026-09-13。来源：**R2 可靠性审计 D2 的 P1**（`RELIABILITY_REPORT_R2.md`），**编排者已用真实数据目录复核**。

## 目标
让启动自动备份产出的文件是**一致且完整**的数据库快照——包含 WAL 中已提交的事务，使"从备份恢复"不会静默丢数据。

## 用户场景
用户正常使用一段时间后，发现数据异常，按 `QUICKSTART` 的恢复步骤从 `backend/data/backups/` 取最近一份备份覆盖回 `finquant.db`，启动——**一切正常，没有任何报错**，但最近若干天的自选股、组合、研究记录**凭空消失了**。他不会知道原因，只会认为"这软件会丢数据"。

## 当前问题（已核实，证据充分）
1. **备份只复制单个 `.db`**：`start.bat:98-99` 的 PowerShell 用 `Copy-Item -LiteralPath 'backend\data\finquant.db' -Destination ...`，**不包含 `finquant.db-wal` / `finquant.db-shm`**。
2. **WAL 模式确证**：`backend/app/database.py:335` `PRAGMA journal_mode=WAL`。
3. **WAL 中确有未合并数据**：真实数据目录里 `finquant.db-wal` = **135,992 字节**（且当前服务未运行）。SQLite 仅在 checkpoint 时把 WAL 帧合并回主库；**只带 `.db` 的副本会丢掉这些已提交事务**，而副本本身仍是"合法数据库"——恢复不报错、只是数据缺失，属**静默数据丢失**。
4. **原注释的判断不成立**：`start.bat:95` 写"服务未启动时 WAL 已落盘，安全"——第 3 点的实测字节数即为反证（WAL 文件在服务未运行时依然持有内容）。

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
1. **含 WAL 数据**：构造一个"主库已 checkpoint 到某行号、WAL 里还有更新的已提交行"的数据库，执行备份后，用备份文件**查询得到 WAL 中的那批行**。（这是本卡的核心判据：把备份文件当独立库打开，能读到源库 `-wal` 里的已提交数据。）
2. **一致性**：备份文件 `PRAGMA integrity_check` 返回 `ok`。
3. **不产出伪成功**：备份失败时**不得**留下一个内容不完整的 `finquant-backup-*.db`；应走 `:backup_failed` 分支（或删除该残件——**删除必须走回收站**）。
4. **无回归**：启动流程、端口、Ctrl+C、7 份滚动提示、`:backup_failed` 语义均不变；`start.bat` CRLF/LF 与 UTF-8 校验通过。
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

## 建议实现方向（供参考，非强制）
优先用**现有 venv 的 Python stdlib `sqlite3`** 执行 `VACUUM INTO '目标路径'`——它产出单一、一致、已含 WAL 内容的副本，且不需新依赖；失败时回落 `:backup_failed`，不要退化回"只复制 .db"。
