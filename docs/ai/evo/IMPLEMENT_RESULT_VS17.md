# IMPLEMENT_RESULT — Vertical Slice 17：备份产物在多实例与硬中断下不留隐患

> 状态：**完成（四场景实测通过，2026-09-11）**。执行者：IMPLEMENTER（worker）。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS17.md`（链接与 Windows 语义由编排者核实，本文件不重复推测）。
> **未 commit。**工作树里 `docs/ai/evo/IMPLEMENT_RESULT_VS16.md`、`docs/ai/evo/PRODUCT_STATE.md`、若干 untracked 文件是**其他 agent 的在途改动，与本卡无关**。

## 0. 计划（先落盘，防中断丢失）

1. [x] `start.bat:121` PowerShell 载荷改两阶段落盘：
   - `$part = $dest + '.' + $PID + '.partial'`（**每进程唯一**，不依赖秒级命名）
   - Python 快照 + `PRAGMA integrity_check` **写到 `$part`**（仍是 `sqlite3.Connection.backup()`，不退回复制 `.db`）
   - 校验通过 → `Move-Item -LiteralPath $part -Destination $dest -Force` 改名为最终 `.db`
   - 失败 → **只**回收 `$part`，**绝不触碰任何 `.db`**，`exit 1` → `:backup_failed`
2. [x] 7 份计数保持 `-Filter 'finquant-backup-*.db'`（实测天然不匹配 `*.db.partial`）
3. [x] 新增一行遗留 `*.db.partial` 提示（**只提示不自动删**）
4. [x] 更新 `:backup` 段注释（现 109-117）
5. [x] 门禁：夹具经 `cmd.exe` 实测四场景 + 两条对照，字节级 CRLF+UTF-8+`git diff --check` 全绿

## 1. 开工前已核实事实（读码结论，供评审复用）

- `start.bat:108-124` 为 `:backup` / `:backup_failed` 段；`:114` 无库 `goto launch`、`:115` 无 venv `goto backup_failed`、`:117` 是唯一 PowerShell 载荷、`:118` 非零 `goto backup_failed`、`:122-124` 失败提示 + `goto launch`。
- 基线 `:117` 的三处问题：`$dest` 只有秒级精度；失败分支 `DeleteFile($dest,...)` 会回收**同秒另一进程已写好的有效 `.db`**；中断残件与有效件**同名同形**并被 7 份 `-Filter` 计入。
- 文件字节级基线：12147 字节、190 行、LF=190 / CRLF=190 / LF-only=0、无 BOM、严格 UTF-8 可解。
- 编制夹具时实测到的 `-Filter` 语义（与编排者结论一致）：`-Filter 'finquant-backup-*.db'` 数不到 `….db.<pid>.partial`；`-Filter 'finquant-backup-*.partial'` 能数到；**注意 `-Filter '*.db.partial'` 反而数不到**（所以遗留提示用的是 `'finquant-backup-*.partial'`）。

## 2. 改动（文件:行）

改动全部落在 `start.bat` 的 `:backup` 段（仅此一个文件；**未 commit**）。

**2.1 `start.bat:109-117`（原 109-113）注释块重写**，写明两阶段落盘、失败只清自己的 `.partial`、7 份计数天然排除 `*.db.partial`。新增行使文件由 190 行变为 194 行。

**2.2 `start.bat:121`（原 117）PowerShell 载荷**，逐字如下（与盘上一致，单行）：

```
"$ErrorActionPreference='Stop'; $db='backend\data\finquant.db'; ... $dest=Join-Path $dir ('finquant-backup-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.db'); $part=$dest+'.'+$PID+'.partial'; if(Test-Path -LiteralPath $part){ ...DeleteFile($part,...) }; $env:FQ_BACKUP_SRC=$db; $env:FQ_BACKUP_DST=$part; $code='...'; & $py -c $code; if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $part)){ if(Test-Path -LiteralPath $part){ ...DeleteFile($part,...) }; exit 1 }; try{ Move-Item -LiteralPath $part -Destination $dest -Force }catch{ if(Test-Path -LiteralPath $part){ ...DeleteFile($part,...) }; exit 1 }; $left=@(Get-ChildItem -LiteralPath $dir -Filter 'finquant-backup-*.partial' -ErrorAction SilentlyContinue); if($left.Count -gt 0){ Write-Host ('[提示] 检测到 '+$left.Count+' 个未完成的备份临时文件（*.db.partial，可能来自上次中断或另一个正在运行的实例）；确认无用后可在文件管理器中手动删除（回收站）。') }; $files=@(Get-ChildItem -LiteralPath $dir -Filter 'finquant-backup-*.db' | Sort-Object Name -Descending); if($files.Count -gt 7){ Write-Host '[提示] 备份已超过 7 份，请按需保留后手动清理（回收站）多余文件。' }; exit 0"
```

与基线逐项对照：

| 项 | 基线（HEAD） | 现在 |
|---|---|---|
| 快照方式 | `sqlite3.connect(src).backup(dst)` | **不变**（`FQ_BACKUP_DST` 改指向 `$part`） |
| 完整性校验 | `PRAGMA integrity_check`，非 `ok` 则 exit 3 | **不变** |
| 落盘目标 | `$dest`（最终名，直接写） | `$part = $dest + '.' + $PID + '.partial'` |
| 失败清理 | `DeleteFile($dest)` | `DeleteFile($part)`（**只碰自己的 `.partial`**，任何分支都不再出现 `$dest` 的删除） |
| 改名为最终件 | 无（本就是最终名） | `Move-Item -LiteralPath $part -Destination $dest -Force`（在 `try/catch` 内） |
| 7 份计数 | `-Filter 'finquant-backup-*.db'` | **不变** |
| 遗留提示 | 无 | 新增一行 `*.db.partial` 提示（**只提示不删**） |

未改动的既有语义（逐条核对过）：
- `:118` 无 `finquant.db` → `goto launch`（原 `:114`）；`:119` 无 venv → `goto backup_failed`（原 `:115`）；`:122` 非零 → `goto backup_failed`（原 `:118`）。
- `:122-127` `:backup_failed` 仍是"提示 + `goto launch`"，**不是硬失败**。
- 最终文件名仍是 `finquant-backup-<yyyyMMdd-HHmmss>.db`（`QUICKSTART.md:169` 的文案无需改）。
- `sqlite3.Connection.backup()` 与 `PRAGMA integrity_check` 一字未动——**没有退回"只复制 finquant.db"**。

**2.3 过程中被编排者拦下的严重回归（已修）**：我的第一版把 **包裹整条载荷的那对双引号弄丢了**（`:121` 首字符 `$`=36，应为 `"`=34）。载荷内的 `|`（`New-Item … | Out-Null`、`Get-ChildItem … | Sort-Object`）与 `&`（`& $py -c $code`）在引号外会被 cmd 当管道/命令分隔符 ⇒ 命令行被截断、`errorlevel 1`、**每次启动都走 `:backup_failed`、永远不生成备份**。修法：恢复 `  "…"` 包裹。**这条也直接改变了我的夹具方法**：夹具必须把 `:120-121`（含 `powershell.exe -NoProfile -Command ^` 续行）**逐字做成 `.bat` 交出 `cmd.exe` 运行**，而不是把载荷字符串直接喂给 PowerShell——后者绕过 cmd 解析层，这类缺陷完全不可见。夹具起手即断言载荷首字符码为 34。


## 3. 实测原始输出与目录清单

**夹具方法（照 VS-9/VS-14，并按编排者要求收紧）**：从盘上 `start.bat` **逐字抽出** `:118-124`（`if not exist …` / `powershell.exe -NoProfile -Command ^` / **带两个前导空格的载荷行** / `if errorlevel 1 …` / `echo …` / `goto launch`），拼成临时 `.bat`（`@echo off` + `chcp 65001 >nul` + `pushd <沙箱>`），**交给 `cmd.exe /c` 运行**——不把载荷字符串直接喂 PowerShell。沙箱建在 `%TEMP%\fq_vs17\sb`，用 **junction** 指向真实 `backend\.venv`（回收时**先单独回收 junction**，实测真实 venv 完好：`python.exe` 在、`site-packages` 190 个目录）。合成库：**WAL + `wal_autocheckpoint=0` + 连接保持不关闭**（数据只活在 `-wal`，`finquant.db` 仅 4096 字节）。

唯一对夹具的改动（不影响被测语义）：在载荷行后插入 `set "BKRC=%ERRORLEVEL%"`，把**真实 bat 用来分支的那个 errorlevel** 原样打进 stdout（`Start-Process -PassThru` 的 `.ExitCode` 在本机 PS 5.1 下取回为空，故以 `%BKRC%` 为准；下面 `bat exit code =` 为空即此故）。

### 夹具头部（自检）

```
payload first char  = 34  (" = 34 ; $ = 36)
payload line leading spaces = 2
payload head        = "$ErrorActionPreference='Stop'; $db='backe
payload tail        = ' }; exit 0"
payload length      = 1949
old(HEAD) firstchar = 34  length=1230  leadingSpaces=2
```

### 场景 1 正常 —— 产出最终 `.db`、无 `.partial`、`integrity_check=ok`、退出 0

```
holder: READY rows=2000 db=…\sb\backend\data\finquant.db (pid 6968)
source dir BEFORE backup (rows live in -wal, not yet in finquant.db):
      finquant.db  4096 bytes
      finquant.db-shm  32768 bytes
      finquant.db-wal  935272 bytes
bat stdout    = [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。 | [fixture] BRANCH=launch BKRC=0
bat stderr    =
  --- S1 backups dir AFTER : …\fq_vs17\sb\backend\data\backups
      finquant-backup-20260911-222025.db  921600 bytes
      7-count(-Filter 'finquant-backup-*.db') = 1 ; partial-count(-Filter 'finquant-backup-*.partial') = 0
      integrity_check(finquant-backup-20260911-222025.db) = 'ok' ; rows=2000
source dir AFTER backup:
      backups  1 bytes
      finquant.db  4096 bytes
      finquant.db-shm  32768 bytes
      finquant.db-wal  935272 bytes
```

判定：① `BRANCH=launch BKRC=0`（退出 0）② 最终名 `finquant-backup-20260911-222025.db` 格式不变 ③ 7-count=1、partial-count=0 ④ `integrity_check='ok'` ⑤ **rows=2000 全部来自 `-wal`**（源 `finquant.db` 只有 4096 字节）⇒ 快照**没有**退回"只复制 `.db`"，WAL 数据被完整带上。

### 场景 2 校验失败 —— 非零退出、无最终 `.db`、自己的 `.partial` 进回收站

```
made corrupt source: …\finquant.db size=1830912 patched_off=915456 len=512
bat stdout    = [fixture] BRANCH=backup_failed BKRC=1 | [提示] 数据库备份失败，本次未生成新备份，不影响启动；数据仍可用（可检查磁盘空间后重试）。 | [fixture] BRANCH=launch BKRC=1
bat stderr    =
recycle-bin delta = finquant-backup-20260911-222027.db.13552.partial
  --- S2 backups dir AFTER : …\fq_vs17\sb\backend\data\backups
      (empty)
      7-count(-Filter 'finquant-backup-*.db') = 0 ; partial-count(-Filter 'finquant-backup-*.partial') = 0
  inner python step (same $code as the payload), exit code = 3 ; output = []
  -> exit 3 means backup() succeeded and PRAGMA integrity_check returned non-ok (the failure branch under test)
```

判定：① `BKRC=1`（非零）② 目录**空**——没有最终 `.db`、也没有 `.partial` 残件 ③ **回收站里只有 `….db.13552.partial`**，没有任何 `.db` ④ 把载荷里的 `$code` 原样单独跑一遍，**python 退出码 = 3**，证明走的正是"`backup()` 成功、`PRAGMA integrity_check` 非 ok"那条分支，而不是别的崩溃 ⑤ 失败仍 `goto launch`（`BRANCH=launch`），**没有变成硬失败**。

### 场景 3 硬中断（写完 `.partial`、改名之前终止）—— 残件是 `*.partial`，且不被 7 份计数匹配

```
holder: READY rows=400000 …   source finquant.db size = 4096 bytes ; -wal = 183587232 bytes
  attempt 1: .partial seen after 574 ms: finquant-backup-20260911-222031.db.14812.partial (size 0)
    killing the cmd wrapper (pid 22748) and the payload powershell.exe NOW; the python child is
    deliberately LEFT ALIVE so the copy completes -- the process that would run Move-Item is gone.
    killed 1 payload powershell.exe process(es); waiting for the python child to finish
    python child exited, 1535 ms after launch
  --- S3 backups dir AFTER hard interrupt : …\fq_vs17\sb\backend\data\backups
      finquant-backup-20260911-222031.db.14812.partial  182509568 bytes
      7-count(-Filter 'finquant-backup-*.db') = 0 ; partial-count(-Filter 'finquant-backup-*.partial') = 1
      integrity_check(finquant-backup-20260911-222031.db.14812.partial) = 'ok'
```

判定：① 残件名是 `finquant-backup-20260911-222031.db.**14812.partial**`（进程号在名字里）② **7-count = 0**：`-Filter 'finquant-backup-*.db'` **数不到它**，残缺件不再挤占 7 份限额 ③ 它的内容是**完整可用**的（`integrity_check='ok'`，182 MB）——**这正是本卡要解决的核心**：旧实现下它叫 `….db`、与有效备份同名同形、且计入限额；现在它只能以明确的 `.partial` 形态存在 ④ 同时被 S4a 的第一个进程读到并打印了遗留提示（见下），证明提示行生效。

### 场景 4a 同秒并发（两个进程同时跑）—— 互不删对方、至少一份 `ok`、无进程崩溃

```
  attempt 1: dbCount 0 -> 1
    A stdout = [提示] 检测到 1 个未完成的备份临时文件（*.db.partial，可能来自上次中断或另一个正在运行的实例）；确认无用后可在文件管理器中手动删除（回收站）。 | [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。 | [fixture] BRANCH=launch BKRC=0
    B stdout = [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。 | [fixture] BRANCH=launch BKRC=0
    => TWO runs produced only ONE new .db => both used the SAME $dest (same second) => overwrite path exercised, neither process crashed
  --- S4a backups dir AFTER : …\backups
      finquant-backup-20260911-222035.db  1376256 bytes
      7-count(-Filter 'finquant-backup-*.db') = 1 ; partial-count(-Filter 'finquant-backup-*.partial') = 0
      integrity_check(finquant-backup-20260911-222035.db) = 'ok' ; rows=3000
```

判定：① 两次运行**都在同一秒**（两个进程只产出 1 个新 `.db`，且 `finquant.db` 的时间戳同秒）② 双方 **`BKRC=0`**，**没有进程因同名崩溃** ③ 结束后 `partial-count = 0`（各进程的 `.partial` 都已被自己改名走）④ 目录里那一份 **`integrity_check='ok'`、rows=3000** ⑤ 先完成的那个进程**没有**把后完成的 `.partial` 当垃圾——它只**提示**，不自动删。

### 场景 4b（本卡重点）同秒：失败进程 vs 已写好的**有效备份**

方法（可判定到秒，非概率）：在和载荷**同一秒**预置一份**有效的** `finquant-backup-<该秒>.db`（用真 sqlite 建库 + `integrity_check=ok`，并另外预置前后若干秒的同名件覆盖抖动窗口），紧接着跑载荷；**回收站里被移除的路径名**即该进程实际使用的 `$dest`/`$part`，因此"是否同秒"与"删了谁"都有字节级证据。四格 × 各 1 次即命中：

**（a）新载荷 + 损坏源（`integrity_check` 失败路径）**

```
    attempt 1: SAME SECOND confirmed (payload touched a path named finquant-backup-20260911-222039.db...)
    seed 20260911-222039 BEFORE: size=8192 sha256[:16]=95745DE9F66459F0 integrity_check=ok   (second used by the payload: True)
    bat stdout    = [fixture] BRANCH=backup_failed BKRC=1 | [提示] 数据库备份失败… | [fixture] BRANCH=launch BKRC=1
    recycle-bin delta = finquant-backup-20260911-222039.db.10508.partial
    seed 20260911-222039 AFTER : exists=True size=8192 sha256[:16]=95745DE9F66459F0 integrity_check='ok'
    （另外 4 个种子同样 exists=True / 哈希不变 / ok）
  --- S4b dir AFTER cell NEWpayload-corruptsrc
      finquant-backup-20260911-222038.db … 222042.db  （5 个种子全在）
      7-count(-Filter 'finquant-backup-*.db') = 5 ; partial-count(-Filter 'finquant-backup-*.partial') = 0
```

**（b）新载荷 + 根本不是数据库的源**

```
    attempt 1: SAME SECOND confirmed (… finquant-backup-20260911-222044.db ...)
    bat stdout    = [fixture] BRANCH=backup_failed BKRC=1 | …
    bat stderr    = Traceback … sqlite3.DatabaseError: file is not a database
    recycle-bin delta = finquant-backup-20260911-222044.db.6432.partial
    seed 20260911-222044 AFTER : exists=True size=8192 sha256[:16]=95745DE9F66459F0 integrity_check='ok'
```

**（c）旧载荷（`git show HEAD:start.bat` 原样）+ 损坏源 —— 复现旧缺陷**

```
    attempt 1: SAME SECOND confirmed (… finquant-backup-20260911-222048.db ...)
    seed 20260911-222048 BEFORE: size=8192 sha256[:16]=95745DE9F66459F0 integrity_check=ok   (second used by the payload: True)
    bat stdout    = [fixture] BRANCH=backup_failed BKRC=1 | …
    recycle-bin delta = finquant-backup-20260911-222048.db
    seed 20260911-222048 AFTER : exists=False size=<missing> sha256[:16]=<missing> integrity_check=<missing>
  --- S4b dir AFTER cell OLDpayload-corruptsrc
      7-count(-Filter 'finquant-backup-*.db') = 4        ← 比运行前的 5 个少了一个
```

**（d）旧载荷 + 非数据库源 —— 未触碰过的有效备份被直接删除**

```
    attempt 1: SAME SECOND confirmed (… finquant-backup-20260911-222054.db ...)
    seed 20260911-222054 BEFORE: size=8192 sha256[:16]=95745DE9F66459F0 integrity_check=ok   (second used by the payload: True)
    bat stdout    = [fixture] BRANCH=backup_failed BKRC=1 | …
    recycle-bin delta = finquant-backup-20260911-222054.db
    seed 20260911-222054 AFTER : exists=False size=<missing> sha256[:16]=<missing> integrity_check=<missing>
```

**结论（正面回答"失败方是否仍会删掉有效备份"）**：
- **旧实现会**。同秒另一进程已写好的**有效 `.db`**（`integrity_check=ok`）被失败进程 `DeleteFile($dest)` 送进回收站；格 (d) 里那份种子在失败前**从未被打开或写过**（失败发生在 `sqlite3.connect` 之后、`backup()` 抛 `file is not a database`），仍然是完整的有效备份，**照样被删**。格 (c) 更糟：旧进程会先把对方的有效备份**覆盖**成损坏副本，再删除。
- **新实现不会**。同秒失败进程只回收**自己的** `<seed>.db.<pid>.partial`：格 (a) 回收站 delta 是 `finquant-backup-20260911-222039.db.10508.partial`，同秒种子 `…222039.db` **仍在、大小不变、sha256 不变、`integrity_check='ok'`**；格 (b) 同样。新载荷的失败路径**任何分支都不再出现对 `$dest` 的删除**。

### 附加对照 1：`Move-Item` 的 `-Force` 是承重的

```
=== S5 Move-Item semantics when the destination already exists ===
  without -Force : THREW System.IO.IOException
  with -Force    : dest=NEW-CONTENT-2 ; source still exists=False
  dest.bin now = NEW-CONTENT-2
```
⇒ 目标已存在时**必须带 `-Force`**：不带会抛 `IOException`（等价于同秒并发时后到者直接非零退出并留下 `.partial`）；带 `-Force` 正常覆盖且源文件消失。载荷中用的是 `-Force`。

### 附加对照 2：cmd 解析层自检（本卡新增的承重约束）

```
=== S6 cmd parse layer: the payload line must not start at column 0 with a double quote ===
  variant C0 - payload line starts with: double quote at column 0 (no leading space)
    cmd exit code = 255 ; stdout=[] ; stderr=['Out-Null' is not recognized as an internal or external command, | operable program or batch file.]
  variant C2 - payload line starts with: two leading spaces (as in start.bat)
    cmd exit code = 0 ; stdout=[RC=1] ; stderr=[Traceback … sqlite3.DatabaseError: file is not a database]
```

**新发现（超出任务卡，建议沉淀）**：`start.bat:121` 行首那**两个空格是承重的**。`powershell.exe … -Command ^` 的**续行**若恰好以 `"` **顶格**开始，cmd 会解析错乱——载荷被从引号处截断，`|`/`&` 落到引号外被当管道/命令分隔符，症状与"引号丢失"**完全一致**（`'Out-Null' is not recognized`、退出码 255、备份永不生成）。实测矩阵：顶格 `"` → 255（`chcp 65001` 与否都失败）；**1 个或 2 个前导空格 → 正常**。所以"把续行顶格对齐"这种看似无害的格式化会直接弄死备份；复核时请把 `L121` 的**前导空格数**也当成契约的一部分。

### 字节级门禁

```
bytes=13527 LF=194 CRLF=194 LFonly=0 endsWithCRLF=True
strictUTF8 = OK      BOM = False      lines = 194
L120 = [powershell.exe -NoProfile -Command ^]
L121 firstchar code = 32 (space) ; lastchar code = 34 ; leadingSpaces = 2
=== git diff --check ===      exit=0（无输出）
=== git ls-files --eol ===    i/lf  w/crlf  attr/text eol=crlf   start.bat
=== git diff --stat ===       start.bat | 8 ++++++--   (1 file changed, 6 insertions(+), 2 deletions(-))
```

## 4. 未解决问题 / 风险

1. **【已发生并已修，最高优先级】引号丢失导致备份永不生成**：第一版载荷行丢了包裹用的双引号（首字符变 `$`），cmd 把 `|`/`&` 当分隔符，实测 `'Out-Null' is not recognized` + 退出码 255 + **产物目录为空** ⇒ 每次启动都走 `:backup_failed`。**已恢复 `"…"` 包裹**，并在此后的每一轮都经 `cmd.exe` 实测（夹具断言首字符码 = 34）。**教训**：`start.bat` 的这类载荷**只能靠"逐字做成 .bat 交给 cmd.exe"来验证**；把载荷字符串直接交给 PowerShell 会绕过 cmd 解析层，这类缺陷 100% 不可见。
2. **【新风险，已知且当前正确】`L121` 顶格即坏**：续行以 `"` 顶格时会重现上面同样的 255/`'Out-Null'` 故障（附加对照 2）。当前文件有 2 个前导空格、实测正常；但**任何"格式化/去缩进"式改动都会静默打掉备份**，且 `git diff --check` 与常规审阅都看不出来。建议把这条写进 `AGENTS.md` 的 bat 踩坑清单。
3. **`.partial` 的可见性**：中断残件现在不占 7 份限额，也**不会被自动清理**（按铁律只提示、不自动删）。代价是磁盘上可能积累大体积 `.partial`（本夹具里单份 182 MB）。这是**有意为之**的取舍（避免误删他人产物），但用户需要自己清理——提示行已给出。
4. **`Move-Item` 失败路径**：目标被占用等异常会走 `catch` → 回收自己的 `$part` → `exit 1` → `:backup_failed`。这条路径**未单独做夹具**（只验证了不带 `-Force` 会抛 `IOException`）；它与"失败不阻塞启动"的既有语义一致。
5. **`$PID` 复用的遗留 `.partial`**：同一 PID 复用时若上次残留同名 `.partial`，载荷会**先把它送回收站再写**（避免往有内容的文件上续写）。理论窗口极小，未做夹具。
6. **夹具覆盖面的边界**：合成库、单机、`%TEMP%`、SSD；未覆盖磁盘满、目录只读、网络盘、真实 52 表库。7 份限额用的是**合成件**（5 个种子即触发 5<7，未实测 >7 的提示），但该分支与本次改动无关（`-Filter` 未变）。
7. **未做**：`task/CHANGELOG.md`、`HANDOFF.md`、`docs/QUICKSTART.md` 未改（本卡要求"不 commit"；`QUICKSTART:169` 的最终文件名格式**未变**，故无需同步文案）。

## 5. 证据

- 被测文件：`start.bat`（工作树，**未 commit**）。`git diff --stat`：`start.bat | 8 ++++++--`；`git ls-files --eol start.bat` = `i/lf w/crlf attr/text eol=crlf`；`git diff --check` 无输出（exit 0）；13527 字节 / 194 行 / LF-only=0 / 严格 UTF-8 / 无 BOM。
- 夹具：`%TEMP%\fq_vs17_fixture.ps1`（ASCII-only，经 `powershell.exe -File` 跑），`cmd.exe` 子进程逐次运行 `%TEMP%\run_*.bat`（由 `start.bat:118-124` **逐字**生成）；合成库 `%TEMP%\fq_vs17_hold.py`（WAL + `wal_autocheckpoint=0` + 保持连接）；损坏源 `fq_vs17_make_corrupt.py`；非数据库源 `fq_vs17_make_notadb.py`；种子 `fq_vs17_seed_valid.py`；校验 `fq_vs17_integ.py` / `fq_vs17_rows.py`。
- 原始转录（本次最终轮 v6，与本文件引用的数字一一对应）：`%TEMP%\fq_vs17_console6.txt`（15613 字节，含 S1/S2/S3/S4a/S4b×4/S6/S5/清理全量输出）与 `%TEMP%\fq_vs17_transcript.txt`。前一轮 `fq_vs17_console5.txt` 同结论（已回收）。
- **收尾**：沙箱目录、`run_*.bat`、`out_*/err_*`、`t2*`、`s6_*`、`start.bat.HEAD` 等 **133 个临时件已全部送回收站**（无硬删、无残留沙箱）；**按证据留存**只保留 9 个小文件（`fq_vs17_fixture.ps1` 夹具 + 5 个 helper `.py` + 2 份转录），均在 `%TEMP%` 下、评估者复核后可自行清理。
- 沙箱安全证据（清理输出）：`recycled junction (link only) …` → `root exists after cleanup = False` → `real venv python still present = True` / `real venv site-packages dirs = 190`。
- 语义对照基线：`git show HEAD:start.bat`（旧载荷）在同秒场景下删除了有效备份（4b 格 c/d）。
- 全过程无 commit（`git status --short` 中 `start.bat` 仍为 ` M`；其余改动属于其他 agent 的在途工作）。

