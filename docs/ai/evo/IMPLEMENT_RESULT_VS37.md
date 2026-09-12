# IMPLEMENT_RESULT — VS-37：形态级防护（"引述旧原文"形态告警）

> 未 commit（按卡要求）。基线 HEAD = `d44a850cac9a2bcf0bd16bcd8e4e53651d1ee97e`。
> 本卡第一验收对象是**精度**，故证据以"命中清单 + 逐条判定 + 收紧阶梯"为主，不以"加了规则"为成绩。

---

## 0. 目标文件确认（先于一切；本会话已有"卡里路径错、实现者连门都进不去"的事故）

| 卡里写的 | 实际 | 结论 |
|---|---|---|
| `scripts/audit.py` = 审计脚本 | 存在，**改动前 541 行**（改动后 **649** 行 = 541 + `git diff --numstat` 的 `108 0`），文件头自述"harness-engineering audit.py — 自动核查单项目 harness 的健康状态" | **路径与脚本名均正确，无需更正** |

旁证（避免下一次"连门都进不去"）：

- `scripts/` 下另有 21 个脚本：`harness-check.py`（汇总体检）、`handoff-log.py`（变更日志）、`record-error.py`（规则/事故写入）、`bootstrap.py`、`note-lifecycle.py`、`gate-dag.py`、`state-diff-merge.py`、`ui-contrast-audit.py`、`openapi_tsgen.py` 等。**没有第二个叫 audit 的脚本**（只有一个 PowerShell 旁支 `audit_open_source_readiness.ps1`，主题是"开源就绪度"，不是本卡的审计脚本）。
- `AGENTS.md` 的 "Harness governance" 与 "Harness 日常用法（v4.11.0）" 两段都把 `python scripts/audit.py .` 明确描述为**审计健康检查**（`0=健康，1=有问题`）。⇒ 卡中指的确实是它。
- 卡中的 `python`：本机 `python` 解析到 `D:\Technology_application\Anconda_All\Anaconda3\python.exe`（base 3.11.14）；仓库另有 `backend\.venv`（3.12.12）。**本卡门禁按 AGENTS.md 的 `python scripts/audit.py .` 执行**；`audit.py` 是纯标准库脚本，两者均可跑，实测输出一致（本卡结果用 Anaconda `claude` 环境的 python 3.11.14 产出，与 `~/.dsh/AGENTS.md` 的"默认 Python"一致）。

---

## 1. 结论摘要

**实现完成，且精度达标**：形态级规则已加入 `scripts/audit.py`，约定已写入 `AGENTS.md`。

- 规则在**当前 HEAD 的作用面上命中 0 处**（⇒ 0 误报、0 真告警，见 §3.1）。
- **历史档案与 CHANGELOG 未被标为需修改**——不是"碰巧没命中"，而是**显式豁免**；实测这些档案里**确实有 20 处**该形态，若纳入作用面将 100% 是误报（见 §3.2、§5）。
- 正例夹具（12 例，5 正 7 负）**全部按预期判定**（见 §6）。
- 既有检查项**零回归**（24 项逐项一致，含证据文本；退出码仍为 0；见 §4）。
- 我判定**这条规则值得做**，没有走到卡里给的"出口"——依据是收紧后的判据在基线作用面上命中 0，而它仍能命中 VS-28 的真实事故原文（见 §5.3）。

---

## 2. 规则实现

### 2.1 判据：**锁形态，不锁某句话**

一条命中要**同时**满足两段：

| 段 | 内容 | 正则 |
|---|---|---|
| ① 引述框架词 | 弱：`原文`/`原句`/`原话`/`原表述`/`原说法`/`旧说法` **+ 系词 `为`/`是`** | `QUOTE_OLD_WEAK_RE` |
| | 强：`(?:已删除的\|删除的\|旧)原文` | `QUOTE_OLD_STRONG_RE` |
| ② 紧随的**引文实体** | 成对引号里 ≥2 字（可前置全/半角括号与空白），**或**冒号后紧跟非空白 | `QUOTE_OLD_SPAN_RE` |

⇒ 判据是"**有人把一段旧文本抄了回来**"这个**形态**。所以：

- 换一句旧文照样命中（不依赖任何具体句子）；
- 某个具体句子消失**不会**让规则失效；
- **没有引文实体就不是"引述"**——"这份旧文本已删除"不命中；卡里推荐的指路式写法（原断言已删除，取回 `git show <sha> -- <path>`）**也不命中**。

### 2.2 作用面与豁免面（`_quote_old_scope`）

| 面 | 范围 | 判定 |
|---|---|---|
| **作用面（in）** | 源码扩展名（`.py .ts .tsx .js .jsx .mjs .cjs .vue .ps1 .sh .sql`，即注释/docstring 所在）+ **契约类文档**（`AGENTS.md`、`CLAUDE.md`，以及文件名含 `CONTRACT`/`ARCHITECTURE`/`SCHEMA`/`TECH_STACK` 的 `.md`，如 `docs/API_CONTRACT.md`） | 命中 ⇒ **WARN** |
| **豁免面（archive）** | `docs/ai/*`、`task/*`、`memory/*`、`notes/*` **全部文件**（含 `docs/ai/evo/**` 历史档案与 `task/CHANGELOG.md`） | 只统计、**不告警**（改写＝伪造记录） |
| 不扫 | 其余（README、普通 docs、products 报告…）；`reference/`（只读第三方克隆＝"正常引文"大本营）、`node_modules`、`.venv` 等 | 忽略 |

**第三方引文豁免**：框架词**前 24 字符内**出现 `RFC\d`/`ISO\d`/`GB/T`/`PEP\d`/`规范`/`标准`/`第三方`/`上游`/`官方`/`外部` 时跳过——对应卡里"正常引文（引用第三方文档/规范原文）不该被拦"。

**报告呈现**：新增独立段 `## 形态级防护（引述旧句）`（在"隐私"之后、"基础设施"之前）。有命中出 `WARN` + 至多 8 条样例；无命中出 `OK`；**另有一条 `INFO` 显示归档面豁免计数**——这条 INFO 是**故意的**：它证明"豁免是承重的、不是空豁免"（若归档面命中恒为 0，豁免就无从验证）。该 INFO 随档案增长而变，已在 evidence 里写明"非零且随档案增长属预期，不是缺陷"。

**退出码不受影响**：新项只可能是 `OK`/`WARN`/`INFO`，**永不 `NOT-OK`** ⇒ `python scripts/audit.py .` 仍 `exit 0`。这是刻意选择（与 PII 相同：默认 WARN，需要阻断时由人升级），理由见 §9-2。

- 实现规模：`scripts/audit.py` **+108 / −0 行**（`git diff --numstat` 实测；新增常量块 33 行 + `_quote_old_scope`/`scan_quote_old` 两函数 48 行 + 报告段 23 行 + 模块 docstring 语义边界 4 行），`AGENTS.md` **+1 / −0 行**。

### 2.3 精度阶梯：三级收紧，逐级实测（**这是本卡的核心证据**）

数字锚定在**基线提交 `d44a850` 的 `git archive` 抽取面**（只含被跟踪文件，排除 `reference/`、`node_modules/` 与本机未跟踪产物），可复现：

| 档 | 判据 | 作用面命中 | 逐条核实 |
|---|---|---|---|
| **A** | 裸 `原文`（无系词、无引文要求） | **13** | **13/13 全是误报**——全部是"**原始文本**"义（详见 §5.1） |
| **B** | A + 系词 `为`/`是` | **0** | 系词一步就把 13 处全排除 |
| **C** | 强框架词（无引文要求） | **0** | — |
| **D** | **B + 紧随引文实体（本卡采用）** | **0** | 见 §3.1 |

**B 已经是 0，为什么还要加 ②（引文实体要求）？** 因为"基线 0"不等于"判据够严"——**构造性反例实测**：

> 我写的**第一版** `audit.py` 注释里有一句「…旧说法是承重语义…」，**被 B 档判据命中 3 处**（全在本文件自己的注释与报告文案里，全是正常行文、全是误报）。加上"紧随引文实体"后**归零**，且此后我又把 3 处 `旧说法是…` 改写成 `旧说法属…`，使本文件在工作树上**连 B 档也命中 0**。

⇒ ②是**承重的**，不是装饰。附带结论：**这条规则最大的误报来源是"它自己的说明文字"**，见 §2.4。

### 2.4 自命中问题（必须明写的设计约束）

判据要能拦住"引述旧原文"，**规则的自我描述就必须能写出被禁形态**——这天然冲突。处理方式与结果：

- **不设"自我豁免"**（那会变成"把不方便的样本排除掉"的盲区）。改为**把正则与注释写成不自命中的形态**：强框架词写成分组式 `(?:已删除的|删除的|旧)原文`（**不写整串字面量**）；报告文案与注释避开「框架词＋系词」相邻写法。
- **实测自命中为 0**：`scripts/audit.py` 在作用面上命中 **0**（§3.1）；`AGENTS.md`（同样是作用面）命中 **0**。
- **代价（如实披露）**：以后有人在 `audit.py`/`AGENTS.md` 里**逐字写出被禁形态**（例如在注释里举例 `原文为"…"`），会被自家规则命中并 WARN。这不是 bug，是"形态级判据的固有属性"；已在 `AGENTS.md` 条目末尾显式提醒。
- **本文件（`docs/ai/evo/IMPLEMENT_RESULT_VS37.md`）不受影响**：归档面豁免，所以下文可以放心贴逐字原文作为证据——这本身就是"豁免面是承重的"的一个实例。

---

## 3. 当前 HEAD 上的全部命中清单与逐条判定（验收①）

### 3.1 作用面（会告警的面）：**0 处**

在**基线提交 `d44a850` 的抽取面**与**当前工作树**上分别实测，作用面命中均为 **0**：

```
ROOT = <temp>\vs37_base_d44a850        (git archive d44a850 抽取)
A 裸原文（无系词、无引文要求）                       in-scope(作用面) hits = 13
B 原文+系词（无引文要求）                          in-scope(作用面) hits = 0
C 强框架词（无引文要求）                           in-scope(作用面) hits = 0
D 强+弱框架词+紧随引文实体【本规则】                    in-scope(作用面) hits = 0
归档面 D 命中（豁免，不告警）= 20
```

```
当前工作树（含本卡的 audit.py / AGENTS.md 改动）:
A 裸原文            in-scope hits = 21
B 原文+系词          in-scope hits = 0
C 强框架词           in-scope hits = 0
D 强+弱+引文实体【本规则】 in-scope hits = 0
```

⇒ **无"真告警"、无"误报"，本清单为空**。（`A=21` 里多出的 8 处全是本卡新增的 `audit.py` 注释与 `AGENTS.md` 条目里对"原文"一词的正常提及——本来就是 B 档要排除的东西，不是命中。）

### 3.2 归档面（豁免、不告警）：基线 **20 处**，逐条判定"**应当保留、不得改写**"

| # | 位置（基线 `d44a850`） | 命中片段 | 判定 |
|---|---|---|---|
| 1 | `docs/ai/evo/EVALUATION_RESULT_VS14.md:26` | `原文为"**若需**同步说明"` | **豁免**：评估报告在引述 brief 原文以判定范围 |
| 2 | `docs/ai/evo/EVALUATION_RESULT_VS28.md:72` | `原文为"…在**事件通道**上同样显式、不可静默"` | **豁免**：VS-28 评估报告的原始取证 |
| 3 | `docs/ai/evo/EVALUATION_RESULT_VS28.md:73` | `原文为"事件通道与返回值同源，两条都不静默"` | **豁免**：同上 |
| 4-7 | `docs/ai/evo/EVALUATION_RESULT_VS33.md:150,153,268,287` | `原文为"使'提前结束'`／`原文为"事件通道与返回值同源…"`／`旧原文"的形态* `原文为"`／`原文为"`）而非"` | **豁免**：VS-33 报告**为审计目的**逐字保留了被删原文与 grep 前后对照——**这正是历史档案该存的** |
| 8 | `docs/ai/evo/IMPLEMENTATION_BRIEF_VS37.md:9` | `旧原文"的形态**（例如 `原文为"` | **豁免**：本卡任务书本身在描述该形态 |
| 9-10 | `docs/ai/evo/IMPLEMENT_RESULT_VS28.md:89,90` | `原文为"使'提前结束'`／`原文为"事件通道与返回值同源…"` | **豁免**：VS-28 实现报告 |
| 11-19 | `docs/ai/evo/IMPLEMENT_RESULT_VS33.md:31,60,73,122,124,127,129,240,248` | 同上（含 `原文为"…"` 的形态说明与逐字旧文） | **豁免**：VS-33 实现报告 |
| 20 | `docs/ai/evo/PRODUCT_STATE.md:331` | `原文为"` 一类"` | **豁免**：产品状态册引述 VS-33 的建议原文 |

**20/20 全部判为"豁免、应当保留"**：这些文档的语义**就是**"这条说法不实/已改正"，逐字保留是它们的**内容**（VS-28 已明确冻结历史档案，改写＝伪造记录）。**判为"需修改"的数量 = 0。**

---

## 4. 既有检查项零回归（验收④）

方法：改动前先跑 `python scripts/audit.py . --json` 存基线（`%TEMP%\vs37_before_json.txt`），改动后再跑一次（`%TEMP%\vs37_gate_json.txt`），**按 (段名, 状态, 检查项, action, 证据) 五元组逐项比对**，并剔除新增段。

- 报告段：改前 `['指令层','约束层','反馈层','记忆层','编排层','数据正确性','隐私','基础设施']`（8 段）
  → 改后 同一列表 **+ `形态级防护（引述旧句）`**（插在"隐私"与"基础设施"之间，9 段）。
- 条目数：改前 **24** → 改后 **26**；**剔除新增段后 = 24**（数量一致，无增无减）。
- **既有检查项逐项完全一致（含证据文本、状态、action）：`True`**。
- 顶层退出码：改前 **0**、改后 **0**（新项只可能是 OK/WARN/INFO，永不 NOT-OK ⇒ 不影响退出码）。

| # | 段 | 检查项 | 改前 | 改后 | 一致 |
|---|---|---|---|---|---|
| 1 | 指令层 | 指令文件行数 | OK | OK | 是 |
| 2 | 指令层 | 规则密度（仅粗略计数，人工复核） | INFO | INFO | 是 |
| 3 | 约束层 | 工具调用前拦截（hooks） | OK | OK | 是 |
| 4 | 约束层 | CI 阻断 | OK | OK | 是 |
| 5 | 约束层 | 约束层入 git：.claude/hooks | OK | OK | 是 |
| 6 | 约束层 | 约束层入 git：.github/workflows | OK | OK | 是 |
| 7 | 反馈层 | 客观门禁命令（文本匹配；可跑性需人工实测） | OK | OK | 是 |
| 8 | 记忆层 | 记忆载体（STATE.json） | OK | OK | 是 |
| 9 | 记忆层 | 文档目录 | OK | OK | 是 |
| 10 | 编排层 | 编排需求信号（能单不多） | INFO | INFO | 是 |
| 11 | 编排层 | 轮次/成本上限 | INFO | INFO | 是 |
| 12 | 数据正确性 | golden set / 字段级验收指标（预算单位、缺失率、误提取率） | INFO | INFO | 是 |
| 13 | 数据正确性 | 单位/金额归一化 | INFO | INFO | 是 |
| 14 | 隐私 | 样本扫描（手机/邮箱/疑似密钥，仅掩码） | WARN | WARN | 是 |
| 15-22 | 隐私 | PII 样例（phone）×7 / （email）×1 | WARN | WARN | 是 |
| 23 | 基础设施 | git 仓库 | OK | OK | 是 |
| 24 | 基础设施 | tests/ 目录存在 | INFO | INFO | 是 |

> 补充：改前的 `WARN` 计数（PII 77354 条命中、8 条样例）与改后**逐字节一致**——新增的源码文本没有引入任何新的 PII 命中，既有隐私扫描判定未变。

---

## 5. 误报证据（验收②）

### 5.1 为什么**不能**匹配裸「原文」——基线 13 处逐条看，13/13 是误报

`A` 档（裸 `原文`）在基线作用面上的**全部 13 处命中**如下（逐条都是"**原始文本**"义，**没有一处**是"引述旧原文"）：

| # | 位置 | 该处"原文"的实际含义 |
|---|---|---|
| 1 | `AGENTS.md:87` | 「错误原文按房间作用域」＝**被渲染的错误消息原文** |
| 2,3,4 | `.claude/hooks/record-error.py:28,167,398` | 「不回显**事件原文**」「事件**原文**在写入前已被敏感拦截」＝**事件的原始文本**（防密钥泄露） |
| 5 | `backend/app/services/swarm_orch.py:290` | 「失败**原文** / 被跳过的原因…留存」＝**失败的原始文本** |
| 6,7,8 | `frontend/src/i18n/zh.ts:1070,1071,1072` | 「中文**原文**」「可打开**原文**查阅」＝**教学文档的中文原文** |
| 9,10 | `scripts/harness-mcp.py:19,319` | 「事件不回显**原文**」＝**事件原始文本** |
| 11,12,13 | `scripts/record-error.py:28,167,398` | 同 2-4（bundle 内的副本） |

⇒ **裸「原文」在本仓是"原始文本"的同义词**，把它当"引述旧原文"的判据 **13/13 误报**。这与卡里点名的两个前科（合法键名 `noMutation` 被当变异标记、行长阈值被当拼接检测）**同型：把匹配当事实**。加系词 `为`/`是` 一步解决。

### 5.2 历史档案与 CHANGELOG **确实**没被标为需修改（不是空豁免）

- 若把归档面并入作用面，基线会有 **20 处**告警，**20/20 是误报**（§3.2 逐条）。
- 定向构造验证（夹具，`$env:TEMP`）：`docs/ai/evo/EVALUATION_RESULT_VS99.md` 写入 `原文为"…两条都不静默"`、`task/CHANGELOG.md` 写入 `原文为"两条都不静默"` 已改正 —— **两者均未告警**，且**被计入豁免统计**（夹具输出 `archive(exempt) hits = 2`，明细见 §6）。

### 5.3 反面对照：规则**确实能**命中 VS-28 的真实事故原文

同一次实测里，归档面命中了**逐字的真实事故文本**——即 `原文为"事件通道与返回值同源，两条都不静默"`（`EVALUATION_RESULT_VS28.md:73`、`IMPLEMENT_RESULT_VS33.md:73/122/129/248` 等）。

⇒ 这条规则**不是**只能"什么都不命中"的空规则：**VS-33 修复前**，`backend/app/services/llm_client.py:132/562` 里的那两行就是同一形态，规则**会**命中（该文件属源码＝作用面）。也就是说：**若今天有人把旧句抄回去，会立刻 WARN。**

---

## 6. 正例/负例证据（验收③）—— 夹具在 `$env:TEMP`，**未进仓库**

夹具体：`%TEMP%\vs37_fixture\`（12 个文件，**只用 Python 写出、写完即弃**，**未在仓库目录放任何临时文件**）。

**夹具判定表（12 例，5 正 7 负；驱动：`python %TEMP%\vs37_fixture.py`）**：

```
FIXTURE: <temp>\vs37_fixture
in_scope hits = 5 ; archive(exempt) hits = 2
================================================================================
PASS backend/app/services/demo.py        expect=True  got=True   weak frame + quote (the real VS-28 shape)
        matched: '原文为"两条都不静默"'
PASS backend/app/x.py                    expect=True  got=True   weak frame 原句为 + quote
        matched: '原句为"事件通道与返回值同源"'
PASS backend/app/y.py                    expect=True  got=True   strong frame + colon
        matched: '已删除的原文：该'
PASS frontend/src/z.ts                   expect=True  got=True   strong frame 旧原文 + quote
        matched: '旧原文："'
PASS docs/API_CONTRACT.md                expect=True  got=True   contract doc is in scope
        matched: '原文为"只有一个端点"'
PASS backend/app/ok1.py                  expect=False got=False  bare 原文 = raw-text sense, no copula
PASS backend/app/ok2.py                  expect=False got=False  bare 原文, no copula
PASS backend/app/ok3.py                  expect=False got=False  third-party citation (extern guard)
PASS backend/app/ok4.py                  expect=False got=False  RECOMMENDED pointer form
PASS docs/ai/evo/EVALUATION_RESULT_VS99.md expect=False got=False historical archive is exempt
PASS task/CHANGELOG.md                   expect=False got=False  CHANGELOG is exempt
PASS README.md                           expect=False got=False  README is not contract surface
--------------------------------------------------------------------------------
EXEMPT (archive) detail:
   docs/ai/evo/EVALUATION_RESULT_VS99.md -> [(1, '原文为"事件通道与返回值同源，两条都不静默"')]
   task/CHANGELOG.md -> [(1, '原文为"两条都不静默"')]
--------------------------------------------------------------------------------
ALL FIXTURE CASES PASS: True
```

三个关键负例的**原文**（逐字，便于复核）：

| 负例文件 | 内容 | 为何不告警 |
|---|---|---|
| `backend/app/ok1.py` | `# 失败时把底层错误原文原样带出（不吞掉）。` | 裸「原文」＝原始文本义，无系词 ⇒ **这正是 §5.1 的 13 处误报形态** |
| `backend/app/ok3.py` | `# 依据 RFC 9457 原文为"problem+json 是统一错误载体"。` | **正常引文**（第三方规范）⇒ 外部来源豁免生效 |
| `backend/app/ok4.py` | `# 此处原断言已删除，取回：git show 3109b6e -- backend/app/services/llm_client.py` | **卡里推荐的指路式**，无框架词 ⇒ 不告警 |

**规则确实告警（正例的原始输出）** `python scripts/audit.py %TEMP%\vs37_fixture`：

```
## 形态级防护（引述旧句）
[WARN] 代码/契约面出现"引述被更正的旧句"形态（形态判据，不锁具体句子）
    -> 改为指路式："此处原有断言已删除，取回：git show <sha> -- <path>"；逐字旧文只留在 docs/ai/* 历史档案（档案不许改写）
    证据：5 处：backend/app/x.py:1（原句为"事件通道与返回值同源"）；backend/app/y.py:1（已删除的原文：该）；backend/app/services/demo.py:1（原文为"两条都不静默"）；docs/API_CONTRACT.md:1（原文为"只有一个端点"）；frontend/src/z.ts:1（旧原文："）
[WARN] 引述旧句样例
    -> 人工核实并改指路式
    证据：backend/app/x.py:1 → 原句为"事件通道与返回值同源"
...
[INFO] 历史归档面豁免（改写＝伪造记录，故不计入告警）
    证据：2 处命中落在 docs/ai/*、task/* 等历史归档面——**豁免、不告警**（档案保留旧说法属承重语义，改写＝伪造记录）；该数非零且随档案增长属预期，不是缺陷；第三方引文（RFC/ISO/规范等）同样豁免
```

**关于夹具审计报告 `EXIT=1`（口径澄清）**：该 `1` 来自夹具**故意没有** `CLAUDE.md`/`AGENTS.md` ⇒ `[NOT-OK] 存在指令文件`；**不是**新增项导致的（新项是 `WARN`，按 §2.2 永不影响退出码）。夹具报告里 `[NOT-OK]` 只有这一条。

---

## 7. `AGENTS.md` 约定条目（验收⑤，已写入）

写进 `### Agent 作业踩坑` 段，紧接"用行长阈值查行拼接"那条（同属"把匹配当事实"家族）：

> - **更正旧说法要用"指路式"，不要把被更正的旧句抄回代码/契约面**：本会话踩过一次——`llm_client.py` 为说明"旧说法不实"而把**旧句逐字抄回注释与 docstring**（VS-28 的 NIT-1），于是**字面 grep 旧句仍命中**，后续审计会把**引述**误读成"**代码仍在那样声明**"，只好再改一次（VS-33，`7600642`）。做法：写「此处原有断言已删除，取回：`git show <sha> -- <path>` 里以 `-` 开头的旧行」+ 更正后的结论；**逐字旧文只保留在 `docs/ai/evo/*` 历史档案与 `task/CHANGELOG.md`**（档案**不许改写**，改写＝伪造记录）。判据是**形态**不是某句话：`scripts/audit.py` 已有检查项「形态级防护（引述旧句）」——命中「引述框架词（形如 `原文`/`原句`/`原话` 后接 `为`/`是`，或 `已删除的`、`删除的`、`旧` 与 `原文` 连用）+ 紧随的**引文实体**（引号引文或冒号后内容）」即 WARN（不影响退出码）；**历史归档面（`docs/ai/*`、`task/*`、`memory/*`、`notes/*`）与正常引文（RFC/ISO/规范等第三方原文）显式豁免**。⚠️ 写这条约定本身也不能用被禁形态——`AGENTS.md` 也在作用面内（实测本条 0 命中；`scripts/audit.py` 里的正则同样写成 `(?:已删除的|删除的|旧)原文` 的分组式以避开自命中）。

（上面这段即写入 `AGENTS.md` 第 **109** 行的条目原文；位于 `### Agent 作业踩坑` 段内，紧跟"用行长阈值查行拼接"那条之后。）

**说明**：条目本身**刻意不使用被禁形态**（`AGENTS.md` 也是作用面带）——实测该条 **0 命中**（§3.1）。

---

## 8. 门禁：`python scripts/audit.py .` 原始输出（验收⑥）

命令：`python scripts/audit.py .`（在仓库根目录，按 `AGENTS.md` 约定）—— **退出码 `EXIT=0`**。
（同时验证 `--json` 形式：`python scripts/audit.py . --json` → `EXIT_JSON=0`。）

```text
# Harness 审计报告 — finquant-hub

## 指令层
[OK] 指令文件行数
    证据：106 行
[INFO] 规则密度（仅粗略计数，人工复核）
    -> 逐行问：删掉会导致 agent 犯错吗？
    证据：约 2 条规则行

## 约束层
[OK] 工具调用前拦截（hooks）
    证据：.claude/settings.json 已配置 hooks
[OK] CI 阻断
    证据：.github\workflows 存在
[OK] 约束层入 git：.claude/hooks
    证据：已跟踪
[OK] 约束层入 git：.github/workflows
    证据：已跟踪

## 反馈层
[OK] 客观门禁命令（文本匹配；可跑性需人工实测）
    -> 确保 agent 能真的跑起来
    证据：pytest

## 记忆层
[OK] 记忆载体（STATE.json）
    证据：存在
[OK] 文档目录
    -> 补 INDEX/ADR 更好
    证据：存在

## 编排层
[INFO] 编排需求信号（能单不多）
    -> 按可还原性判据判定：能单 agent 就别拆；拆则先写数据契约
    证据：角色
[INFO] 轮次/成本上限
    -> 编排/多轮循环建议设预算上限（超出即停、人在环续批）
    证据：未显式声明

## 数据正确性
[INFO] golden set / 字段级验收指标（预算单位、缺失率、误提取率）
    -> 提取类项目必须有，否则代码对≠数据对
    证据：人工判断
[INFO] 单位/金额归一化
    -> 万元/元混用是经典错法，加断言
    证据：人工判断

## 隐私
[WARN] 样本扫描（手机/邮箱/疑似密钥，仅掩码）
    -> 确认是测试数据还是真实 PII；真实 PII 不入库不提交
    证据：手机 76662、邮箱 667、密钥 25，样例见下方
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\architecture.visual-check.json:39 → 132****
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\architecture.visual-check.json:169 → 132****
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\architecture.visual-check.json:298 → 132****
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\architecture.visual-check.json:427 → 132****
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\architecture.visual-check.json:459 → 132****
[WARN] PII 样例（email）
    -> 人工核实
    证据：archify-output\README.md:33 → …alid
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\workflow.visual-check.json:39 → 180****
[WARN] PII 样例（phone）
    -> 人工核实
    证据：archify-output\workflow.visual-check.json:101 → 180****

## 形态级防护（引述旧句）
[OK] 代码/契约面出现"引述被更正的旧句"形态（形态判据，不锁具体句子）
    证据：0 处（作用面：源码注释/docstring + 契约类文档）
[INFO] 历史归档面豁免（改写＝伪造记录，故不计入告警）
    证据：39 处命中落在 docs/ai/*、task/* 等历史归档面——**豁免、不告警**（档案保留旧说法属承重语义，改写＝伪造记录）；该数非零且随档案增长属预期，不是缺陷；第三方引文（RFC/ISO/规范等）同样豁免

## 基础设施
[OK] git 仓库
    证据：存在
[INFO] tests/ 目录存在
    -> 有测试覆盖更佳
    证据：未发现
```

**对 `[INFO] … 39 处` 的说明（免得被当成缺陷）**：39 = 基线本就有的 **20 处**（§3.2）+ **本结果文件自身的 19 处**。本文件必须逐字贴出被删原文当证据，而它就落在 `docs/ai/`（归档面 ⇒ 豁免）——**这正是豁免存在的理由**。逐文件分布（实测）：

```
docs/ai/evo/EVALUATION_RESULT_VS14.md      1
docs/ai/evo/EVALUATION_RESULT_VS28.md      2
docs/ai/evo/EVALUATION_RESULT_VS33.md      4
docs/ai/evo/IMPLEMENTATION_BRIEF_VS37.md   1
docs/ai/evo/IMPLEMENT_RESULT_VS28.md       2
docs/ai/evo/IMPLEMENT_RESULT_VS33.md       9
docs/ai/evo/IMPLEMENT_RESULT_VS37.md      19   <- 本卡结果文件的证据引用
docs/ai/evo/PRODUCT_STATE.md               1
作用面（in-scope）命中                       0   <- 会告警的面
```

**粘贴有效性自检（防"证据与当前树不符"）**：把上面这段原始输出贴回本文件**之后**再跑一次 `--json`，与贴之前的输出**逐字节相同**（SHA256 均为 `6B4BF5FE457738634E1F3B36C91EAA3156A826A6A4BFAD7489144A39895D636C`，`IDENTICAL=True`），且 `in_scope=0 / archive=39` 未变。⇒ 贴出的门禁输出**就是当前树的输出**，不是过期快照。

---

## 9. 未解决问题 / 风险 / 边界

1. **归档面 INFO 计数会随档案增长而变**（基线 20，写本文件后更多）。这是**故意**的（证明豁免承重），但会让 `--baseline`/`--diff` 在每次写 EVO 档案后报 drift（`exit 3`）。既有的 PII 计数本来就有同样性质，故保持一致；若评估者认为应稳定，可把该计数从 evidence 里去掉——**我没有自作主张去掉**。
2. **新项是 `WARN` 而非 `NOT-OK`**，故 `exit 0` 现状不变。取舍：卡里说"告警"，且 `audit.py` 的既有语义是"`NOT-OK` = 需修复"；风格性引述升格为 `NOT-OK` 会让"0=健康"在善意的引述上变红。需要阻断时再由人升级（PII 同款机制）。**这是我的判断，不是事实**，评估者可要求改。
3. **判断而非事实**：我判"这 13 处裸原文全部是误报"是**逐条读语义**得出的（代码可复现位置，但语义归类是人判）。若评估者认为某处其实该算"引述"，请指出行号。
4. **作用面边界是我的定义**：源码扩展名 + `AGENTS.md`/`CLAUDE.md` + 名字含 CONTRACT/ARCHITECTURE/SCHEMA/TECH_STACK 的 `.md`。⇒ `README.md`、`docs/HANDOVER.md` 等**不在**作用面（夹具里 `README.md` 负例即此义）。理由：卡里说的是"**代码/契约面**"，且 VS-33 报告自身把契约面定义为"`backend/app` + `backend/tests` + `frontend/src` + `docs/API_CONTRACT.md`"——我据此前例并扩到源码扩展名与顶层指令文件。**这是可调参数**，若评估者要求把全部 `.md`（除归档）纳入，我实测过：基线作用面仍为 **0**（不产生新误报），只是 `reference/` 之外要扫更多文件。
5. **没有加测试**：`scripts/tests/` 只有 4 个 `.ps1` 契约测试，`audit.py` 无 Python 测试框架。**且卡明确警告不要写"注释里不许出现某串"的字符串禁令断言**（那正是本卡要治的病）。故证据以 `$env:TEMP` 夹具 + 可复现命令给出，**没在仓库里留夹具、没加断言**。
6. **第三方引文豁免是启发式**：靠框架词前 24 字符的 `RFC/ISO/规范/…` 标记。真有人写 `按行业标准，原文为"…"` 会被豁免——**这是有意偏保守**（宁可漏一个真告警，也不要拦正常引文），符合卡里"第一验收对象是精度"。
7. **安静的自命中面**：见 §2.4。若将来有人在 `audit.py`/`AGENTS.md` 里逐字举例被禁形态，会被自家规则 WARN。**已知、已写进 `AGENTS.md`、未做豁免处理**。
8. **未实测的部分**：本卡的运行时间对比不干净（基线那次 161 s 是冷缓存，改动后 61.5 s 是热缓存；差异来自既有 PII 扫描遍历 `reference/` 1.4 GB/14140 文件，与本卡无关）。**干净的单函数实测**：`scan_quote_old` **1.246 s** vs 既有 `scan_text_files` **36.5 s** ⇒ 新增开销约 **+3.4%**，可忽略。
9. **`ruff`**：`backend\.venv` 的 ruff 对 `scripts/audit.py` 报 **1 个错**（`hooks_dir` 赋值未使用，`:379`）——**改动前 `HEAD` 版本同样报这 1 个**（已用 `git show HEAD:scripts/audit.py` 抽取后对照实测），**非本卡引入**，且按"不做无关重构"**未修**。

---

## 10. 未触碰清单与边界

- **未 commit**（`git status` 只显示本卡的 `scripts/audit.py`、`AGENTS.md`、`docs/ai/evo/IMPLEMENT_RESULT_VS37.md`）。
- **未改** `backend/` 下任何源码；**未改** `docs/ai/evo/*` 既有历史档案（只**新增**本结果文件）；**未改** `task/CHANGELOG.md`。
- **未触碰 VS-36 的在制文件**（`frontend/src/pages/Discover.tsx`、`frontend/src/components/alpha/AlphaResearchPanel.tsx`、`frontend/tests/DiscoverQueryScope.test.tsx`、`frontend/tests/AlphaResearchQueryScope.test.tsx`、`docs/ai/evo/IMPLEMENT_RESULT_VS36.md`），**未把它计入任何门禁**。
- ⚠️ **跨卡并发如实披露（我不能证明无关，也不能证明有关）**：本卡门禁期间 **VS-36 正在写工作树**——证据：`git status` 在本次会话内观察到其文件集从 2 个未跟踪文件变为 2 修改 + 4 未跟踪（`frontend/src/pages/Discover.tsx` 与 `AlphaResearchPanel.tsx` 处于 ` M` 状态）。
  - **对本卡的实际影响面**：`frontend/src/**/*.tsx` **在本规则的"作用面"内**（源码扩展名），即**我的门禁确实扫了 VS-36 在制的两个 tsx**。实测那一刻作用面命中 `in_scope=0`，**故未污染计数**；但**若 VS-36 恰处变异窗口并在其中写出被禁形态，我的 `in_scope=0` 会受影响**——我无法排除这一可能，只能声明**未见其发生**。
  - **反向影响（本卡对 VS-36）**：本卡只改 `scripts/audit.py` 与 `AGENTS.md`，**不动 `frontend/`**，不参与任何 vitest/build 门禁 ⇒ 不会把 VS-36 的在制 src 构建进来。
- 临时文件全部在 `%TEMP%`（**仓库目录内零临时文件**，已用 `Get-ChildItem -Recurse -Filter 'vs37*'` 核实为空）：`vs37_scan.py`、`vs37_scan2.py`、`vs37_probe.py`、`vs37_ladder.py`、`vs37_ladder2.py`、`vs37_fixture.py`、`vs37_regress.py`、`vs37_base_d44a850/`（git archive 抽取）、`vs37_fixture/`、`vs37_before_*.txt`、`vs37_gate_*.txt`、`vs37_regress_table.md`、`vs37_audit_HEAD.py`。
- **未加依赖**（纯标准库；`audit.py` 仍只 import `argparse/datetime/json/os/re/subprocess/sys`）。
- **未执行任何进程清理动作**：全程没有 `Stop-Process`、没有按排除法杀进程 ⇒ 不存在误杀他卡进程的风险。
- **如实披露一次被拒的操作**：我**曾尝试**用 `Remove-Item -Recurse -Force` 清理 `%TEMP%` 里的一个临时目录（非仓库内），被本机铁律守卫**拒绝执行**（`Error: 全局铁律：删除必须进回收站，禁止 Remove-Item`）。**该命令从未生效**；我随即改用**新的唯一目录名**（`vs37_base_d44a850`）绕开删除需求，未再尝试任何删除，也**未在仓库内产生或残留任何临时文件**。
