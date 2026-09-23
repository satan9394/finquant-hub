# EVALUATION_RESULT — VS-9：启动自动备份必须是"一致且完整"快照

> 独立验收（EVALUATOR），假设实现有错、不采信任何自述数字。
> 日期：2026-09-11　｜　被验提交：`ab15be8`（工作区 clean，`git status --porcelain` 为空）
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS9.md`　｜　实现报告：`docs/ai/evo/IMPLEMENT_RESULT_VS9.md`
> 环境：`backend\.venv\Scripts\python.exe` = Python 3.12.12 / SQLite 3.50.4

---

## 0. 判定

**ACCEPT**（0 个阻断问题，2 条非阻断观察）。

核心判据（自造 WAL 场景）逐项通过，且我**未采信实现者与编排者的任何数字**——全部数字本人重跑。

---

## 1. 证据 A：静态核对 `start.bat` `:backup` 段（L94-110）

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| `Copy-Item` 出现次数 | **0** | 全文正则 `Copy-Item` = 0 处；全文唯一复制是 L86 `copy /b "backend\.env.example" "backend\.env"`（与备份无关） |
| 是否用 `sqlite3.Connection.backup()` | 是 | L103 载荷内 `s=sqlite3.connect(...);d=sqlite3.connect(...);s.backup(d)` |
| `VACUUM INTO` | 0 处 | 正则 `(?i)VACUUM` = 0 |
| **是否存在"失败后回退到只复制 .db"的分支** | **不存在** | `goto backup_failed` 仅出现 2 处：L101（venv 缺失）、L104（errorlevel 1）；两条都指向 L108-110 的 `:backup_failed`（只打印提示 + `goto launch`），无任何复制退化路径 |
| `.venv` python 缺失时的行为 | 明确失败 | L101 `if not exist "backend\.venv\Scripts\python.exe" goto backup_failed`——**不静默跳过**（动态实测见 §4） |
| 失败残件是否走回收站 | 是 | L103 `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($dest,'OnlyErrorDialogs','SendToRecycleBin')`，动态实测见 §5（回收站元数据命中） |
| 源库不存在 | 保持既有跳过语义 | L100 `if not exist "backend\data\finquant.db" goto launch` |
| 文件名格式 | 保留 | L103 `'finquant-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db'` |
| 7 份滚动提示 | 保留（只提示不自动删除） | L103 `$files=@(Get-ChildItem -LiteralPath $dir -Filter 'finquant-backup-*.db' \| Sort-Object Name -Descending); if($files.Count -gt 7){ Write-Host '[提示] 备份已超过 7 份…' }` |
| 失败不阻塞启动 | 保留 | `:backup_failed`（L108-110）末尾 `goto launch` |

## 2. 证据 B：字节级校验

```
bytes=10886 CRLF=171 loneLF=0 loneCR=0
BOM=False
UTF8_STRICT=OK chars=7800
CopyItem_count=0
backup_api_count=2        (1 处注释 + L103 代码)
VACUUM_count=0
git diff --check          exit=0（无输出）
git log --oneline -3      ab15be8(VS-9) / 8e6a1ea / 9fdb275
git status --porcelain    （空，工作区与 HEAD 一致）
```

## 3. 证据 C：核心判据——**自造 WAL 场景**三路对照

真实 `backend\data` 的 WAL 已被 checkpoint（本人复核：目录下只有 `finquant.db`，无 `-wal`/`-shm`），旧/新实现已不可区分，故**自造**：

`hold.py`（本人编写）：新建 `backend\data\finquant.db` → `PRAGMA journal_mode=WAL`、`PRAGMA wal_autocheckpoint=0` → 建 4 张表、插入 200 行 `t_wal_data` + 1 行 `user_credentials` + 1 行 `schema_version(26)` → `commit()` → **连接保持不关闭**（sleep 240s）。

源库文件状态（数据确实只在 WAL 里）：

```
WAL_STATE_READY
  finquant.db              4096
  finquant.db-shm          32768
  finquant.db-wal          45352
```

**执行的"新实现逻辑"不是手工转写**：把 `start.bat` 的 `:backup` 段（L94-110）**逐字**拼进临时 `run_backup.bat` 用 `cmd.exe` 真跑（保真度校验：复刻块与原文 L94-110 `-eq` → `True`，载荷行 1232 字符完全相同）。旧实现 = `Copy-Item` 只复制 `.db`。基准 = 三件套直接打开。

三路独立打开产物（`probe.py`，逐项原始输出）：

```
=== three-way independent open ===
TRUTH: -wal three-piece open       total_rows=202   integrity=ok   journal_mode=wal    size=4096     tables=4
                                   t_wal_data=200 user_credentials=1 schema_version_rows=1 model_pricing=0
OLD: .db copy only                 total_rows=0     integrity=ok   journal_mode=wal    size=4096     tables=0
                                   t_wal_data=None user_credentials=None schema_version_rows=None model_pricing=None
NEW backup files: ['finquant-backup-20260911-111953.db']
NEW: bat Connection.backup()       total_rows=202   integrity=ok   journal_mode=wal    size=20480    tables=4
                                   t_wal_data=200 user_credentials=1 schema_version_rows=1 model_pricing=0

ASSERT new == truth : True
ASSERT new != old   : True
filename pattern ok : True
NEW has -wal sibling: False
NEW has -shm sibling: False
```

⇒ **① == ③ 且 ① ≠ ②**：新实现在源库仍有未 checkpoint 的 WAL 时读到了全部 202 行；旧实现只复制 `.db` 得到 **0 行、连表都不存在**。备份产物是**单一自洽文件**（无 `-wal`/`-shm` 旁件），恢复只需覆盖 `finquant.db`。

## 4. 证据 D：cmd 层转义（真跑，非纸面推演）

`:backup` 载荷是 1232 字符单行、内含单引号/双写单引号/管道，外层是 `powershell.exe -NoProfile -Command ^` + 引号行续行。我用 `cmd.exe /c run_backup.bat` 在含 `backend\data` 与 `backend\.venv`（junction 指向真实 venv）的沙箱里实跑：

```
---- bat stdout ----
| [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。
| [EVAL] REACHED_LAUNCH errorlevel=0
---- exit code: 0 ----
files in backups dir: finquant-backup-20260911-111953.db(20480)
```

⇒ 续行与引号转义**真实可用**，中文（`chcp 65001`）无乱码。（本人全程按 `[System.IO.File]::ReadAllBytes` + 严格 UTF-8 解码读取 `start.bat`，未使用 ANSI 默认的 `Get-Content`。）

`.venv` 缺失分支（同样逐字 bat，沙箱无 `backend\.venv`）：

```
venv present in lab2: False
---- lab2 (no .venv) stdout ----
| [提示] 数据库备份失败，本次未生成新备份，不影响启动；数据仍可用（可检查磁盘空间后重试）。
| [EVAL] REACHED_LAUNCH errorlevel=0
---- exit code: 0 ----
backups dir created: False
```

⇒ 明确走 `:backup_failed`，**没有静默跳过**、没有产出任何文件、不阻塞启动。

## 5. 证据 E：失败路径与"伪成功"防线

**E1 `integrity_check` 真会给非零退出码**——人为构造"backup() 能复制、但校验不通过"的源库（4000 行建表后 `DELETE` 造 308 个空闲页，再篡改 page 3）：

```
integrity_check(src_free) -> *** in database main ***
Freelist: freelist leaf count too big on page 3
Freelist: invalid page number 1515870810
...
EXIT3-ATTEMPT exit=3
```

⇒ 走的是载荷里 `raise SystemExit(0 if r=='ok' else 3)` 的 **exit 3** 分支（非异常路径），退出码非零，防线成立。

**E2 完整 bat 在该场景下的行为**（源库 = 上述库）：

```
---- lab4 (corrupt source) stdout ----
| [提示] 数据库备份失败，本次未生成新备份，不影响启动；数据仍可用（可检查磁盘空间后重试）。
| [EVAL] REACHED_LAUNCH errorlevel=1
---- exit code: 0 ----
backups dir exists: True
residue files: 
stray finquant-backup anywhere in lab4: 
```

⇒ 残件 **0**，落到 `:backup_failed`，不阻塞启动。

**E3 残件确实进了回收站**（而非 `del` 式删除）：回收站 `$I` 元数据中检索到被清理的产物原始路径——

```
file still on disk: False
recycle-bin metadata match: nC:\Users\Satanchen\AppData\Local\Temp\fqvs9-eval-fail\backend\data\backups\finquant-backup-20260911-112038.db
```

（此前已在 lab3 确认该 partial 文件**曾存在**，故非"根本没创建"。）

## 6. 证据 F：文档与回归

- `docs/QUICKSTART.md:163` 已与新行为一致："用 SQLite 的在线备份功能给数据库做一份**完整快照**……快照是**单一、自洽**的文件，已经包含尚未合并进主文件的最新数据，所以恢复时只需覆盖 `finquant.db` 一个文件"。
- 恢复步骤（L165-171）仍是"覆盖 `finquant.db`"，未要求用户处理 `-wal`/`-shm`，与新产物形态一致（L170 关于旧库遗留 `-wal`/`-shm` 的提示对"覆盖后防旧日志套用新库"仍然正确）。
- 提交内容：`docs/QUICKSTART.md | 2 +-`、`start.bat | 12 ++++--`、`IMPLEMENT_RESULT_VS9.md`（3 files, +280/-5）。
- `:launch`（L112-131）内无任何依赖 `errorlevel` 的分支，失败路径残留的 `errorlevel=1` 不影响启动流程。
- 无新增依赖；未改后端/前端。

## 7. 非阻断观察（不构成 REJECT）

1. `start.bat:103` 载荷内的 `if(-not (Test-Path -LiteralPath $db)){exit 0}` 会以**成功**退出码返回，从而打印 L105 的"已生成数据库快照"。该分支被 L100 的 `if not exist … goto launch` 挡住，实际只在"L100 判定后源库瞬间消失"的 TOCTOU 竞态下可达，届时无文件产出却打印成功文案。建议把该分支改为 `exit 1`（或去掉），语义更诚实。**不影响本次验收**（不产出伪文件）。
2. `QUICKSTART:163` 措辞"滚动保留最近 7 份"与实现（**只提示、不自动删除**）略有出入；该措辞是 VS-2 既有文本、本次未改，且同句已说明"看到提示请自行移走"。非本次回归。

## 8. 验收动作的副作用与清理

- 未修改任何实现文件；本文件为唯一新增产物。
- 临时目录均在 `%TEMP%`：`fqvs9-eval`、`fqvs9-eval-novenv`、`fqvs9-eval-corrupt`、`fqvs9-eval-fail`。**先单独回收 junction**（`…\backend\.venv`，确认回收的是链接本身）**再回收沙箱**；四个沙箱现均 `Test-Path = False`，`%TEMP%` 下 `fqvs9*` 残留 = 0。全程使用 `SendToRecycleBin`，无任何 `rm`/`del`。
- 真实 venv 完好：`backend\.venv\Scripts\python.exe` 存在（`Scripts` 下 50 项），实测可运行（3.12.12 / 3.50.4）。
- 真实库未被触碰：`backend\data\finquant.db` = 1,785,856 字节 / mtime 2026-09-11 11:10:16（与实现报告 §6 记录一致，本人只读），目录下无 `-wal`/`-shm`、无 `backups\`。
- `git status --porcelain` 为空（本文件为未跟踪新增，属验收产物）。

---

## 9. 结论

ACCEPT。`start.bat:94-110` 已彻底移除"只复制单文件"的退化路径，改用 `sqlite3.Connection.backup()` 产出一致完整快照；在**自造**的"已提交事务仍留在 WAL"场景下，新实现产物与三件套基准逐项一致（202=202），旧实现为 0（≠202）；cmd 层转义实跑通过；venv 缺失与校验失败均诚实失败、残件经回收站清除、失败不阻塞启动；字节级与文档同步均通过。2 条非阻断观察见 §7。
