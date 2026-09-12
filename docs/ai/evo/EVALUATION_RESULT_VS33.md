# EVALUATION RESULT — VS-33：把"已被更正的原文引文"改成不会被 grep 误认的形式

> 被验提交：**`7600642`**（`git log -1` 的 HEAD）
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS33.md`；被验自述：`docs/ai/evo/IMPLEMENT_RESULT_VS33.md`
> 评估者：EVALUATOR（独立验收，**不采信实现者自述**，逐条自建证据）
> 环境：Windows 11 / pwsh；`$env:no_proxy='localhost,127.0.0.1,::1'`；未跑全量 pytest / `tests/test_api.py`；
> 临时脚本与门禁输出全部落在 `$env:TEMP`（`C:\Users\Satanchen\AppData\Local\Temp\`），仓库内只新增本文件。

## 判定：**ACCEPT**

核心问题（"旧引文是否还会被误认"）在**代码/契约面**上被真正消除（3 处真命中 → 0），
且**零行为改动**经我自建的、比实现者更强的证明成立。无阻塞项；4 条非阻塞 NIT（含一条**实现者证据措辞失效**）。

---

## 1. ⚠️ 核心：旧引文是否真的不会再被误认

### 1.1 我采用的判据（不沿用实现者的口径）

我先把判据写死，再拿它筛命中——**"像现行声明的命中"** = 同时满足：

- **(L) 位置**：文件在讲**当前系统**——源码（`backend/app`、`backend/tests`、`frontend/src`）、现行契约（`docs/API_CONTRACT.md`）、
  当前态产品文档（`PRODUCT_STATE` / `PRODUCT_GAP_MAP` / `HANDOFF`）；
- **(F) 形态**：把旧说法写成**无限定的肯定句**（"系统会 X"），且**不在**"更正/已删除/不成立/不实"的上下文里。

**只要 (L) 或 (F) 有一个不成立，就不算"像现行声明的命中"。** 这条判据比卡面更宽（卡面只要求"不产生像是现行声明的命中"），
用于逼出实现者可能漏掉的残留。

### 1.2 我的 grep 集合（自建，**不是**实现者那 5 个模式）

覆盖旧句的全部特征片段，另加两个"边界探针"：

| # | 模式 | 来源 |
|---|---|---|
| P1 | `事件通道同样显式` | 旧句完整特征串 |
| P2 | `两条都不静默` | 卡面点名 |
| P3 | `不可静默` | 卡面点名 |
| P4 | `事件通道与返回值同源` | 卡面点名 |
| P5 | `同样显式` | 卡面点名，且是**唯一跨主题可误召回的短片段**（边界探针） |
| P6 | `同源` | **我自己加的**：旧说的另一半（"同源"）在改后是否仍以肯定句形式留存 |
| P7 | `事件通道` | **我自己加的**：旧说的主语是否还在代码面被当成声明 |

命令：`git grep -n -F -- "<P>" <rev> -- backend/app backend/tests frontend/src docs/API_CONTRACT.md`（rev = `HEAD~1` 改前 / `HEAD` 改后）。

### 1.3 逐条结论

| 模式 | 改前命中（`HEAD~1`） | 改后（`HEAD`，代码/契约面） | 判定 |
|---|---|---|---|
| P1 `事件通道同样显式` | 0 | 0 | — |
| P2 `两条都不静默` | **1** `llm_client.py:562` | **0** | ✅ 真命中消除 |
| P3 `不可静默` | **1** `llm_client.py:132` | **0** | ✅ 真命中消除 |
| P4 `事件通道与返回值同源` | **1** `llm_client.py:562` | **0** | ✅ 真命中消除 |
| P5 `同样显式` | **2** `llm_client.py:132` + `Dashboard.tsx:128` | **1** `Dashboard.tsx:128` | ✅ 见 §1.4 |
| P6 `同源` | 40 处（改后 39） | `llm_client.py:131` 等 | ✅ 见 §1.5 |
| P7 `事件通道` | 3（`chat.py:220`、`llm_client.py:132`、`:562`） | 1（`chat.py:220`） | ✅ 见 §1.6 |

实现者给的 5 个模式口径（**代码/契约面** = `backend/app` + `backend/tests` + `frontend/src` + `docs/API_CONTRACT.md`）与我实测一致：
**改动把"像现行声明"的真命中从 3 处降到 0 处**（P2 一处、P3 一处、P4 一处；P5 的 `:132` 一处是同一行）。

### 1.4 `Dashboard.tsx:128` 到底是否无关 —— **我读了上下文，判定"无关"成立**

我读了 `frontend/src/pages/Dashboard.tsx:112-130`。该行是：

```
128:    {/* VS22：`statsFailed` 为真时本区块同样显式报错（同一失败、同一形态、同一个重试入口），
129:        不再像修前那样退化成空列表——那会让"读取失败"和"确实没有研究运行"不可区分。 */}
130:    <ResearchRuns runs={researchRuns} error={statsFailed ? statsError : null} loading={statsPending} onRetry={retryStats} />
```

判断依据（不采信"无关"二字）：
- **主语/话题**：`statsFailed` 驱动 `<ResearchRuns>` 渲染错误态；**全段不出现** `tool_loop_truncated`、`event_sink`、SSE、截止、截断任何一个词。
- **谓词**：命中片段是"同样显式**报错**"，与旧句的"在事件通道上同样显式"**谓词不同、宾语不同**。
- **匹配机制**：`同样显式` 是通用副词短语（"同样显式地做某事"），跨主题误召回是**必然**而非线索——
  与实现者的判断一致：**为一个无关文件去改代码凑计数才是错**。

⇒ `Dashboard.tsx:128` **不是**现行声明。实现者未改它，正确。

### 1.5 `同源`（P6）的残留：`llm_client.py:131` 是改后**唯一**值得看一眼的代码面残留 —— 我看后判定**不是**误认源

改后 `:130-131` 为：`# VS23 追加 tool_loop_truncated：整轮截止触发时提前结束的信号（与返回值里的 truncated_by_deadline 同源）。`

- 该行**不是**本卡引入，也不是旧句引文：对照 `git show 3109b6e -- …` 的 `-` 行可见，**3109b6e（VS-28）当时就已把**
  `…同源），使"提前结束"在**事件通道**上同样显式、不可静默。` **改成**了现在这句——旧说被判定不实的那一半
  （"同样显式、不可静默"＝**对用户可见**）在 VS-28 就被删掉了；留下的是**触发链路同源**（同一个截止触发），这一半**是真的**。
- 且其下一行（`:132`）就是更正段，`同源 ≠ 送达客户端` 被紧接着说清。
- `同源` 全仓 39 处、跨 6 个主题（Vite 同源、实时/回放同源…），**从来不是可判别模式**。

⇒ 判定：**不是"像现行声明"的命中**。但它确实说明"改用概括后，`同源`这半句在代码面仍是肯定句"——
记为**观察项 NIT-4**，不阻塞。

### 1.6 全仓剩余命中（`docs/ai/evo/*` + `task/CHANGELOG.md`）逐条看过：**无一是现行声明**

| 位置 | 形态 | 判定 |
|---|---|---|
| `RELIABILITY_REPORT_R5.md:21,96,104` | "…**在生产链路上不成立**"/"**与事实不符**" | 自否证，不是声明 |
| `IMPLEMENTATION_BRIEF_VS28.md:9,13,32`；`IMPLEMENTATION_BRIEF_VS33.md:9` | 任务卡在**描述要被修的毛病** | 不是声明 |
| `IMPLEMENT_RESULT_VS28.md`、`IMPLEMENT_RESULT_VS33.md` | 交付档案**引用被改正的旧行**（本卡档案甚至在串前加了 `[已删除·非现行声明]`） | 不是声明 |
| `PRODUCT_GAP_MAP.md:204`、`task/CHANGELOG.md:761,787` | "…**的不实说法**"/"**与事实不符**"/"**已改正了**…" | 不是声明 |
| **`EVALUATION_RESULT_VS23.md:69`** | `### 3.2 「截断是显式的」 ⇒ **是，三通道同源、不可静默**` | **⚠️ 见下** |

**这是全仓唯一一处"读单行会像肯定声明"的剩余命中**（它是 VS-23 当时的验收结论，非引文、非更正语境）。
判为**不是现行声明**的依据：①位置＝**历史轮次档案**（文件名即带 `VS23`，内容是该轮的事实快照）；
②VS-28 已确立**历史档案冻结**约定（改写＝伪造记录），且它正是"该说法当时被写进验收、后被 VS-28 推翻"这条证据链的一环；
③其正下方/同族的 VS-28 档案已给出推翻结论。⇒ **不构成本卡的误认源，也不应改**。记为**观察项 NIT-3**。

### 1.7 §1 结论

**旧引文不会再被误认——成立。** 三条独立理由：
① 旧句的**全部特征串**在代码/契约面**字面命中为 0**（P1–P4）；
② 唯一跨主题的短片段残留（`Dashboard.tsx:128`）经读上下文确认**话题与谓词均不同**；
③ 全仓剩余命中**全部**位于历史档案/追加式日志，其**单行语义**（"不成立""与事实不符""已删除"）或**文件定位**（`EVALUATION_RESULT_VS23.md`）都排除了"现行声明"的读法。

---

## 2. 零行为改动 —— 我的自建证明（**比实现者的更强**）

### 2.1 先指出实现者证据的一处措辞失效（NIT-1，非阻塞）

其自述与提交信息写的是："`ast` 解析 **HEAD 与工作区**、剥掉所有 docstring 后 `ast.dump` 逐节点完全一致（identical=True）"。
**在本提交已入库之后按字面复核，这个对照是空的**：我实测 `worktree_bytes_equal_to_HEAD = True`（工作区的
`llm_client.py` 与 `HEAD` **逐字节相同**），故"HEAD vs 工作区"只证明了"工作树干净"，**证明不了改动本身零行为差异**。
（按其写作时点，很可能 `HEAD` 还是改动前的 `38b8e65`，那样口径是对的——**属措辞在提交后失效**，不是造假。）
⇒ 结论不受影响，因我**自己**做了正确对照，见下。

### 2.2 我的对照：`HEAD~1`（改前）vs `HEAD`（改后）

脚本 `$env:TEMP\vs33_ast_proof2.py` / `vs33_ast_proof3.py`，用仓库 venv 的 python 3.12.12 运行：

```
raw_ast_dump_identical(HEAD~1 vs HEAD) = False          ← 确有差异，正是本卡要的差异
docstring_slots = 24 24
DOCSTRINGS_REMOVED = 1   owner=chat_with_tools_loop len=2835
DOCSTRINGS_ADDED   = 1   owner=chat_with_tools_loop len=2965
CHANGED_OWNERS = ['chat_with_tools_loop']               ← 只有 1 个 docstring 变了
docstrings_stripped = 24 24
STRIPPED_AST_IDENTICAL(HEAD~1 vs HEAD) = True           ← ★ 剥 docstring 后逐节点完全相同
NON_DOC_STRINGS_IDENTICAL = True   count = 189          ← ★ 189 个"非 docstring"字符串字面量（含日志/错误文案）全等
COMMENT_AND_DOCSTRING_STRIPPED_TEXT_IDENTICAL = True | lines 538 538   ← ★ 去掉注释行与 docstring 行后，538 行全等
```

三条独立通道**互相印证**（AST 节点 / 非 docstring 字符串字面量 / 去注释与 docstring 后的文本），
任一条单独都足以支撑"零行为改动"；其中 `NON_DOC_STRINGS_IDENTICAL` 直接覆盖了卡面禁令的
"**不得改任何日志或错误字符串**"（189 个字面量逐个相等）。模块可被 `ast.parse` 且被 pytest 成功导入执行（§6），语法与导入无虞。

### 2.3 逐行核对 diff：**只有注释/docstring 行**

用 `difflib` 对 `HEAD~1`/`HEAD` 做行级 diff，并对每一行**用各自版本的 AST 判定它是否落在 docstring 行区间内**（不靠缩进猜）：

```
  - 132 [COMMENT] # ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：
  + 132 [COMMENT] # ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
  + 133 [COMMENT] # 里以 `-` 开头的旧行）称"提前结束"在事件层对客户端也直接可见——与生产链路不符。更正为：
  - 562 [DOCSTRING]             ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
  + 563 [DOCSTRING]             ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
  + 564 [DOCSTRING]             里以 `-` 开头的旧行）称该事件与返回值互为同一来源、两条路径都让用户看得到"提前结束"，
  + 565 [DOCSTRING]             与生产链路不符。更正为：事件只到 sink，
NON_COMMENT_NON_DOCSTRING_LINES_TOUCHED = 0             ← ★ 可执行语句 0 行被触碰
```

与 `git show --numstat` 的 `5 2 backend/app/services/llm_client.py` 完全吻合（3 注释 + 4 docstring = 5 增 2 删）。
⇒ **§2 结论：零行为改动成立**（我自建证明，非采信其自述）。

---

## 3. 信息未丢 + 取回命令实测有效

### 3.1 取回命令我**亲自跑过**

```
$ git show 3109b6e -- backend/app/services/llm_client.py | Select-String -Pattern '^-.*静默|^-.*事件通道'
-# `truncated_by_deadline` 同源），使"提前结束"在**事件通道**上同样显式、不可静默。
-            同时发出受控事件 `tool_loop_truncated`（事件通道与返回值同源，两条都不静默）。
exit code = 0
```

⇒ **两条旧句原文都能逐字取回**，命令有效。唯一限制（实现者已自记 §7-1）：依赖 `3109b6e` 在历史中可达。
**该限制的缓解我核过**：`IMPLEMENT_RESULT_VS28.md:28-29` 与 `EVALUATION_RESULT_VS28.md:72-73` 里确实留有逐字原文与提交号，
且本卡档案 `IMPLEMENT_RESULT_VS33.md:60,73` 也留了 before 原文 ⇒ **即使 git 取回失效，"旧说法错在哪"也不丢**。

### 3.2 "错在哪"仍在源码内（我读了改后的两处上下文）

- `:132-137`：更正段逐字未动——陈述事件只到 **event_sink**、`routers/chat.py` 白名单只放行 `tool_completed`、
  聊天 SSE **看不到** `tool_loop_truncated`、用户可见通道是"正文前缀 + `done.truncated_by_deadline`"。
- `:563-568`：同上，逐字未动。
- **概括的保真度**：`:133` 把旧断言概括为"在事件层**对客户端也直接可见**"——原文写的是"在**事件通道**上同样显式"，
  "对客户端"是**解释性补充**（也正是 VS-28 判定其"与生产链路不符"的那个点），且同句保留了"——与生产链路不符"。
  ⇒ 概括**不失真**；信息未丢，成立。（记为**观察项 NIT-2**：概括是解释、非逐字。）

---

## 4. 行号校正：**属实**

| 断言 | 我的实测 | 结论 |
|---|---|---|
| 卡面写第二处在 `:534` | `git show 3109b6e:backend/app/services/llm_client.py` → VS28 块在 **`:534`** | 卡号在 VS-28 时点**正确** |
| 实现者称改前实际在 `:562` | `HEAD~1` → **`:562`** | ✅ 属实 |
| 成因：VS-30 新增文档下移约 28 行 | `38b8e65`（VS-30）后为 `:562`：**534 → 562 = +28 行** | ✅ 归因属实 |
| `:132` 与现状一致 | 改前 `:132`、改后 `:132` 均为同一处的首行 | ✅ 属实 |

⇒ 校正**不是缺陷**，是卡面行号过期；实现者的更正**准确**。

---

## 5. 边界与 VS-30 字段

- **提交文件集**（`git show --name-only HEAD`）：**恰好 2 个** —— `backend/app/services/llm_client.py`（+5/−2）
  与 `docs/ai/evo/IMPLEMENT_RESULT_VS33.md`（+430/−0）。**无第三个文件**。
- `backend/tests/`、`frontend/src/`、`docs/API_CONTRACT.md` 在本提交内**零改动**（已由 name-only 列表证否其存在）。
  `docs/API_CONTRACT.md` 我也独立确认**不含**任何旧句字面串（§1.3 全部模式命中为 0），实现者"无需改动"的结论成立。
- **VS-30 的两处结构化字段仍在**（`git grep -n -E 'budget_exhausted|effective_budget_seconds'`）：
  `:168-170`（docstring 文档）、`:180-181`（签名默认值）、`:184-185`（赋值）、`:282`（`_budget_exhausted_error` 定义）、
  `:302-303`（构造实参）、`:356`（调用点）——与实现者所列一致，且均**不在**任何 diff hunk 内。
- 工作区另有 `frontend/src/pages/Discussion.tsx`、`frontend/tests/ReadStateThreeWay.test.tsx` 为 **VS-32 在途改动**，
  **不属本提交、未被我读入结论、未计入我的门禁**（我的 ruff 作用域为 `backend/`，pytest 只跑 2 个后端文件）。

---

## 6. 门禁（我独立复跑）

前置 `$env:no_proxy='localhost,127.0.0.1,::1'`；未跑全量 pytest / `tests/test_api.py`；输出落在 `$env:TEMP`。

| 命令 | 我的结果 |
|---|---|
| `pytest -q --no-cov tests/test_llm_client.py tests/test_chat_tools.py` | **74 passed**，`EXIT=0`（9.28s） |
| `pytest -q tests/test_llm_client.py tests/test_chat_tools.py`（默认配置） | **74 passed**，`EXIT=1`，**零 failed / 零 error**（40.21s） |
| `ruff check .`（`backend/`） | `All checks passed!`，`EXIT=0` |

### `EXIT=1` 是否确为覆盖率门禁 —— **我给出独立依据**

默认那次运行的**末尾原文**（非我推断）：

```
FAIL Required test coverage of 80.0% not reached. Total coverage: 11.71%
74 passed in 40.21s
TOTAL  13036  11310  3640  85  11.7%
```

依据有三：① 报告行明确写着 `Required test coverage of 80.0% not reached`，且 `TOTAL` 的分母是**全仓 13036 条语句**，
而本次只跑了 2 个测试文件（覆盖率 11.71%）——**该阈值在"只跑聚焦文件"的跑法下必然不达标**，与本次改动无关；
② 同一批用例在 `--no-cov` 下 `EXIT=0`，**唯一变量就是覆盖率门禁** ⇒ 归因闭合；
③ 测试结果行是 `74 passed`，**无 failed/error**，不存在"测试失败被覆盖率掩盖"的可能。
⇒ 实现者的解释**成立**，非"把失败说成门禁"。

副作用：默认那次让 pytest-cov 重写 `backend/.coverage` 与 `backend/htmlcov/`；两者均被 `.gitignore` 命中
（`git check-ignore -v` → `.gitignore:12` / `.gitignore:14`），我事后 `git status --porcelain` 复核：
**被跟踪文件零变化**（只有 VS-32 的两个前端文件 M 与它的结果文件 `??`）。按删除铁律未做任何删除。
收尾 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` **为空**——无遗留 pytest 进程，
我**全程未执行任何 `Stop-Process`**（不存在按排除法误杀他卡进程的风险）；常驻 `http.server` 未被触碰。

---

## 7. ⚠️ 反向检查：本卡不新增测试，这一取舍是否可接受

**我的判断：可接受，且"不加字符串禁令"这个具体判断是**对**的。** 理由：

1. **字符串禁令在本场景会再造本卡要治的病**。写一条 `assert "两条都不静默" not in src` 就是**把匹配当事实**——
   正是本会话已发生两次的失败模式（`noMutation` 被当变异标记、行长阈值被当拼接检测）。
   而且它**必然误报**：该串在历史档案里有正当用途（本卡自己的档案就要引用它）。
2. **"注释内容不是行为契约"**：这条断言锁的不是系统行为，是文本形态；它会让**合法的**档案同步/引用改动变红，
   从而训练出"红了就改断言"的坏习惯。
3. **本卡的判据本来就是一次性人工 grep**，卡面验收标准第 1 条要的就是"grep 前后对照"，不是"测试变红"。

**但"未来若有人把旧句抄回注释，没有任何人会察觉"这一代价是真实的**（实现者已如实标为 §7-2），
所以我不认同"什么都不做"，而是**提议一条更合适的防护（不是字符串禁令）**：

> **建议（记为 NIT-5，非阻塞，属新需求）**：把防护加在**形态**上而不是**某句话**上——
> 在 `scripts/audit.py`（harness 已有入口）增加一条**高精度**检查：*代码/契约面（`backend/app`、`frontend/src`、
> `docs/API_CONTRACT.md`）的注释与 docstring 中，出现"引述旧原文"的形态* `原文为"` / `原来的说法是"` **即告警**，
> 提示应改为**指路式**（概括 + `git show <sha> -- <path>`）。
> 理由：① 它锁的是**本次真实致病的那种形态**（"为说明某说法错而保留逐字引文"），不是某个具体句子；
> ② 片段长、含义专一，**不会像 `同样显式`/`静默` 那样跨主题误召回**（本报告 §1.4 就是反例）；
> ③ 改动量极小的正则一条，且天然允许 `docs/ai/evo/*`（历史档案）放行。
> **另一条零成本的补充**：把"更正注释一律用指路式、不留逐字引文"写进 `AGENTS.md` 的作业踩坑条目
> （与已沉淀的"同一件事两条路径必须同源""失败判据不要用字符串前缀哨兵"同族）。这两条都**不依赖人的细心**，
> 也不把文本当行为契约。

---

## 8. 非阻塞 NIT 汇总

| # | 项 | 说明 | 影响 |
|---|---|---|---|
| NIT-1 | **实现者的零行为改动证据措辞在提交后失效** | "HEAD vs 工作区"在提交后是空对照（两者逐字节相同）；我以 `HEAD~1 vs HEAD` 重做，结论成立 | 证据表述，须以本报告 §2 为准 |
| NIT-2 | 旧断言的概括含解释性补充 | `:133` 把旧句概括为"…**对客户端**也直接可见"，原文只说"在事件通道上同样显式"；同句保留了"与生产链路不符" | 不失真，信息未丢 |
| NIT-3 | `EVALUATION_RESULT_VS23.md:69` 是全仓唯一"单行像肯定声明"的剩余命中 | 属历史轮次档案（VS-28 已冻结改写＝伪造记录），非本卡范围 | 不改，仅登记 |
| NIT-4 | 改后 `llm_client.py:131` 仍以肯定句保留旧说的"同源"半句 | 该半句**已被 VS-28 判定为真**（触发链路同源），假的那半句（"同样显式、不可静默"）在 `3109b6e` 已删；紧邻的 `:132` 即更正段 | 不是误认源 |
| NIT-5 | 无机器防护（§7） | 建议以"形态"（`原文为"`）而非"某句话"作为 audit 规则，并写入 `AGENTS.md` | 属新需求，本卡不做正确 |

---

## 9. 一句话总结

本卡治的是"**旧引文会不会被 grep 到、并被当成现行声明**"。我以自建判据与自建 grep 集合复核：
**代码/契约面的真命中 3 → 0，唯一跨主题残留（`Dashboard.tsx:128`）经读上下文确认无关，全仓剩余命中全在历史档案/追加日志且单行语义自否证**；
**零行为改动**由三条独立通道（去 docstring AST 全等、189 个非 docstring 字符串字面量全等、去注释与 docstring 后 538 行全等）证实；
**信息未丢且取回命令实测有效**（两条旧句逐字可取回，exit 0）。
实现者"不加字符串禁令"的取舍**可接受**（该禁令正是本卡要治的病），但"抄回无人察觉"的真实代价应以
**形态级 audit 规则**（NIT-5）而非字符串禁令来兜底。

**判定：ACCEPT。**
