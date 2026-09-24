# finquant-hub 基线勘察报告（只读侦察）

> 侦察对象：`E:\Code_file\Projects\finquant-hub`（git 仓库，`main` 分支）
> 侦察时间：2026-09-13 01:18–01:35（机器本地时间 `-07:00`，`Get-Date` 实测）
> 被勘基线：`main` HEAD = `f74a26e3574158da4bc617522df3485a3bf2747a`（2026-09-12 13:41:29 -07:00，作者 satan9394）
> 角色：只读侦察员。**本报告未改动、未提交、未删除被勘项目的任何文件**；唯一写入是本文件。
> 唯一写入路径：`E:\DeepSeek_Harness\workspace\2026_09_04\finquant-mission-01\recon-report.md`

---

## 0. 结论先行（TL;DR）

1. **VS-38 / VS-39 确实已完成验收**，且是**走完整闭环的 ACCEPT**：实现（`38c0e3e`）→ 独立 Reviewer 逐条判定（`f74a26e` 归档 `docs/ai/evo/EVALUATION_RESULT_VS{38,39}.md`，卡面标准 VS-38 ①–⑧ / VS-39 ①–⑦ 全满足）。两份验收文件都在 HEAD 里，测试文件也在 HEAD 里。
2. **基线是干净的**：`git status --porcelain` 只有两行未跟踪文件（两份 DSH 恢复文档），**没有任何已修改的已跟踪文件**；无 stash、无额外 worktree、无 remote（纯本地仓）。
3. **不存在"待收拾的在途半成品"**。`DSH_RECOVERY_CHECKPOINT.md` 里描述的"工作树含未验收改动（+199/−53）"**已被 `38c0e3e`/`f74a26e` 消除**，该文档现在的第 3、4、7 节内容**整体过期**。同时 `tasks/` 目录**确实不存在**——但项目约定用的是单数 `task/`（内含 `CHANGELOG.md` 看板）与 `docs/ai/tasks/`（142 个历史任务卡），所以"0 张卡"是**误判口径**，不是空看板。
4. **所以第一轮"恢复 Mission"不应该是再审计一轮**，而应该是**裁决 + 固化 + 收敛**：裁决两份未跟踪文档的落位 → 在最终提交上跑一次项目自带门禁并落盘 → 把散在 5 份文档里的 NEXT/NIT 收敛成一份带状态的清单。
5. **不能重复劳动的红线**：`docs/ai/evo/` 下已有 100+ 份证据文件、`task/CHANGELOG.md` 689 行、`PRODUCT_STATE.md` 333 行。**不要重跑全面审计循环**（上一轮 goal 已 440/440 触顶、phase=blocked、disarmed，用户明示"收完这一族就停"）。

---

## 1. 问一：VS-38 / VS-39 是否真的验收完成？ACCEPT 归档在哪？有无遗留待办？

### 1.1 判定：**真的完成了。归档在两处提交 + 两类文件里，且测试文件已入库。**

证据命令与输出摘录：

```
$ git log --oneline -10
f74a26e VS-38/VS-39 独立验收归档（ACCEPT ×2）与 CHANGELOG 补记
38c0e3e VS-38/VS-39 收尾：补齐两卡实现与结果记录（原实现者被中断；本轮只读取证 → 补证据 → 独立验收 ACCEPT）
cf2514a VS-38/VS-39 任务书（本族收口批，用户已定"收完这一族就停"）…
e101617 VS-37 复验轮归档：**ACCEPT（含 3 条 NIT）**——REJECT → 修复 → 复验通过
...
```

```
$ git show --stat --oneline HEAD | Select-Object -First 40
f74a26e VS-38/VS-39 独立验收归档（ACCEPT ×2）与 CHANGELOG 补记
 docs/ai/evo/EVALUATION_RESULT_VS38.md | 296 +++++++++++++++++++++++++++++++++++++++++
 docs/ai/evo/EVALUATION_RESULT_VS39.md | 290 +++++++++++++++++++++++++++++++++++++++++
 task/CHANGELOG.md                     |  16 ++++++++-
 3 files changed, 601 insertions(+), 1 deletion(-)
```

```
$ git ls-tree -r --name-only HEAD | Select-String -Pattern "VS3[89]|GlobalTaskEntryQueryScope|DiscoverThemesScope|DiscoverFactorScope"
docs/ai/evo/EVALUATION_RESULT_VS38.md
docs/ai/evo/EVALUATION_RESULT_VS39.md
docs/ai/evo/IMPLEMENTATION_BRIEF_VS38.md
docs/ai/evo/IMPLEMENTATION_BRIEF_VS39.md
docs/ai/evo/IMPLEMENT_RESULT_VS38.md
docs/ai/evo/IMPLEMENT_RESULT_VS39.md
frontend/tests/DiscoverFactorScope.test.tsx
frontend/tests/DiscoverThemesScope.test.tsx
frontend/tests/GlobalTaskEntryQueryScope.test.tsx
```

判定原文（`docs/ai/evo/EVALUATION_RESULT_VS38.md` / `VS39.md`）：

```
VS38.md:8   ## 1. 判定
VS38.md:10  **VS-38：ACCEPT。**
VS38.md:12  卡面验收标准 ①–⑧ **全部满足**（逐条见 §4）。无阻塞项；§7 列出 3 条 NIT 与 3 条残余风险，均不改变判定。
VS39.md:8   ## 1. 判定
VS39.md:10  **VS-39：ACCEPT。**
VS39.md:12  卡面验收标准 ①–⑦ **全部满足**（逐条见 §4）。无阻塞项；§7 列出 3 条 NIT 与 3 条残余风险，均不改变判定。
```

验收质量（值得肯定的部分，供 Mission 提案参考）：Reviewer 是**唯一 1 个独立 Reviewer**、**不修改代码**、只在 `%TEMP%` 副本内做变异；它自己重跑了数字（vitest 12 文件 / 44 用例 exit 0、`bun run build` exit 0、探针 1/2 均 `12 failed | 3 passed`、超时计数 0），并**主动标注了两处"判据空隙"并声明其中一条为"代码推理、未实测"**。这符合本项目"不夸大测试分辨力"的规矩。

### 1.2 遗留痕迹：**有，但不是"未完成"，而是 4 条登记在案的 NIT + 2 条已声明的判据空隙**

来自 `EVALUATION_RESULT_VS38.md` §7 与 `EVALUATION_RESULT_VS39.md` §7，并经我在源码中抽查复核：

| # | 遗留项 | 我的复核结论（只读） |
|---|---|---|
| N1 | `GlobalTaskEntry.tsx` 的 **`saved`/`recent` 同族未修**；验收者明确指出"**『本族收口』的声明因此并不严格成立**" | **成立**。`frontend/src/components/GlobalTaskEntry.tsx:87` = `.catch(() => setSaved([]));`；`:77` `useState<GlobalTaskTarget[]>(readRecentTargets)`、`:84` `setRecent(readRecentTargets())` |
| N2 | `onRetry` 的**操作数在 UI 上不可区分**（`runSearch(scopedFailure?.query)` 与 `runSearch()` 等价）——判据空隙、非缺陷 | 成立（VS38 §6 表 d 行，Reviewer 明确写"未被本卡用例直接命中"） |
| N3 | `Discover.tsx:130` 与 `GlobalTaskEntry` 失败时**瞬时 toast 与新内联失败态并存**（冗余观感） | 成立（非缺陷，仅观感） |
| N4 | **因子重试会连带重跑整个 `run()`**（多 2 个请求，无用例覆盖） | 成立（非缺陷，性能/请求数观感） |
| N5 | `DiscoverThemesScope` 用例 5 的绿灯**不能单独证明 `requestId` 守卫有效** | 成立（Reviewer 如实标注） |
| N6 | 因子失败"不加输入框门"的判断是**代码推理、未实测** | 成立（Reviewer 如实标注） |

另外两条**已被裁定为达标、不构成待办**：`DiscoverThemes` 快捷选词按钮不受 loading 门控（卡面写在"现状"而非验收标准，裁定达标）；`IMPLEMENT_RESULT_VS38.md` 的 `:219-239` 区间歧义（**决定不回改**，因为验收归档已引用该句，事后修改会让两份档案互相矛盾——这个决定本身是对的）。

```
$ git grep -n -I -E "TODO|FIXME|XXX|HACK" -- . ':!reference' ':!node_modules' ':!*.lock' ':!*.md'
（无输出）

$ git grep -n -I -E "TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP" -- frontend/src frontend/tests backend/app backend/tests scripts
（无输出）
```

⇒ **源码面 0 条 TODO/FIXME、0 处变异残留**。全部 33 处 `TEMP-REPRO|MUTATED` 字面命中都落在 `AGENTS.md` 与 `docs/ai/evo/*` 的历史正文里（是在**引用规则本身**，不是残留）。

---

## 2. 问二：那两份未跟踪的恢复文档是什么？建议怎么处置？

### 2.1 它们是什么

| 文件 | 大小 | 内容要点 |
|---|---|---|
| `DSH_RECOVERY_CHECKPOINT.md` | 4,789 B / 60 行 | 2026-09-12 的**紧急止损快照**（收到 `DSH_EMERGENCY_BRAKE.md` 后生成）。原始目标（Product Evolution Orchestrator 循环）、已完成卡清单、**当时 HEAD=`cf2514a` 且工作树含未验收的 VS-38/39 在途改动（+199/−53）**、5 项未完成、5 项风险、被中断的两个 Subagent（`6b6b3a6e`/`e73cf3f6`）、3 项推荐下一步、恢复方式 |
| `DSH_RECOVERY_REPORT.md` | 13,676 B / 138 行 | 同日的**恢复报告**，且已在 09-12 二次更新为"收尾后事实"。含 §8 只读取证的四项证据、§8.2 鉴别力两探针、§8.5 收尾结果（ACCEPT ×2 + 内容哈希 8/8 锚定）、两处判据空隙、4 条 NIT、§9 恢复原则 |

两者**不互为重复**：CHECKPOINT 是"刹车时的现场快照"，REPORT 是"救援后的结案"。

### 2.2 关键事实：CHECKPOINT 的现场描述**已整体过期**

```
$ git status --porcelain=v1
?? DSH_RECOVERY_CHECKPOINT.md
?? DSH_RECOVERY_REPORT.md
```

CHECKPOINT §3 写的"已修改：`GlobalTaskEntry.tsx`、`DiscoverThemes.tsx`、`Discover.tsx`、`i18n/{zh,en}.ts`（+199/−53）；未跟踪：3 个测试 + 2 个 `IMPLEMENT_RESULT_VS{38,39}.md`"——**这些内容现在全部已在 `38c0e3e` 里**，工作树干净。CHECKPOINT §4 第 1 项、§7 第 1 项、§5 第 1 项（"最大现场风险：工作树含未验收的在途改动"）**均已失效**。

REPORT 比 CHECKPOINT 新（含 §8.5 收尾），但它 §1 的"工作树已清空，仅剩两份恢复文档未跟踪"**与当前实测一致**。

### 2.3 建议（**我没有执行任何处置**）

**推荐：归档提交，原件一字不改 + 追加"已被取代"注记。**

理由：
1. **可客观验证的"干净基线"需要一个空的 `git status`**。只要这两份文件留在原地未跟踪，`git status --porcelain` 永远非空，"基线干净"就无法用一条命令证明。
2. **这份内容是唯一的过程记录**：CHECKPOINT 记录了紧急刹车的触发与两个被中断 Subagent 的 id；REPORT §8 记录了 VS-38/39 收尾轮的原始探针证据。`task/CHANGELOG.md` 的"附五"（已提交）是它们的**摘要素**，但**探针表、四项证据的原始输出、被中断 agent id 都不在 CHANGELOG 里**。
3. **项目自己的规则不许改写历史档案**：`AGENTS.md` 明确"逐字旧文只保留在 `docs/ai/evo/*` 历史档案与 `task/CHANGELOG.md`；档案不许改写，改写＝伪造记录"。所以**正确动作是落地归档并标记失效，而不是编辑它**。
4. 落位建议：把两份**原样**（`git hash-object` 前后不变）落到 `docs/ai/evo/`，并**另加**一份极简的 `docs/ai/evo/DSH_RECOVERY_SUPERSEDED.md`（1 页）说明"CHECKPOINT §3/§4-1/§5-1/§7-1 已被 `38c0e3e`/`f74a26e` 取代"。**不要**在 CHECKPOINT 文件内部改字——那会破坏"档案不可改写"这条规则。

**备选 A（若用户认为恢复文档不属项目产物）**：把它们移到**项目之外**（例如本工作区 `2026_09_04\finquant-mission-01\archive\`），使仓库 `git status` 变空。代价：项目内失去过程记录，且跨目录移动仍需一次"写 + 回收站"两步。
**备选 B（建议拒绝）**：直接删掉。这会让 VS-38/39 收尾轮只剩 CHANGELOG 摘要素可查，破坏项目"证据落盘"的既有约定；且与用户全局"所有删除必须进回收站"的铁律无关地损失信息。**不推荐。**

> 注：无论选哪条，都**不要**把这两份文件加进 `.gitignore`——`.gitignore` 现在的定位是"构建产物/密钥/本地缓存"，把决策档案塞进去等于让一个待裁决物永远看不见。

---

## 3. 问三：当前项目状态（目录 / 技术栈 / 命令）

### 3.1 目录结构概要

```
$ Get-ChildItem -Force | Select Mode,Length,Name
d---- .claude  .dsh  .dsh-vision-router  .github  .harness
d---- archify-output  artifacts  backend  BrowserSkill  docker  docs
d---- frontend  htmlcov  knowledge  memory  node_modules  notes
d---- output  reference  scripts  sites  task  templates
-a--- .coverage 856064 | AGENTS.md 26795 | HANDOFF.md 77918 | start.bat 13997
-a--- README.md 10719 | CHANGELOG.md 2717 | CLAUDE.md 5351 | STATE.json 444
-a--- design-qa.md 6089 | SECURITY.md 2312 | CONTRIBUTING.md 2642 | LICENSE 11365
-a--- DSH_RECOVERY_CHECKPOINT.md 4789 | DSH_RECOVERY_REPORT.md 13676
```

已跟踪文件 **6,593** 个；顶层占比：`reference/` 3,023 + 2,333（第三方克隆，只读、公开快照不分发）、`docs/` 465、`frontend/` 351+8、`backend/` 265、`sites/` 47、`scripts/` 24、`templates/` 20。

关键子结构：

- `backend/app/` — `main.py`（FastAPI 入口，**import 23 个 APIRouter**）、`database.py`（aiosqlite 原生 SQL，schema v23 / 52 逻辑表）、`routers/`（24 个 .py，23 个 `APIRouter`）、`services/`（含 `research_orch.py`、`swarm_orch.py`、`llm_client.py`）、`agent/`（13 个本地工具）、`backtest/`、`orchestrator/`（**只有 `runtime.py`/`team.py`**）
- `frontend/src/` — `pages/`、`components/`、`services/api.ts`（单 axios 实例）、`store/`（zustand）、`i18n/{zh,en}.ts`
- `frontend/tests/` — **131 个 `*.test.tsx`**（目录内共 152 个文件）；`frontend/e2e/` 11 个 spec（另有 `e2e-8000/`）
- `backend/tests/` — **123 个 `test_*.py`**
- `docs/ai/evo/` — **125 份**编排产物（审计报告、任务书、实现结果、验收结果、产品状态、缺口图）
- `docs/ai/tasks/` — **142 张历史任务卡**（`AIOS-*` / `BACKLOG-*` / `PROD-*` / `TASK-*` / `UI-*`）
- `task/` — 单数！`CHANGELOG.md`（**689 行 / 163,717 B，这是项目的事实看板**）、`PROJECT_CONTEXT.md`、`TASK_TEMPLATE.md`
- **`tasks/`（复数）不存在** ← 与 `AGENTS.md` 工作区规则里"任务卡落盘 `tasks/`"的约定**不一致**，见 §6 风险 R10

### 3.2 技术栈

`STATE.json` 自述 profile：`mode=single`，`modifiers=[local-first, a-share, chinese-ui, fastapi-react]`，`default_components=[backend,frontend,docs]`；`rules=[]`、`archived=[]`、`total_incidents=0`（**这个治理层几乎是空的**，所有经验都写在 `AGENTS.md` 里）。

- 后端：Python 3.12 + FastAPI + uvicorn + aiosqlite（**无 ORM / 无连接池 / 无独立 DAL**）+ sse-starlette + numpy；lint `ruff`（line-length 120, py312, select F/W/E）+ `mypy --strict`（files=["app"]）；测试 `pytest`（coverage `fail_under=80`）
- 前端：TypeScript ~5.6 + React 18 + AntD 5 + ProLayout + zustand + axios + echarts 6 + lightweight-charts；构建 Vite 6 + `tsc -b`；包管理 **bun**（`bun.lock` 80KB）；测试 **vitest 4** + Testing Library + jsdom；E2E Playwright 1.62
- 数据：`backend/data/finquant.db`（SQLite + WAL，手写迁移、无 migration 框架）
- 交付：Windows 双击 `start.bat` → `http://127.0.0.1:8000`（唯一入口）；可选 Docker Compose 路径（`127.0.0.1:5173`）；`scripts/export_public_source.ps1` 生成 Apache-2.0 公开快照
- **`frontend/package.json` 的构建链**：`prebuild` 会先跑 `../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check`，然后 `tsc -b && vite build` ⇒ **前端构建依赖后端 venv 存在**

### 3.3 命令（来自 README / AGENTS.md / HANDOFF.md，三处基本一致）

```bash
# 后端测试（慎用全量，见 §6 R4）
cd backend && .venv\Scripts\python.exe -m pytest -q
# 后端 lint（作用域 = backend/，用的是 backend/pyproject.toml）
cd backend && .venv\Scripts\python.exe -m ruff check .
# 后端类型
cd backend && .venv\Scripts\python.exe -m mypy app
# 前端测试 / 构建
cd frontend && bun run test
cd frontend && bun run build
# E2E（核心旅程变更才需要）
cd frontend && bun run test:e2e
```

### 3.4 我在本轮**实际跑过的只读命令**与结果

| 命令 | 结果 |
|---|---|
| `git status` / `--porcelain=v1` | 仅 2 行未跟踪；**无已跟踪文件被修改** |
| `git log` / `show --stat` / `ls-tree` | 见 §1 |
| `git remote -v` | **空**（本地仓，无远端，不用担心落后/领先） |
| `git worktree list` | 只有主工作树 `E:/Code_file/Projects/finquant-hub f74a26e [main]` |
| `git stash list` | **空** |
| `git branch -a` | 6 个（`main` + 5 个 `codex/*` 分支，均非 HEAD 祖先关系未知但不影响 main） |
| `git check-ignore -v DSH_RECOVERY_*.md` | **无输出 ⇒ 未被忽略**（所以它们出现在 `status` 里） |
| `git grep TODO/FIXME/XXX/HACK`（排除 reference/node_modules/*.md） | **0 命中** |
| `git grep TEMP-REPRO\|MUTATED\|XXX-TEMP`（限源码目录） | **0 命中** |
| `cd backend && ruff check --no-cache .` | **`All checks passed!`**（exit 0）——**后端门禁当前是干净的** |
| `ruff check --no-cache --select F --isolated scripts/audit.py` | **`Found 1 error`**：`scripts/audit.py:423` `hooks_dir` 赋值后未使用（F841）。**该文件不在 backend 门禁作用域内**，见下 |
| `Get-ChildItem` / `Select-String` 若干 | 结构、计数、版本号等，见上 |

**一处对既有档案的更正（本轮实测）**：`DSH_RECOVERY_REPORT.md` §4-3 与 §8.3-5 称"`scripts/audit.py` 存在 1 处既有 `ruff` 报错，**会让 `ruff check .` 常红**"。**该表述只在"从仓库根目录跑 `ruff check .`"时成立**；项目文档定义的门禁是 `cd backend && ruff check .`，我实测为 `All checks passed!`。顺带实测：从根目录跑 `ruff check .` 会得到 **`Found 11956 errors`**，因为 `reference/` 下 5,000+ 个第三方文件也在扫描面内 ⇒ **"根目录 ruff"根本不是本项目的可用判据，不要用它做红线**。

### 3.5 会产生/修改文件、故本轮**按约定未跑**的命令（建议在 Mission 里跑，附预期判据）

| 命令 | 会写什么 | 预期判据 |
|---|---|---|
| `cd frontend && bun run test` | `node_modules/.vite` 等缓存（已忽略） | 131 个测试文件全绿、exit 0；**已知在峰值负载下会有假红**，需记录并发边界 |
| `cd frontend && bun run build` | `frontend/dist/`、`tsconfig.tsbuildinfo`（均已被 `.gitignore` 覆盖；`dist` 现在已存在） | `openapi_tsgen.py --check` fresh（60 schemas）→ `tsc -b` 无错 → `vite build` 成功（历史约 `4263 modules transformed`，20–100s） |
| `cd backend && python -m pytest -q` | `.pytest_cache/`、`.coverage`、`htmlcov/`（**已被忽略**） | ⚠️ **不要跑全量**：`AGENTS.md` 记录本机沙箱下**全量 pytest 会挂起**（多次实测被杀，含单独文件也挂）。只跑被改到的测试文件 |
| `cd backend && python -m ruff check .` | `.ruff_cache/`（已忽略） | `All checks passed!`（本轮已用 `--no-cache` 证实） |
| `cd backend && python -m mypy app` | `.mypy_cache/`（已存在） | `strict=true, files=["app"]` 无错 |
| Docker 路径 `.\scripts\local.ps1 doctor` | 首次 `up` 会创建 `.env.local` | `doctor` 本身是只读检查；`up` 会建容器与 named volume ⇒ **本轮未跑** |

---

## 4. 问四：项目自己的"下一步该做什么"证据 → 候选清单（按严重度）

### 4.1 先说结论：**没有任何"未完成的 planning 文件"**，但有大量**过期陈述**

- `docs/ai/EXEC_PLAN.md`：140 个 `[DONE]`，**只有 1 处 `[READY]` 字样**，且是一句话："AIOS-088 已完成，当前无 `[READY]`。"（第 1132 行）⇒ **执行计划已排空**。我另核实 `BACKLOG-046/047/048/049` 的代码确实已提交（`bc0d59c`/`9cbe1d4`/`37cbd4b`/`d249644`，均为 `main` 祖先，`git merge-base --is-ancestor` exit 0），**尽管这些 `[DONE]` 条目正文写着"未 commit"** ⇒ **文档里的"未提交"声明不可信，必须以 git 为准**（见 §6 R11）。
- `HANDOFF.md`（77KB）：`AGENTS.md` 要求"开工先读 HANDOFF.md"，但它的**当前目标仍是 `Local OSS v1 发布就绪`，最近更新 2026-08-21**（比 HEAD 早 3 周），其 DoD 里 LICENSE、"docs 引用注释"三项**已全部完成却仍标着未勾选**（文件内已有一条 2026-09-13 的复核注记确认三项其实都完成了）。⇒ **HANDOFF.md 相对 HEAD 严重过期，不能当"下一步"依据**。
- `docs/ai/evo/PRODUCT_STATE.md`（333 行）：**这是唯一还在维护的状态档案**，"当前最高价值下一步"一节已更新到 R267（列出 R5 综合的 NOW-1..NOW-4 队列），但 **NOW-1..NOW-4 已全部由 VS-24..VS-29 做完并 ACCEPT** ⇒ 该节的"当前"也已被 R439 收官账取代（**这符合文件自己的约定："当前"类陈述随进展更新，带日期的历史陈述只标记被取代、不改写**）。
- `docs/ai/evo/PRODUCT_GAP_MAP.md`（45KB）：R5 综合的 NOW-1..NOW-4（第 192–195 行）同上，已全部完成。
- **没有** `PRODUCT_BACKLOG.md`、没有 roadmap 文件、没有 `tasks/` 看板。

### 4.2 候选清单（按严重度，全部带来源）

> 每条的"状态核实"是我在源码/文档上做的只读抽查。

**🟠 P1 — 真实缺陷、范围小、已有明确判据**

1. **`GlobalTaskEntry.tsx` 的 `saved`/`recent` 读取失败与"确实为空"同形**（VS-38 NIT-1，验收者独立复核成立，并指出"本族收口声明不严格成立"）。
   来源：`EVALUATION_RESULT_VS38.md` §7 NIT-1。复核：`:87 .catch(() => setSaved([]))`、`:77/:84 recent`；渲染侧 `targetList` 在 `items.length === 0` 时整块不渲染。**与已 ACCEPT 的 VS-19/22/29/36/38 同族，修法已有既定范式**（三态契约 + `LoadStateView`；族内唯一实现处 `LoadFailureAlert.tsx`，由 `8d05556` 建立）。

2. **`frontend/tests/MonitorToday.test.tsx:30` 未传已成必填的 `onRetry`**（来源：`PRODUCT_STATE.md` R439 补二 🟡）。
   复核成立：`ResearchRuns` 的 props 签名 `{ runs, error, loading, onRetry: () => void }`（`ResearchRuns.tsx:8-21`），而 `MonitorToday.test.tsx:30` 只传了 `runs`。**注**：`frontend/tsconfig.json` 的 `include` 只有 `["src","vite-env.d.ts"]` ⇒ **`tsc -b` 不会检查 tests/，所以这不是构建红**，而是潜伏的类型缺口（一旦有人把 tests 纳入 tsc，或改成必填运行时使用就会暴露）。

3. **`scripts/audit.py:423` 的 `hooks_dir` 未使用（F841）**——**本轮实测确认是唯一真实 lint 红**（在根作用域 F 类扫描下）。
   来源：`DSH_RECOVERY_REPORT.md` §4-3。复核：`ruff check --select F --isolated scripts/audit.py` → `Found 1 error`。**注意口径更正**：`cd backend && ruff check .` 是**干净**的（本轮实测 `All checks passed!`），该错误只在根目录作用域下可见。修法零行为变更（删除该赋值或改为实际使用）。

**🟡 P2 — 需要先评估/需人裁决，不建议直接开工**

4. **`swarmApi.ts` 根本没有历史回放拉取**（VS-35 验收者发现：只有实时 SSE + 团队定义；唯一回放入口 `deriveAgentOutcomes` 只遍历 research 的 `AGENT_KEYS`）⇒ **新需求而非缺陷**。
   来源：`PRODUCT_STATE.md` R439 补二 🟠、`DSH_RECOVERY_REPORT.md` §6-3（判定"暂缓，需先单独评估是否值得做"）。**建议：先出一张只读评估卡，不实现。**

5. **约 40 处族外"发起时清失败态"**（VS-29 划出家族边界时登记的遗留）。
   来源：`PRODUCT_STATE.md` R439（VS-29 交付要点"遗留"）、`DSH_RECOVERY_REPORT.md` §6-4。**建议：不整批开工，改为"扫到即列出、不扩卡"**（沿用 VS-36 先例）。

6. **A5-P2-5 高频 AI 入口不在导航**（`/chat` `/discussion` `/thesis` `/compare` 不在主导航）。
   来源：`PRODUCT_GAP_MAP.md` 第 212 行、`DSH_RECOVERY_CHECKPOINT.md` §4-3。属**用户体验类**，文档自己写"等有明确用户反馈再排" ⇒ 维持 NOT_NOW。

7. **`A5-P3-6`：`start.bat` 跳过依赖安装**（`DSH_RECOVERY_CHECKPOINT.md` §4-3 列入旧 NEXT；未在任何后续文档中被重申）⇒ 状态存疑，需先核实是否仍成立。

**🟢 P3 — 观感/性能/技术债，明确非阻塞**

8. `Discover.tsx:130` 与 `GlobalTaskEntry` 失败时**瞬时 toast 与内联失败态并存**（冗余观感）。
9. **因子重试连带重跑整个 `run()`**（多 2 个请求，无用例覆盖）。
10. VS-34 残留：非 `Error` rejection 时 `e.message` 为 `undefined`，会让 toast 无文案；`Chat` 的角色失败态有两份（**文档明确说是有意冗余**）。
11. VS-37 NIT③：`scripts/audit.py` 的"引述旧句"检查里，第三方豁免对**强框架词**一并生效，留了一条很窄的过宽路径（**本仓 0 命中**）。
12. 技术债滚动清单（`PRODUCT_STATE.md` §技术债/风险）：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、`AlphaSimulationWorkbench` 负载 flake。
13. 文档漂移（见 §6 R10）：`README.md` 第 5 行与第 104 行写"**22** 个 APIRouter、**135** 个 `/api/*` 路径、**169** 个 HTTP 操作"，而 `README` 架构段又写"**22** APIRouter → 135 路径"；`AGENTS.md` 第 50/53 行写"**23** APIRouters / **133** 个 /api/* 路径"。我实测 `app/routers/*.py` 有 **23 个 `APIRouter(` 定义**、`main.py` import 了 **23 个 router 模块** ⇒ **`AGENTS.md` 的 23 更接近事实，README 的 22 已过期**（路径/操作数未逐一核对，见 §7 未验证项）。

### 4.3 被明确拒绝 / 明确暂缓的（**不要重新捡起来做**）

- **NOT_NOW（主动拒绝，附理由）**：Notebook 研究环境；实盘交易/券商接口；高频数据；纯装饰功能；`database.py` 上帝模块拆分（G-08）；用量计价借鉴 one-api（G-15）；**CI**（G-14：本机无 CI 环境，手工门禁已足够）；Python 放宽到 3.13（与文档一致，放宽需真实兼容性验证）；`VS-11 F1` 的按 `local_mode` 条件渲染（经核实该发现被削弱）。
- **明确暂缓**：swarm 历史回放（须先评估）；~40 处族外发起时清；A5 产品 UX 类（等真实用户反馈）。
- **已失效的陈述（勿据以行动）**：`CHECKPOINT` 的"工作树含未验收改动"；`REPORT` §6 中已被 §8.5 消除的两项；`PRODUCT_GAP_MAP`/`PRODUCT_STATE` 的 NOW-1..NOW-4（已全部 ACCEPT）；`PRODUCT_STATE` R439 补二的"同族状态未按实体作用域"（`Discover.tsx:49` / `AlphaResearchPanel.tsx:25`）——**这两处已由 VS-36（`37c3eef`，ACCEPT `ba725bd`）修掉**。

---

## 5. 问五：第一轮"恢复基线"Mission 提案

### ① 一句话 Mission

> **在不重跑任何已完成工作的前提下，把 finquant-hub `main@f74a26e` 固化为"可用一条命令验证的干净基线"：裁决两份未跟踪恢复文档的落位、在最终提交上复跑项目自带门禁并落盘证据、把散落在 5 份文档里的 NEXT/NIT 收敛为一份带状态的单一待办清单。**

### ② Definition of Done（5 条，均可客观验证）

| # | DoD | 客观判据（命令级） |
|---|---|---|
| D1 | 工作树真正干净 | `git status --porcelain` **输出为空**（两份恢复文档已按用户裁决"归档提交"或"移出仓库"之一，且有对应处置记录） |
| D2 | 后端门禁绿且证据在案 | `cd backend && python -m pytest <被改文件聚焦集> -q` → `0 failed`；`cd backend && python -m ruff check .` → 文本含 `All checks passed!`；两者退出码 0 |
| D3 | 前端门禁绿且证据在案 | `cd frontend && bun run test` → exit 0（131 个测试文件）；`cd frontend && bun run build` → exit 0（`openapi --check` fresh + `tsc -b` 无错 + `vite build` 成功） |
| D4 | 基线证据文件落盘且**锚点不可漂移** | 存在 `docs/ai/evo/BASELINE_VERIFICATION.md`，首部写明被验的**显式提交号全 40 位**（**禁止 `HEAD~1` / `HEAD^^` 这类相对锚点**）与每项门禁的**原始输出粘贴**；文件内容含被验对象的 `git hash-object` 摘要 |
| D5 | 待办收敛且不重复劳动 | 存在 `docs/ai/evo/NEXT_BACKLOG.md`；其中**每一条**都带 `状态 ∈ {未解决, 已解决, 已拒绝, 待评估}` 与**来源文件+行号/章节**；且经人工抽查：**不得出现任何已 ACCEPT 卡（VS-3..VS-39）已解决的问题**，尤其不得出现 NOW-1..NOW-4、`Discover.tsx:49`、`AlphaResearchPanel.tsx:25`（均已解决） |

> D2 的 pytest 作用域：**只跑被 W4/W5/W6 触到的测试文件**（预期 `backend/tests/` 内 0–2 个文件因本轮改动而变化）。若本轮 W4–W6 全部不纳入，则 D2 退化为"ruff `All checks passed!` + 一条 3–5 文件的 backend 冒烟"。

### ③ 建议的 WorkSet（6 张卡，≤8；每张一行）

| 卡 | 来源 | 目标（一行） |
|---|---|---|
| **W1 恢复文档裁决与落位** | `human-requested` | 依用户裁决把两份恢复文档**原样**归档到 `docs/ai/evo/` 并追加一份"已被取代"说明（或整体移出仓库），使 `git status --porcelain` 为空；含一次路径限定提交，提交信息写明处置理由 |
| **W2 基线门禁复跑与落盘** | `planned` | 在 W1 后的最终提交上跑 D2/D3 的门禁，产出 `docs/ai/evo/BASELINE_VERIFICATION.md`（显式提交号 + 原始输出 + 并发边界声明）；**不修任何代码** |
| **W3 NEXT/NIT 清单收敛** | `planned` | 合并 `PRODUCT_STATE.md` R439 补二、`DSH_RECOVERY_REPORT.md` §6、`EVALUATION_RESULT_VS{38,39}.md` §7、`PRODUCT_GAP_MAP.md` NOW/LATER，产出 `docs/ai/evo/NEXT_BACKLOG.md`（每条带状态与来源）；**不改写任何历史档案** |
| **W4 `saved`/`recent` 同族收口** | `planned`（VS-38 NIT-1，验收者复核成立） | 让 `GlobalTaskEntry.tsx` 的 `saved`/`recent` 读取失败与真实为空**可区分**（复用族内三态契约 + `LoadStateView`），含**反向断言**（当前实体自己失败仍须显示）与请求计数证明重试真重发；**必须独立验收**后方可算完成 |
| **W5 测试类型缺口收口** | `planned`（VS-32 评估者 🟡） | 给 `frontend/tests/MonitorToday.test.tsx:30` 的 `ResearchRuns` 补 `onRetry`，并全仓核对是否存在同类缺参调用点；**零生产代码改动** |
| **W6 唯一真实 lint 红收口** | `planned`（本轮实测） | 处理 `scripts/audit.py:423` 的 `hooks_dir` 未使用（F841，**零行为变更**），使根作用域 F 类扫描归零；不得改动 `backend` 作用域结论，不得顺手扩卡 |

> **建议的批次**：W1+W2+W3 = **Mission 1 的必做三卡**（它们本身就是 DoD 的载体）；W4/W5/W6 建议作为**同一 Mission 的第二批**（若预算吃紧，可整体拨到 Mission 2，但那样 D2 的 pytest 作用域就退化为冒烟）。**不建议**一轮全开 6 卡：本项目的实测教训是"并行开卡只保证文件不重叠是不够的——门禁会互相污染"（见 §6 R5），而 W4 需要独立验收（意味着同时存在实现者与 Reviewer）。

### ④ 预算建议

> 基线依据：本仓单卡历史实际耗时/轮次（VS-25/26/27/28/29/30/31/38/39 的结果文件显示单卡 6–20 轮、前端门禁单次 20–100s、vitest 12 文件 44 用例在负载下达 73–244s）；已知本机全量 pytest 会挂起、负载下未变异副本也会假红。**因此预算的重心是"轮次与并发上限"，不是 token 上限。**

**Run 级（1 个 Run = 1 张卡的一次"派活→交证"循环）— 8 项**

| # | 项 | 建议值 | 为何是这个值 |
|---|---|---|---|
| 1 | 墙钟上限 | 文档/裁决类卡 **20 min**；代码类卡 **45 min**（W4 前端） | W1–W3/W5/W6 是文档与小改动；W4 需 vitest + build，本机负载下 build 历史 20–100s、vitest 探针 73–244s |
| 2 | Worker 轮次上限 | **12 步** | 本仓单卡历史 6–20 轮；12 轮足以覆盖"读卡→核实行号→改→跑门禁→写证据"，超限即交证停下 |
| 3 | 并发上限 | 同时 **≤2** 个 Worker；其中**任何时刻只有 1 个**跑 `bun run build` / `tsc -b` / 全仓 glob 收集 | `AGENTS.md` 实测：门禁会互相污染（VS-31 的 build 把 VS-29 在制 src 一起编译） |
| 4 | 门禁重跑上限 | 每条门禁 **最多 2 次**（首次 + 1 次净化重跑）；第 2 次仍红即按"疑似真红"上报 | 本机"负载假红"已成常态，但**第 3 次重跑就是"用重跑换绿"**，正是本仓反复出现的走歪方式 |
| 5 | 变异/探针预算 | 每卡 **1–2 个**变异体，**必须在 `%TEMP%` 副本内**（junction 指回真实 `node_modules` / `.venv`） | VS-25/26/27/28/30/38/39 的评估者全部用副本，效果良好；真实工作树变异已被证明会污染提交（`9979b14` 事故） |
| 6 | 测试作用域预算 | 只跑"被改文件 + 直接相关文件"；前端单卡 **≤15 个测试文件**；**禁跑全量 pytest** | `AGENTS.md`：全量 pytest 在本机挂起，且杀 `pwsh` 不杀子 `python`（会留孤儿进程） |
| 7 | 证据预算 | 结果文件必须含「命令原文 + 原始输出摘录 + **显式提交号或内容哈希**」；单卡结果文件 **≤400 行** | 对齐 `EVALUATION_RESULT_VS38/39.md`（296/290 行）的实际体量；同时禁 `HEAD~1`（锚点漂移已被实测） |
| 8 | Token/上下文预算 | 单卡 **≤150k** 有效上下文工作量；超出即交证停下问人 | 上一轮开放式循环 440 轮触顶（`goal-6d6cd59d…`，phase=blocked）的教训 |

**Mission 级（第一轮恢复基线）— 3 项**

| # | 项 | 建议值 |
|---|---|---|
| 1 | **轮次** | **≤3 个 Run**（建议 3：W1 → W2 → W3；W4/W5/W6 若纳入则 +2，封顶 5），**无自动续轮**、不使用 goal 自动续跑 |
| 2 | **墙钟总预算** | **≤120 min**（W1 20′ + W2 30′ + W3 40′ + 缓冲 30′） |
| 3 | **停止判据（任一满足即停并交人裁决）** | ①D1–D5 全部客观验证通过；②任一 Run 触碰 Out of scope；③遇到需要用户决策的产品语义分叉（首当其冲就是"两份恢复文档是归档还是移出"）；④同一 blocking 条件连续 3 轮无进展 |

### ⑤ Out of scope（明确不做，写进卡里当红线）

1. **不重开全面产品审计循环**（`docs/ai/evo/RAW_*` / `PRODUCT_UX_REPORT_R*` / `RELIABILITY_REPORT_R*` 的六轮审计已完成）；**不自动开新功能卡**；**不自动续轮**。
2. **不改任何架构不变量**：无 ORM、无连接池、无独立 DAL、无 WebSocket、无 SSR、无 DI 容器、无 Agent 间通信。
3. **不加新依赖**（npm 与 Python 均含）；**不做 schema 迁移**（`database.py` 52 表 / v23 是高风险区）。
4. **不动 `reference/`**（第三方克隆，只读）；**不删除任何文件**（一切删除必须进回收站，遵守本仓删除铁律）。
5. **不做 `git push` / 不建 Release / 不做公开快照导出**（无 remote，且发布门禁是独立议题）。
6. **不重跑全量 pytest / 不跑 E2E / 不跑 Docker 路径 `up`**（会挂起或产生容器与 volume）。
7. **不改写 `docs/ai/evo/*` 与 `task/CHANGELOG.md` 的历史条目**（"档案不许改写，改写＝伪造记录"）——只允许**新增**文件与在 R 节追加带日期的更新。
8. **不处理 NOT_NOW 清单**（Notebook / 实盘 / 高频 / G-08 / G-15 / CI / Python 放宽）。
9. **不整批修"约 40 处族外发起时清"**（沿用"扫到即列出、不扩卡"）。
10. **不在真实工作树内做变异/探针**（一律 `%TEMP%` 副本）。

### ⑥ 未纳入本 WorkSet 的候选（附理由，供用户选择是否升级为卡）

- **swarm 历史回放**（🟠，新需求）：体量大且是"评估先行"型 ⇒ 建议 Mission 2 的首张卡（只读评估卡），本 Mission 只把它登进 `NEXT_BACKLOG.md`。
- **A5-P2-5 高频 AI 入口不在导航**、**`A5-P3-6` start.bat 跳过依赖安装**：前者已定 NOT_NOW，后者状态存疑需先核实 ⇒ 本 Mission 只做"状态核实并登记"，不开工。
- **`README.md` 的 22/135/169 与 `AGENTS.md` 的 23/133 漂移**：属文档一致性，建议合并进 W3（收敛清单）时**只登记不修改**，避免"顺手扩卡"。

---

## 6. 问六：风险与坑（下一轮必须避免的"踩过就疼"）

> 全部来自 `AGENTS.md` "Agent 作业踩坑"（约 25 条）、`task/CHANGELOG.md` 与 `PRODUCT_STATE.md` 的实测事故记录。**每条后面括号里是该坑的实测来源。**

| # | 坑 | 必须怎么做 |
|---|---|---|
| **R1** | **提交时点比"结果文件写完"早一步**——连续两张卡（VS-26/VS-27）在编排者按"报告完成"提交后又追加内容，导致入库的是**缺证据版本**。（`PRODUCT_STATE` R439 沉淀①） | 报告完成后**再等一次确认**，或核对文件大小/时间戳是否还在变，再 `git add`；若已提交而对方又追加，**立即补一次路径限定提交**并写明"补入后续修订"，不要用 amend 掩盖 |
| **R2** | **证据随提交衰减** + **相对锚点漂移**——"工作区 vs HEAD"类证明在提交后退化为同义反复；`HEAD~1` 在验收中途因别人提交而指向错对象（VS-34 评估者实测取到错 blob）。（`AGENTS.md:84-86`） | 归档一律写**显式提交号**（如 `92055e0^`）或**被验对象的内容哈希**；**禁 `HEAD~1`/`HEAD^^`**；对"零改动"类证明要求多通道印证 |
| **R3** | **变异窗口污染工作树 → 变异态被提交**——`ResearchWorkspace.tsx` 曾以含 `TEMP-REPRO` 且缺两行逻辑的形态进入 `9979b14`，事后只能 `--amend`。（`AGENTS.md:95-96`） | ①等实现者明确报告完成再读/提交；②提交前对**待提交文件**扫 `TEMP-REPRO\|TEMP_REPRO\|MUTATED\|XXX-TEMP`；③`git add` **一律限定路径**，禁 `git add .`；④变异一律在 `%TEMP%` 副本内，且让做变异的人**先声明窗口** |
| **R4** | **全量 pytest 在本机挂起 + 杀 pwsh 不杀子 python**——全量 pytest 多次被杀（`pwsh-1/65/79`），连单个 `test_model_pricing.py` 都挂；`job_kill`/`Stop-Process` 只结束包装进程，`pytest` 变孤儿继续跑。（`AGENTS.md:78-81`） | 前置 `$env:no_proxy='localhost,127.0.0.1,::1'`，**只跑确实改到的测试文件**；收尾必须核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` 无残留 `-m pytest`；**别误杀**非本项目的常驻 python |
| **R5** | **并行开卡的门禁互相污染 + 负载制造假红**——VS-31 的 `bun run build` 会把 VS-29 在制的 8 个 src 一起编译；峰值负载下**未变异的副本也会超时变红**（本仓默认 `testTimeout` 5s）。（`AGENTS.md:111-112`） | 开卡前除比对**改动文件集**，还要比对**门禁作用域**（`bun run build`/`tsc -b`/`ruff check .`/vitest glob/全量 pytest 都算共享资源）；**能让 build 洁净就跑 `%TEMP%` 副本**；执行者须**如实记录"本窗口内有他卡并发"并声明"不能证明该失败与本卡无关，也不能证明有关"** |
| **R6** | **清理进程按"排除法"误杀他卡**——VS-31 只排除了一个文件名，误杀另两张卡的 vitest；真正代价是被误杀方把"跑一半中断/exit 1/无输出"**误判为自身缺陷**。（`AGENTS.md:82-83`） | ①正向匹配**自己的完整命令行特征**；②动手前先列出全部候选进程命令行逐个确认；③若已误杀，**立刻只给事实**并请对方以自己的重跑为准，**不得因此放松任何断言** |
| **R7** | **"绿灯不能反推修法正确"**——同一处缺陷有两个改法都能让 26 条断言全绿（RTL 的 `act` 冲刷吃掉"切换那一帧"）；同类还有"把断言改弱""做成错误永不显示""退回旧契约""用文案匹配代替结构化信号"。（`AGENTS.md:87-89`） | ①看到"改完就绿"，先问"**有没有另一种错误改法也能让它绿**"；②正确性理由必须写成**结构性的**（例如"错误态自带实体归属"）；③时序/中间帧类改动**读代码判定**并标注"代码时序推理、未实测"；④**既有断言一条都不能放宽** |
| **R8** | **文档承诺与实现不一致**（出现过"文档说保留 7 份、实现只提示不删"、"README 承诺免 Bun、脚本却硬退出"、"PRD 描述不存在的加密迁移"）。（`AGENTS.md:93`） | 改行为时同步改文案；**已实测两处现状**：`README.md` 的 22 APIRouter vs `AGENTS.md` 的 23（实测 23）；`HANDOFF.md` 三周未更新、DoD 勾选状态与实际相反 |
| **R9** | **日期错记事故**——`docs/ai/evo/` 多处曾误记 `2026-09-13`，`task/CHANGELOG.md` 条目标题日期与会话跨午夜不符；本仓历史上有过同类事故。（`task/CHANGELOG.md` 2026-09-11 条注、`PRODUCT_STATE`） | 用 `Get-Date` 核对机器时间再写日期；跨午夜显式记录边界；**带日期的历史条目不得回改**；发现日期不符时**显式记录"以某处为准"而不是静默统一** |
| **R10** | **项目约定与工作区约定不一致**：`AGENTS.md`（工作区）要求"任务卡落盘 `tasks/`"，而 **finquant-hub 用的是单数 `task/`（只放 CHANGELOG）+ `docs/ai/tasks/`（142 张历史卡）**，`tasks/` 根本不存在 | 下一轮**不要**在 finquant-hub 里新建 `tasks/` 目录制造第二套看板；先问用户"看板落在 `docs/ai/evo/NEXT_BACKLOG.md` 还是 `task/`" |
| **R11** | **文档里的"未提交/未完成"声明不可信**：`EXEC_PLAN.md` 里 `BACKLOG-046/047/048` 的 `[DONE]` 条目正文写着"**未 commit**"，但对应提交（`bc0d59c`/`9cbe1d4`/`37cbd4b`）**早已是 `main` 的祖先** | 任何"是否已提交/是否已完成"的判断**必须以 git 为准**（`git merge-base --is-ancestor`），不采信文档自述 |
| **R12** | **`start.bat` 的一系列承重细节**：`.bat` 对含中文必须 CRLF（LF-only + 非 ASCII 会让 cmd 解析错位）；备份载荷的双引号是承重的（含 `\|`/`&`）；续行的行首缩进必须保留；`-Filter` 的**尾星**承重（`-partial*` 才能匹配 `-wal`/`-shm`/`-journal` 伴生件）；回收含 junction 的目录会失败（先单独回收 junction 本身）。（`AGENTS.md:97-105`） | 动 `start.bat` 前必读这几条；夹具必须**逐字复制原行、不 Trim**、并以 `.bat` 经 `cmd.exe` 实跑 |
| **R13** | **SQLite WAL 一致性**——只复制 `finquant.db` 会静默丢弃 `-wal` 里已提交的事务；必须用 `sqlite3.Connection.backup()`。（`AGENTS.md:100`） | 任何备份/恢复相关改动都走既有约定，并**自造场景**验证（真实 `backend/data` 的 WAL 已被 checkpoint） |

**另有一条"别再犯"的元教训**（`PRODUCT_STATE` R439）：编排者本会话**被下游纠正 4 次**——"预存在测试污染"归因被推翻、"3 处竞态"框架被更正、`PRODUCT_GAP_MAP:204` **只换半句留下悬空且自相矛盾的尾句**（"子串替换只换半句"犯过两次，两次都由下游发现）、提交信息写"已同步路线图"而当时尚未同步。⇒ **W3 收敛清单时，替换/合并文档内容必须"整句整段替换 + 读回核对"，并用 `grep` 复核旧句不残留。**

---

## 7. 不确定项与未验证项（如实列出）

**本轮未运行、故未验证的（按约定只读，避免产物）：**

1. **前端测试与构建未实跑**：`bun run test`（131 个测试文件）与 `bun run build` 本轮**未执行**（会产生 `dist`/`tsconfig.tsbuildinfo`/缓存）。当前"全绿"的依据是 `38c0e3e`/`f74a26e` 收尾轮与 Reviewer 的副本内结果（vitest 12 文件 44 用例 exit 0、build exit 0），**不是我在 HEAD 上复跑的**。
2. **后端 pytest 未跑**：按 `AGENTS.md` 的实测（全量挂起）与"避免产物"的双重理由未执行；D2 的 pytest 判据因此**待 Mission 内证实**。
3. **`.venv` / `node_modules` 的完整性未验证**：只做了存在性观察（`backend/.venv`、`frontend/node_modules`、`backend/data/finquant.db`、`frontend/dist/index.html` = True），未验证可执行性。
4. **未验证 `frontend/dist` 是否与 HEAD 源码同源**：`dist/` 已被 `.gitignore` 忽略且存在，无法从 git 判断新鲜度（`start.bat` 的"产物过期判定"本身也是已知脆弱项）。
5. **`/api/*` 路径数与 HTTP 操作数未核对**：只核到 **23 个 `APIRouter` 定义 + `main.py` import 23 个 router 模块**；README 的"135 路径 / 169 操作"与 AGENTS 的"133 路径"**均未实测**（需跑 OpenAPI 导出，会产生文件，故未跑）。
6. **5 个 `codex/*` 分支与 `main` 的关系未评估**：`codex/pr-01-app-shell`、`codex/sites-release-20260727/28`、`codex/sites-source` 等**既未确认是否已并入 main，也未确认 HEAD 是否为其祖先**；本轮只确认 `main` 无 remote、无额外 worktree。若用户关心"是否有分支上的成果未回收"，需另做一次分支盘点。
7. **`A5-P3-6`（`start.bat` 跳过依赖安装）是否仍成立未核实**：该条只在 `DSH_RECOVERY_CHECKPOINT.md` §4-3 出现过一次，后续文档未重申 ⇒ **状态存疑，需先核实再决定是否登记**。
8. **`~40 处族外"发起时清失败态"` 的确切数字未复核**：引用自 `PRODUCT_STATE.md`/`DSH_RECOVERY_REPORT.md`，本轮**未自行 grep 计数**。
9. **`swarmApi.ts` 无历史回放的判断未复核**：引用自 VS-35 验收者（`PRODUCT_STATE` R439 补二），本轮未读该文件。
10. **两份恢复文档的"原件一字不改即可归档"未做哈希预记录**：建议 W1 执行时先 `git hash-object` 记下两份文件的 blob 哈希，再入库，以便事后证明内容未变。

**本身存在歧义、需要用户裁决的：**

11. **`DSH_RECOVERY_CHECKPOINT.md` 的处置方式**：归档提交（推荐）vs 移出项目 vs 其他。**这是本 Mission 唯一的"人工决策点"**，也是 D1 的前置。
12. **"看板落哪里"**：`docs/ai/evo/NEXT_BACKLOG.md`（我的建议，沿用 `docs/ai/evo/` 既有证据面）vs `task/`（项目既有看板目录）vs 新建 `tasks/`（与工作区规则一致但与项目现状冲突）。建议二选一由用户拍板，**不要两套并存**。
13. **W4（saved/recent 同族）是否属"恢复基线"范围**：严格说它是**新修复**，不是"恢复"。若用户希望第一轮 Mission 纯粹是"确认 + 固化"，则应把 W4/W5/W6 整体拨到 Mission 2，DoD 的 D2 相应退化为 ruff + backend 冒烟。

---

## 8. 附录：本轮命令清单（可复现）

```powershell
# 基线
cd E:\Code_file\Projects\finquant-hub
git status; git status --porcelain=v1; git branch -vv
git log --oneline -10; git show --stat --oneline HEAD
git remote -v; git worktree list; git stash list; git reflog -5
git check-ignore -v DSH_RECOVERY_REPORT.md DSH_RECOVERY_CHECKPOINT.md
git ls-tree -r --name-only HEAD | Select-String -Pattern "VS3[89]|Scope"
git merge-base --is-ancestor 37cbd4b main; git merge-base --is-ancestor d249644 main

# 结构与配置
Get-ChildItem -Force; Get-ChildItem -Recurse task; Get-ChildItem docs\ai\evo
Get-Content frontend\package.json; Get-Content backend\pyproject.toml
Get-Content frontend\tsconfig.json; Get-Content .gitignore; Get-Content STATE.json

# 标记扫描（只读）
git grep -n -I -E "TODO|FIXME|XXX|HACK" -- . ':!reference' ':!node_modules' ':!*.lock' ':!*.md'
git grep -n -I -E "TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP" -- frontend/src frontend/tests backend/app backend/tests scripts

# lint（--no-cache 保证不写缓存；--isolated 避免配置发现歧义）
cd backend; .\.venv\Scripts\python.exe -m ruff check --no-cache .
cd ..; .\backend\.venv\Scripts\python.exe -m ruff check --no-cache --select F --isolated scripts\audit.py

# 计数与漂移
(Select-String -Path backend\app\main.py -Pattern "include_router" | Measure-Object).Count
(Select-String -Path backend\app\routers\*.py -Pattern "APIRouter\(" | Measure-Object).Count
(Get-ChildItem frontend\tests -Filter *.test.tsx | Measure-Object).Count
(Get-ChildItem backend\tests -Filter test_*.py | Measure-Object).Count
Select-String -Path docs\ai\EXEC_PLAN.md -Pattern "\[READY\]"
Select-String -Path docs\ai\evo\PRODUCT_GAP_MAP.md -Pattern "NOW-\d"
```

**报告结束。** 本报告未对被勘项目执行任何写操作；两份未跟踪恢复文档、5 个 `codex/*` 分支、全部既有文件均**原样保留**。
