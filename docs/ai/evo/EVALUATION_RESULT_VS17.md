# EVALUATION_RESULT — VS-17：备份产物在多实例与硬中断下不留隐患

> 角色：EVALUATOR（独立验收，假设实现有错，不采信自述）。日期：2026-09-11。
> 待验：任务卡 `docs/ai/evo/IMPLEMENTATION_BRIEF_VS17.md`、实现者报告 `docs/ai/evo/IMPLEMENT_RESULT_VS17.md`（交付提交 `e2007ea`）。
> 判定：**ACCEPT**。六条验收标准全部由**独立夹具**复现；1 条既有 P1 遗留属 VS-18 范围（本卡被明令冻结 `QUICKSTART` 与 7 份文案），不构成本卡驳回理由；4 条非阻塞观察见 §6。

## 0. 被验对象与"我测的到底是哪个字节"

- **HEAD 在评估期间前移**：开始 `d3d6718` → 中途 `c7b320d` → 结束 `b055a6e`（均为他人提交）。已复核 `git diff --stat e2007ea HEAD -- start.bat` **无输出**、`git diff --stat e2007ea -- start.bat`（工作树）**无输出** ⇒ 本卡交付后 `start.bat` 一字未动，**下述判定基于当前 HEAD 与工作树（二者对 start.bat 相同）**。工作树只多一个他人的 untracked 文件 `IMPLEMENTATION_BRIEF_VS18.md`。
- **不复用实现者夹具**。自建方法：用 `[System.IO.File]::ReadAllLines($p,[System.Text.UTF8Encoding]::new($false))` 严格读盘上的 `start.bat`，取 0-based `117..123`（即 `:118-124`，含 `powershell.exe -NoProfile -Command ^` 续行与**带 2 前导空格的载荷行**），**逐字**拼成 `fix_new.bat`（头部 `@echo off` + `chcp 65001 >nul` + `setlocal DisableDelayedExpansion`，尾部自建 `:backup_failed` / `:launch` 标签并 `exit /b`），交 `cmd.exe /c` 运行。旧载荷对照夹具同法取自 `git show e2007ea~1:start.bat`（190 行版）。
- **抽取保真性自证（关键）**：把 194 行按 CRLF 重新拼回后与磁盘文件**逐字节相等**（`SequenceEqual=True`）；两条夹具的载荷行与各自源行 `-ceq` 比较均为 `True`。⇒ 不存在"Trim 掉行首空格""重排续行"这类夹具污染。
- **明确不采用的错误方法**：直接调 PowerShell 喂载荷字符串——它绕过 cmd 解析层，引号/缩进类缺陷 100% 不可见。

## 0.1 【追加】评估结束后工作树被他人改写（务必阅读）

我在完成 §3 全部实测之后，工作树被**另一位 agent 的 VS-18 在途改动**改写：`git status --porcelain` 变为 ` M start.bat`、` M docs/QUICKSTART.md`、新增 `IMPLEMENT_RESULT_VS18.md`。`start.bat` 的 diff（vs `e2007ea`）是**给三处 `DeleteFile` 各包了一层 `try/catch`**（`catch` 内 `Write-Host '[提示] 未能把临时文件送入回收站，已跳过…'`）。

- **本报告的判定只针对已提交的 `e2007ea` 载荷**（§0 首条已证：评估期间 `e2007ea`、当时的 HEAD、当时的工作树三者对 `start.bat` 无差异）。
- 顺带复核（**非本卡范围、未做动态验证**，仅静态）：那一刻的 `start.bat` 仍然是 194 行、`L121` 前导空格 = **2**、`Trim()` 首末字符码 = **34/34**、`DeleteFile($dest)` = **0**、`try{ Move-Item … -Force }` = 1、`try{ Add-Type }`（新增保护）= 3、CRLF=194 / lone LF=0 ⇒ **VS-18 的在途改动没有破坏 VS-17 的任何契约**。
- 提交前请按 `AGENTS.md` 规矩确认"提交内容 == 预期文件集 == 最终态"：当前工作树**不是** VS-17 的交付态，不要把在途文件当成 VS-17 一并提交。

## 1. 静态核对（逐条；下表基于"已提交 `e2007ea` == 评估时工作树"，见 §0.1）

| 核对项 | 实测 | 判定 |
|---|---|---|
| `DeleteFile($dest` 出现次数 | **0**。（全文件 `DeleteFile(` 共 3 次，全部是 `DeleteFile($part`） | ✔ |
| 失败清理是否只针对 `$part` | 3 处（写前清同名残留 / 失败分支 / `Move-Item` 的 `catch`）目标**全部是 `$part`** | ✔ |
| `$part` 是否含 `$PID` | `$part=$dest+'.'+$PID+'.partial'`（命中 1 次）⇒ 同秒两进程不会共用同一 partial 名 | ✔ |
| `Move-Item` 是否带 `-Force` | `try{ Move-Item -LiteralPath $part -Destination $dest -Force }catch{...}` | ✔ |
| 是否在 `try/catch` 内 | 是；`catch` 内先回收 `$part` 再 `exit 1` | ✔ |
| 快照是否仍是 `Connection.backup()` + `integrity_check` | `s.backup(d)` 1 次、`integrity_check` 1 次；全文件 `Copy-Item` **0** 次 | ✔ **未退回"只复制 finquant.db"** |
| `:118` 无库 `goto launch` | 未变 | ✔ |
| `:119` 无 venv `goto backup_failed` | 未变 | ✔ |
| `:122` 非零 `goto backup_failed` | 未变 | ✔ |
| "失败不阻塞启动" | `:126-128` `:backup_failed` 仍是"提示 + `goto launch`"，**不是硬失败** | ✔ |
| 7 份 `-Filter 'finquant-backup-*.db'` | 出现 2 次（遗留提示 + 7 份提示），**语义未变**；新增 `-Filter 'finquant-backup-*.partial'` 1 次 | ✔ |
| 字节级 | CRLF=194 / LF=194 / **lone LF=0** / 无 BOM（64,101,99）/ 严格 UTF-8 可解（无非法序列）/ `git ls-files --eol` = `i/lf w/crlf attr/text eol=crlf` | ✔ |

`git diff --check e2007ea~1..e2007ea` 唯一输出 `docs/ai/evo/IMPLEMENT_RESULT_VS17.md:254: new blank line at EOF`——属实现者报告，**不在被测文件内**，仅记录。

## 2. 两条承重属性（如实核对行号与字符码）

`start.bat` 第 **121** 行 = `ReadAllLines(...)[120]`：

| 属性 | 实测 | 判定 |
|---|---|---|
| 行首前导空格数 | **2**（字符码 32, 32） | ✔ |
| `Trim()` 后首字符码 | **34**（`"`） | ✔ |
| `Trim()` 后末字符码 | **34**（`"`） | ✔ |
| 行长 | 1951（字符数，含中文） | — |
| 夹具内同行 | `leading=2 / first=34 / last=34 / -ceq 源行 = True` | ✔ |

⇒ 顶格即坏（255 + `'Out-Null' is not recognized` + 零产物）这条约束在本 HEAD 上**仍然满足**。

## 3. 动态实测（全部经 `cmd.exe`；合成库；`$env:TEMP` 沙箱）

沙箱 `%TEMP%\vs17_ev`，`backend\.venv` 为真实 `python -m venv --without-pip`（s2/s3/s4 用 junction 复用；**回收时先单独回收 junction**，实测真实 `backend\.venv\Scripts\python.exe` 完好）。合成 WAL 库：建库 → `journal_mode=WAL` → `wal_autocheckpoint=0` → 插 1200×100KB → **保持连接不关闭**。

### 3.1 ①正常路径 —— 通过

```
SOURCE: finquant.db=4096 bytes ; finquant.db-wal=124234512 bytes (118.5MB)   ← 数据只在 -wal
RUN fix_new.bat (cmd.exe, cwd=sandbox)
  OUT| [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。
  OUT| [FIXTURE] LAUNCH_OK
  EXITCODE=0
backups: finquant-backup-20260911-223201.db  123502592 bytes
  db_count=1  partial_count=0
  integrity= ok   rows= 1200   (源 rows=1200)
  BACKUP size=123502592 vs SOURCE main .db=4096  ⇒ 30,152x
```

**关键**：源主文件 4096 字节而产物 123,502,592 字节、行数一致 ⇒ 产物数据**必然来自 `-wal`**，快照没有退化成"只复制 `.db`"。文件名格式、无 `.partial` 残留、退出 0 全部满足标准 1。

### 3.2 ②失败路径（源库损坏）—— 通过

源 `finquant.db` = 65536 字节 `SQLite format 3\0` + 随机体。

```
OUT| sqlite3.DatabaseError: file is not a database
OUT| [FIXTURE] BACKUP_FAILED
EXITCODE=1
backups 目录存在但为空：db_count=0  partial_count=0
recycle-bin 前后：911 → 912
  DELTA(=>) = finquant-backup-20260911-223234.db.15876.partial      ← 仅此项，无任何 .db
data/ 下源 finquant.db 仍为 65536 字节（未被触碰）
```

**关键**：非零退出、**目录中无最终 `.db`**、回收站 delta **只有自己的 `.partial`**（名字含本进程 PID 15876），满足标准 2。

### 3.3 ③硬中断 —— 通过（两种中断点都测了）

- **写一半被打断**：`taskkill /PID <cmd> /T /F` ⇒ 残件 `finquant-backup-20260911-223257.db.18140.partial`（84279296 字节）+ `…partial-journal`（1024 字节）。
- **"part 已写完、尚未改名"被打断**（本卡要求的那一点）：用 .NET 紧轮询（`Directory.GetFiles` + `FileInfo.Length`，阈值 110MB，实测 239 次迭代 / 1084ms 命中）在数据写满的瞬间 kill：

```
HIT finquant-backup-20260911-223634.db.26800.partial  size=117911552  t=1084ms
POST:  finquant-backup-20260911-223634.db.26800.partial      123502592 bytes
       finquant-backup-20260911-223634.db.26800.partial-shm   32768
       finquant-backup-20260911-223634.db.26800.partial-wal       0     ← 校验连接已打开该文件
SCENARIO3: 7-count(Filter 'finquant-backup-*.db') = 2   ;  '*.partial' = 2
```

**关键**：残件落在**完整大小 123,502,592 字节**（与一份有效备份等大）且**7 份计数数不到它**（7-count 只数到那 2 份有效 `.db`，残件 0 贡献）⇒ 满足标准 3。

**追加实测（残件是否被后续运行动过）**：再跑一次正常备份，输出

```
OUT| [提示] 检测到 2 个未完成的备份临时文件（*.db.partial，可能来自上次中断或另一个正在运行的实例）；…
OUT| [准备] 已生成数据库快照…
EXITCODE=0
BEFORE/AFTER 逐文件 sha256 比对：
  …223257.db.18140.partial  84279296  44452C4A9C835FCE   ← 未动
  …223257.db.18140.partial-journal 1024 7125F6D428DD19EC ← 未动
  …223314.db / …223449.db（有效）     哈希未动
  …223634.db.26800.partial 123502592 7475ECCA5D5B4B12   ← 未动
  DELTA = 仅新增 …223708.db
```

⇒ 残件**只提示、不自动删**（含"正在被另一实例写入"的情形也不会被误删），满足标准 3 与铁律。

### 3.4 ④同秒并发（本卡核心）—— **正面对照实测**

夹具 `fix_new.bat`（新载荷）与 `fix_old.bat`（`git show e2007ea~1:start.bat` 旧载荷，逐字）**并发同秒**启动，源库为损坏库（两进程都走失败分支），backups 目录**预置 16 份有效 `.db`**（`integrity_check=ok`，各不同内容，覆盖 −3s…+12s）。

```
SEEDS(16): finquant-backup-20260911-223707.db … 223722.db （各自 sha256 已记录）
recycle before=912
both finished in 1040ms ; NEW exit=1  OLD exit=1
AFTER(15): 少了 223713 那一份
SEED DELTA:  <= finquant-backup-20260911-223713.db|8192|C65613ECADA8D40B   ← 被移除
RECYCLE-BIN DELTA:
  => finquant-backup-20260911-223713.db                    ← 被删的是【有效 .db】
  => finquant-backup-20260911-223713.db.27144.partial      ← 新载荷只回收自己的
```

**两个进程都在同一年月日时分秒 `223713`**（旧进程 `$dest` = `…223713.db`，新进程 `$part` = `…223713.db.27144.partial`）。⇒ **旧载荷删掉了自己从未写过的、同秒的有效备份；新载荷一个 `.db` 都没碰。**这就是本卡价值的直接证据。

**把新载荷单独隔离，做 3 轮（非概率、可判定到秒）**：

| 轮 | exit | 目录中被移除的文件 | 回收站 delta | 该秒的预置有效 `.db` 是否仍在 |
|---|---|---|---|---|
| 1 | 1 | **NONE** | `…223751.db.24964.partial` | `…223751.db` → **True** |
| 2 | 1 | **NONE** | `…223755.db.23324.partial` | `…223755.db` → **True** |
| 3 | 1 | **NONE** | `…223758.db.18164.partial` | `…223758.db` → **True** |

回收站里那个 `.partial` 的名字**自带该进程实际使用的秒**，因此"是否同秒"与"删了谁"都有字节级证据：**新载荷在其操作的那一秒，同秒的有效备份原样存在**。三处 `$PID` 互异（24964 / 23324 / 18164）。

**同秒双跑的有效路径（标准 4②③）**：

- 两个新载荷并发 + 有效源：`A=0 B=0`，两次运行**产出同一个名字**（`…223858.db`，先 8192 字节种子 → 后 28672 字节真备份），`partial_left=0`，存活的 `…223858.db` `integrity=ok rows=2000` ⇒ **无进程因同名崩溃、至少一份有效且 `ok`**。
- 单个新载荷 + 有效源 + 同秒预置有效 `.db`：`exit=0`，**只有碰撞的那一份**从 `8192|834CAB7F3A35952D` 变为 `28672|54BCCB0A6C60BC55`（`Move-Item -Force` 覆盖），其余种子零变化，`partial-left=0`。

### 3.5 附加（实现者自陈"未做夹具"的那条新分支）：`Move-Item` 失败

用 `[System.IO.File]::Open(...,FileShare::None)` **独占锁住**备份目录里 ±6s…+20s 共 27 份同名有效 `.db`，使改名必然抛错：

```
window seeds=27 locked=27  window=20260911-224204..20260911-224230
EXITCODE=1   elapsed=1435ms
stdout: [FIXTURE] BACKUP_FAILED          ← 走 :backup_failed（提示 + goto launch），非硬失败
dir delta: （空）                        ← 62 份 .db 一份未少、一份未变
7-count=62 (before=62)   partial-left=0
recycle delta: finquant-backup-20260911-224220.db.26256.partial
   payload second=20260911-224220 ; 该秒是否在被锁窗口内 = True
```

⇒ `catch` 分支行为正确：**只回收自己的 `.partial`**、退出非零、`goto launch` 不阻塞启动；被锁的既有 `.db` 一份未动。**这补上了实现者 §4.4 明说未验证的缺口。**

## 4. 验收标准逐条裁决

| 标准 | 证据 | 判定 |
|---|---|---|
| 1 正常路径（最终 `.db` / 无 `.partial` / `ok` / 退出 0） | §3.1 | **PASS** |
| 2 失败路径（非零 / 无最终 `.db` / 自己的 `.partial` 进回收站） | §3.2 | **PASS** |
| 3 硬中断（残件为 `*.db.partial` 且不被 7 份计数匹配） | §3.3 | **PASS** |
| 4 并发（互不删、至少一份 `ok`、无进程崩溃） | §3.4（旧 vs 新同秒对照 + 3 轮隔离 + 双跑有效路径） | **PASS** |
| 5 不误删（给出前后清单） | §3.4 前后清单 + sha256；§3.5 | **PASS** |
| 6 字节级（CRLF 完整 / 严格 UTF-8 / `git diff --check`） | §1 末行 | **PASS** |

## 5. 重点质疑的逐条回答

1. **`.partial` 会不会被误当成可恢复件？——会，且这是真风险，但属 VS-18（P1）范围。**
   我实测到：被打断于"校验期"的残件 `…223634.db.26800.partial`（123,502,592 字节，sha256 前 16 位 `7475ECCA5D5B4B12`）与两份 `integrity_check=ok` 的有效备份 `…223314.db` / `…223449.db` **大小与哈希完全相同** ⇒ **`.partial` 后缀只保证"未改名"，不保证"残缺"**：它可能是一份**完整可用**的数据库。而 `QUICKSTART:174` 让用户"选一个最近、状态正常的备份文件"、全篇不提 `.partial`，`backups/` 里恰好就有它 ⇒ 数据受损时存在把（可能截断的）残件覆盖回 `finquant.db` 的路径。**本卡明令冻结 `QUICKSTART` 与文案**，故不作为驳回理由；与 R4 审计 D4-P1、VS-18 卡一致。
2. **硬中断残件会永久累积吗？——会（有意为之）。** 残件永不被后续运行回收（§3.3 哈希不变的实测即证），只提示。单次中断在夹具里留下 123.5MB。另外 `.partial-shm`（32KB）、`.partial-wal`、`.partial-journal`（1KB）这些**伴生文件既不被遗留提示计数、也不被 7 份计数匹配**，属"静默累积"（见 §6-N2）。提示文案已显式提示"可能来自另一个正在运行的实例；确认无用后…删除"，**误导用户去删正在写入的 partial 的风险较低**。
3. **同秒双跑最终只留 1 个 `.db`（后者覆盖前者）是否可接受？——可接受。** §3.4 实测：只有碰撞的那一份被 `-Force` 覆盖，其余零影响；两份内容同源、相隔毫秒。极端情况下（两次快照之间源库有写入）二者不等价，但**后者更新**，覆盖方向无损。需注意：被覆盖的旧文件**不进回收站**（PS 5.1 `Move-Item -Force` 语义，实测回收站 delta 为空）——任务卡 §错误场景已明确接受此取舍。
4. **`:backup_failed` 文案是否仍准确（现在也会因 `Move-Item` 失败触发）？——准确。** 文案 `:127`「数据库备份失败，本次未生成新备份，不影响启动；数据仍可用（可检查磁盘空间后重试）。」在 `Move-Item` 失败路径下：`catch` 回收了 `.partial`、没有产生最终件 ⇒ "本次未生成新备份"为真；"检查磁盘空间"仍是首要排查方向。**未改动的 `:126-128` 语义与文案均无需修正。**

## 6. 非阻塞观察与建议（不构成驳回）

- **N1（P1，已由 VS-18 承接）**：见 §5.1。建议 VS-18 除 `QUICKSTART` 外**同时收紧新增提示的措辞**——现在的"检测到 N 个**未完成**的备份临时文件"在"写满但未改名"的中断下是**不准确**的（实测该残件 `integrity_check` 与有效备份逐字节相同）。建议改为"未完成或未改名的临时文件（内容可能完整也可能残缺，请勿作为恢复来源）"。
- **N2（P3）**：`-journal` / `-shm` / `-wal` 伴生残件对两条提示都不可见，会静默累积。可把提示的 `-Filter` 放宽为 `'finquant-backup-*.partial*'`（既能数到伴生件，仍不匹配 `*.db`）。
- **N3（P3，已由 VS-18 承接）**：三处 `DeleteFile(...,'SendToRecycleBin')` **无 `try/catch`**，在 `$ErrorActionPreference='Stop'` 下，无回收站的卷/网络盘上会抛终止错误。我逐条追踪了三处调用点，它们**全部位于"结局已经是 `:backup_failed`"的路径上**（写前清同名残留需 PID 复用+同秒；另两处分别在备份失败与改名失败分支）⇒ **不存在"成功备份被误报为失败"的路径**，最坏后果是残件不被回收 + 一行红色报错。属健壮性打磨。
- **N4（P4）**：`IMPLEMENT_RESULT_VS17.md` 头部仍写"**未 commit**"，实际已提交 `e2007ea`；同文件 `:254` 有 EOF 空行（`git diff --check` 命中）。报告元数据陈旧，非代码缺陷。
- **N5（信息）**：评估期间 HEAD 被他人前移 3 次。本次判定绑定"`e2007ea` 与当前 HEAD 对 `start.bat` 无差异"这一事实；若后续有人改动 `:118-124`，本判定自动失效，**须重跑 §3 四场景**。

## 7. 结论

**ACCEPT。** 交付物在静态契约（`DeleteFile($dest)` 计数 0、`$PID` 唯一临时名、`-Force` 在 `try/catch` 内、快照仍是 `Connection.backup()` + `integrity_check`、三条既有分支与"失败不阻塞启动"未变、7 份 `-Filter` 未变、两条承重属性逐字成立）与四类动态场景上**全部通过**，并额外补验了实现者自陈未测的 `Move-Item` 失败分支。本卡的核心价值（同秒失败进程不再删掉他人的有效备份）由**旧/新载荷同秒对照**直接证明：**旧载荷删掉 `…223713.db`（有效），新载荷只回收自己的 `…223713.db.27144.partial`；隔离复跑 3 轮，目录中被移除的文件均为 NONE，且每一轮"该进程实际使用的秒"对应的预置有效 `.db` 都原样存在（哈希不变）。**

## 8. 证据与收尾

- 被测文件：`start.bat`（`e2007ea` == 当前 HEAD == 工作树，`git status --porcelain start.bat` 为空）。
- 夹具：`%TEMP%\vs17_ev\fix_new.bat` / `fix_old.bat`（逐字抽取，抽取保真性以"194 行重拼 == 磁盘字节"自证）；合成库 helper（WAL + `wal_autocheckpoint=0` + 保持连接）；`%TEMP%\vs17_mi\fix.bat`（`Move-Item` 失败路径）。
- 收尾：两个沙箱（含 4 个 junction）**已全部回收**——先单独回收 junction，再逐文件、由深到浅回收目录；回收后 `vs17_ev`/`vs17_mi` 均不存在，**真实 `backend\.venv\Scripts\python.exe` 完好**。无 `Remove-Item`/硬删；评估产生的残件按铁律进了回收站（测试残件约 210MB，在回收站中，用户可自行清空）。
- 未修改任何仓库文件（本文件除外），未 commit。
