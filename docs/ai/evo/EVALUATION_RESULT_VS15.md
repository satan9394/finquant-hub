# EVALUATION_RESULT — VS-15：用户可见文本与实现对齐（独立验收）

> 评估者：独立 Evaluator（不采信实现者自述，全部结论由自建夹具/字节级比对复现）。评估时间：2026-09-11（机器实际日期）。
> 验收对象：commit `63da155`（实现者=Orchestrator 接管）。**评估期间 HEAD 已前进到 `52c4bf6`（只改 `PRODUCT_GAP_MAP.md`，与本卡无关）**，故所有比对锚定在 `63da155~1 → 63da155`。
> 工作区一致性：`git hash-object start.bat` = `4220fa8e5bc515af5b263f5ea1de02f94dda047b` **等于** `git rev-parse 63da155:start.bat`；评估开始时 `git diff 63da155 -- start.bat docs/QUICKSTART.md` 为空 ⇒ 被验文件就是提交内容，无漂移。
> **评估末期（写完本报告前）另一并发 agent 未提交地改了 `docs/QUICKSTART.md` 的 L12/L125（Bun 产物判定措辞，非本卡范围）**；`QUICKSTART` 的 VS-15 目标行 L169 **逐字未受影响**（见 §7）。

## 判定：**ACCEPT**（2 项非阻断，见 §5）

四条验收标准全部独立复现通过；两处"用户可见文本必须反映实际行为"均达成，且**流程与退出码未变**。

---

## 1. 标准 4（字节级）— 通过

严格 UTF-8 读取（`[System.IO.File]::ReadAllLines/ReadAllText($p,[System.Text.UTF8Encoding]::new($false))`，未用裸 `Get-Content`）：

- `bytes=12064`；`CRLF=190`，`LF总=190`，`LF-only=0`（全部 LF 都成对属于 CRLF）；`CR=190`。
- 首三字节 `64,101,99` = `@ec` ⇒ **无 BOM**；`[UTF8Encoding]::new($false,$true)` 严格解码**无异常**（有效 UTF-8）。
- `git diff --check 63da155~1 63da155` **exit 0**（无空白错误/冲突标记）。

## 2. 标准 2（只改文本、流程与退出码未动）— 通过

`git --no-pager diff -U0 63da155~1 63da155 -- start.bat`：**1 个 hunk，6 insertions / 1 deletion，全部落在 L158 一处**（`@@ -158 +158,6 @@`），没有任何第二处改动：

```
-echo [错误] Python 运行环境准备失败，通常是没有装 Python 3.12 或安装时没勾选加入 PATH。
+echo [错误] Python 运行环境准备失败：本项目需要 **Python 3.12**。
+rem VS-15：打印"检测到的版本"，避免装了 3.13/3.11 的用户只看到"没装 3.12"而不知问题在版本号上。
+rem 注：python -V 输出到 stdout（已实测），故 2>nul 只抑制"不是内部或外部命令"这类 stderr。
+echo [检测] 当前 PATH 中 python 命令的版本：
+call python -V 2>nul
+echo         （上面若没有版本号，说明 PATH 中没有 python 命令）
```

独立逐行比对（旧 185 行 vs 新 190 行，插入 5 行造成位移，按位移对齐后比对）：

- 旧 `L1..L157` 与新 `L1..L157` **逐字相同**（含 `:41 call py -3.12 -m venv`、`:46 sys.version_info[:2] == (3, 12)`、`:47 if errorlevel 1 goto venv_failed`、`:python_path` 仍在 `:45`）。
- 旧 `L159..L185` 与新 `L164..L190` **逐字相同**（含 `:fail` 段 `pause` / `popd` / **`exit /b 1`**；`:fail` 标签因插行由 `:182` 移到 `:187`，**内容未变**）。
- 关键行 `-ceq` 校验：`L39,L40,L41,L46,L47,L48` 全部 `True`；`:python_path` 标签旧新均在 L45。
- 唯二 `rem` 注释新增于 L159/L160，包住的新增可执行行仅 `echo`（L161/L163）与 `call python -V 2>nul`（L162）；**无判定逻辑新增或删除**。

## 3. 标准 1（真的会打印检测到的版本 + 无 python 时说明）— 通过（原始输出）

自建夹具（**未采信实现者输出**）：从 `start.bat` 逐字抽出 `L157..L171`，前置 `@echo off` + `chcp 65001 >nul`，后接两种 `:fail` 桩；用 `cmd /c ... > out.txt 2>&1` 重定向取**原始字节**，以严格 UTF-8 读回。

**桩 R（复刻真实 `:fail` 语义：`echo REACHED=fail` + `exit /b 1`）**

场景 A — 正常 PATH（`where python` 首命中 `D:\Technology_application\Anconda_All\Anaconda3\python.exe` = 3.13.5），**exit=1**：

```
[错误] Python 运行环境准备失败：本项目需要 **Python 3.12**。
[检测] 当前 PATH 中 python 命令的版本：
Python 3.13.5
        （上面若没有版本号，说明 PATH 中没有 python 命令）
[怎么做] 1) 打开 https://www.python.org/downloads/release/python-31210/ 下载 Windows 安装包；
[怎么做] 2) 安装时务必勾选 Add python.exe to PATH，装完重启电脑；
[怎么做] 3) 重新双击 start.bat。详细图文步骤见 docs\QUICKSTART.md 的"你需要准备什么"。
[进阶] 若你熟悉命令行，也可在项目根目录依次运行：
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
REACHED=fail
```

场景 B — `set "PATH=C:\Windows\System32"`（无 python），**exit=1**：

```
[错误] Python 运行环境准备失败：本项目需要 **Python 3.12**。
[检测] 当前 PATH 中 python 命令的版本：
        （上面若没有版本号，说明 PATH 中没有 python 命令）
[怎么做] …（同 A，三行）
[进阶] …（同 A）
REACHED=fail
```

**桩 I（惰性桩，仅 `echo REACHED=fail`，不设退出码）**：A 与 B **均为 exit=0**。

结论：`python -V` 的版本号在场景 A **确实打印**、在场景 B **确实不打印版本号但打印了说明行**（不空白、有解释）；且**两种场景在真实 `:fail` 语义下均退出 1**。

## 4. 标准 3（QUICKSTART 与实现语义一致）— 通过

`docs/QUICKSTART.md:169` 现文本（严格 UTF-8 读）：

> …文件名带时间（如 `finquant-backup-20260913-083000.db`）。**备份不会自动删除**：累计超过 7 份时，启动窗口只会给出提示，请按你的习惯把多余文件移走或删除（送回收站），系统不会替你删。…

- 旧串"滚动保留最近 7 份"**已消失**（`git grep` 在用户可见文档中零命中；残留命中仅在 `docs/ai/evo/` 历史报告与本卡任务书/结果文件）。
- 与实现对齐：`start.bat:113` 注释"滚动保留最新 7 份，超过时只提示不自动删除（…由用户处理）"；`start.bat:117` `if($files.Count -gt 7){ Write-Host '[提示] 备份已超过 7 份，请按需保留后手动清理（回收站）多余文件。' }` —— **只提示、不删**。新文案"只会给出提示…系统不会替你删"逐点对应。
- 未改实现：diff 中 `start.bat` 的备份段（L105–125）与旧版**逐字相同**（region 比对 True），未引入任何自动删除行为。

## 5. 重点质疑逐条回应

1. **是否动了流程或退出码？** 未动。`:41/:46/:47/:python_path` 逐字相同；`:fail` 仍 `pause`/`popd`/`exit /b 1`。**"`:fail` 恒 `exit /b 1`"这一论断独立成立**：用复刻真实 `:fail` 的桩 R 实跑，A、B 两场景**都返回 1**。
   （保留意见：结果文件 §二"夹具中 A=0、B=1"的**具体数值与归因（"场景A 的 `call python -V` 成功把 errorlevel 置 0"）在我这里不可复现**——我的惰性桩得到 A=0 **且 B=0**。该差异只存在于桩层、与产品行为无关，故不构成缺陷，但结果文件那句具体数字属未经复核的自述，不宜当作证据引用。）
2. **`echo [检测]` 与 `call python -V` 的输出顺序/可读性？** 无错位。最坏情况（stdout 重定向到文件）下，版本号仍**紧跟在 `[检测]` 行之后**（`call` 是同步等待子进程退出后才继续）。`python -V` 的流向已独立实测：`python -V 1>out 2>err` ⇒ `stdout=[Python 3.13.5]`，`stderr=[]` ⇒ `2>nul` **不会吞掉版本号**（该 rem 注释属实）。
3. **PATH 无 python 时是否空白无解？** 否。场景 B 原始输出中 `[检测]` 行之后**确实出现**解释行"（上面若没有版本号，说明 PATH 中没有 python 命令）"；cmd 的"不是内部或外部命令"提示走 stderr 被 `2>nul` 抑制，符合预期。
4. **QUICKSTART 是否引入新的不准确？** 未见。"移走或删除（送回收站）"+"系统不会替你删"与 `start.bat:117` 的实际提示同义。**未与"失败产物会被送回收站"冲突**：`start.bat:117` 中段的 `DeleteFile(...,'SendToRecycleBin')` 只针对**本次写坏的半成品备份**，新文案的"系统不会替你删"被限定在"累计超过 7 份…多余文件"语境，不构成误导。
5. **别处是否仍声称"自动保留 N 份"？** 用户可见文档（`README.md`、`docs/PRD.md`、`docs/QUICKSTART.md`、`docs/ARCHITECTURE.md`）= **零命中**。残留命中仅历史 `docs/ai/evo/` 产物：`IMPLEMENTATION_BRIEF_G01.md:7/:25`（该文件 `:35` 已写明"**决策：不自动删**"，`:25` 属同文被覆盖的前期设想）、`PRODUCT_UX_REPORT_R2.md:95`、`RELIABILITY_REPORT_R3.md:145`（均为"**建议**"小节里的改进提议，非现状陈述；同文现状描述与实现一致）。**不阻断**。

## 6. 非阻断项（不构成 REJECT，建议后续顺手处理）

- **N1（P3，本次改动引入的观感瑕疵）**：`start.bat:158` 用户可见的 `echo` 里用了 Markdown 粗体 `**Python 3.12**`，cmd 会**照字面打印两个星号**（原始输出已证）。这是全文件**唯一**一条带 `**` 的 `echo`（另一处 L67 是 `rem` 注释），面向非技术用户略突兀。建议改为 `本项目需要 Python 3.12。`。
- **N2（P4）**：旧文案里"安装时没勾选加入 PATH"这一线索从错误行移除，但 `[怎么做] 2)` 仍保留该指引，信息未丢失；`[检测]` 行也不再引用 `start.bat:117` 的原始提示串（「[提示] 备份超过 7 份」），仅作概括表述——语义不错，可选是否回引原串。

以上两项均**不影响**本卡 4 条验收标准的判定。

## 7. 评估期间的并发改动（非本卡，仅记录）

评估进行中，共享工作区先后出现与本卡无关的变更：HEAD 由 `63da155` 前进到 `52c4bf6`（只改 `PRODUCT_GAP_MAP.md`）再到 `f81816f`（VS-16 任务书）；`docs/QUICKSTART.md` 被另一 agent **未提交**地改了 L12 与 L125（Bun 产物判定措辞）。

- 本卡的判定锚定 `63da155~1 → 63da155`，与该并发改动无关。
- **`docs/QUICKSTART.md:169`（VS-15 目标行）与 `63da155` 版本逐字相同**（`-ceq` 校验 `True`）。
- 附带观察（供编排者，不作为本卡结果）：那份未提交改动使 `docs/QUICKSTART.md` 工作副本当前为 **LF-only**（`CRLF=0 / LF=193`）。本卡验收标准只要求 `start.bat` 保持 CRLF——该文件已满足（190/190，LF-only=0）；`QUICKSTART` 的行尾不属本卡范围，且 `core.autocrlf=true` 会在提交时归一化。
- 评估者**未修改** `start.bat` / `docs/QUICKSTART.md`，也未回退他人的改动。

## 8. 复现方式（评估者原样复跑即可）

```powershell
$p='E:\Code_file\Projects\finquant-hub\start.bat'
$L=[System.IO.File]::ReadAllLines($p,[System.Text.UTF8Encoding]::new($false))
$seg=$L[156..170]                                   # L157..L171 逐字
$enc=[System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllLines("$env:TEMP\fx.bat",(@('@echo off','chcp 65001 >nul')+$seg+@(':fail','echo REACHED=fail','exit /b 1')),$enc)
cmd /c "`"$env:TEMP\fx.bat`" > `"$env:TEMP\o.txt`" 2>&1"; "A exit=$LASTEXITCODE"
cmd /c "set `"PATH=C:\Windows\System32`" && `"$env:TEMP\fx.bat`" > `"$env:TEMP\o2.txt`" 2>&1"; "B exit=$LASTEXITCODE"
[System.IO.File]::ReadAllText("$env:TEMP\o.txt",$enc); [System.IO.File]::ReadAllText("$env:TEMP\o2.txt",$enc)
```

差异证明：`git --no-pager diff -U0 63da155~1 63da155 -- start.bat docs/QUICKSTART.md`。

**临时文件处理**：本次评估产生的全部夹具/输出/中间文件（`$env:TEMP\vs15_*`、`g2..g5.txt`，共 21 个）已用 `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(...,'SendToRecycleBin')` **送回收站**，TEMP 中残留 0 个。**未修改 `start.bat` / `docs/QUICKSTART.md`**（`git status` 仅剩他人未跟踪文件 `docs/ai/evo/EVALUATION_RESULT_VS14.md`）。
---

## §复验（验收后文案修复）

**范围**：commit `39699e4`（HEAD），`start.bat` 三处用户可见文案修复；工作目录 `E:\Code_file\Projects\finquant-hub`。只读验证，未修改被验文件。

**1. 改动只落文本 — PASS。** `git show --stat HEAD`：`start.bat` 3 行（+3/-3），另有 `docs/ai/evo/IMPLEMENT_RESULT_VS15.md`。`git show -U0 HEAD -- start.bat` 共三个 hunk，逐个核对均为 `rem`/`echo` 的整行替换，hunk 头上下文恰为最近标签（`@@ -67 +67 @@ goto reuse_frontend`、`@@ -158 +158 @@ goto fail`、`@@ -184 +184 @@ echo [怎么做] 1^) ...`），说明改动落在标签之间的正文行：`:67` rem 注释去 `**`；`:158` echo 去 `**Python 3.12**`；`:184` echo 重写 Bun 文案。**无任何标签、`goto`、`if`、`errorlevel`、PowerShell 载荷被改动。**

**2. `:bun_missing` 可达性断言（关键）— PASS，断言成立。** 全文件仅一处跳往 `:bun_missing`：`:83 if defined FQ_BUN_MISSING goto bun_missing`，位于 `:build_frontend` 内；而进入 `:build_frontend` 只有两条路径：

- `:57 if not exist "frontend\dist\index.html" goto build_frontend` → 产物**缺失** → `:83` 处 `FQ_BUN_MISSING` 已定义（由 `:19` 在 `FQ_BUN` 未定义时置 1）→ `:bun_missing`。文案前提为真。
- `:63 if errorlevel 1 goto stale_frontend`（过期路径）→ `:66 :stale_frontend` → `:70 if defined FQ_BUN_MISSING goto stale_frontend_nobun`：**无 Bun 时在此分流**；`:71 goto build_frontend` 只在 `FQ_BUN_MISSING` **未定义**时执行，而 `:83` 要求它**已定义**——两条件互斥，故该路径**永不**到达 `:bun_missing`。于是"产物存在（哪怕偏旧）+ 无 Bun"走 `:73 :stale_frontend_nobun`（`:74-75` 提示偏旧）→ 顺序落入 `:77 :reuse_frontend`（`:78` 打印构建时间）→ `:79 goto environment` 照常启动。
- 落空/穿透补查：`:173 :build_failed` 以 `:179 goto fail` 收尾，不穿透到 `:181 :bun_missing`；`:181-185` 自身顺序落空至 `:187 :fail`（既有错误路径，本次未改）。

**结论**：不存在任何"产物存在（哪怕偏旧）却到达 `:bun_missing`"的路径，`:184` 新文案"出现本提示说明产物已缺失（被删或解压不完整）"**准确**。

**3. 残留 — PASS。** `start.bat` 中 `**`、`或过期`、`且未过期` 匹配数均为 **0**。用户可见文档同步到位、无失效断言：`docs/QUICKSTART.md:125` 已写"全程不需要 Bun…只有产物确实缺失时，才会要求安装 Bun"、`:11` 已写"已附带 frontend/dist 时启动不需要 Bun"；`README.md:69` 已写"产物偏旧也只提示、照常启动"。（文档内其余 `**` 为 Markdown 有意加粗，非残留。）

**4. 字节级 — PASS。** `start.bat` 12147 字节：LF=190、CRLF=190、**裸 LF=0**（CRLF 完整）、无 BOM、严格 UTF-8 解码通过；`git diff --check HEAD~1 HEAD` 无输出（无空白错误）。

**判定：ACCEPT。** `start.bat:67/158/184` 三处文案修复正确、内部一致，且第 2 项可达性断言经独立路径穷举成立。