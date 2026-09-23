# EVALUATION_RESULT — VS-18：让"残缺件"不可能被误认为可用备份（P1 数据丢失）

> 独立验收者：EVALUATOR。2026-09-11。工作目录 `E:\Code_file\Projects\finquant-hub`。
> 被验提交：**`5195d66`**（`git log` 中该卡的提交；其后另有 `e1421c4`，`--stat` 确认它**只改 `docs/ai/evo/PRODUCT_STATE.md`**，未触碰任何被验文件）。
> 角色纪律：**默认实现有错**、不采信自述；全部结论来自本次独立复算与实测。
> 未修改任何被验文件（`git diff --name-only HEAD -- start.bat docs/QUICKSTART.md` = 0）。工作树中 `frontend/src/*`、`backend/app/services/llm_client.py` 等**他人在途**改动未触碰、不计入判定。

## 判定：**ACCEPT**

两条承重目标均独立复现：①恢复指引已把用户挡在 `.partial` 之外（且理由按 N1 口径为中性"无法判断"）；②`start.bat:121` 三处回收失败**不再以终止错误收场**、退出码/分支语义不变。无阻断项；下列 NIT 仅记录事实，不影响交付。

---

## 1. 判定方法（与"直接喂 PowerShell"划清界限）

- 全部文本按 **严格 UTF-8 无 BOM** 读取：`[System.IO.File]::ReadAllBytes/ReadAllLines($p,[System.Text.UTF8Encoding]::new($false))`（未用裸 `Get-Content`）。
- 动态判据一律把 `start.bat:120-121` **逐字**（不 `Trim()`、不重排）拼成 `.bat`，**经 `cmd.exe`** 运行；夹具自证：`verbatim_new_l121=True`、`verbatim_old_l121=True`、`new_l121_lead=2 first=34 last=34`、`fixture_new_contains_l121_exact=True`。
- **被验字节 == 提交字节**：`[System.IO.File]::ReadAllLines` 逐行比较 `git show 5195d66:start.bat`（13803 字节 LF）与工作树 `start.bat`（13997 字节，CRLF 由 `.gitattributes` 导出）⇒ **194 行全部 `-ceq` 相等**。
- 未跑 pytest（本机沙箱会挂起）；本卡无 Python/前端代码改动，无需测试面。

## 2. 静态判据（逐条实测）

| 判据 | 实测 | 结论 |
|---|---|---|
| `:121` 行首前导空格 | `leading=2` | ✔ |
| `:121` `Trim()` 后首末字符码 | `first=34 last=34`（`"`） | ✔ |
| `DeleteFile(` 总数 / `DeleteFile($part` / `DeleteFile($dest` | `3 / 3 / 0` | ✔ VS-17 成果未破（绝不触碰 `.db`） |
| 三处回收动作在 `try/catch` 内 | `catch{ Write-Host` × **3**，三处 `DeleteFile` 全部落在 `try{ … }catch{…}` 中（偏移 5167/5850/6170） | ✔ |
| `$part` 含 `$PID` | `$part=$dest+'.'+$PID+'.partial'` × 1 | ✔ |
| `Move-Item` 带 `-Force` 且在 `try/catch` 内 | `try{ Move-Item -LiteralPath $part -Destination $dest -Force }catch{` × 1 | ✔ |
| 快照方式未退化 | `s.backup(d)` × 1、`PRAGMA integrity_check` × 1、`Copy-Item` × **0** | ✔ |
| 有效备份计数过滤器 | `-Filter 'finquant-backup-*.db'` 全文 2 处（代码 1 + 注释 1），与 `5195d66~1` **逐字相同** | ✔ |
| 遗留提示过滤器 | `'finquant-backup-*.partial*'` × 1；无尾星变体 × **0** | ✔ 尾星在 |
| `:118/:119/:122` 三条分支 | `git diff 5195d66~1 5195d66 -- start.bat` 的 hunk 仅含 **1 对 `-/+`**（即 `:121`），上下文行 `118/119/122/123/124` 原样 | ✔ |
| "失败不阻塞启动" | `:126 :backup_failed` → `:127` 提示 → `:128 goto launch` 未变 | ✔ |
| **载荷等价性（强判据）** | 把新载荷中 3 处 `{ try{ Add-Type` → `{ Add-Type`、3 处 ` }catch{ Write-Host '…' } };` → ` };` 后：**滤波前前缀 1559 字符逐字相同、提示串之后尾部 204 字符逐字相同** ⇒ 除「三处 try/catch」「尾星」「提示措辞」外**载荷无任何其它改动** | ✔ |
| 字节级 | `start.bat`：bytes=13997、CRLF=194、**lone LF=0**、strict_utf8=True、BOM=False（首字节 64 `@`）、控制字符=0；`docs/QUICKSTART.md`：bytes=17494、LF-only=197/CRLF=0（与 `HEAD~1` 形态一致，未引入混合行尾）、strict_utf8=True、BOM=False | ✔ |
| `git diff --check` | exit 0，干净 | ✔ |
| `TEMP-REPRO/MUTATED/XXX-TEMP` 扫描 | start.bat 0 命中 | ✔ |

## 3. 动态判据（原始输出）

夹具沙箱：`%TEMP%\fqvs18_eval\sandbox`（`backend\.venv` 为指向真实 venv 的 junction；真实 venv 有 `python.exe`）。**收尾已全部送回收站**（junction 单独先回收：`junction_is_reparse=True` → 回收后 `REAL_VENV_INTACT=True`、`site_packages` 190 个目录完好；再逐文件 + 由深到浅回收目录）。

### 3.1 ★ 回收失败不再终止（新载荷 vs 旧载荷，同条件对照）

构造"**回收必失败**"：监视进程以 `os.open(p, O_RDWR|O_BINARY)`（不允许 DELETE 共享）持有目标文件；两种构造分别命中**两个不同的调用点**。

**(a) 只锁 `*.partial` 本体 ⇒ 备份成功、`Move-Item` 失败（第 3 处调用点）**

```
=== RUN A2: NEW payload（工作树 :121 逐字）===
A2OUT| [提示] 未能把临时文件送入回收站，已跳过（不影响本次启动）。
A2OUT| [fixture] BRANCH=backup_failed
A2OUT| [fixture] DONE
A2WATCH| LOCKED 0.007s finquant-backup-20200101-000000.db.424242.partial size=64
LOCKED 0.824s finquant-backup-20260911-225930.db.18652.partial size=0        ← 本进程的 .partial 被锁
=== RUN B: OLD payload（5195d66~1 :121 逐字）===
BOUT| Exception calling "DeleteFile" with "3" argument(s): "The process cannot access the file because it is being used by another process"
BOUT| At line:1 char:1405
BOUT| + ... isualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($pa ...
BOUT| + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
BOUT|     + FullyQualifiedErrorId : IOException
BOUT| [fixture] BRANCH=backup_failed
```
判定：**同一失败条件下，旧载荷抛终止错误（红字，调用点被中止），新载荷被 `catch` 接住、打印中性提示、并真正执行到其后的语句。** 两者最终都 `errorlevel≥1 → BRANCH=backup_failed`（**退出码/分支语义未变**），与 N3 的"窄化收益"表述完全一致。

**(b) 同时锁伴生件 ⇒ `backup()` 前置失败（第 2 处调用点）**

```
OUT| sqlite3.OperationalError: disk I/O error
OUT| [提示] 未能把临时文件送入回收站，已跳过（不影响本次启动）。
OUT| [fixture] BRANCH=backup_failed / [fixture] DONE
cmd_exit=0 elapsed_ms=5641（未挂起）
```
⇒ 第 2 个调用点的 `try/catch` 同样真实生效（三处结构同形，静态已证）。**未观测到任何"把成功备份误报为失败"的路径**，与实现者 §4.2 的诚实边界一致。

### 3.2 残件不被自动回收 + 新提示确实"数到"它（N2）

预置**其他 PID** 的残件与伴生件，跑正常备份（WAL 库，见 3.3）：

```
SEEDED: finquant-backup-20200101-000000.db.424242.partial=64 | ...partial-wal=48
RUN（新载荷逐字夹具，cmd.exe）:
[提示] 检测到 2 个尚未改名完成的备份临时文件（*.db.编号.partial 及其 -wal/-shm 等伴生文件，可能来自上次中断或另一个正在运行的实例）；其内容是否完整无法从名字判断，请勿作为恢复来源；确认无用后可在文件管理器中手动删除（回收站）。
[fixture] BRANCH=launch
stale_after= ...424242.partial=64 | ...424242.partial-wal=48      ← 字节数不变
partial_like=2（= 残件 + 其 -wal，全属于预置件；本进程自身 .partial 残留 0）
```
`-Filter` 尾星承重（同一真实目录实测）：`'finquant-backup-*.partial*'` = **6**（4 个 `.partial` + `-wal` + `-journal`），无尾星 `'finquant-backup-*.partial'` = **4**（伴生件全漏），`'finquant-backup-*.db'` = **1**（只中真 `.db`，7 份计数不受放宽影响）⇒ **N2 实测闭环，且未污染计数过滤器**。

### 3.3 正常路径未退化（快照仍是 `Connection.backup()`）

合成 WAL 库（保持连接不关闭、`wal_autocheckpoint=0`，2000 行只存在于 `-wal`）：

```
HOLDER: holder_pid=24428 main=4096 wal=243112          ← 主文件仅 4096 字节
newest=finquant-backup-20260911-225850.db integrity=ok rows=2000   ← 233472 字节，数据必然来自 -wal
source_main=4096 source_wal=243112   holder_alive=True
cmd_exit=0   BRANCH=launch   自身 .partial 残留=0
```
⇒ 若退回"只复制 `.db`"只会得到 0 行；`Connection.backup() + integrity_check` 两阶段落盘**未被改动**。

## 4. 重点质疑（找茬结论）

**Q1「完全不懂的人照着恢复步骤走，会不会仍选中 `.partial`？」⇒ 不会。**
`:176` 现在是硬性限定"**只挑文件名形如 `finquant-backup-*.db` 的文件**"，`:177` 紧接一条**显式排除** `.partial`（带具体例子），`:178` 补了**根因提示**"只看谁最新不够……按结尾判断，而不是按时间"。通读全文，用户看到的候选集在第一步就被收窄为 `.db`；`.partial` 需要用户**主动违反两条 bullet** 才会被选中。
**NIT-1（不阻断）**：`:176` 仍保留"在其中选一个最近、**状态正常的**"这一模糊措辞——**未被消除**。它现在被前一条的硬性文件名限定与后一条显式排除夹在中间，已不具备"让人误选残件"的能力；但若追求与卡面"消灭模糊措辞"同口径，后续可改为"选一个时间最近的 `.db`（打开确认未被截断）"。**验收判据不要求清除该词，故不判失败。**

**Q2「把 `.partial` 说成'不是可恢复件'会不会让用户丢掉一份其实完好的库？」⇒ 不会。**
`:177` 用中性口径"内容**可能完整、也可能残缺，无法从名字判断 ⇒ 一律不作为恢复来源**"（**未**出现"一定不完整/已损坏"这类过头说法，N1 已落实）；`:171` 进一步给出**非破坏性**处置指引"确认没有备份正在运行，可以按习惯把它**移走或送回收站**"——回收站可还原，不存在"照着文档把完好库删掉"的路径。

**Q3「N3 的收益是否被如实窄化？」⇒ 是。**
实现者 §4.2 明确写了三处调用点都在"结局已定"的路径上、`try/catch` **不会**把失败变成功、也不会改变 `:118/:119/:122` 分支；本次实测（3.1）复核了这一点：新/旧载荷最终都是 `BRANCH=backup_failed`。**未发现夸大表述**。

**Q4「未定位的 cmd 中文怪象，是否影响本卡结论？」⇒ 不影响，且我已定位到高置信根因：`.bat` 为 LF-only 行尾且含非 ASCII 文本。**
隔离实验（内容逐字相同，只改行尾）：

| 夹具 | 行尾 | 内容 | cmd.exe 结果 |
|---|---|---|---|
| `min_cn.bat` | CRLF | 中文提示 | `[提示] 未能把临时文件送入回收站，已跳过（不影响本次启动）。` / `RC=0` ✔ |
| `min_cn_lf.bat` | **LF** | **同上一模一样的中文** | `RC=9009` + `'未能把临时文件送入回收站，已跳过（不影响本次启动）。'"' is not recognized as an internal or external command,` ✘ |
| `min_ascii_lf.bat` / `min_ascii_crlf.bat` | LF / CRLF | 纯 ASCII | 均 `CATCH-OK` / `RC=0` ✔ |
| `min_cn_bom.bat` | CRLF + BOM | 中文 | `[提示] …` / `RC=0` ✔（**BOM 不是原因**，与编排者 `e1421c4` 的证伪一致） |
| 逐字夹具 `fixture_new.bat`（2841 B）| CRLF | 全中文载荷 | 正常（3.1–3.3 共 4 次运行） |

⇒ 症状（`RC=9009`/"`…` is not recognized"）与实现者所述**同类且可稳定复现**，但**触发条件是探针 .bat 的行尾（LF-only）+ 非 ASCII 内容**，与其"体积/位置"假设无关（我的 169 字节 LF+中文夹具即复现；纯 ASCII 的 LF 夹具不复现）。
⇒ 真实 `start.bat` 由 `.gitattributes`（`*.bat text eol=crlf`）保证 CRLF，**结构上不可能踩到**；本卡全部承重证据均由 CRLF 逐字夹具取得。**结论：不影响 VS-18 判定**。诚实边界：实现者的探针文件已进回收站、无法回读，故归因为**高置信推断**而非直接取证（`e1421c4` 已把"根因未定位"写进状态档，可据本条更新为"已定位：LF-only + 非 ASCII"）。

## 5. 未做 / 遗留（诚实边界）

1. **未独立复跑实现者 §3.1 的"真实 `start.bat` 端到端"**（我用的是卡面要求的"逐字 `:120-121` 经 cmd.exe"）；但已证明**提交字节 == 工作树字节（194 行 `-ceq`）**，且同一载荷行在 cmd 下行为已由 3.1–3.3 覆盖。
2. 未构造"**无回收站的卷**"（同实现者 §4.4）；本次构造的是"目标文件被独占、`DeleteFile` 抛 `IOException`"，与无回收站同属"`DeleteFile` 抛异常"这一被测语句的输入。`OnlyErrorDialogs` 模态框在无回收站卷上是否弹出仍属**未知**（本次两次运行均 2–6 秒内返回、无残留 `powershell.exe`）。
3. 夹具中未包含 `start.bat:2-3` 的 `chcp 65001` / `setlocal DisableDelayedExpansion`；中文提示在**无 chcp** 的夹具下仍正确输出（经管道捕获，非真实控制台视图）。
4. **NIT-2（仅报告，不影响交付物）**：`IMPLEMENT_RESULT_VS18.md` §1.2「改动 C」的**"改前"引文不实**——实测 `5195d66~1:start.bat` 的旧文案是 `'…个未完成的备份临时文件（*.db.partial，可能来自上次中断或另一个正在运行的实例）；确认无用后…'`，报告里却写成 `（*.db.编号.partial 及其 -wal/-shm 等伴生文件…）`（那是**改后**措辞）。代码与文档本身正确，属报告笔误。
5. 未做超范围事项：`$dest` 同秒唯一性（R4 的 P3）、7 份滚动策略、`:117` 注释措辞——均未改动，符合卡面"不能破坏"。

## 6. 复现要点

```powershell
# 静态
$p='start.bat'; $l=[System.IO.File]::ReadAllLines($p,[System.Text.UTF8Encoding]::new($false))
$l[120].Length - $l[120].TrimStart(' ').Length          # 2
[int][char]$l[120].Trim()[0]; [int][char]$l[120].Trim()[-1]   # 34 / 34
# 夹具（必须逐字、必须经 cmd.exe）
cmd /c "<sandbox>\fixture_new.bat"      # 载荷行由 $l[119]/$l[120] 原样拼入，CRLF、UTF-8 无 BOM
```

**结论：ACCEPT。** 目标达成且有独立实测支撑：用户在数据受损时不会再把 `.partial` 当成可用备份覆盖回去（文档主动作 + 两条排除理由 + 根因提示齐备），回收失败不再以终止错误打断备份流程且退出码语义未变。
