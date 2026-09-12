# IMPLEMENT_RESULT — VS-18：让"残缺件"不可能被误认为可用备份（P1 数据丢失）

> 实现者：IMPLEMENTER。工作目录 `E:\Code_file\Projects\finquant-hub`。**未 commit**。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS18.md` + 编排者中途两条更正（N1 措辞中性化、N2 放宽遗留提示过滤器、N3 收益窄化）。
> 本卡改动**只涉及两个文件**：`docs/QUICKSTART.md`、`start.bat`。（工作树里还有 `frontend/src/*` 的改动，属**其他 agent 在途**，我未触碰、也未提交。）

---

## 0. 结论（一句话）

恢复指引现在**显式限定只选 `finquant-backup-*.db`**、并说明"以 `.partial` 结尾的一律不作为恢复来源（内容是否完整无法从名字判断）"；启动时新增/修正的提示用**同一口径**；`start.bat:121` 三处回收动作包进 `try/catch`，**实测回收失败后流程继续、不再以终止错误收场，且退出码语义不变**。

---

## 1. 改动清单（文件:行 + 前后对照）

### 1.1 `docs/QUICKSTART.md`

| 位置（改后行号） | 改动 |
|---|---|
| `:171`（**新增段落**） | 备份形态补一段：写入期先出现 `.db.<数字>.partial` 临时件，**校验通过并改名后**才成为正式备份 |
| `:176`–`:178` | 恢复步骤第 2 步：**显式限定**只挑 `finquant-backup-*.db`，并给出两条排除理由 |
| `:179` | 恢复步骤第 3 步：明确"用上一步挑出的那个 `finquant-backup-*.db`"覆盖 |

**前后对照 1（原 `:169` 末尾 → 现在 `:169` 末尾 + 新增 `:171`）**

改前（`HEAD`，`:169` 结尾）：

```
…快照是**单一、自洽**的文件，已经包含尚未合并进主文件的最新数据，所以恢复时只需覆盖 `finquant.db` 一个文件。备份失败不影响启动（数据仍可用）。
```

改后（`:169` 结尾**不变**，其后新增空行 + `:171`）：

```
…备份失败不影响启动（数据仍可用）。

**写入期间会先出现一个临时文件**：备份分两步落盘——先把快照写进形如 `finquant-backup-20260913-083000.db.1234.partial` 的临时文件（`.db.` 后面是进程编号），**校验通过并改名之后，它才会成为正式的 `finquant-backup-*.db`**。因此备份进行中在同一个目录看到 `.partial` 文件属正常现象；**请不要把它当作可恢复的备份**——它只是"还没改名"，**内容是否完整无法从名字判断**（可能完整，也可能残缺）。如果启动窗口早已结束、确认没有备份正在运行，你可以按自己的习惯把它移走或送回收站（系统只会在启动时提示存在这类未完成文件，不会替你清理）。
```

**前后对照 2（原 `:174` → 现在 `:176`–`:178`）**

改前：

```
2. 打开 `backend/data/backups/`，选一个最近、状态正常的备份文件。
```

改后：

```
2. 打开 `backend/data/backups/`，**只挑文件名形如 `finquant-backup-*.db` 的文件**（例如 `finquant-backup-20260913-083000.db`），在其中选一个最近、状态正常的。
   - **不要用任何以 `.partial` 结尾的文件**（例如 `finquant-backup-20260913-083000.db.1234.partial`）：那是备份**尚未改名完成**的临时件，**内容可能完整、也可能残缺，无法从名字判断**，所以**一律不作为恢复来源**。
   - 只看"谁最新"不够：这类临时件的名字里同样带时间戳，**往往就是该目录中时间最新的那个**，按文件名排序会排在所有正式备份前面；请按结尾是 `.db` 还是 `.partial` 来判断，而不是按时间。
```

**前后对照 3（原 `:175` → 现在 `:179`）**

改前：`3. 把 … 然后用选中的备份文件**覆盖** `backend/data/finquant.db`。`
改后：`3. 把 … 然后用上一步挑出的那个 `finquant-backup-*.db` 文件**覆盖** `backend/data/finquant.db`。`

> 按编排者 N1 更新：**不说"一定不完整"**（评估者实测残件可能 `integrity_check=ok`），也不说"可用"，而是"**无法从名字判断 ⇒ 一律不作为恢复来源**"。
> 全文一致性：`QUICKSTART` 里另一处 `PARTIAL`（`:113`/`:115`）是**行情数据状态词**，与备份无关，未改；全文再无其他 `.partial` 说法与新段落冲突。

### 1.2 `start.bat:121`（单行载荷内，三处）

**改动 A：三处回收动作包 `try/catch`（逐字替换，3/3 生效）**

改前（三处同形）：

```powershell
if(Test-Path -LiteralPath $part){ Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($part,'OnlyErrorDialogs','SendToRecycleBin') };
```

改后（三处同形）：

```powershell
if(Test-Path -LiteralPath $part){ try{ Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($part,'OnlyErrorDialogs','SendToRecycleBin') }catch{ Write-Host '[提示] 未能把临时文件送入回收站，已跳过（不影响本次启动）。' } };
```

**改动 B（N2）：遗留提示过滤器放宽**（7 份计数**未动**）

- 改前：`-Filter 'finquant-backup-*.partial'` → 改后：`-Filter 'finquant-backup-*.partial*'`（尾星承重，见 §3.7）
- 7 份「有效备份」计数仍是 `-Filter 'finquant-backup-*.db'`（`start.bat:121` 与 `:117` 注释），**逐字未改**。

**改动 C（N1 同源）：该提示的措辞与 `QUICKSTART` 对齐**

- 改前：`'[提示] 检测到 '+$left.Count+' 个未完成的备份临时文件（*.db.编号.partial 及其 -wal/-shm 等伴生文件，可能来自上次中断或另一个正在运行的实例）；确认无用后可在文件管理器中手动删除（回收站）。'`
- 改后：`'[提示] 检测到 '+$left.Count+' 个尚未改名完成的备份临时文件（*.db.编号.partial 及其 -wal/-shm 等伴生文件，可能来自上次中断或另一个正在运行的实例）；其内容是否完整无法从名字判断，请勿作为恢复来源；确认无用后可在文件管理器中手动删除（回收站）。'`

**未动**（逐条核对）：`:120` 载荷首行、`:118/:119/:122` 三条分支、`:123` 成功提示、`:126`–`:128` `:backup_failed` → `goto launch`、7 份计数与超限提示、两阶段落盘与 `sqlite3.Connection.backup()` + `PRAGMA integrity_check`、`:113-117` 注释块。

---

## 2. 静态/字节级判据（全部实测）

```
lines=194 LF=194 CRLF=194 LFonly=0            ← CRLF 完整，无 LF-only
line121 leading=2 first=34 last=34            ← 两条承重属性保持（Trim 后首末均为 " ）
DeleteFile_total=3  DeleteFile($part)=3  DeleteFile($dest)=0   ← VS-17 成果未破
tryRecycle=3  catchWriteHost=3                ← 三处回收动作均在 try/catch 内
hintFilter('finquant-backup-*.partial*')=1    ← 放宽后
dbFilter('finquant-backup-*.db')=2            ← 与 HEAD 相同（1 处代码 + 1 处注释），未受影响
git diff --check → 干净（exit 0）
start.bat 无 BOM（首字节 64='@'），UTF-8 严格
docs/QUICKSTART.md：LF-only（197 LF / 0 CRLF），与仓库既有形态一致，未引入混合行尾
TEMP-REPRO/MUTATED/XXX-TEMP 扫描：无命中
```

实测命令（节选）：

```
$lines=[System.IO.File]::ReadAllLines($p,[System.Text.UTF8Encoding]::new($false)); $l=$lines[120]; $tr=$l.Trim()
按字符码判断：leading=$($l.Length-$l.TrimStart(' ').Length) first=$([int][char]$tr[0]) last=$([int][char]$tr[$tr.Length-1])
→ line121 leading=2 first=34 last=34
```

---

## 3. 行为实测（原始输出）

> 夹具纪律：把 `start.bat:120-121` **逐字**（`$src[119]`/`$src[120]`，**未 `Trim()`/未重排**）写入 `$env:TEMP` 下的 `.bat`，经 **`cmd.exe`** 运行；`backend\.venv` 用 **junction** 指向真实 venv；合成库由真实 venv 的 python 生成。
> 夹具自检：`payload_verbatim=True leading=2 first=34 last=34`（即夹具载荷与 `start.bat` 对应行 `-ceq` 逐字相等）。

### 3.1 真实 `start.bat` 端到端（决定性证据，非"抽取行"）

把**当前工作树里的 `start.bat` 字节级复制**到沙箱（`start.bat_copied_bytes_identical=True bytes=13916`），沙箱内放好 `backend\.venv`(junction) / `backend\.env` / `frontend\dist\index.html` / 合成 `backend\data\finquant.db`，然后 `cmd.exe /c start.bat`：

```
[准备] 复用已有 frontend\dist（构建时间：2026/9/11 22:49）。
[准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。
[提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
[启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
…
[错误] 服务启动失败。…（沙箱无 backend\app，uvicorn 报 ModuleNotFoundError: No module named 'app'）→ :fail，属预期）
cmd_exit=1
```

沙箱 `backend\data\backups`（连跑 3 次，含一次预置了残件+伴生件）：

```
finquant-backup-20200101-000000.db.424242.partial        32   ← 预置残件（其他 PID）
finquant-backup-20200101-000000.db.424242.partial-wal    48   ← 预置伴生件
finquant-backup-20260911-224950.db  32768
finquant-backup-20260911-225106.db  32768
finquant-backup-20260911-225120.db  32768
newest=finquant-backup-20260911-225120.db  integrity=ok  rows=1500
```

第 3 次（预置残件后）真实窗口输出**逐字**：

```
[提示] 检测到 2 个尚未改名完成的备份临时文件（*.db.编号.partial 及其 -wal/-shm 等伴生文件，可能来自上次中断或另一个正在运行的实例）；其内容是否完整无法从名字判断，请勿作为恢复来源；确认无用后可在文件管理器中手动删除（回收站）。
```

判定：① **真实文件（含全部中文与 `try/catch`）经 cmd.exe 解析正常**，备份照常产出；② 新措辞、新过滤器端到端生效，`2` = 残件 + 其 `-wal` 伴生件（**N2 实测闭环**）；③ 残件与伴生件 3 次运行后**仍未被触碰**。

### 3.2 夹具·正常路径（合成 WAL 库：数据只在 `-wal` 里）

```
holder_pid=26456 main_bytes=4096 wal_bytes=45352        ← 库本体仅 4096 字节，2000 行全在 WAL
[提示] 检测到 1 个尚未改名完成的备份临时文件（…）
[fixture] BRANCH=launch BKRC=0
finquant-backup-20200101-000000.db.424242.partial  64    ← 预先放入的"其他 PID"残件
finquant-backup-20260911-225151.db  36864
integrity=ok   rows=2000                                 ← 2000 行全部来自 WAL
stale_leftover_present=True   own_partial_left=0
```

判定：**快照仍是 `sqlite3.Connection.backup()`**（若退回"只复制 `.db`"只会得到 0 行）；正常路径退出 0 → `:launch`。

### 3.3 夹具·失败路径（源库被写成垃圾字节）

```
Traceback (most recent call last):
  File "<string>", line 1, in <module>
sqlite3.DatabaseError: file is not a database
[fixture] BRANCH=backup_failed RC=1
---RECYCLE DELTA---
  RB+: finquant-backup-20260911-225208.db.18332.partial
---DIR STATE---
  finquant-backup-20190101-000000.db 8192                  ← 预置的有效备份，未被触碰
  finquant-backup-20200101-000000.db.424242.partial 64     ← 其他 PID 的残件，未被触碰
```

判定：① 仍 `exit 1` → `:backup_failed`（**退出码语义不变**）；② 回收站里**只有它自己的** `.partial`；③ **没有**产出最终 `.db`；④ 目录里既有 `.db` 与其他 PID 残件**一动不动**（`DeleteFile($dest` 计数 0 的运行时旁证）。

### 3.4 ★ 回收失败不再终止 —— 集成实测（**用逐字载荷**，本卡采用的两种方法之一）

构造"不可回收"：另起一个 python 监视进程，对备份目录里出现的 `*.partial` 以 `open(p,'rb+')` 持有（Windows 上该句柄**不允许 DELETE 共享**）⇒ `Move-Item` 失败 → 进入 `catch` → `DeleteFile` 抛 `IOException: The process cannot access the file because it is being used by another process`。

**新载荷（当前 `start.bat:121` 逐字）**：

```
[提示] 未能把临时文件送入回收站，已跳过（不影响本次启动）。   ← 新增的 catch 真的执行了
[fixture] BRANCH=backup_failed RC=1
elapsed_ms=2182       ← 未挂起
before=0 after=0      ← 无残留 powershell 进程（模态框假说未成立）
```

**旧载荷（`git show HEAD:start.bat`，同一沙箱、同一构造）**：

```
Exception calling "DeleteFile" with "3" argument(s): "The process cannot access the file because it is being used by
another process"
At line:1 char:1405
+ ... isualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($pa ...
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : IOException

[fixture] BRANCH=backup_failed RC=1
```

判定：**旧实现下同一个回收失败会抛出终止错误（红字）**，`$ErrorActionPreference='Stop'` 把它打成脚本终止；**新实现下它被 catch 接住、打印一行中性提示，随后按原语义 `exit 1`**。（⚠️ 收益窄化见 §4.2。）

### 3.5 回收失败不再终止 —— 隔离最小探针（方法二，交叉印证）

把 `start.bat` 里**逐字抽出**的两种语句，分别做成 `.bat`（保留 `powershell.exe … -Command ^` 续行结构，经 `cmd.exe` 跑），`$ErrorActionPreference='Stop'`，目标是一个**必然抛错**的 `DeleteFile`（`Test-Path` 为真、但目标是不存在的文件/目录，VB 抛 `FileNotFoundException`）：

| 探针 | 语句 | 输出 | errorlevel |
|---|---|---|---|
| `probe_bare`（HEAD 形态，无 try/catch） | 逐字取自 HEAD | **没有** `AFTER_RECYCLE`；stderr 为 `Exception calling "DeleteFile" … FileNotFoundException` | **1** |
| `pw_ascii` / `pw_empty`（当前形态，有 try/catch） | 除 catch 文案外逐字取自当前 `:121` | `CATCH…` → `AFTER_RECYCLE` | **0** |

判定：**同一条件下，裸调用会终止脚本（后续语句不执行、errorlevel=1），包进 `try/catch` 则继续执行（errorlevel=0）。**

> **诚实边界（§4.1）**：探针 `.bat` 的 catch 文案若保留中文，`cmd.exe` 会在这类**小体积合成 .bat** 上解析失败（`RC=9009` / `123`，`'$ErrorActionPreference' is not recognized…`）。该现象**与位置无关**（catch 内、顶层 Write-Host 都复现；加 160 行 ASCII 填充、改短文案均复现），但在**真实 `start.bat`（13916 字节）与逐字夹具（含同样中文）上完全不复现**——§3.1/§3.2/§3.3/§3.4 全部正常。因此探针用的是 ASCII catch 文案；**逻辑结论不依赖该文案**，且"逐字载荷 + 真中文"的行为由 §3.4 独立证明。

### 3.6 残件确实不会被自动回收（文档写"请你自己处理"的依据）

- 夹具正常路径：预置 `finquant-backup-20200101-000000.db.424242.partial`（**其他 PID**）→ 运行后 `stale_leftover_present=True`、字节数仍 64（§3.2）。
- 真实 `start.bat`：预置残件 + 伴生件，连跑 2 次后仍为 32 / 48 字节（§3.1）。
- 机理（已核对代码）：回收判据是 `Test-Path -LiteralPath $part`，而 `$part = $dest + '.' + $PID + '.partial'` **含本进程 PID** ⇒ 上次中断留下的残件名字对不上，永不被后续运行回收。
- 旁证（编排者转述 VS-17 评估者实测）：紧轮询在写满瞬间 kill 得到的残件，7 份计数=2（数不到它），后续运行逐字节未动它。

### 3.7 `-Filter` 尾星语义（N2 的实测依据）

在探针目录放 6 个文件（`.partial`、`.partial-wal`、`.partial-shm`、`.partial-journal`、2 个真 `.db`）：

```
newHintFilter('finquant-backup-*.partial*') = 4   ← 残件 + 三个伴生件，全中
sevenCountFilter('finquant-backup-*.db')    = 2   ← 只中两个真 .db
oldHintFilter('finquant-backup-*.partial')  = 1   ← 尾星一丢，三个伴生件全漏
```

判定：放宽**只影响"遗留提示"**，7 份「有效备份」计数不受影响（仍是 `*.db`，实测只匹配真 `.db`）。

---

## 4. 未解决问题 / 风险 / 未验证

### 4.1 `cmd.exe` 在"小体积合成 .bat + 中文"上的解析怪象（**已界定，不影响交付**）
探针 .bat 中出现中文时，`cmd` 会把 `powershell` 载荷行解析错（`RC=9009/123`）。已做的排除：与中文**位置**无关、与**文件体积**无关（160 行填充复现）、与 `setlocal` 无关；**同一段中文放进真实 `start.bat`/逐字夹具则完全正常**（§3.1–§3.4 共 8 次运行）。⇒ 归属为**探针夹具的 cmd 解析怪象**，不是 `start.bat` 缺陷；但我**没有定位到根因**，若后续有人写小 .bat 夹具请直接引用本结论，别重踩（建议夹具 >10 KB 或 catch 文案用 ASCII）。

### 4.2 `try/catch` 的收益是**窄化**的（N3，照实写）
D4 原文说"回收失败会把备份流程打成终止错误"**语气过强**。逐条追踪三处调用点：它们**都在"结局已定"的路径上**——
- 第 1 处（写入前的自清理）：仅当"自己的 PID + 当前秒"的残件已存在才会进入，实际不可达；
- 第 2/3 处：都在 `exit 1`（→`:backup_failed`）之前，**分支与退出码都不变**（§3.4 实测：新旧载荷最终都是 `BRANCH=backup_failed RC=1`）。

⇒ 真实收益是：**不再向启动窗口抛红字终止错误、恢复被 catch 打断的 `exit` 语句、保持"失败不阻塞启动"的观感**；**不会**把失败变成成功，也**不会**改变 `:118/:119/:122` 的分支走向。加它的代价近乎为零，故仍加。

### 4.3 回收失败时 `.partial` 会留在磁盘上（**有意的取舍，但会累积**）
§3.4 沙箱里三次运行留下了 3 份 16 KB 的 `.partial`（回收失败 ⇒ 残件无法被送走）。这正是 N2 放宽过滤器（让伴生件也被提示到）的动机：**只提示、不自动删**（遵守删除铁律与"不误删他人产物"）。用户需要自己清理。

### 4.4 "无回收站的卷"未真实构造
§3.4/§3.5 构造的是"**目标文件无法被移动/删除**"（被独占打开 / VB 抛 `FileNotFoundException`），**不是**"卷上没有回收站"。两者对被测语句而言同属"`DeleteFile` 抛异常"，结论可迁移，但**字面上的无回收站卷未实测**。另：`DeleteFile(..., 'OnlyErrorDialogs', ...)` 在失败时**是否弹模态框未直接观测**——§3.4 实测无挂起（2182 ms 返回）、前后无残留 `powershell.exe`，故本次未见对话框；**在无回收站卷上是否弹框仍属未知**。

### 4.5 未做（超范围，按卡）
未改 `$dest` 的同秒唯一性（R4 的 P3）、未改 `:117` 注释措辞、未动 7 份滚动保留策略、未碰任何后端/前端代码、**未 commit**。

---

## 5. 证据与产物

- 改动文件：`docs/QUICKSTART.md`、`start.bat`（`git diff --check` 干净；工作树中 `frontend/src/*` 的改动为**他人在途**，与本卡无关）
- 沙箱（`$env:TEMP\fqvs18\`，收尾已全部送回收站）：`lab1/lab2/lab6/lab7`（夹具）、`lab4`（真实 `start.bat` 端到端）、`probe`（bare/wrapped 探针）、`filterprobe`（`-Filter` 语义）
- 关键实现细节：`start.bat:121` 的三处 `try/catch` 用**同形整段替换**（`replace_all`，3/3 命中），因此三处文案与结构完全一致；改动前后 `DeleteFile($dest` 均为 **0** 次。
