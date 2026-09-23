# EVALUATION_RESULT — VS-37：形态级防护（"引述旧原文"形态告警）

> **本文件含两轮，勿混读**：
> - **第 1 轮（§0~§7，原样保留）** = 对被验提交 `415efe9` 的判定：**REJECT**（D1/D2/D3）。
> - **第 2 轮 = 复验轮**：对被验提交 **`075b528`（修复轮）** 的判定 —— **见文末「复验轮」段**，结论：**ACCEPT（含 3 条 NIT）**。

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

---

# 复验轮（Round 2）— 被验提交 `075b528`

> 上一轮（§0~§7，已原样保留）判 `415efe9` **REJECT**，理由是 **D1/D2/D3**。
> 本轮**假设修复可能没修对、或修出新问题**：实现者自述只当**待验断言**，所有探针/夹具由评估者**自建**
> （`%TEMP%\vs37rev\`，未复用 `vs37_fix_impl`；仓库内零夹具），基线脚本一律**按字节**取出并核对 git blob sha1。

## V0. 判定

**ACCEPT（含 3 条 NIT，均不影响交付面与退出码）** —— **D1/D2/D3 三处均真修好**，且**放宽作用面后没有冒出新告警**、
**零回归成立**。三条 NIT：N1 仓库内残留 1 个本卡第一轮生成的 `.pyc`（未跟踪/被 gitignore/不在提交内，且 §R8 对它的
"前几日留下的"描述与时间戳不符）；N2 归档面计数与结果文件所载 53 不同（**不是缺陷**：我独立复现了它的 56，
6→61 的漂移是"结果文件自身落归档面"造成的，其 §R9-1 已如实披露）；N3 第三方豁免**对强框架词一并生效**，
留下一条**很窄**的过宽路径（`依据 RFC 9457 已删除的原文："X"` 不告警）——需要真来源编号紧邻才可达，
本仓 0 命中、不影响退出码。

**锚点（显式，不用相对引用）**：被验提交 `075b528ac9415b65a20f00ad851b6f9dbe565211`（其父 `ba725bd`）；
`415efe9` = `415efe9f2e340e9183445ec7fbc46ee29a737e1f`；`d44a850` = `d44a850cac9a2bcf0bd16bcd8e4e53651d1ee97e`。
`scripts/audit.py` blob：`415efe9` = `5c858885d63b39b63f077fe6cce1eb879ad39e2b`（**独立复算一致**）、
`d44a850` = `6927372b060f201145b87e18fdc07acd28f9af67`（**独立复算一致**）、`075b528` = `ff843d1d2429237e27094c146a2a4eb6d6a31e15`。
取 blob 用 `subprocess.run(["git","cat-file","blob",...])` **二进制**写出（不走 `git show | Set-Content`，避免 LF→CRLF）。

## V1. D1 —— **真修好**（自建 7 扩展名探针 + 真实文件"确实被打开"独立确认）

闸门 `scan_quote_old`：`… not in (TEXT_EXTS | QUOTE_OLD_CODE_EXTS)`（`scripts/audit.py:358`）。
自建夹具（`%TEMP%\vs37rev\fx`，每例 `原文为"两条都不静默"`），**同一夹具在"修复前脚本"与"修复后脚本"下各跑一遍**：

```text
EXP    PATH                                PRE(415efe9) HEAD(075b528)  VERDICT
True   frontend/src/probe_e0.tsx           False        True          PASS
True   frontend/src/probe_e1.jsx           False        True          PASS
True   frontend/src/probe_e2.vue           False        True          PASS
True   frontend/src/probe_e3.mjs           False        True          PASS
True   frontend/src/probe_e4.cjs           False        True          PASS
True   scripts/probe_e5.ps1                False        True          PASS
True   backend/app/probe_e6.sql            False        True          PASS
True   frontend/src/probe_e7.ts (对照)      True         True          PASS
False  frontend/src/probe_e8.txt           False        False         PASS   ← .txt/.json 在 TEXT_EXTS 但不在作用面，仍不扫（未被顺手放宽）
False  frontend/src/probe_e9.json          False        False         PASS
7/7 转 True，且原有扩展名未受影响、作用面外扩展名未被卷进来。
```

**"不能只看文件被打开"——我按闸门逐层独立计数**（同一棵工作树、同一次 `os.walk`，只改闸门取值）：

```text
[PRE(415efe9)]  opened=1016  blocked=317  blocked_exts={'.ps1':12,'.tsx':267,'.mjs':35,'.sql':3}  frontend/src(*.tsx|*.jsx|*.vue) opened=0
[POST(HEAD)]    opened=1333  blocked=0                                                                 frontend/src(*.tsx|*.jsx|*.vue) opened=110
                Discussion.tsx opened? True      ← 真实文件，不依赖它的夹具
```
⇒ 与实现者自述的 1015→1332 相差 **+1（两侧同偏移，增量 317 完全一致）**，属计数口径的 ±1，不影响结论。
**真实 `.tsx` 确实进入判定**（不止被打开）：我另建 `frontend/src/pages/backend/notes/x.ts` 等形态探针，均按预期命中/落在正确桶。

## V2. D2 —— **真修好**（弱框架词不再认冒号；强框架对照不受影响）

```text
EXP    CASE(自建)                                              PRE     HEAD
False  错误原文是：底层返回的超时信息。                            True    False   PASS ← 上一轮的误报，已堵
False  该接口的响应原文是：{"ok":true}                            True    False   PASS
False  事件原文是：底层抛出的异常。                                True    False   PASS
False  错误原文是: 空（半角冒号）                                  True    False   PASS ← 边界：半角分支同样收掉
False  错误原文是：（行尾、无引文实体）                            False   False   PASS
True   已删除的原文：该（**强框架 + 冒号，卡里的正例**）            True    True    PASS
True   旧原文：只有这一个端点 / 旧原文： 只有这一个端点             True    True    PASS
True   原文为"两条都不静默" / 原话是'什么都不做'（弱框架+引号）      True    True    PASS
```
**代码层核对**：`QUOTE_OLD_RE = (?:STRONG SPAN_strong | WEAK QUOTE_SPAN)`；`QUOTE_OLD_SPAN_RE`（含 `[：:]\s*\S` 分支）
只接在 `QUOTE_OLD_STRONG_RE` 之后，弱框架词接的是只认成对引号的 `QUOTE_OLD_QUOTE_SPAN_RE`。⇒ 与自述一致。

## V3. D3 —— **真修好**（泛词豁免删除；真第三方引文与"紧邻来源编号"仍豁免）

```text
EXP    CASE                                                                    PRE     HEAD
True   # …遵循既有规范。此处原文为"两条都不静默"已删除。（卡里原文）             False   True    PASS ← 上一轮 2/2 被吞
True   # 按项目标准，原文为"两条都不静默"。（卡里原文）                          False   True    PASS
True   规范 距 >24 字符（上一轮对照组）                                        False   True    PASS
False  # 依据 RFC 9457 原文为"problem+json 是统一错误载体"。                     False   False   PASS ← 真引文仍豁免
False  # 见 GB/T 35273 原文为"个人信息安全规范"。                                False   False   PASS
False  # 参见 ISO 8601 原文为"YYYY-MM-DD" / # 依据 PEP 8 原文为"4 空格缩进"。      False   False   PASS
False  RFC9457原文为 / RFC 9457 的原文为 / RFC 9457 第 4 节原文为 / RFC 9457 与 GB/T 35273 原文为   均 False  PASS ← 间隔 0/2/5 字符仍豁免
False  # 此处原有断言已删除，取回：git show <sha> -- <path>（卡推荐的指路式）       False   False   PASS ← 未因收窄而被误伤
```
源码核对：`QUOTE_OLD_EXTERN_RE` 只剩 `RFC|ISO|GB/?T?|PEP` + 编号，六个泛词（`规范/标准/第三方/上游/官方/外部`）**确已从正则删除**；
新增 `MAX_GAP=6` + 句读集合。⇒ 与自述一致。

**"收紧是否反而把该豁免的真引文也放过"**（必做 5 前半）：**是，存在一条已知边界**——来源编号与框架词之间只要有**句读**
或**间隔 >6 字符**就不再豁免，于是 `# 依据 RFC 9457，原文为"problem+json"。` 与
`# 见 ISO 8601 中定义的校验规则，原文为"YYYY-MM-DD"。` 现在**会告警**（`OLD=False → NEW=True`，我实测 3/3）。
判定：这**符合上一轮给出的建议原文**（"要求标记与框架词之间无句读"）与 `AGENTS.md:109` 明写的"**紧邻**"口径，
且只是 **WARN、不影响退出码**，本仓 0 命中；实现者 §R9-4 亦自认阈值是经验值、未做敏感性实测。**不作为缺陷**，作为已知边界登记。

## V4. 放宽作用面后**没有冒出新告警**；tier A 那 44 处我**独立读全**

我自建 walk（不用它的 `dumpA.py`），在同一棵工作树上只改闸门取值：

```text
                        gate=TEXT_EXTS(交付)   gate=TEXT_EXTS|CODE_EXTS(修复后)
tier A 裸「原文」        in=23 arc=341          in=67  arc=341      NEW=44  GONE=0
tier B 弱框架+系词        in=0  arc=95           in=1   arc=95       ← 唯一命中 = frontend/src/pages/Discussion.tsx:205（独立复核一致）
tier C 强框架词           in=0  arc=27           in=0   arc=27
tier D 本规则(交付形态)   in=0  arc=65           in=0   arc=61
```
- **44 处逐条判定**（全文见本轮 `%TEMP%\vs37rev\tierA_new.txt`，我逐行读过）：**44/44 都是「原始文本」义**——
  `错误原文`/`失败原文`/`底层（错误/原因）原文`/`出错原文`/`axios 原文`/`年报原文`，**0 处是「引述被更正的旧句」义**。
  ⇒ 实现者"0 不是靠继续漏扫维持"的论据**成立**（若该 44 处含引述义，D1 修复就会把它变成新告警）。
- **交付规则（tier D）的两侧闸门 in-scope 均为 0**：真实仓库上 `in_scope = 0`，与门禁一致。
- **D3 的净作用面隔离**（同一棵树、同一份交付正则，**只替换豁免函数**）：旧豁免 9 行 → 新豁免 4 行，
  **新暴露的 5 行全部落在 archive 桶**（`docs/ai/evo/EVALUATION_RESULT_VS37.md:185/187`、
  `docs/ai/evo/IMPLEMENT_RESULT_VS37.md:114/115/807`，即两轮评估文字与探针表格自身的引文），**in-scope 新增 = 0**。

## V5. 零回归（显式提交号；五元组 / 退出码 / 段数 / 基线 blob sha1）

```text
[A] 415efe9(blob 5c85888，已按字节取出并复算 sha1) vs 075b528：既有 24 项五元组 IDENTICAL=True
    sections 9 → 9（本卡新增段在 415efe9 就已存在，段内 evidence 属本卡自带，不计入既有项）
    NOT-OK 0 → 0
[B] d44a850(blob 6927372，同上) vs 075b528：既有 24 项五元组 IDENTICAL=True
    sections 8 → 9（新增 '形态级防护（引述旧句）'，插在 隐私 与 基础设施 之间）；NOT-OK 0 → 0
门禁：python scripts/audit.py .  EXIT=0(38.3s)   --json EXIT=0(44.9s)   NOT-OK=0
同内容连跑 4 次 --json：逐字节相同 = True（sha256 679c2027…，与本轮无关的 4 次运行互比）
```
**写入本评估文件之后再跑一遍**（因为本文件也在 `docs/ai/` 归档面，archive 计数会上升——这正是它 §R9-1 说的）：

```text
POST-EDIT: python scripts/audit.py . EXIT=0 ； --json EXIT=0 ； NOT-OK=0 ； items=26 ； in_scope 仍为 0 ； archive 61 → 69
POST-EDIT 同内容 4 连跑 --json：逐字节相同 = True（sha256 041ed93c…）
```
⇒ **写入本文件不会引入任何 in-scope 命中、不改变退出码**；archive 只增不减的是**豁免面**，属预期。

说明：`--json` 的 sha256 **不与**实现者 §R6 所载相同——因为该文件自身已增长（archive 53→61），
这正是它 §R9-1 主动披露的点；我改用**同内容 4 连跑**这一有信息量的形式复核，成立。
（我另独立复现了它 §R3 的 `56`：`新正则 + 旧闸门 + 旧豁免 = 56` **逐位命中**；`61` 与门禁实况一致。）

## V6. 口径是否与世界一致（上一轮 D1 就是"声明 ≠ 有效"）

- `scripts/audit.py`：`scan_quote_old` 处的注释明写"闸门必须是 `TEXT_EXTS ∪ QUOTE_OLD_CODE_EXTS`，否则 7 个已声明
  扩展名永远进不到正则"（L356-358），docstring 的形态级防护段（L27-30）与 L96-102 的作用面描述均已同步。**与实现一致**。
- `AGENTS.md:109`（blob `2dee6c45…`，改了 `+1/-1`）：作用面写成 `.py/.ts/.tsx/.js/.jsx/.mjs/.cjs/.vue/.ps1/.sh/.sql`
  + `AGENTS.md`/`CLAUDE.md` + 契约类 `.md`；判据写成"成对引号里 ≥2 字；冒号后内容**只对强框架词算数**"；
  豁免写成"框架词**紧邻** RFC/ISO/GB-T/PEP 来源编号"。**三处与代码逐条对得上**。
- `IMPLEMENT_RESULT_VS37.md`：第一轮原文逐字保留 + `⚠️ 修复轮订正(D#)` 就地标注（§2.1/§2.2/§3.1/§6/§9-6/§10），
  另有 §R7 七条口径订正清单。**"作用面含 `.tsx`"那句假话已被就地更正为事实口径**。
- 自命中：`scripts/audit.py` / `AGENTS.md` / `CLAUDE.md` 三者在交付规则下均为 **0 命中**（我直接调 `QUOTE_OLD_RE` 逐行判，不读报告）。

## V7. 边界与清理

```text
git diff --name-status 075b528^ 075b528 → M AGENTS.md / M docs/ai/evo/IMPLEMENT_RESULT_VS37.md / M scripts/audit.py
git diff --name-only d44a850 075b528 -- backend/ task/   → 空
git status --porcelain → 空（0 未跟踪）；git ls-files 无 vs37*/probe_*/*.pyc
```
⇒ 提交**只含** `scripts/audit.py` + `AGENTS.md` + 本卡结果文件；`backend/**`、`task/CHANGELOG.md`、`docs/ai/evo/*`
既有档案**零改动**（vs `415efe9` 出现的 VS-36 文件来自 `37c3eef`/`ba725bd`，不在 `075b528` 的文件集内）。
仓库内 `vs37*` 临时文件 = 0。

**N1（唯一实体残留）**：`scripts/__pycache__/audit.cpython-313.pyc` 仍在（创建时间 **2026/9/12 10:55:13**，
早于 `415efe9` 的提交时刻 10:57:32 ⇒ 是**本卡第一轮**用 3.13 加载 `scripts/audit.py` 时生成的）。
它**未跟踪、被 `.gitignore` 覆盖、不在提交内、门禁不读它**，故不影响交付面；但：①必做 6 的"无 `.pyc` 残留"
字面不成立；②`IMPLEMENT_RESULT_VS37.md` §R8/§R9 把它描述成"**前几日**留下的 `audit.cpython-313.pyc`"，
**与时间戳不符**（同日、同卡的更早一轮）。建议：把它送回收站，并把该句改成"本卡第一轮生成、本轮送回收站"。
（本轮我自己生成的字节码全部落在 `%TEMP%\vs37rev\__pycache__\`，未在仓库内产生任何新文件。）

## V8. 仍未解决的边界（登记，不阻断）

1. **N3 豁免对强框架词同样生效**：`# 依据 RFC 9457 已删除的原文："只有这一个端点"` 实测 `False`（不告警）。
   要触发需要"真来源编号紧邻 + 强框架词"同时成立，本仓 0 命中、只影响 WARN，故不判缺陷；
   若要彻底堵死，只需让 `_quote_old_extern_exempt` 在 `QUOTE_OLD_STRONG_RE` 命中位置生效时返回 `False`。
2. **弱框架词不再认冒号的反面**：`原文是：某段被删掉的旧文`（若真存在）会漏一个告警——这是上一轮 D2 建议的直接代价，
   实现者 §R9-2 已自认，我认同该交易（本仓"错误原文是：…"是高频合法行文）。
3. **`tier A = 67` 是"裸 `原文`"档、不进门禁**：我认同（44/44 为"原始文本"义），但该数字会随前端代码增长，
   **不得**据此收紧规则（收紧会打掉 `错误原文` 一类合法行文）。
4. **归档面 INFO 计数是移动靶**（53 → 61）：计数随 `docs/ai/evo/*` 增长而上升，属预期；`in_scope` 与退出码不受影响。
   若编排者希望门禁输出稳定，建议把该计数从 `evidence` 移到不含数字的说明，或改用"是否仅出现在归档面"的布尔口径。
