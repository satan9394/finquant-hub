# EVALUATION_RESULT — VS-37：形态级防护（"引述旧原文"形态告警）

> 独立验收（EVALUATOR）。**假设实现有错**；实现者自述只当待验断言。
> 所有夹具/探针由评估者**自建**，未复用实现者的 `%TEMP%\vs37_fixture`。

## 0. 判定

**REJECT（fix-and-re-accept）** —— 三条可复现缺陷，两条属**精度**（本卡第一验收对象），一条属**证据真实性**。

**必须同时说明**：卡里列的 **①~⑥ 六条验收标准我逐条独立复现，全部通过**；核心断言"**当前 HEAD 作用面命中 0**"经我独立攻击（含**把作用面放宽到它自己声明的全部扩展名**）**依然成立**。所以本次 REJECT **不是**"方法不可行/该走出口"，而是"**能把已声明的作用面做实、把两个精度口子堵上**"——三处修法都是小改动，复验成本很低。

## 1. 被验对象与环境锚点（显式提交号；**不用相对锚点**）

| 项 | 值 |
|---|---|
| 被验提交 | `415efe9f2e340e9183445ec7fbc46ee29a737e1f`（VS-37） |
| 其父提交 | `d44a850cac9a2bcf0bd16bcd8e4e53651d1ee97e`（**显式**，非 `HEAD~1`） |
| `scripts/audit.py` blob | `5c858885d63b39b63f077fe6cce1eb879ad39e2b`（541 → 649 行） |
| `AGENTS.md` blob | `3843d9d7f8cf7db65ba513c109620527aa0234ad` |
| Python | `D:\Technology_application\Anconda_All\Anaconda3\envs\claude\python.exe`（3.11.14，与 `~/.dsh/AGENTS.md` 默认一致） |
| 夹具/抽取面 | 全部在 `$env:TEMP\vs37_eval_ij\`（仓库内零临时文件，已核） |

**⚠️ 时间线如实记录（并发边界，必做 7）**：本次验收**开始时**工作树含 VS-36 在制文件（`Discover.tsx`、`AlphaResearchPanel.tsx` 为 ` M`，另 4 个未跟踪）；**验收中途编排者把 VS-36 提交为 `37c3eef`**，之后工作树干净。我两次门禁（在制窗口内一次、干净树一次）**均得 in_scope=0**。
`415efe9f` → `37c3eef` 的 diff 只有 VS-36 的 4 个前端文件 + 其结果文件；**`scripts/audit.py` 与 `AGENTS.md` 在该区间零改动**（`git diff --stat` 空），故被验对象未漂移。
**我不能证明"若 VS-36 处在变异窗口会影响本卡"，也不能证明无关**——但见 §3-D1：**本规则实际上从未读取任何 `.tsx` 文件**，所以这一顾虑在事实层面不成立（这本身是实现者披露的一处错误，见 D1）。

## 2. 逐条判定（对应"必做"清单）

| # | 必做项 | 结论 |
|---|---|---|
| 1 | 自建正/负例精度集合 | ✅ 已做，40 例，**29 PASS / 11 FAIL**（§4）。11 个 FAIL 中 **1 个是我自己的标注错误**，**10 个是真实缺陷** |
| 2 | 独立复核"当前 HEAD 命中 0" | ✅ **属实**，且**主动找反例成功**（规则确实会告警）——见 §3-A |
| 3 | 零回归（显式提交号） | ✅ **属实**，五元组逐项一致 = `True`，段 8→9，退出码 0→0 —— 见 §3-B |
| 4 | 豁免是否过宽 | ⚠️ **归档面豁免不过宽**（根锚定，够不到 `backend/`）；**第三方引文豁免过宽**，可在 `backend/` 内静默吞掉真告警 —— 见 §3-D3 |
| 5 | `AGENTS.md` 条目 | ✅ 在第 109 行、确实写了约定、**自身 0 命中** —— 见 §3-C |
| 6 | 边界（只含 3 文件） | ✅ **属实** —— 见 §3-E |
| 7 | 并发边界 | ✅ 已如实记录（§1）；**并发现实现者的并发披露在事实层面不成立**（D1） |
| 8 | 门禁 | ✅ `python scripts/audit.py .` EXIT=0、`--json` EXIT=0、`NOT-OK=0` —— 见 §3-F |

## 3. 关键证据

### A. "0 命中"独立复核 + 我自己写的正例确实告警（必做 2）

**① 规则确实会告警**（自建夹具，`%TEMP%`）：我自建的正例**全部命中**，且**真实文件注入**也命中：

```
IN  CLAUDE.md:1                              原文为"老约定"
IN  backend/app/p1.py:1                      原文为"两条都不静默"
IN  backend/app/p2.py:1                      已删除的原文：该
IN  backend/app/p3.py:2                      原句为"事件通道与返回值同源"      (docstring)
IN  backend/app/p7.py:1                      原话是"什么都不做"
IN  docs/API_CONTRACT.md:1                   原文是"只有一个端点"
IN  docs/ARCHITECTURE.md:1                   原文为"旧架构描述"
IN  frontend/src/p4.ts:1                     旧原文："
IN  backend/app/services/llm_client.py:758   原文为"事件通道与返回值同源，两条都不静默"   ← 真实源码副本 + 注入 VS-28 原形
```

⇒ **"0 命中"不是"规则根本没生效"**：同一份代码在同一台机器上对自建正例全部报警。

**② 当前 HEAD 作用面命中 0 —— 属实，且在放宽作用面后仍为 0**（这是对实现者最有利的独立证伪尝试）：

```
[A] STOCK scan on real repo:            in_scope=0  archive=39
[B] TEXT_EXTS 放宽到它声明的全部扩展名   in_scope=0  archive=39   ← 仍然 0
```

**③ 三级收紧阶梯——我独立复现，数字逐位命中**（锚定 `d44a850` 的 `git archive` 抽取面）：

```
A  bare 原文                                          in-scope=13   archive=204
B  原文/原句 + 系词 为|是                              in-scope=0    archive=28
C  strong (?:已删除的|删除的|旧)原文                    in-scope=0    archive=7
D  已交付 QUOTE_OLD_RE（框架词 + 引文实体）            in-scope=0    archive=20
```

A=**13**、B/C/D=**0**、归档面=**20** —— 与实现者自述**完全一致**。A 档 13 处的清单我也逐条比对，与其 §5.1 的 13 处**一一对应**（`AGENTS.md:87`、`.claude/hooks/record-error.py:28/167/398`、`swarm_orch.py:290`、`zh.ts:1070/1071/1072`、`harness-mcp.py:19/319`、`scripts/record-error.py:28/167/398`），**逐条语义确为"原始文本"义（错误原文/事件原文/中文原文），13/13 判为误报是正确的**。

**④ "引文实体要求是承重的"——我独立找到反例并证实**（不必依赖它那份已消失的初版草稿）：
把作用面放宽到声明扩展名后，**B 档（只要系词）会命中 1 处误报**，而 D 档（本规则）不会：

```
TIER-B-ONLY HIT (eliminated by quote requirement):
  frontend/src/pages/Discussion.tsx:205
  // VS32：错误原文是**这个房间**的 ⇒ 只有当前房间仍是它时，右栏才允许显示。
```

⇒ 这条"承重性"结论**成立**，但**证据应换成上面这处真实文件**（实现者用自己初版注释的 3 处，已不可复现）。

### B. 零回归（必做 3）—— 独立比对，`True`

方法：`git show d44a850:scripts/audit.py` 取出**基线脚本**（541 行）→ 与 `HEAD` 脚本（649 行）**在同一棵树上**各跑一次 `--json` → 按 `(段名, 状态, 检查项, action, 证据)` 五元组逐项比对，并剔除新增段。

```
sections before: ['指令层','约束层','反馈层','记忆层','编排层','数据正确性','隐私','基础设施']      (8)
sections after : 同上 + '形态级防护（引述旧句）'(插在 隐私 与 基础设施 之间)                      (9)
item count     : 24 -> 26 (after removing new section: 24)
FIVE-TUPLE IDENTICAL (old vs new-minus-new-section) = True
GATE: OLD_JSON_EXIT=0   NEW_JSON_EXIT=0   NEW_TEXT_EXIT=0
```

⇒ **既有 24 项判定逐项未变（含证据文本），无增无减；退出码 0→0。属实。**

### C. `AGENTS.md` 条目（必做 5）—— 属实

- `git show 415efe9f:AGENTS.md` 第 **109** 行即该条目，位于 `### Agent 作业踩坑` 段内，紧跟"行长阈值查行拼接"那条。
- **自身不触发**（直接调用交付的正则逐行判定，非读报告）：

```
AGENTS.md            rule hits = 0
CLAUDE.md            rule hits = 0
scripts/audit.py     rule hits = 0
```

- 无"自我豁免"后门：确实靠把强框架词写成 `(?:已删除的|删除的|旧)原文` 的分组式 + 条目措辞（`旧说法不实`/`旧说法要用` 后不接系词）避开自命中。**属实。**

### D. 三条缺陷（`文件:行` + 原因 + 建议）

#### D1 — `scripts/audit.py:317`：**声明的作用面有 7 个扩展名从未被扫描**（同时导致结果文件里一句**不成立的事实陈述**）

```python
297:    ext = os.path.splitext(base)[1].lower()
298:    if ext in QUOTE_OLD_CODE_EXTS:          # 声明面：.py .ts .tsx .js .jsx .mjs .cjs .vue .ps1 .sh .sql
299:        return "in"
...
317:    if where is None or os.path.splitext(fn)[1].lower() not in TEXT_EXTS:   # ← 硬闸门
318:        continue
```

`TEXT_EXTS`(L53) = `{.md,.txt,.json,.yaml,.yml,.py,.js,.ts,.sh,.toml,.cfg,.env}` ⇒ `QUOTE_OLD_CODE_EXTS` 里 **`.tsx .jsx .vue .mjs .cjs .ps1 .sql`（11 个中的 7 个）永远进不到第 325 行的正则**。实测 6/6 探针全部 `got=False`：

| 探针文件（内容均为 `原文为"两条都不静默"`） | 期望 | 实际 |
|---|---|---|
| `frontend/src/probe_h1.tsx` | 告警 | **不告警** |
| `frontend/src/probe_h1b.jsx` | 告警 | **不告警** |
| `frontend/src/probe_h1c.vue` | 告警 | **不告警** |
| `scripts/probe_h1d.ps1` | 告警 | **不告警** |
| `backend/app/probe_h1e.sql` | 告警 | **不告警** |
| `backend/app/probe_h1f.mjs` | 告警 | **不告警** |

实测规模：`frontend/src` 下 **110 个 `.tsx/.jsx/.vue`** 全部不被扫描。
**后果（这才是要修的部分）**：
1. `IMPLEMENT_RESULT_VS37.md` §2.2、`AGENTS.md:109`、commit message 都写"作用面 = 源码扩展名（含 `.tsx`）"——**与实现不符**。
2. §10 的并发披露写"**我的门禁确实扫了 VS-36 在制的两个 tsx**"——**事实相反：那 2 个 `.tsx` 从未被读过**。本卡赖以论证跨卡边界的论据不成立。
3. **不产生当前误报**（我已验证：放宽作用面后 HEAD 仍 in_scope=0），故这是**作用面声明失真 + 覆盖缺口**，不是隐藏的误报。

**建议**（二选一，推荐前者，不动全局 `TEXT_EXTS`）：
```python
if where is None or os.path.splitext(fn)[1].lower() not in (TEXT_EXTS | QUOTE_OLD_CODE_EXTS):
    continue
```
并把结果文件 §10 的并发披露改成事实口径（"本规则未读取任何 `.tsx`"）。

#### D2 — `scripts/audit.py:98`（配合 `:95`）：冒号分支把**"原始文本"义**重新放回误报面

```python
95: QUOTE_OLD_WEAK_RE = re.compile(r"(?:原文|原句|原话|原表述|原说法|旧说法)(?:为|是)")
98:     r"(?:\s*[\uff08(]?\s*[QUOTES][^\n]{2,}?[QUOTES]|\s*[\uff1a:]\s*\S)"   # ← 冒号后任意非空白
```

"引文实体"的**第二个分支只要求"后面有个冒号"**，而 `原文是：…` 正是本仓"原始文本"义的**最自然写法之一**（与 `swarm_orch.py:290`「失败原文」、`LoadFailureAlert.tsx:35`「底层错误原文」同族）。实测 **2/2 命中误报**：

```
**FAIL**  backend/app/probe_h2.py   exp=False got=True  # 错误原文是：底层返回的超时信息。
**FAIL**  backend/app/probe_h2b.py  exp=False got=True  # 该接口的响应原文是：{"ok":true}
```

⇒ 与 §5.1"加系词一步解决裸「原文」歧义"的论证**不成立**：裸`原文` 换成 `原文是：` 就能绕过。当前 HEAD 恰好没有这种写法（故 0 命中），但**一个词的改写即可触发**，且命中的是**本该排除的那一族**。
**建议**：冒号分支只对**强框架词**开放（`已删除的原文：…` 正是卡里的正例），弱框架词只认**引号引文**：
```python
QUOTE_OLD_RE = re.compile(r"(?:%s%s|%s%s)" % (STRONG, SPAN, WEAK, QUOTE_ONLY_SPAN))
```

#### D3 — `scripts/audit.py:328`：**第三方引文豁免过宽，能在 `backend/` 里静默吞掉真告警**（必做 4 的答案）

```python
328:  if QUOTE_OLD_EXTERN_RE.search(line[max(0, m.start() - 24):m.start()]):
329:      continue  # 正常引文（第三方文档/规范原文）不拦
103: QUOTE_OLD_EXTERN_RE = re.compile(r"(?:RFC\s*\d+|ISO\s*\d+|GB/?T?\s*\d+|PEP\s*\d+|规范|标准|第三方|上游|官方|外部)")
```

判据是**"命中词前 24 个字符里出现过 `规范`/`标准`/`官方`/`外部`/`上游`/`第三方`"**，即**整行豁免**。而 `规范`/`标准` 在中文技术行文里是高频词，24 字符约等于一个小句。实测 **2/2 真告警被吞**：

```
**FAIL**  backend/app/probe_h3.py   exp=True got=False
          # 统一错误响应遵循既有规范。此处原文为"两条都不静默"已删除。
**FAIL**  backend/app/probe_h3b.py  exp=True got=False
          # 按项目标准，原文为"两条都不静默"。
PASS      backend/app/probe_h3c.py  exp=True got=True   ← 对照组：`规范` 距 >24 字符 ⇒ 正常告警
```

⇒ **这是我的答案：归档面豁免不过宽，第三方引文豁免过宽。**
- **归档面**：`QUOTE_OLD_ARCHIVE_PREFIXES` 是**根锚定**前缀，`backend/**` 结构上够不到。对照组 `backend/app/services/notes/probe.py`（嵌套 `notes/`）**未被豁免、正常告警** ⇒ 无"在 backend 里恰好命中归档豁免"的路径。（另：`task/`、`memory/`、`notes/` 下**没有任何源码**，只有 11 个 `.md` + 1 个 `.json`，故"归档面放过源码"在本仓只是理论风险。）
- **第三方引文**：**可从 `backend/` 命中并静默**，7 个关键词里 `规范`/`标准` 尤其泛。实现者 §9-6 已自认"宁可漏一个真告警"，但我的探针是**2/2 全漏**，不是偶发。

**建议**：把窗口从"前 24 字符里出现关键词"收紧为**"框架词紧邻前置来源标记"**（如 `(?:RFC|ISO|GB/T|PEP)\s*\d+[^\n]{0,6}原文`，且要求标记与框架词之间无句读），或干脆**只豁免强来源编号（RFC/ISO/GB-T/PEP）**，把 `规范/标准/官方/外部/上游/第三方` 从豁免表里删掉——这些词太泛，不足以证明"引文实体来自第三方"。

#### D4（附：非缺陷，但是**我自己的**夹具标注错误，如实披露）

`backend/app/services/notes/probe.py` 我标了 `exp=False`（意为"不得告警"），实际 `got=True`。**这是我把"嵌套 notes/ 不得豁免"写反了标注**：该文件**应当**在作用面内、**应当**告警。实现行为**正确**，是我的 harness 打标错误，不计入缺陷。

### E. 边界（必做 6）—— 属实

```
git diff --name-status d44a850 415efe9f
  M  AGENTS.md
  A  docs/ai/evo/IMPLEMENT_RESULT_VS37.md
  M  scripts/audit.py

git diff --name-only d44a850 415efe9f -- backend/ task/ docs/ai/evo/
  docs/ai/evo/IMPLEMENT_RESULT_VS37.md        ← 仅"新增"本卡结果文件
```

⇒ 提交**恰好**只含 `scripts/audit.py` + `AGENTS.md` + 结果文件；`backend/**`、`task/CHANGELOG.md`、`docs/ai/evo/*` 既有档案 **零改动**。仓库内 `vs37*` 临时文件 = **0**。

### F. 门禁（必做 8）

```
python scripts/audit.py .          → TEXT_EXIT=0
python scripts/audit.py . --json   → JSON_EXIT=0
NOT-OK items = 0
[OK]   代码/契约面出现"引述被更正的旧句"形态 … 证据：0 处
[INFO] 历史归档面豁免 … 证据：39 处
```

**粘贴有效性自检我独立复现，且结果比实现者主张的更强**：在当前干净树（`37c3eef`，含 VS-36 提交后的新档案）上重跑 `--json`，SHA256 为

```
6B4BF5FE457738634E1F3B36C91EAA3156A826A6A4BFAD7489144A39895D636C
```

与实现者结果文件 §8 所载**逐字节相同（MATCH=True）** ⇒ 其贴出的门禁输出**确为当前树输出，不是过期快照**；且 `in_scope=0 / archive=39` 在 VS-36 提交前后**未变**。
（附注：写入本评估文件后 archive 计数会上升——本文件也落在 `docs/ai/` 归档面，属预期，不是缺陷。）

## 4. 自建夹具逐例结果（40 例；驱动 `%TEMP%\vs37_eval_ij\fx_probe.py`）

```
POS = 应告警；NEG/OOS = 不应告警；ARC = 归档豁免；PROBE = 我的对抗探针
CASE      KIND       PATH                                  RESULT
PASS      POS        backend/app/p1.py                     exp=True  got=True   原文为 + 引文
PASS      POS        backend/app/p2.py                     exp=True  got=True   已删除的原文 + 冒号
PASS      POS        backend/app/p3.py                     exp=True  got=True   docstring 原句为 + 引文
PASS      POS        frontend/src/p4.ts                    exp=True  got=True   旧原文 + 引文
PASS      POS        docs/API_CONTRACT.md                  exp=True  got=True   契约文档在作用面
PASS      POS        CLAUDE.md                             exp=True  got=True   顶层指令文件在作用面
PASS      POS        docs/ARCHITECTURE.md                  exp=True  got=True   文件名含 ARCHITECTURE
PASS      POS        backend/app/p7.py                     exp=True  got=True   原话是 + 引文
PASS      NEG        backend/app/n1.py                     exp=False got=False  裸原文＝原始文本义
PASS      NEG        backend/app/n2.py                     exp=False got=False  裸原文＝事件原文
PASS      NEG        backend/app/n3.py                     exp=False got=False  第三方 RFC 引文
PASS      NEG        backend/app/n4.py                     exp=False got=False  卡推荐的指路式写法
PASS      NEG        backend/app/n5.py                     exp=False got=False  无引文实体
PASS      NEG        backend/app/n6.py                     exp=False got=False  裸原文＝原文查阅
PASS      NEG        backend/app/n7.py                     exp=False got=False  docstring 裸原文
PASS      NEG        docs/ISO_STANDARD.md                  exp=False got=False  非契约名 .md ⇒ 不扫
PASS      OOS        README.md                             exp=False got=False  README 不在作用面
PASS      OOS        docs/HANDOVER.md                      exp=False got=False  普通 docs/*.md ⇒ 不扫
PASS      OOS        docs/notes/deep.md                    exp=False got=False  docs/notes/ ≠ 根 notes/
PASS      ARC        docs/ai/evo/EVAL_VS99.md              exp=False got=False  归档豁免
PASS      ARC        task/CHANGELOG.md                     exp=False got=False  CHANGELOG 豁免
PASS      ARC        memory/foo.md                         exp=False got=False  memory/ 豁免
PASS      ARC        notes/foo.md                          exp=False got=False  notes/ 豁免
PASS      ARC-BREADTH task/probe_tool.py                    exp=False got=False  task/ 下源码也被豁免（理论过宽，本仓无源码）
PASS      ARC-BREADTH memory/probe_tool.py                  exp=False got=False  同上
**FAIL**  ARC-CTRL   backend/app/services/notes/probe.py    exp=False got=True   ← 我的标注错误，实现正确（见 D4）
**FAIL**  PROBE      frontend/src/probe_h1.tsx              exp=True  got=False  ← D1
**FAIL**  PROBE      frontend/src/probe_h1b.jsx             exp=True  got=False  ← D1
**FAIL**  PROBE      frontend/src/probe_h1c.vue             exp=True  got=False  ← D1
**FAIL**  PROBE      scripts/probe_h1d.ps1                  exp=True  got=False  ← D1
**FAIL**  PROBE      backend/app/probe_h1e.sql              exp=True  got=False  ← D1
**FAIL**  PROBE      backend/app/probe_h1f.mjs              exp=True  got=False  ← D1
**FAIL**  PROBE      backend/app/probe_h2.py                exp=False got=True   ← D2 误报：原文是：…
**FAIL**  PROBE      backend/app/probe_h2b.py               exp=False got=True   ← D2 误报：响应原文是：{…}
**FAIL**  PROBE      backend/app/probe_h3.py                exp=True  got=False  ← D3 漏报：`规范` 在前 24 字符
**FAIL**  PROBE      backend/app/probe_h3b.py               exp=True  got=False  ← D3 漏报：`标准` 在前 24 字符
PASS      PROBE      backend/app/probe_h3c.py               exp=True  got=True   D3 对照组：`规范` 距 >24 ⇒ 正常
PASS      PROBE      backend/app/probe_h4.py                exp=True  got=True   旧说法是 + 引文
PASS      PROBE      backend/app/probe_h5.py                exp=True  got=True   强框架 + 系词 + 弯引号
PASS      PROBE-REAL backend/app/services/llm_client.py     exp=True  got=True   真实源码副本注入 VS-28 原形
--------------------------------------------------------------------------------
TOTAL 40 cases, PASS=29 FAIL=11   （11 = 1 个我的标注错误 + D1×6 + D2×2 + D3×2）
```

归档豁免实测：`archive(exempt) = 6`（`docs/ai/evo/EVAL_VS99.md`、`task/CHANGELOG.md`、`memory/foo.md`、`notes/foo.md`、`task/probe_tool.py`、`memory/probe_tool.py`）——**豁免是承重的，不是空豁免**（证实实现者主张 3 的前半）。

## 5. 已证实属实的实现者断言（逐条）

| 断言 | 独立结论 |
|---|---|
| 1 规则=框架词+引文实体；作用面/豁免面；新项永不 NOT-OK | **部分属实**：判据、豁免、退出码均属实；**"作用面=源码扩展名（含 `.tsx`）"不属实（D1）** |
| 2 当前 HEAD 命中 0；阶梯 13→0；引文实体承重 | **属实**：独立复现 13/0/0/0、archive 20；承重性用 `Discussion.tsx:205` 独立证实 |
| 3 豁免显式；归档 20 处 20/20 会是误报；CHANGELOG 不告警 | **属实**：基线 archive=20 逐条复现；夹具 6/6 归档豁免 |
| 4 12 例夹具 ALL PASS | **未复用**（按要求）；自建 40 例取代，见 §4 |
| 5 零回归（24 项五元组一致、段 8→9、退出码 0→0） | **属实**，独立复现 = `True` |
| 6 `AGENTS.md:109`、不用被禁形态 | **属实**，且三文件自命中均为 0 |
| 7 门禁 EXIT=0；贴回后 JSON SHA256 逐字节相同 | **属实且更强**：我在 VS-36 提交后的干净树上复算得**同一 SHA256** |

## 6. 复验建议（修复后只需重跑这三条）

1. 改 `scripts/audit.py:317` 为 `TEXT_EXTS | QUOTE_OLD_CODE_EXTS`，重跑 §4 的 6 个 `probe_h1*` 探针（应全部 `got=True`），并同步订正 `IMPLEMENT_RESULT_VS37.md` §2.2/§10 与 `AGENTS.md:109` 的作用面描述。
2. 收窄 `scripts/audit.py:98` 的冒号分支（仅强框架词可用），重跑 `probe_h2/h2b`（应 `got=False`）。
3. 收窄 `scripts/audit.py:103/328` 的第三方豁免（去掉 `规范/标准/官方/外部/上游`，或改为紧邻来源编号），重跑 `probe_h3/h3b`（应 `got=True`），并复核真实作用面仍为 **0 命中**（不得因收窄而在 HEAD 上引入新误报）。
4. 回归复跑：基线脚本 `git show 415efe9f^:scripts/audit.py` vs 改后脚本，五元组应继续 `True`、退出码 0。

## 7. 未发现问题的项

- 既有 24 项检查项判定**零改动**（含证据文本）；退出码 0→0。
- `AGENTS.md` 条目的**约定内容本身**表述准确、可用，且不触发自身规则。
- 归档面豁免的**根锚定**实现正确（嵌套 `notes/` 不被误豁免）。
- 结果文件 §8 的门禁输出**不是过期快照**（SHA256 独立复算一致）。
- 仓库内零临时文件、零新依赖、未 commit。
