# EVALUATION_RESULT — VS-14 独立验收（Evaluator）

> 验收对象：`start.bat` 提交 `e452a93`（+16/−2，唯一改动文件）。
> 方法：**不采信实现者自述**，双通道独立复跑（夹具 + 真实脚本副本），全部原始输出见下。
> 机器时间口径：本机 UTC−7。

## 一、判定

**REJECT** —— 但有明确边界，请按下面两段读：

1. **代码行为本身全部通过**（四场景独立复跑、字节级、既有语义未破坏，见 §三~§六）。
   没有任何一条"验收标准（可判定）1–6"失败，**start.bat 无需再改逻辑**。
2. **唯一阻塞项是文档/用户可见文案未同步**：`docs/QUICKSTART.md:125` 仍在向用户描述**改造前**的行为
   （"…只有产物缺失**或过期**、确实需要重新构建时，脚本才会**要求安装 Bun 并给出指引后退出**"），
   与本卡新行为**直接矛盾**。本卡 brief §涉及模块已把 `docs/QUICKSTART.md` 列为涉及文件；
   仓库规则要求同步（`CLAUDE.md` 文档同步第 6 条"改了 setup/commands → 同步文档"、
   `AGENTS.md`"改行为时同步改文案"）。且该行正是 R3 报告（`PRODUCT_UX_REPORT_R3.md:13`）
   用来描述本卡所修缺陷的两处文档之一 —— 缺陷已修，文档仍在描述缺陷行为。

**建议的解除条件（只改文案，勿动代码）**：把 `docs/QUICKSTART.md:125` 改为
"发行包已附带 `frontend/dist` 页面产物时，启动会直接复用产物，**全程不需要 Bun**；
即使判定产物偏旧，只要产物存在，脚本也会给出提示后照常启动（窗口会打印所用产物的构建时间）；
只有产物**确实缺失**、必须重新构建时，脚本才会要求安装 Bun 并给出指引后退出。"
（同源的 `docs/QUICKSTART.md:11`、`README.md:69` 一并微调，见 §七。）

若编排者认定"文档同步"超出本卡范围（brief 原文为"**若需**同步说明"），则本卡的代码部分可判 ACCEPT-as-is；
但按仓库既有规则与 R3 的引用链，我判定为**需同步**。

---

## 二、方法（可复制）

- **读取**：`[System.IO.File]::ReadAllLines($p,[System.Text.UTF8Encoding]::new($false))`，未使用裸 `Get-Content`。
- **输出采集**：`cmd.exe /c "…bat > out.txt 2>&1 < nul"`，再用严格 UTF-8 读回，避免 PowerShell 解码污染中文。
- **通道 1（夹具）**：把 `start.bat` **L55–L79 逐字抽出**（含 `:frontend` … `goto environment`），
  接上镜像真实结构的桩：`:build_frontend` 含 `if defined FQ_BUN_MISSING goto bun_missing` + `cd frontend` / `node_modules` /
  `call "%FQ_BUN%" install --frozen-lockfile` / `call "%FQ_BUN%" run build` / `:build_failed` / `:bun_missing` /
  `:environment` / `:launch` / `:fail`。4 个 `$env:TEMP` 沙箱，受控 mtime，`chcp 65001` 真实执行。
- **通道 2（真实脚本副本）**：整份 `start.bat` 拷入沙箱，**只**替换"Bun 探测两行"（→ `set "FQ_BUN="` + `set "FQ_BUN_MISSING=1"`）
  和末行 uvicorn 调用（→ echo 标记），其余**逐字保留**（含 `:environment`/`:backup`/`:launch` 全部真实代码），5 个场景实跑。
- 沙箱内 `backend\.venv` 用 **junction** 指向真实 venv（使 `:backup` 的 Python 备份段真实可跑），用完连 junction 一并送回收站。
- 未对仓库内 `start.bat` 做任何修改；`git status --porcelain` 全程为空。

---

## 三、四场景原始输出（通道 1：夹具，决策块逐字抽取）

```
===================== s1_nobun_missing   exitcode=1 =====================
[STUB] REACHED=bun_missing
[STUB] MSG=未找到 Bun，而当前需要构建前端页面，无法继续。
[STUB] REACHED=fail

===================== s2_nobun_stale   exitcode=0 =====================
[提示] 前端产物可能偏旧（frontend\package.json 比 frontend\dist\index.html 新），但本机未安装 Bun。
        将直接使用现有产物启动；若界面与预期不符，请安装 Bun 后重新运行本脚本。
[准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
[STUB] REACHED=environment
[STUB] REACHED=launch
[STUB] ERRORLEVEL_AT_LAUNCH=1

===================== s3_nobun_fresh   exitcode=0 =====================
[准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
[STUB] REACHED=environment
[STUB] REACHED=launch
[STUB] ERRORLEVEL_AT_LAUNCH=0

===================== s4_bun_stale   exitcode=0 =====================
[STUB] bun install --frozen-lockfile
[FAKEBUN] install --frozen-lockfile
[STUB] REACHED=build_frontend_with_bun
[FAKEBUN] run build
[STUB] REACHED=built_ok
[STUB] REACHED=environment
[STUB] REACHED=launch
[STUB] ERRORLEVEL_AT_LAUNCH=0
```

对照卡片要求：① 缺失→`bun_missing`（硬失败保留）✅ ② 过期→**不再退出**、告警后复用并走到启动 ✅
③ 新鲜→复用 ✅ ④ 有 Bun + 过期→走构建 ✅。

## 四、真实脚本副本实跑（通道 2，关键原文）

```
===================== A_nobun_missing  exit=1 =====================
[错误] 未找到 Bun，而当前需要构建前端页面，无法继续。
[怎么做] 1) 打开 https://bun.sh 按官网步骤安装 Windows 版本，装完后关闭本窗口，再重新双击 start.bat；
[怎么做] 2) 如果拿到的是已附带 frontend\dist 页面产物的发行包，产物存在且未过期时本来不需要 Bun；产物被删或过期后仍需按上一步安装。
[文档] 详见 docs\QUICKSTART.md 的"提示没装 Bun / Python，或安装、构建失败"一节。
Press any key to continue . . .

===================== B_nobun_stale  exit=0 =====================
[提示] 前端产物可能偏旧（frontend\package.json 比 frontend\dist\index.html 新），但本机未安装 Bun。
        将直接使用现有产物启动；若界面与预期不符，请安装 Bun 后重新运行本脚本。
[准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
[配置] 已创建 backend\.env。…
[提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
[启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[停止] 保持本窗口打开，使用完毕按 Ctrl+C 停止服务。
[EVAL] REACHED_UVICORN_EXEC errorlevel_entry=0

===================== C_nobun_fresh  exit=0 =====================
[准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
… [启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[EVAL] REACHED_UVICORN_EXEC errorlevel_entry=0

===================== D_bun_stale  exit=0 =====================
[准备] 正在安装锁文件中的前端依赖，首次安装需要网络。
[FAKEBUN] install --frozen-lockfile
[准备] 正在构建前端，请稍候。
[FAKEBUN] run build
… [启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[EVAL] REACHED_UVICORN_EXEC errorlevel_entry=0

===================== E_nobun_stale_db  exit=0 =====================
[提示] 前端产物可能偏旧…但本机未安装 Bun。
        将直接使用现有产物启动；…
[准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
[准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。
… [EVAL] REACHED_UVICORN_EXEC errorlevel_entry=0
```

**通道 2 的价值**：走的是**未经改写的真实** `:environment`/`:backup`/`:launch` 段，直接证伪了
"新分支会污染后续流程"这一类担心。

---

## 五、必做项 1：L55–L80 区域逐条核对（严格 UTF-8 读取）

| 行 | 事实（读到的原文要点） | 判定 |
|---|---|---|
| `:57` | `if not exist "frontend\dist\index.html" goto build_frontend` —— 与改造前一致 | ✅ 缺失仍走 build |
| `:83` | `:build_frontend` 首行 `if defined FQ_BUN_MISSING goto bun_missing` | ✅ 未改 |
| `:63` | `if errorlevel 1 goto stale_frontend`（原为 `goto build_frontend`） | ✅ 新增分岔 |
| `:70-71` | `:stale_frontend`：`if defined FQ_BUN_MISSING goto stale_frontend_nobun` / `goto build_frontend` | ✅ 有 Bun 仍构建 |
| `:73-75` | `:stale_frontend_nobun` 两条中文告警，**无 `goto fail`、无 `exit`** | ✅ 不硬退出 |
| `:77-79` | `:reuse_frontend`：`for %%I in ("frontend\dist\index.html") do echo [准备] 复用已有 frontend\dist（构建时间：%%~tI）。` → `goto environment` | ✅ 打印产物时间、落 :environment |
| `:176-180` | `:bun_missing` 文案与改造前一致（`git show e452a93` 证实该块未被 touch） | ✅ 语义保留 |

`:stale_frontend_nobun` 通过自然落空进入 `:reuse_frontend`——**标签顺序**（`:reuse_frontend` 在 `:build_frontend` 之前）
使得构建成功后经 `:95 cd ..` 直接落到 `:environment`（`:97`），**不会**误入复用分支打印旧时间。

## 六、必做项 3：字节级复核

```
BYTES=11684
CRLF=185      LF_ONLY=0      HAS_BOM=False
STRICT_UTF8_OK (strict decoder, 无替换字符)
L55–L80 逐行扫描：行尾空格 0 处、制表符 0 处
git diff --check  (e452a93^ .. 工作区, -- start.bat) → 无输出，exit 0
git status --porcelain → 空（验收过程未改动仓库）
```

---

## 七、重点质疑逐条回答（找茬结论）

**Q1「有没有可能改过头」——让"产物缺失 + 无 Bun"也不退出？**
**否。** 通道 1 场景 ① 与通道 2 场景 A 均以 **exit 1** 结束并输出 `:bun_missing` 的安装指引。
控制流上 `:57`（缺产物）与 `:63/stale_frontend`（产物在但旧）是两条**互斥**入口，新分支只挂在后者。

**Q2 `:stale_frontend_nobun` 是否有语法/标点问题导致 cmd 解析异常？**
**无。** 已**实跑**（通道 1 场景 ②/③、通道 2 场景 B/E）而非目视：中文与全角括号（`（…）`）在 `chcp 65001`
下原样输出、无解析错误、无 `'' 不是内部或外部命令` 类报错。L55–L80 无行尾空格、无制表符（脚本逐行扫描 0 命中）。
`%%~tI` 输出 `2026/09/11 11:31`（对应我设置的 `LastWriteTimeUtc=2026-09-11 18:31Z`，本机 UTC−7 ⇒ **本地时间，正确**）；
该行只在产物存在时可达，不会对缺失文件误报。

**Q3 `:backup` 的 `if errorlevel 1 goto backup_failed` 会否误吃前面时间检查遗留的 errorlevel？**
**独立判断：结论（不可观测）成立，但实现者 §三 的归因不完整。** 证据：

- **泄漏是真的**：夹具场景 ② 在 `:launch` 处读到 `ERRORLEVEL_AT_LAUNCH=1`（`:58` 的 `exit 1` 一路带过来，`goto`/`echo`/`for` 不重置）。
- **但它在任何 errorlevel 判断之前就被覆盖**。最干净的场景 F3（`backend\.env` **已存在** ⇒ 跳过 `:100 copy`；
  `finquant.db` **存在** ⇒ 执行 `:116-117` PowerShell；`backend\.venv` 经 junction 指向真实 venv ⇒ Python 真能跑）：

  ```
  [提示] 前端产物可能偏旧…（无 Bun）
  [准备] 复用已有 frontend\dist（构建时间：2026/09/11 11:31）。
  [准备] 已生成数据库快照（含 WAL 中的最新数据）到 backend\data\backups。
  [EVAL] REACHED_UVICORN_EXEC errorlevel_entry=0        exit=0
  --- backups created --- finquant-backup-20260911-203558.db
  ```
  ⇒ 备份成功、**未**走 `:backup_failed`、走到启动、退出码 0。
- **归因修正**：实现者称"DB 不存在时由 **uvicorn** 覆盖"**不准确**。通道 2 场景 B（DB 不存在 ⇒ 跳过 `:backup` 的 PowerShell）
  在 uvicorn **之前**测得 `errorlevel_entry=0` —— 重置它的是 `:135 start` 或 `:136 cd backend`，不是 uvicorn。
  不影响结论：**两种路径都在判断点前被重置**。
- **静态枚举（独立复核）**：泄漏点之后所有可达的 `if errorlevel` —— `:88`、`:93`（各自前面是 `call bun …`）、
  `:101`（前面是 `copy /b`）、`:118`（前面是 `:116-117` PowerShell）、`:138`（前面是 uvicorn）——**前置命令都会写 errorlevel**。
  `:114 if not exist … goto launch` 这条跳过 backup 的路径**不做任何 errorlevel 判断**，直接进 `:launch`，不构成风险。
- **残余风险**：与实现者记账一致——若日后有人在 `:launch` 的 uvicorn **之前**插入 `if errorlevel`，会踩到陈旧值。属"未来改动"风险，非本卡缺陷。

**Q4 是否破坏 `:build_frontend` / `:run_build` / `:bun_missing` 既有语义？**
**未破坏。** `git show e452a93` 的 diff 只有两处：`:63` 的跳转目标 + 新增 3 个标签（+16/−2），
`:81-95`（`:build_frontend`/`:run_build`）、`:168-174`（`:build_failed`）、`:176-180`（`:bun_missing`）**逐字未动**。
通道 2 场景 D 用假 `bun.cmd` 实跑**真实** `:build_frontend`：`install --frozen-lockfile` → `run build` → 落到 `:environment` → 启动；
途中一次误触发的构建失败（见 §八）也原样打印出未改动的 `:build_failed` 文案与指引。

**Q5 新增 `for %%I … %%~tI` 在 cmd + `chcp 65001` 下是否正确、会否在文件缺失时误报？**
**正确、不会误报。** 见 Q2（真实输出 `2026/09/11 11:31`）。可达性：`:57` 已保证进入 `:reuse_frontend` 时
`index.html` 必然存在；`:stale_frontend_nobun` 同源。构建成功路径根本不到该行。

---

## 八、阻塞项（REJECT 依据）

| 文件:行 | 原因 | 建议 |
|---|---|---|
| `docs/QUICKSTART.md:125` | 原文："…**只有产物缺失或过期、确实需要重新构建时，脚本才会要求安装 Bun 并给出指引后退出**。" VS-14 之后，**"过期" 不再要求安装 Bun、也不再退出**（有 Bun 才构建；无 Bun 告警后照常启动）。该行是用户在 `:bun_missing`/FAQ 中真正会读到的说明，与本卡新行为矛盾；也正是 R3 报告引用来说明本缺陷的两处文档之一。 | 按 §一 给出的替换句改写；同源微调 `docs/QUICKSTART.md:11`、`README.md:69`（都写成"未过期才不需要 Bun"，现已不完整）。**不改任何代码。** |

## 九、非阻塞观察（建议，不构成 REJECT 依据）

1. `docs/QUICKSTART.md:11` 与 `README.md:69`："（若发行包已附带 frontend/dist **且未过期**，则启动不需要 Bun）" —— 语义偏旧；
   现在"产物存在但过期 + 无 Bun"同样能启动（仅多一条告警）。建议随 §八 一并措辞。
2. `start.bat:179`（`:bun_missing` 内）："产物被删**或过期**后仍需按上一步安装" —— 该句在 VS-14 后对"过期"不再成立。
   但本卡 brief 明确要求 `:bun_missing` 文案"与改造前一致"（验收标准 1），**故不计为缺陷**，仅记账，日后随文档一并处理。
3. 验收标准 5 的边界：产物时间是**复用路径**打印的；"有 Bun + 过期 → 构建 → 启动"这条路径（`:95 cd ..` 落到 `:environment`）
   不打印时间。考虑到此时产物刚重建、不存在"看到旧界面"的自查需求，判为**可接受**；如想闭环可在构建成功后补一行同样格式的时间打印。
4. 实现者 §三 的**归因**不精确（详见 Q3），结论正确。建议在记账里把"被 uvicorn 覆盖"改为"被 `:135 start` / `:136 cd backend` 覆盖"，
   免得后人据错误归因做判断。

## 十、验收过程自查（透明记录，防止误判为产品缺陷）

- 通道 2 的前两次 F 场景运行出现了"无 Bun 却走进构建、报 `'""' is not recognized`"的假象。
  根因是**我自己的夹具脚本**漏处理原始 `set "FQ_BUN_MISSING="` 行，导致标记被清空 —— **不是产品缺陷**。
  修正后（F3）复现出正确行为（告警 → 复用 → 备份成功 → 启动，exit 0）。**该两次失败输出不得作为产品证据引用。**
- 通道 2 早期运行中，真实 `:135` 的浏览器守护进程会持有重定向句柄并可能在 90 秒后打开浏览器；
  已即时 `Stop-Process` 清理 4 个残留进程，后续场景在副本中屏蔽该行，收尾核对残留为 0。
- 所有 `$env:TEMP\vs14_*` 沙箱（含 junction）已送**回收站**，未使用 rm/del；真实 `backend\.venv` 完好。

## 十一、复验（文档同步）

> 复验范围**极小**：只读 `docs/QUICKSTART.md:11`/`:125`、`README.md:69`、`start.bat:55-79`（只读），
> 并 grep `docs/` 与 `README.md` 同类旧表述。**未修改任何实现或产品文档**（本条记录除外）。
> 复验对象：`93e6c83`（README.md 1 处、docs/QUICKSTART.md 2 处、IMPLEMENT_RESULT_VS14.md 归因）。

**判定：ACCEPT** —— §八 唯一阻塞项已解除，未引入新的不准确。

### 1. 三处逐句核对（对照 `start.bat` 实际行为）

| 位置 | 现文本要点 | 与实现是否一致 |
|---|---|---|
| `docs/QUICKSTART.md:125` | 产物存在 → 直接复用、**照常启动**、窗口打印所用产物**构建时间**；判为偏旧也**只提示不挡人**；**只有产物确实缺失**才要求装 Bun 并退出 | **一致**。`:57` 缺 `index.html` → `build_frontend` → `:83` 无 Bun → `:bun_missing`（`:189 exit /b 1`）；`:63` 过期 → `:stale_frontend` → `:70` 无 Bun → `:stale_frontend_nobun`（**不退出**）→ `:77 reuse_frontend`，`:78` 打印 `%%~tI` 构建时间 |
| `docs/QUICKSTART.md:11` | 准备项里保留 Bun，并注明"已附带 `frontend/dist` 页面产物时，启动**不需要 Bun**" | **一致**，且**未**暗示"永远不需要 Bun"（Bun 仍列在准备项） |
| `README.md:69` | "若发行包已附带 `frontend/dist` 页面产物，则启动不需要 Bun；产物偏旧也只提示、照常启动"；后文"需要时构建前端（否则复用 dist）" | **一致**（括号整体限定在"不需要 Bun"的场合；后句已含"需要时构建"即"缺失仍需 Bun"的前提） |

三项检查全部通过：① 与实现一致；② **已无**"缺失或过期 → 要求安装 Bun"这类断言（原 `:125` 的"或过期"已删除）；③ 未引入新不准确（没有出现"永远不需要 Bun"，"产物确实缺失仍需 Bun"这一前提在 `:125` 明确保留、在 `:11`/`README:69` 以保留 Bun 准备项 + "需要时构建"体现）。

### 2. 同类旧表述残留 grep（关键词：`缺失或过期` / `且未过期` / `要求安装 Bun`）

- **用户可见文档（`docs/QUICKSTART.md`、`README.md`）：无残留。** 仅 `QUICKSTART.md:125` 命中，且命中的是**改写后的新句**（"只有产物确实缺失时，才会要求安装 Bun…"），语义正确。
- 历史归档内的命中（**不计为缺陷**，均为带日期的记录，非当前行为描述）：
  - `docs/ai/EXEC_PLAN.md:277` —— 原始卡（017）的范围描述"检测 `frontend\dist`（缺失或过期则 `bun run build`）"，是**当时的设计记录**。
  - `docs/ai/evo/IMPLEMENT_RESULT_VS8.md:46/47/51/115/126` —— VS-8 实现记录中引用的**当时原文**。
  - `docs/ai/evo/PRODUCT_UX_REPORT_R3.md:13` —— R3 报告引用旧文案以描述本缺陷。
  - `docs/ai/evo/EVALUATION_RESULT_VS14.md:14/23/88/207/211/213` —— 本评估记录自身对旧文案的引用。
  - `reference/**` —— 第三方克隆，只读，无关。

### 3. `IMPLEMENT_RESULT_VS14.md` §三 归因

**已按更正写入，作废说法已明确标注作废**：`:35` 写明重置者是 **`:135` 的 `start` 与 `:136` 的 `cd backend`**，并把"DB 不存在时由 uvicorn 覆盖"标注为"**该说法不准确，已作废**"（全文再无把 uvicorn 当作重置者的表述）。与 `start.bat:135`（`start "" /b powershell…`）、`:136`（`cd backend`）行号一致。

### 4. 非阻塞观察（不影响 ACCEPT，留待编排者处置）

1. `start.bat:184`（`:bun_missing` 内）仍写"产物**被删或过期**后仍需按上一步安装"。VS-14 后"过期且无 Bun"已**不要求安装、也不退出**（走 `:stale_frontend_nobun`），故该从句对"过期"已不成立。与上轮 §九.2 同源；因 VS-14 验收标准 1 要求 `:bun_missing` 文案与改造前一致，**仍不计为缺陷**。该行仅在产物缺失时可见，用户影响极小。建议日后随文档一并把"或过期"删去。
2. `docs/ai/EXEC_PLAN.md:277` 属历史卡范围描述，非当前行为；如追求文档零歧义，可加一句"（VS-14 后过期不再触发构建）"。

---

## 十二、复现命令要点（供复核）

```powershell
$enc=[System.Text.UTF8Encoding]::new($false)
$all=[System.IO.File]::ReadAllLines('start.bat',$enc)
$block=$all[54..78]                       # L55..L79 逐字
# 夹具：$block + 桩(:build_frontend 首行 if defined FQ_BUN_MISSING goto bun_missing …)
# 真实副本：$all 全量，仅替换 Bun 探测两行与末行 uvicorn 调用
cmd.exe /c "sandbox\run.bat > sandbox\out.txt 2>&1 < nul"
[System.IO.File]::ReadAllText("sandbox\out.txt",$enc)   # 严格 UTF-8 读回
```
