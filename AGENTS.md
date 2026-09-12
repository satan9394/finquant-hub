# AGENTS.md — FinQuant Hub

**Role**: Implementation engineer. Code, test, fix, optimize. Do not change architecture.

## Before starting (read in order)

1. `HANDOFF.md` — current objective, done criteria, open blockers
2. `docs/ai/EXEC_PLAN.md` — find the highest-numbered `[READY]` task
3. That task's TASK file under `docs/ai/`

## Quick commands

```bash
# Backend tests
cd backend && .venv\Scripts\python.exe -m pytest -q

# Backend lint (ruff, line-length=120, py312 target)
cd backend && .venv\Scripts\python.exe -m ruff check .

# Frontend build (runs tsc -b then vite build)
cd frontend && bun run build

# Frontend tests
cd frontend && bun run test

# Full verification before commit
cd backend && .venv\Scripts\python.exe -m pytest -q && .venv\Scripts\python.exe -m ruff check . && cd ../frontend && bun run build
```

**No CI exists** — all checks are local. Run the above before every commit.

## Architecture (non-negotiable)

These are enforced invariants. Violations cause regression:

- **No ORM** — all DB via aiosqlite raw SQL
- **No connection pool** — single aiosqlite connection, `get_db()` asserts global `_db`
- **No separate DAL** — routers call `database.query_one/query_all/execute` directly
- **No WebSocket** — all real-time via SSE (sse-starlette)
- **No SSR** — pure CSR (Vite dev proxy / static prod build)
- **No DI container** — `MarketDataService` injected via `request.app.state.market`
- **No Agent inter-communication** — 4 research agents run independently

Full architecture: `docs/ARCHITECTURE.md`. Tech stack authority: `docs/TECH_STACK.md`.

## Project structure

```
backend/app/
  main.py           → FastAPI entrypoint (lifespan init, 23 APIRouters)
  config.py         → env vars from backend/.env
  database.py       → 52-table schema v23, query helpers
  routers/          → 23 APIRouters (133 /api/* paths)
  services/         → market_data, llm_client, indicators, scoring, etc.
  agent/            → 13 local tools (ToolRegistry singleton)
  backtest/         → v1 sync + v2 async backtest engines
  orchestrator/     → research_orch (4-agent parallel), discussion_orch
frontend/src/
  pages/            → route pages
  components/       → shared UI components (--fq-* design tokens)
  services/         → api.ts (single axios instance for all requests)
  store/            → zustand stores
```

## Gotchas

- **Port 5173**: previously occupied by an old Docker container (`finquant-hub-local-frontend-1`). If "port in use", run `docker ps` + `netstat -ano | findstr 5173` and kill the occupant. Do not silently switch ports.
- **Delete rule**: never use `rm`, `del /f`, `rmdir /s /q`. All deletions must go to recycle bin via PowerShell `SendToRecycleBin`.
- **`reference/` is read-only**: contains third-party clones; never modify.
- **No new dependencies**: Design System is pure CSS (`--fq-*` tokens). Do not add npm or Python packages without explicit approval.
- **Chinese data sources** (Tencent/Sina/EastMoney): use `trust_env=False` to bypass proxy. Yahoo uses `trust_env=True`.
- **SSE proxy**: Vite proxy must set `compress: false` + `timeout: 0` to prevent SSE buffering. See `frontend/vite.config.ts`.
- **SQLite DB path**: `backend/data/finquant.db`. Schema migrations are hand-written (no migration framework).

### Agent 作业踩坑（跨会话沉淀；踩过一次就不要重来）

- **读 UTF-8 文件不要用裸 `Get-Content`**：PowerShell 5.1 默认按 ANSI 解码，会**损坏 UTF-8 无 BOM 文件里的中文**（`start.bat` 首当其冲，症状是乱码与引号不配对）。用 `[System.IO.File]::ReadAllLines($p, [System.Text.UTF8Encoding]::new($false))`。**改动或复刻失败时，先怀疑自己的读取/引号/编辑，再怀疑代码**——曾因自己的读取问题误判"载荷执行失败"，差点去"修好"一份正确的实现；也曾因编辑时选错替换范围而**删掉整段记录**。
- **不要跑全量 pytest**：本机沙箱下会**挂起**（多次实测被杀：`pwsh-1/65/79` 全量、`pwsh-113` **连单个 `tests/test_model_pricing.py` 都挂**）。**不是"只有 `test_api.py` 会挂"**——排除它跑 `pytest tests/` 同样会挂。做法：前置 `$env:no_proxy='localhost,127.0.0.1,::1'`（必要时清 `HTTP_PROXY/HTTPS_PROXY`），并且**只跑你确实改到的那几个测试文件**，不要试图跑大范围。
- **杀掉后台 pwsh 任务不会杀掉它的子 python**：`job_kill` / `Stop-Process` 只结束 pwsh 包装进程，`pytest` 会**变成孤儿继续跑**（表现为"任务显示已杀/已完成，但命令永不返回"）。收尾时**必须**核对并清理：
  `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select ProcessId,CommandLine`
  确认无遗留的 `-m pytest` 后再继续；`Stop-Process -Id <pid> -Force`。注意**别误杀**非本项目的常驻服务（如 `python -m http.server 3001`）。
- **清理进程必须按"精确匹配自己的命令行"，绝不要按"排除法"**：本会话实测事故（VS-31 主动报回）——它清理自己遗留的 vitest 进程时，白名单**只排除了 `ListFailureNotEmptiness`**，于是**误杀了另外两张卡的 vitest 运行**（`tests/Dashboard.test.tsx` 与 `tests/ResearchDeadlineSi…`）。**代价不是"多杀几个进程"，而是被误杀的卡会把自己"跑到一半中断 / exit code 1 / 无输出"误判为自身缺陷**——在本机"负载下超时"已成常态的背景下，**这类假红与真红的表象完全一样**。
  - **做法**：①清理时**正向匹配自己那次运行的特征**（完整测试文件名 + 自己使用的命令行参数），**不要**用"排除别人的"这种反向写法；②**动手前先列出全部候选进程的命令行**（`Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='bun.exe'" | Select ProcessId,CommandLine`），确认每一个都是自己的再杀；③**若已误杀**，**立刻向受影响的卡通报事实，并只给事实**——"我不能证明你看到的那次异常就是它造成的"，请对方**以自己的重跑结果为准，不得因此放松任何断言或判据**；④错误归因一旦扩散，会让人去修**根本没坏的东西**，其代价高于误杀本身。
- **"与 HEAD/工作区对照"类证明在提交后会变成空对照——证据会随提交而衰减**：本会话实测（VS-33 评估者指出并纠正）——实现者写"`HEAD` vs 工作区 `ast` 剥 docstring 后 `identical=True`"，**在提交入库后两者逐字节相同，比的是同一份东西 ⇒ 该证明在档案里已无内容**，却看起来仍然可信。**同类陷阱**：`git diff`（工作区 vs 索引/HEAD）、"我提交前跑过全绿"、"当前工作树与交付一致"——**凡在提交前写下的"与 HEAD 一致"，提交后都退化为同义反复**。
  - **做法**：①凡要归档的"等价性/零改动"证明，**一律写成 `HEAD~1` vs `HEAD`（或给出被验对象的内容哈希）**，不要写"工作区 vs HEAD"；②**多通道印证**（本会话的范例：剥 docstring 的 AST 全等 + **189 个非 docstring 字符串字面量逐个相等** + 剥注释与 docstring 后 **538 行全等**），因为"AST 相等"仍可能漏掉不影响解析的变化；③行级归因**用各自 AST 判定**（本会话范例：7 行全为 COMMENT/DOCSTRING、可执行语句 **0 行**被触碰），而不是"看起来像注释"；④自检一句：**"这条证据如果原样写进档案，还有信息量吗？"**——若答案是"没有"，就换成有信息量的写法再写。
- **"用例全绿"不能反推"修法正确"——被测框架的 `act` 冲刷会吃掉"一帧闪烁"类时序缺陷**：本会话实测（VS-32 评估者构造并纠正）——`Discussion.tsx` 的"错误原文按房间作用域"有两个修法：**(甲) 给错误态补归属 `detailErrorId` 并只认"属于当前房间"的错误**（实现者选的）、**(乙) 去掉作用域 + 在切房间的 `useEffect` 里清**。**两者都让同一组 26 条断言全绿、无人能拦（M2b）**；但**乙不等价**：`useEffect` 在**提交/绘制之后**运行 ⇒ **切换那一帧仍会渲染上一个房间的错误原文**，只是 **RTL 的 `act` 冲刷看不到中间帧**。⇒ **正确性判据是结构本身（"这条错误属于谁"），不是"用例绿"。**
  - **同类（本会话已多次踩到，全部是"绿灯掩盖了错误做法"）**：把断言改弱（`waitFor` 包裹期望值不变的写法才是安全的）／把修复做成"错误永不显示"／把判据退回旧契约／用文案匹配代替结构化信号——**它们都能让红灯变绿，而只有一部分是对的**。
  - **做法**：①**每次看到"改完就绿了"，先问一句"有没有另一种错误的改法也能让它绿？"**——若能想到（如上面的乙），就**必须把正确性理由写成结构性的**（此处：错误态自带实体归属），而不是"用例通过"；②对**时序/中间帧**类修改（`useEffect` 清状态、切实体时重置、防抖、乐观更新）**尤其要警惕**：RTL 的 `act` 会把中间帧吃掉，**测试根本看不见**；此时应**读代码判定时序**，并**在结果文件里标明"该判断为代码时序推理、未实测"**；③新增断言与既有断言**覆盖的是不同的失败模式，不能互相替代**（本卡实测：M2"发起请求时清"被**既有**断言拦住、而本卡的 3 条新用例全绿）⇒ **既有断言一条都不能放宽**。
- **不要为了迁就测试替身而在生产代码里放宽错误处理**：宽泛的 `except TypeError` / `except Exception` 包住 `await` 会**吞掉真实错误**，并让**同一次调用被重发**（白付一次 API 费用）。如确需兼容，用 `inspect.signature` 判断或只捕获确属签名不匹配的情形，并在注释里写明为何不能用宽捕获。
- **失败/降级判据不要用字符串前缀哨兵**：读结构化信号。注意**成功结果同样可能是 JSON**（以 `{` 开头）——不可据此判失败，必须解析后看 `success` 一类字段。
- **同一件事的两条路径必须同源**：交互 vs 调度、实时 SSE vs 历史回放、脚本 vs 文档、UI vs CLI。历次真缺陷多为"改了一处、忘了另一处"。
- **文档承诺必须与实现一致**：出现过"文档说滚动保留 7 份、实现只提示不删"、"README 承诺预置产物免 Bun、脚本却硬退出"、"PRD 描述了并不存在的加密迁移"。**改行为时同步改文案。**
- **宁可说"未知"也不要说成"成功"**：不确定就标 `degraded` / "未验证"；绝不把失败渲染成成功，也绝不把局部失败说成整轮失败。
- **提交前必须确认"文件内容处于最终态"，不能只看 `git status` 说它"已修改"**：当另一个 agent 正在对同一文件做**变异/还原类验证**（它会在文件里临时植入缺陷、验完再还原）时，**任何一个瞬间的工作树都可能含故意缺陷**——照着 `git status` 提交就会把变异态提交上去。**实测发生过**：`ResearchWorkspace.tsx` 被提交成含 `// TEMP-REPRO: 修前实现…` 且缺两行剥离逻辑的形态，靠事后 `git diff` 才发现、只能 `--amend` 修正。做法：①**等实现者明确报告完成再提交**；②提交前对**待提交文件**（或提交后对 `HEAD`）`grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP'` 扫一遍；③提交后立即 `git diff --name-only HEAD` 与 `git status` 复核，确认"提交内容 == 预期文件集 == 最终态"。顺便：`git add` **一律限定路径**，不要 `git add .`（会把别人在途的改动一起卷进来）。
- **【同一条规则的审查面】"读在途工作树"与"提交在途工作树"是同一个坑，后者已踩、前者也踩过**：变异窗口里植入的缺陷**与真缺陷在源码层面完全一样**（例如"某个 ref 只写不读""某个 state 从不被置为触发值"），**唯一的区分是状态与时机**。**实测发生过**：编排者以为在途树是交付态，把 VS-19 的三处**故意变异**（`notified*Ref` 守卫行被删、`setStatsFailed(true)` 被删）当成真缺陷连发两次纠正，而实现者的变异输出恰恰证明"删掉守卫后用例必然变红"。**做法**：①**优先等实现者报告完成后再读**；②若必须提前读，**先问一句"此刻工作树是否处于变异窗口"**，或**只做不依赖最终态的检查**（如结构、字数、行尾、`git diff --check`）；③看到"机制声明了但没接线"这类形态时**先怀疑自己读到的是变异态**——尤其当它恰好是**你在卡里要求的鉴别力证明**时会出现的形态。④让做变异验证的人**先声明窗口**（"此刻工作树含故意缺陷，勿读"）或**改用副本**。
- **`start.bat` 的行尾由 `.gitattributes` 保证 CRLF**（`*.bat text eol=crlf`，2026-09-11 补）。此前仓库里存的是 **LF**，只因本机 `core.autocrlf=true` 才检出 CRLF ⇒ **`autocrlf=false` 的克隆者（Linux/macOS 默认）会拿到 LF-only 的批处理**（Windows 双击入口）。**验证行尾不要只看工作副本**——那只是本机配置的产物；要验证就用**真实克隆 + 显式 `-c core.autocrlf=false`**，并用 `git ls-files --eol <path>` 看 `i/`（索引）与 `attr/`。**注意**：`git checkout-index --work-tree=<临时目录>` 会在**该临时目录**里找 `.gitattributes`，得不到仓库规则，用它做这类验证会得出错误结论。
  - **【已确证】LF-only 行尾 + 非 ASCII 会让 cmd 的批处理解析错位**（不只是"格式不整齐"）：三组对照实测——`CRLF+中文` → 正常 `exit 0`；**`LF+中文` → `'01' is not recognized`、`'文测试' is not recognized`（行被切错位置）**；`LF+纯 ASCII` → 正常。⇒ **对含中文的 `.bat`，CRLF 是"解析正确性"而非风格问题**（退出码随调用方式包装层不同，可能为 **1 或 9009**，症状一致）。真实 `start.bat` 受 `.gitattributes` 保证 CRLF，结构上踩不到；但**你自己写的夹具 `.bat` 必须显式写成 CRLF**，否则含中文时会以"命令未找到"这类假象失败，极难归因。
  - **顺带排除一个错误假设**：本机实测 `无 BOM / 显式 BOM / Set-Content -Encoding UTF8` 三种写法**都能**正常解析中文（且本机 pwsh 的 `Set-Content -Encoding UTF8` **不写 BOM**）⇒ **BOM 不是本类故障的原因**，不要往那个方向查。
- **数据一致性改动要当心 SQLite WAL**：只复制 `finquant.db` 会**静默丢弃 `-wal` 中已提交的事务**；用 `sqlite3.Connection.backup()`（全仓既有约定）。且**真实 `backend\data` 的 WAL 已被 checkpoint**，想验证 WAL 行为必须**自造场景**（保持连接不关闭 + `wal_autocheckpoint=0`）。
- **批处理载荷改动必须经 `cmd.exe` 实测，不能只把载荷字符串喂给 PowerShell**：`start.bat` 的备份载荷用双引号裹住是**承重的**——载荷内含 `|`（`New-Item … | Out-Null`、`Get-ChildItem … | Sort-Object`）与 `&`（`& $py -c $code`），**引号一丢，cmd 会把它们当管道/命令分隔符**，命令行被切断、备份**永不生成**（实测：`'Out-Null' is not recognized…`、退出码 255、产物目录为空）。夹具必须把 `powershell.exe … -Command ^` **连续行一起逐字**做成 `.bat` 经 `cmd.exe` 运行；**直接调 PowerShell 喂字符串会绕过 cmd 解析层，这类缺陷完全不可见**。
- **续行的行首缩进也是承重的，别"顺手对齐"**：`start.bat:120-121` 的 `powershell.exe … -Command ^` 后续行必须以**空格起头**（当前 2 个）。若把该行 `"` **顶格**，cmd 解析错乱，症状与"引号丢失"**一模一样**（`'Out-Null' is not recognized`、退出码 **255**、产物目录为空），而 **`git diff --check` 看不出来**。实测矩阵：顶格 → 255（无论是否 `chcp 65001`）；**1 或 2 个前导空格 → 正常**。**教训来源**：有人把载荷 `Trim()` 后重拼进 `.bat`，四个场景全 255、零产物——写夹具时**必须逐字复制原行**，不要 Trim/重排。
- **备份目录的 `-Filter` 通配符尾星是承重的**：SQLite 备份写 `foo.db.<pid>.partial` 时会**同时产生伴生件** `…partial-wal` / `…partial-shm` / `…partial-journal`（中断后残留、会**静默累积**）。实测：`-Filter 'finquant-backup-*.partial*'` 能同时匹配 `.partial` **与三个伴生件**；而 `-Filter 'finquant-backup-*.partial'`（**无尾星**）**只**匹配 `.partial`，伴生件全漏——`git diff` 上只是少一个字符。同理，**7 份「有效备份」计数必须继续用 `'finquant-backup-*.db'`**（实测只匹配真正的 `.db`，不受放宽影响）。
- **PowerShell 双引号串会展开 `$变量`，写提交信息/字符串时当心**：`git commit -m "… DeleteFile(\$dest) …"` 里的 `\$` **不是转义**（PowerShell 用反引号），`$dest` 会被当成变量展开成空，落进历史的是 `DeleteFile(\)`。需要字面 `$` 时用**单引号串**（`'…'`）或在这里用反引号转义；长文本优先用 here-string 单引号形式。
- **回收含 junction 的目录会失败**：`DeleteDirectory(<沙箱>, …,'SendToRecycleBin')` 对**内含 junction 的目录**常报 `Attempted to perform an unauthorized operation`。正确处理：**先单独回收那个 junction 本身**（回收 junction 只删链接、**不伤目标**——已验证：回收指向 `backend\.venv` 的 junction 后，真实 venv 的 `python.exe` 与 190 个 `site-packages` 目录完好），**若父目录仍失败**，则**逐文件回收 + 由深到浅回收各层目录 + 最后回收顶层**。另外 `.git` 内对象文件是**只读**的，克隆出的沙箱要先 `$_.Attributes='Normal'` 再回收。
- **用 PowerShell 直接写盘改 Markdown 会静默造成"行拼接"损坏，且不要用行长阈值去查它**：本项目文档大量使用**长段落单行**的写法，因此用"行长 > N 字符"或"一行内多个句号"来检测拼接会**只产生假阳性**（实测对 `PRODUCT_STATE`/`PRODUCT_GAP_MAP`/`CHANGELOG` 一次性报出 60+ 条，逐条看全是正常段落）——**与"把合法键名 `noMutation` 当成变异标记"是同一个毛病：把匹配当事实**。
  - **真实的损坏长这样**：一行里**出现两个不相干主题**（实测：`PRODUCT_STATE` 末行把"R5 反面约束"与另一处"哨兵只能降级为历史兼容兜底…"的证据要求拼在了一起，前者的收尾与后者的开头直接相连）。可行的判据是**语义**（这一行是否在讲一件事），不是**长度**。
  - **做法**：①改动 `.md` 优先用编辑工具而非 `ReadAllLines`+`WriteAllText`（后者绕过读取追踪，还会让编辑工具报"文件自读取后已变"）；②**改完必须读回改动处与文件末尾核对**（本次正是收尾时读末尾三行才发现的）；③发现拼接时**拆行并显式标注"上下文疑似脱落、不可考"，不要代为编造归属，也不要删掉**。
- **"实现者报告完成" ≠ "结果文件已写完"——提交时点要比口头完成晚一步**：本会话**连续两张卡（VS-26、VS-27）**都在编排者按"报告完成"提交之后**又追加了内容**（VS-26 `+79` 行门禁证据、VS-27 `+18/-4` 行号校正与变异基线），以致**已入库的结果文件是缺证据的版本**，只能再补一次提交（`718936f`、`a043908`）。**根因不是执行者拖沓**（它们本就该在交付后补齐证据），**而是编排者的提交时点选早了**。**做法**：报告完成后**再等一次确认（或直接核对文件大小/时间戳是否还在变）**再 `git add`；若已提交而对方又追加，**立即补一次路径限定的提交**，并在提交信息里写明"补入 XX 的后续修订"，而不是 amend 掩盖。
- **并行开卡只保证"文件不重叠"是不够的——门禁会互相污染**：编排者曾据"三卡文件集不相交（前端 src+i18n / 后端 services / 测试文件）"并行开卡，判据本身没错，**但漏了一类新失败模式**：**某卡的门禁命令会构建/收集另一卡的在制代码**。实测（VS-31 报回）：它要求跑 `bun run build`，而**同一工作树里 VS-29 正在并发跑 vitest 且 `frontend/src` 有 8 个在制文件** ⇒ **该 build 会把 VS-29 的在制 src 一起 `tsc`/`vite build`；若 VS-29 恰处变异窗口，构建失败未必属于 VS-31**。同理，**并发负载下的一切耗时数字都不是静默基线**（本仓默认 `testTimeout` 5s，负载下连未变异的副本也会超时变红）。
  - **做法**：①开并行卡前，除了比对**改动文件集**，还要比对**门禁的作用域**——凡命令会扫全仓的（`bun run build`、`tsc -b`、`ruff check .`、vitest 的 glob 收集、全量 `pytest`）都算跨卡共享资源；②**让执行者如实记录"本窗口内有他卡并发"**，并**明确写出"我不能证明该失败与本卡无关，也不能证明有关"这一边界**，不要替它选一个归属；③**时序错开**：若某卡的 build 必须洁净，就让它在**其它卡不在变异窗口**时跑，或**直接在 `$env:TEMP` 副本里跑**（本会话 VS-25/26/27/28 的评估者都用了副本 + junction，效果良好）；④"**改了有没有用**"（语义探针/变异体变红）比"**改完还是绿的**（重复次数）"更值得优先保证——时间不够时**牺牲重复次数，保住鉴别力证据**。

详见 `memory/`：`MAIN_SESSION_TOKEN_DISCIPLINE.md`、`SUBAGENT_TIMEOUT_DISCIPLINE.md`、`VERIFICATION_BLIND_SPOT.md`。

## Doc sync rule

After any code change that adds/changes an API endpoint, router, or table:

1. Endpoint change → `docs/API_CONTRACT.md`
2. Router/architecture change → `docs/ARCHITECTURE.md`
3. Schema change → SCHEMA section in `docs/ARCHITECTURE.md`
4. Bug fix → `docs/HANDOVER.md` (move from Broken to Verified Working)
5. New concept/pattern → memory file (`memory/`)

Skip for: pure refactoring, test additions, comment/docstring edits.

## Change record

Append to `task/CHANGELOG.md` after each session:
```markdown
## YYYY-MM-DD
- What changed: [file paths]
- Why: [reason]
- Docs updated: [which docs]
- Risk: [low/medium/high]
```

## Harness governance

This project uses harness-engineering v4.11.0. Key files:

- `.harness/manifest.json` — component inventory
- `STATE.json` — rules & incident memory
- `HANDOFF.md` — cross-session continuation authority
- `notes/` — decision records

```bash
python scripts/audit.py .                                        # harness health check
python scripts/handoff-log.py --append "did what" --verify "result" # append change log
```

File not found → component not embedded; skip it.

## Harness 日常用法（v4.11.0）

- **一句话嵌入/重装**：用户说"嵌入 harness"→ 自动跑 `python scripts/bootstrap.py --init --dir . --name finquant-hub`（默认 single，不提问；用户明说团队/生产才加 --mode）
- **一句话体检**：用户说"执行 harness / 跑一下 harness"→ 自动跑 `python scripts/harness-check.py .`（汇总体检报告）
- **收尾必做**：`python scripts/handoff-log.py --append "做了什么" --verify "验证结果"` → 追加 HANDOFF.md 变更日志
- **审计健康**：`python scripts/audit.py .`（0=健康，1=有问题）
- **记决策**：`python scripts/note-lifecycle.py new --class architecture --title "..."`；提交前 `note-lifecycle.py verify`
- **记事故**：`python scripts/record-error.py`（agent 反复犯的错 → STATE.json）
- 完整上手见 `docs/HARNESS-QUICKSTART.md`

## Model switching rule

- **批量读文档、总结、分析** → 用 MIMO V2.5，写代码前切走
- **写代码、改代码、调试** → 用 Deepseek V4 Flash

Agent 无法自动切换模型，但应在任务切换时主动提醒用户切换。

## Target user

Non-technical Chinese finance/investment users. All UI in Chinese. Avoid CLI/terminal in UI work.
