# IMPLEMENT_RESULT — Vertical Slice 9：备份必须是"一致且完整"的快照

> 实现者：IMPLEMENTER　｜　日期：2026-09-11　｜　状态：**已实现，核心判据实测通过**
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS9.md`
> 未 commit（按卡要求）。

---

## 1. 结论（一句话）

`start.bat` 的 `:backup` 段不再用 `Copy-Item` 复制单个 `.db`，改为调用**项目 venv 的 Python 标准库 `sqlite3.Connection.backup()`** 生成一致完整快照；实测备份文件能读到 WAL 中的已提交数据（真实数据 **26 / 1 / 334**，与"三件套打开"完全一致），而旧实现只能读到 **24 / 0 / 331**。

---

## 2. 采用了哪个方案，为什么

**采用 `sqlite3.Connection.backup()`**（不是 `VACUUM INTO`，虽然我先实现了后者）。

理由：`backend/app/database.py:1854-1875` 的迁移前备份（`finquant.db.pre-v10.bak` / `pre-v12.bak` …）**已经在用 `await _db.backup(target)`**。改用同一套 API 使启动备份与项目既有实践一致，评审成本更低；两者在本卡实测中**结果完全等价**（见 §4）。已验证 `backend\.venv` 的 `sqlite3.sqlite_version = 3.50.4`。

产物形态：单一、自洽文件，`PRAGMA integrity_check = ok`，`journal_mode = wal`，恢复只需覆盖 `finquant.db`。

---

## 3. 改动清单（含行号）

### `start.bat`（保持 CRLF；`git diff --numstat` = 8 insertions / 4 deletions）

| 行号 | 改动 |
| --- | --- |
| **95-99** | 重写 `:backup` 段注释：说明用 `Connection.backup()` 生成含 WAL 的一致快照、与 `database.py` 迁移前备份同源、只复制 `.db` 会静默回退（VS-9）、Python 不可用时走 `:backup_failed` 且**绝不退化回 Copy-Item** |
| **100** | 保留 `if not exist "backend\data\finquant.db" goto launch`（源库不存在时跳过备份，语义不变） |
| **101** | **新增** `if not exist "backend\.venv\Scripts\python.exe" goto backup_failed`（venv 缺失时诚实失败） |
| **102-103** | `powershell -Command` 载荷：`Copy-Item` → `Connection.backup()` + `integrity_check` 校验 + 失败清理 |
| **104** | 保留 `if errorlevel 1 goto backup_failed` |
| **105** | 文案改为「已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。」（原文案"已备份数据库"在新实现下不再准确） |
| **108-109** | `:backup_failed` 文案补充"本次未生成新备份"，明确**不产出伪成功**；`goto launch`（失败不阻塞启动）不变 |

关键载荷（第 103 行，逐字）：

```powershell
"$ErrorActionPreference='Stop'; $db='backend\data\finquant.db'; if(-not (Test-Path -LiteralPath $db)){exit 0}; $py=Join-Path (Get-Location) 'backend\.venv\Scripts\python.exe'; if(-not (Test-Path -LiteralPath $py)){exit 1}; $dir=Join-Path 'backend\data' 'backups'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $dest=Join-Path $dir ('finquant-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db'); $env:FQ_BACKUP_SRC=$db; $env:FQ_BACKUP_DST=$dest; $code='import os,sqlite3;s=sqlite3.connect(os.environ[''FQ_BACKUP_SRC'']);d=sqlite3.connect(os.environ[''FQ_BACKUP_DST'']);s.backup(d);d.close();s.close();v=sqlite3.connect(os.environ[''FQ_BACKUP_DST'']);r=v.execute(''PRAGMA integrity_check'').fetchone()[0];v.close();raise SystemExit(0 if r==''ok'' else 3)'; & $py -c $code; if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dest)){ if(Test-Path -LiteralPath $dest){ Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($dest,'OnlyErrorDialogs','SendToRecycleBin') }; exit 1 }; $files=@(Get-ChildItem -LiteralPath $dir -Filter 'finquant-backup-*.db' | Sort-Object Name -Descending); if($files.Count -gt 7){ Write-Host '[提示] 备份已超过 7 份，请按需保留后手动清理（回收站）多余文件。' }; exit 0"
```

实现要点：
- **路径用环境变量传递**（`FQ_BACKUP_SRC` / `FQ_BACKUP_DST`），不再把路径拼进 `-c` 代码字符串。这同时解决了三件事：bat→PowerShell 的单引号转义、PowerShell→原生 exe 的路径含空格问题、以及 Python 代码里对外层 `"` 的冲突。**已实测项目路径含空格时正常工作**（见 §4 T4）。
- `$env:` 变量只存在于该子 PowerShell 进程，不回写到 bat 环境。
- 目标文件先经 `PRAGMA integrity_check` 校验，非 `ok` 则以退出码 3 失败。
- 失败/异常时若 `$dest` 已存在，**用回收站删除**（`SendToRecycleBin`），不留下内容不完整的残件。

### `docs/QUICKSTART.md`（第 **163** 行，1 行替换）

「自动备份」段由"把 `finquant.db` 复制一份"改为"用 SQLite 的在线备份功能做一份**完整快照**……快照是**单一、自洽**的文件，已经包含尚未合并进主文件的最新数据，所以恢复时只需覆盖 `finquant.db` 一个文件"。

「如何恢复」步骤 **未改**：仍是"覆盖 `finquant.db`"，用户**不需要**从备份侧处理 `-wal`（备份产物本身就不含 `-wal`）。原步骤 4"若 `backend/data/` 下还有 `finquant.db-wal` / `-shm` 一并删除"指的是**被覆盖的旧库遗留的日志**，与备份产物无关，且是防止旧 WAL 套用到新库的正确做法，故保留不动。
（该文件在 HEAD 中即为 LF-only：187 行 LF-only，我的编辑未改变此约定。）

---

## 4. 实测原始输出

测试环境：`backend\.venv\Scripts\python.exe` = Python 3.12.12 / SQLite 3.50.4。所有探针均为**独立打开目标文件**后查询。计数口径与任务卡一致：**全库总行数 = `sqlite_master` 中所有 table（含 `sqlite_sequence` 等 `sqlite_*`）行数之和**。

### 4.0 核心判据：合成"WAL 中持有已提交数据"的库

用 `sqlite3` 建库、`PRAGMA journal_mode=WAL`、插入 200 行 `t_wal_data` + 1 行 `user_credentials` 并 `commit()`，**保持连接不关闭**（因此不触发 checkpoint），源库文件状态：

```
=== source WAL state (uncheckpointed) ===
Name            Length
finquant.db       4096
finquant.db-shm  32768
finquant.db-wal  20632      <-- 已提交数据只在 WAL 里
```

对同一源库，**先**跑旧方式（`Copy-Item` 只复制 `.db`），**再**跑新的 `start.bat` 载荷（载荷从 `start.bat` 中**逐字提取**后在沙箱内以相同 cwd 执行），独立打开三个文件：

```
=== CORE JUDGMENT: independent open of each file ===
TRUTH: three-piece open        total_rows=201   integrity=ok   journal_mode=wal     | t_wal_data=200  user_credentials=1
OLD: Copy-Item .db only        total_rows=0     integrity=ok   journal_mode=wal     |
NEW: bat Connection.backup()   total_rows=201   integrity=ok   journal_mode=wal     | t_wal_data=200  user_credentials=1
exit code: 0
```

> **结论**：旧实现产出的文件里 `t_wal_data` / `user_credentials` **连表都不存在**（`total_rows=0`）；新实现产出 **201 行，与三件套打开逐项一致**。核心判据通过。

### 4.1 真实数据对照（`backend\data` 的只读副本，源库只读）

**(a) checkpoint 发生前捕获的原始对照**（11:10，真实三件套 vs 旧 Copy-Item）：

```
########## A) pre-checkpoint REAL artifacts ##########
TRUTH three-piece (pre-ckpt)     schema_version=26   user_credentials=1    total_rows=334   integrity=ok   journal_mode=wal
OLD Copy-Item .db (pre-ckpt)     schema_version=24   user_credentials=0    total_rows=331   integrity=ok   journal_mode=wal
```

⇒ **24 / 0 / 331** vs **26 / 1 / 334**，与编排者实测及任务卡 §当前问题 3 完全一致。

逐表差异（`OLD-single-file-copy.db` vs 三件套副本）也精确吻合卡片描述：

```
table                                                         A          B    delta
------------------------------------------------------------------------------------
model_configs                                                 2          1     DIFF
model_pricing                                                 -          0     DIFF
schema_version                                               24         26     DIFF
sqlite_sequence                                              19         20     DIFF
user_credentials                                              0          1     DIFF
------------------------------------------------------------------------------------
TOTAL (non-sqlite_ tables)                                  331        334        3
```

（`model_pricing` 在旧副本里**整张表缺失** —— 它正是只存在于 WAL 中的 v26 迁移产物。）

**(b) 新载荷在真实库上的产出**：

```
########## B) FINAL payload on CURRENT real db (read-only copy) ##########
exit code: 0
REAL source                      schema_version=26   user_credentials=1    total_rows=334   integrity=ok   journal_mode=wal
NEW bat backup()                 schema_version=26   user_credentials=1    total_rows=334   integrity=ok   journal_mode=wal
backup filename: finquant-backup-20260911-111204.db  matches pattern: True
```

⇒ 备份文件与源库 **26 / 1 / 334 完全一致**，文件名符合 `finquant-backup-<yyyyMMdd-HHmmss>.db`。

### 4.2 `PRAGMA integrity_check`

所有新实现产出的备份文件均为 **`ok`**（见上表 `integrity=ok` 列）；且载荷内部还会再独立校验一次，非 `ok` 即失败。

### 4.3 失败路径（全部走 `:backup_failed`，均无残件）

```
===== T1: venv python missing =====
exit code: 1
backups dir created: False
residue finquant-backup-*.db: 0

===== T2: backups path blocked by a FILE =====
exit code: 1
residue finquant-backup-*.db: 0

===== T3: corrupt source (backup() itself fails) =====
exit code: 1
backups dir exists: True; artifacts in it: 0
residue finquant-backup-*.db: 0

===== T5: partial file written, then python exits 3 =====
exit code: 1
backups dir exists : True
files left in backups dir: 0
residue finquant-backup-*.db on disk: 0
==> EXPECT: exit 1, and 0 residue (partial file sent to Recycle Bin)
```

- **T1**（`.venv` python 不可用）：命中第 101 行的 `goto backup_failed`，退出码 1，**连 `backups` 目录都不创建**，无残件。
- **T2**（`backups` 被一个同名文件占住）：`$ErrorActionPreference='Stop'` 使 `New-Item` 抛出 → 退出码 1，无残件。
- **T3**（源库被替换为随机字节，`backup()` 本身失败）：退出码 1，`backups` 目录存在但**为空**，无残件。
- **T5**（**专门验证"回收站清理残件"分支**）：用变体 bat 让 Python **先写出一个 partial 文件再以退出码 3 结束**，逐字复用生产载荷的守卫逻辑 → 退出码 1，**残件 0**，partial 文件被送进回收站。

另有回收站能力前置验证：

```
=== Microsoft.VisualBasic recycle availability ===
recycle-ok
```

### 4.4 路径含空格的健壮性（T4）

```
===== T4: project path CONTAINS SPACES =====
exit code: 0
produced files: 1
T4 backed up (spaced path)       schema_version=26   user_credentials=1    total_rows=334   integrity=ok   journal_mode=wal
```

⇒ 沙箱目录名含空格时备份仍成功且数值正确（环境变量传参方案生效）。

### 4.5 字节级复核

```
=== byte-level start.bat ===
bytes=10886 CRLF=171 LF-only=0
strict UTF-8 OK, BOM: False
QUICKSTART strict UTF-8 OK, LF-only: 187
```

```
=== git diff --check ===
(empty = clean) exit=0
```

`start.bat`：**CRLF=171，LF-only=0**，严格 UTF-8 解码通过、无 BOM。
`git diff --numstat`：`start.bat` = 8 insertions / 4 deletions；`docs/QUICKSTART.md` = 1 insertion / 1 deletion。

---

## 5. 编排者要求的三点明确回答

**1. 采用 `VACUUM INTO` 还是等价方案，为什么？**
采用 `sqlite3.Connection.backup()`（SQLite 官方在线备份 API），属等价方案。原因：`database.py:1854-1875` 的迁移前备份已经在用 `await _db.backup(target)`，与项目既有约定一致；实测两者产出等价（`VACUUM INTO` 亦为 26/1/334）。我最初实现的是 `VACUUM INTO`，后按编排者指令切换为 `backup()` 并重新全量实测。

**2. `.venv` python 不可用 / `VACUUM INTO`（现为 `backup()`）失败时的实际行为？**
两条独立防线，均实测：
- `start.bat:101` 静态守卫：`if not exist "backend\.venv\Scripts\python.exe" goto backup_failed` —— 实测 T1 输出见 §4.3。
- 载荷内 `$LASTEXITCODE -ne 0 -or -not (Test-Path $dest)` 动态守卫：实测 T2 / T3 / T5 输出见 §4.3，全部退出码 1 且**残件 0**。
两者最终都落到 `start.bat:108-109` 的 `:backup_failed`，只打印提示、`goto launch`，**失败不阻塞启动**（语义与 VS-2 一致）。

**3. 确认代码里不存在"失败后回退到 Copy-Item 单文件"的分支？**
确认**不存在**。静态核对：`:backup` 段（第 94-110 行）内 `Copy-Item` 出现 **0 次**（全文件仅第 86 行有 `copy /b "backend\.env.example"`，与备份无关）；`VACUUM` 出现 0 次；`goto backup_failed` 出现在第 **101** 与 **104** 行。所有失败分支只会 `exit 1`（→ `:backup_failed`），不存在任何退化复制路径。

---

## 6. 事件报告：真实源库的 `-wal` / `-shm` 已消失（**数据未丢失**）

必须如实报告一个观察到的环境变化：

**现象**：约 **11:10:16**，`backend\data\finquant.db` 被重写（mtime = 2026/9/11 11:10:16），其 `finquant.db-wal`（原 135,992 字节）与 `finquant.db-shm` **从目录中消失**。

**判定：这是一次 WAL checkpoint（日志合并进主库），不是数据丢失。** 依据——对当前 `finquant.db`（经只读副本）独立探测：

```
REAL finquant.db (now)             schema_version=26   user_credentials=1    total_rows=334   integrity=ok   journal_mode=wal
```

内容与 checkpoint 前三件套打开的 **26 / 1 / 334 完全相同**，`integrity_check = ok`。

**与我操作的关系**：我全程未对真实库执行任何写操作或连接。所有探针与备份都指向 `%TEMP%` 下的**副本**，`backend\data` 只被 `Copy-Item` 读取。这一点可用「我 11:09 时仍能成功复制到全部三个文件、且其内容为 26/1/334」佐证。

**副作用（需要编排者知悉）**：由于真实目录的 WAL 已被合并，**现在对真实库做"只复制 `.db`"也会得到 26 / 1 / 334** —— 真实数据上那个"24/0/331 vs 26/1/334"的判别信号**已不复存在**。因此本卡的 WAL 判别证据由两部分构成：
1. §4.1(a) 的 **checkpoint 前捕获的原始对照**（24/0/331 vs 26/1/334，且逐表 diff 精确吻合卡片）；
2. §4.0 的**合成 WAL 库**判据（备份 201 行 vs 旧实现 0 行）——这是任务卡 §测试要求明确要求的做法。

若 Evaluator 需要再次在真实数据上复现 WAL 场景，需先让服务正常写入若干事务且**不 checkpoint**（例如保持连接不关闭），再复制三件套。

---

## 7. 风险与未解决问题

**风险**
1. **`backup()` 需要读取源库**：与 `Copy-Item` 不同，它要真正打开 SQLite 连接。若源库被别的进程以独占锁长期持有，备份会失败 → 走 `:backup_failed`。这是**有意的**取舍：宁可诚实失败，也不产出不完整快照。
2. **`.venv` 缺失时不再有备份**：新逻辑下没有 venv 就明确失败、不产出备份。按任务卡 §错误场景，这是允许且正确的（"明确失败，绝不静默产出不完整快照"）。实际控制流上，`start.bat:37/41/48` 保证走到 `:backup` 时 venv 应已就绪（venv 建失败早已 `goto venv_failed` 退出）。
3. **载荷变长**（第 103 行为长单行）：可读性下降，但避免了 bat 内多行/转义陷阱；已由 §4 各项实测覆盖。若后续要维护，建议保持"路径走环境变量"的写法。
4. **真实数据上的 WAL 判别信号已被 checkpoint 消除**（见 §6），未来回归测试不能只依赖真实目录。

**未解决问题**
- 无功能性遗留。本卡范围（`start.bat` + `docs/QUICKSTART.md`）内验收标准 1-5 均满足。
- 未运行 pytest（沙箱会挂），本卡未改任何后端代码。
- 未 `commit`（按卡要求）。

---

## 8. 证据与收尾状态

**测试方法说明（可复现）**：新增的 `extract_and_run.js` 会从 `start.bat` **逐字提取** `:backup` 段的 `powershell -Command` 载荷（含 `^` 续行拼接），在沙箱目录内以相同 cwd 用 `powershell.exe -NoProfile` 执行。因此实测跑的是**生产 artifact 本体**，而非手工转写的近似命令。沙箱通过 `mklink /J` 提供 `backend\.venv\Scripts` 间接引用（只读指向真实 venv，不修改其内容）。

**收尾状态**
- 临时目录 `%TEMP%\fqvs9-lab` **已整体送回收站**，`Test-Path` = False。
- 期间创建的 9 个 junction 已**先逐个单独送回收站**（回收 junction 本身不会影响其目标 —— 已用一次性探针实证"目标目录及其 `marker.txt` 均存活"），随后才回收整个 lab，**真实 venv 未被波及**：`python.exe` 存在且 `py 3.12.12 / sqlite 3.50.4` 正常运行。
- 仓库内**未残留**任何临时文件（早期误放在仓库内 `.vs9-tmp/` 的 3 个脚本已移出并送回收站，`git status` 中不出现）。
- `git status --porcelain`：

```
 M docs/QUICKSTART.md
 M start.bat
```

（另有编排者自己修改的 `docs/ai/evo/IMPLEMENTATION_BRIEF_VS9.md` 未列入上述两条，因其为编排者改动。）

- 本文件：`docs/ai/evo/IMPLEMENT_RESULT_VS9.md`
