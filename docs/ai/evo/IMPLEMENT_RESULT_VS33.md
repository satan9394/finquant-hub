# IMPLEMENT RESULT — VS-33：把"已被更正的原文引文"改成不会被 grep 误认的形式

> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS33.md`（VS-28 独立验收的 NIT-1）
> 状态：**完成**（未 commit；`git status` 中本卡只改 1 个文件）
> 会话约定遵守情况：shell 输出全部 tee 到 `$env:TEMP`；未触碰 `frontend/src/pages/Discussion.tsx`（VS-32 在途）；
> 未跑全量 pytest / `tests/test_api.py`；收尾 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` 为空（无遗留 python）。

> **本文档的书写约定**（两条，请按它读本文档的 grep 命中）：
> ① 凡**我主动引用**已被删除的旧句字面串之处（如 §3 的模式清单），一律加头部标记 `[已删除·非现行声明]`；
> ② 凡**工具的原始输出**（§3.1 的 BEFORE/AFTER 代码块）保持逐字不加工，其所在代码块**上方一行**已标明
> "改前（HEAD 树）"还是"改后（工作区）"，且每行带 `HEAD:` 前缀或路径前缀。
> ⇒ 对本文件自身的任何 grep 命中，都落在"**正在讲这句话已被删除/已作废**"的上下文里，不会被读成现行声明。
> 反过来说：本文件命中旧句**是本文件的职责**（它就是记录这次删除的档案），与"代码面是否还在声明"是两回事。

---

## 0. 结论摘要

| 项 | 结论 |
|---|---|
| 选 A 还是 B | **A（指路式）** |
| 旧句字面 grep 是否还会被误认为现行声明 | **否**。代码/契约面（`backend/app`、`backend/tests`、`frontend/src`、`docs/API_CONTRACT.md`）对旧句片段的命中由 **3 处 → 0 处** |
| 零行为改动是否成立 | **是**。`git diff` 只有 **5 增 2 删**，全部是注释行（2 行）与 docstring 正文行（3 行）；**AST 去 docstring 后逐节点完全相同** |
| VS-28 成果是否零回归 | **是**。`test_llm_client.py`(67) + `test_chat_tools.py`(7) = **74 passed**，`ruff check .` All checks passed |
| VS-30 的 `budget_exhausted` / `effective_budget_seconds` | **未动**（见 §5.3） |

---

## 1. 选了 A（指路式），以及为什么不是 B

**做法**：把两处"`原文为"…"`"的**逐字引文**替换为**指路式表述**——
一句话概括旧断言错在哪 + 取回原文的 git 命令（`git show 3109b6e -- backend/app/services/llm_client.py` 里以 `-` 开头的旧行）。

**为什么是 A 而不是 B**（三条，按权重排序）：

1. **B 治不了本卡要治的那个病**。本卡的问题陈述是：本会话已多次出现"**grep 到即当事实**"的假阳性
   （合法键名 `noMutation` 被当变异标记、行长阈值被当拼接检测）。B 的辩护词是"命中处上下文能看出来是引文"——
   **可那恰恰是需要审计者多读一步的那一步，而它已经失败过至少两次**。B 只是把风险从"字面命中"挪到"人会读上下文"上。
   A 让旧串在**代码与契约面彻底不存在**，把判据从"要正确解读"降级为"会不会命中"，这条判据不依赖人的细心程度。
2. **A 不丢信息**（§4 给证据）。"旧说法错在哪"的完整说明本来就不在引文里，而在紧跟其后的更正段
   （事件只到 sink ≠ 到客户端；`routers/chat.py` 白名单只放行 `tool_completed`；用户可见的是正文前缀 + `done` 字段）。
   引文原本只提供**对照物**，而这个对照物现在由**一句概括 + 一条可执行的取回命令**承担。
3. **A 与 VS-28 已确立的历史档案策略一致**。VS-28 明确把历史档案（`IMPLEMENT_RESULT_VS23.md` 等）中的同一说法**保留不改**
   （改写历史档案＝伪造记录）。A 让"现行声明面"与"历史档案面"**职责分离**：代码里只有指路，档案里才有原文。
   B 会让两处继续混在同一种"看起来像声明"的形态里。

**A 的代价（我主动记下，别当成没有）**：信息变得**依赖 git 历史可达**。若将来 `3109b6e` 所在历史被 rebase/浅克隆丢弃，
取回命令会失效（但"旧说法错在哪"的说明仍在，不会丢）。这是 A 唯一的真实成本，见 §7-1。

---

## 2. 改动内容（逐处 before/after）

改动文件：`backend/app/services/llm_client.py`（**唯一**被本卡改动的文件）

### 2.1 第一处：模块级注释 `:132`（`TOOL_LOOP_EVENTS` 上方）

```text
改动前（1 行，含逐字引文）：
# ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：

改动后（2 行，指路式）：
# ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
# 里以 `-` 开头的旧行）称"提前结束"在事件层对客户端也直接可见——与生产链路不符。更正为：
```

其后 4 行（`:134-137`）**逐字未动**。

### 2.2 第二处：`chat_with_tools_loop` docstring（改动前 `:562`）

```text
改动前（1 行）：
            ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，

改动后（3 行）：
            ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
            里以 `-` 开头的旧行）称该事件与返回值互为同一来源、两条路径都让用户看得到"提前结束"，
            与生产链路不符。更正为：事件只到 sink，
```

其后 4 行（`:566-569`）**逐字未动**。

> **行号漂移校正**：任务卡写的是 `:534`，实际第二处在 **`:562`**（改动前）。原因是 VS-30 在 `:160-200` 一带
> 新增了 `LLMError` 结构化字段与文档，使该处下移约 28 行。卡里 `:132` 与现状一致。这不是缺陷，只是卡的行号已过期。

### 2.3 `docs/API_CONTRACT.md`：**经核无需改动**

任务卡要求"若有同源引文一并处理"。实测**没有**：该文件 `:25/:27/:29` 写的是**更正后的表述**
（"**两条用户可见通道，均已接线**"、"`tool_loop_truncated` **不外发**…它**不是**一条到客户端的通道"），
**不含**任何旧句字面串（§3 的 5 个模式对 `docs/API_CONTRACT.md` 命中数为 0）。故未改动，契约实质内容零变更。

---

## 3. 验收①：grep 前后对照

**5 个字面模式**（覆盖旧句的全部特征片段；均加头部标记以避免本文档自身制造新陷阱）：

```text
P1 [已删除·非现行声明] 事件通道同样显式
P2 [已删除·非现行声明] 两条都不静默
P3 [已删除·非现行声明] 同样显式
P4 [已删除·非现行声明] 不可静默
P5 [已删除·非现行声明] 事件通道与返回值同源
```

### 3.1 代码/契约面（`backend/app`、`backend/tests`、`frontend/src`、`docs/API_CONTRACT.md`）——**这才是"像现行声明"的面**

| 模式 | 改前命中 | 改前位置 | 改后命中 |
|---|---|---|---|
| P1 | 0 | — | **0** |
| P2 | 1 | `llm_client.py:562` | **0** |
| P3 | 2 | `llm_client.py:132` + `Dashboard.tsx:128` | **1**（只剩 `Dashboard.tsx:128`） |
| P4 | 1 | `llm_client.py:132` | **0** |
| P5 | 1 | `llm_client.py:562` | **0** |

原始输出（`git grep -n -- <P> HEAD -- <代码/契约路径>` = 改前；工作区 = 改后）：

```text
===== BEFORE (git grep HEAD, 代码/契约面) =====
  [事件通道同样显式] hits=0
  [两条都不静默] hits=1
      HEAD:backend/app/services/llm_client.py:562:            ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
  [同样显式] hits=2
      HEAD:backend/app/services/llm_client.py:132:# ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：
      HEAD:frontend/src/pages/Dashboard.tsx:128:    {/* VS22：`statsFailed` 为真时本区块同样显式报错（同一失败、同一形态、同一个重试入口），
  [不可静默] hits=1
      HEAD:backend/app/services/llm_client.py:132:# ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：
  [事件通道与返回值同源] hits=1
      HEAD:backend/app/services/llm_client.py:562:            ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
```

```text
===== AFTER (工作区, 代码/契约面) =====
  [事件通道同样显式] code/docs-face hits=0
  [两条都不静默] code/docs-face hits=0
  [同样显式] code/docs-face hits=1
      frontend/src/pages/Dashboard.tsx:128:    {/* VS22：`statsFailed` 为真时本区块同样显式报错（同一失败、同一形态、同一个重试入口），
  [不可静默] code/docs-face hits=0
  [事件通道与返回值同源] code/docs-face hits=0
```

**剩下唯一命中 `Dashboard.tsx:128` 为什么不会被误认为现行声明**：它是**完全无关的另一件事**——
VS22 在讲"`statsFailed` 为真时本区块同样显式地渲染错误态"，句中是"同样显式**报错**"，
**不含** `事件通道`、**不涉及** `tool_loop_truncated`、**不是**对截断通道的断言。
它之所以出现在结果里，只是因为 P3 取了"同样显式"这个**短**片段（短片段必然跨主题误召回——
这本身就是"把匹配当事实"的又一个例子，我没有为了让计数好看去动一个无关文件）。

### 3.2 全仓面（含历史档案）——命中仍在，且**必须**仍在

| 模式 | 改前 | 改后 | 差额 |
|---|---|---|---|
| P1 | 14 | 14 | 0 |
| P2 | 5 | **4** | −1（本卡删掉的 `llm_client.py:562`） |
| P3 | 19 | **18** | −1（本卡删掉的 `llm_client.py:132`） |
| P4 | 7 | **6** | −1 |
| P5 | 4 | **3** | −1 |

剩余命中**全部**落在：`docs/ai/evo/*`（VS-23/VS-28/R5 的历史档案与任务书）与 `task/CHANGELOG.md`（追加式变更日志）。
**它们为何不会被误认为"代码仍在不实地声明"**：

- 这些位置的语义**本身就是"这句话是错的/已改正的"**，例如 `PRODUCT_GAP_MAP.md:204`「**并改正了** `llm_client.py` 中"…"的**不实说法**」、
  `CHANGELOG.md:787`「**改正了**…的不实说法」、`RELIABILITY_REPORT_R5.md:21`「**在生产链路上不成立**」。
  它们引用的主语是"已改正的旧说法"，不是"当前的通道承诺"。
- 它们**已被上游明确冻结**：VS-28 的 `IMPLEMENT_RESULT_VS28.md:140` 记了"历史档案未改——改写历史档案＝伪造记录"。
  本卡的范围（任务卡「涉及模块」）也只有 `llm_client.py` 与 `docs/API_CONTRACT.md`，**不含历史档案**。
- 换句话说：改前的问题是"**代码注释里**留着一条读起来像承诺的句子"；改后代码面归零，剩下的都是**显式在讲"这条说法已作废"**的记述。

> **计数口径必须先说清**：上表的数字用 `git grep`（**只覆盖已跟踪文件**）统计。**本文档此刻是未跟踪的新文件，不在计数内**；
> 一旦被 commit，用 ripgrep 全盘扫会在**本文件**里命中旧句——那属于"记录这次删除的档案"，命中处上下文见文首约定，
> 与"代码面是否还在声明"是两件事。**下一个审计者若看到本文件命中，请不要把它计成发现。**

### 3.3 复现命令（可原样粘贴）

```powershell
cd E:\Code_file\Projects\finquant-hub
foreach ($p in @('<已删除·非现行声明>事件通道同样显式','<已删除·非现行声明>两条都不静默','<已删除·非现行声明>同样显式','<已删除·非现行声明>不可静默','<已删除·非现行声明>事件通道与返回值同源')) {
  $q = $p -replace '^<已删除·非现行声明>',''
  "== $q =="; git grep -n -- $q HEAD -- backend/app backend/tests frontend/src docs/API_CONTRACT.md   # 改前(HEAD)
  git grep -n -- $q -- backend/app backend/tests frontend/src docs/API_CONTRACT.md                   # 改后(工作区)
}
```

原始输出留档：`$env:TEMP\vs33_grep_before.txt`、`$env:TEMP\vs33_grep_before_codeface.txt`、`$env:TEMP\vs33_grep_after.txt`。

---

## 4. 验收②：信息未丢——改动后那几行（读回文件原文）

`backend/app/services/llm_client.py:132-137`（读回自工作区文件，非凭记忆）：

```python
# ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
# 里以 `-` 开头的旧行）称"提前结束"在事件层对客户端也直接可见——与生产链路不符。更正为：
# 该事件只到达**调用方传入的 event_sink**，**不等于到达客户端**。`routers/chat.py` 的 sink
# 刻意只放行 `tool_completed`，因此聊天 SSE 的客户端事件序列里**没有** `tool_loop_truncated`
# （实测只有 tool_call/token/done）。用户可见的截断通道是另外两条：正文前缀 +
# `done.truncated_by_deadline`（前端已消费并渲染持久提示）。
```

`backend/app/services/llm_client.py:563-568`：

```python
            ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
            里以 `-` 开头的旧行）称该事件与返回值互为同一来源、两条路径都让用户看得到"提前结束"，
            与生产链路不符。更正为：事件只到 sink，
            **是否到达用户由调用方决定**——`routers/chat.py` 的白名单只放行 `tool_completed`，
            聊天 SSE 里**看不到** `tool_loop_truncated`。故"用户看得见"不靠本事件，而靠调用方接线：
            chat 走「正文前缀（并落库）+ `done.truncated_by_deadline`（前端消费→持久提示）」。
```

**"旧说法错在哪"的信息点逐条仍在**（对照 VS-28 的更正意图）：

| 信息点 | 改后是否仍在 | 位置 |
|---|---|---|
| 旧断言是什么（概括，非逐字） | ✅ "称…在事件层对客户端也直接可见"/"称该事件与返回值互为同一来源、两条路径都让用户看得到" | `:133` / `:564` |
| 旧断言与生产链路不符 | ✅ "与生产链路不符" | `:133` / `:565` |
| 错在哪：事件只到 sink，≠ 到客户端 | ✅ | `:134` / `:565-566` |
| 错在哪：`chat.py` sink 白名单只放行 `tool_completed` | ✅ | `:134` / `:566` |
| 错在哪：聊天 SSE 里没有 `tool_loop_truncated`（实测只有 tool_call/token/done） | ✅ | `:135-136` / `:566-567` |
| 用户真正可见的是哪两条通道 | ✅ 正文前缀 + `done.truncated_by_deadline` | `:136-137` / `:568` |
| 逐字原文 | ⚠️ **不再内联**，但**可一行命令取回**（见 §7-1 的代价声明） | `git show 3109b6e -- backend/app/services/llm_client.py` |

---

## 5. 验收③：零行为改动——逐行核对

### 5.1 `git diff` 全文（本卡仅此一个文件）

```text
$ git diff --stat -- backend/app/services/llm_client.py
 backend/app/services/llm_client.py | 7 +++++--
 1 file changed, 5 insertions(+), 2 deletions(-)
```

```diff
@@ -129,7 +129,8 @@ def _retry_delay_seconds(attempt: int, response: httpx.Response | None) -> float
 # 避免各调用方自行解析 tool_calls 后重新拼事件。
 # VS23 追加 `tool_loop_truncated`：整轮截止触发时提前结束的信号（与返回值里的
 # `truncated_by_deadline` 同源）。
-# ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：
+# ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
+# 里以 `-` 开头的旧行）称"提前结束"在事件层对客户端也直接可见——与生产链路不符。更正为：
 # 该事件只到达**调用方传入的 event_sink**，**不等于到达客户端**。`routers/chat.py` 的 sink
@@ -559,7 +560,9 @@ class LLMClient:
             截断时第 1 项是**最后一段可用文本**（可能为空串）、第 2 项是已完成的工具调用记录，
             调用方据此如实提示"因超过总时长上限提前结束，以下为已完成部分"；若提供了 `event_sink`，
             同时向**该 sink** 发出受控事件 `tool_loop_truncated`。
-            ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
+            ⚠️ VS28 更正：此处原有断言（已删除；取回：`git show 3109b6e -- backend/app/services/llm_client.py`
+            里以 `-` 开头的旧行）称该事件与返回值互为同一来源、两条路径都让用户看得到"提前结束"，
+            与生产链路不符。更正为：事件只到 sink，
             **是否到达用户由调用方决定**——`routers/chat.py` 的白名单只放行 `tool_completed`，
```

**逐行分类**（5 增 2 删，无一例外）：

| 行 | 类型 | 依据 |
|---|---|---|
| `+` `# ⚠️ VS28 更正：此处原有断言…git show…` | **注释行** | 行首（去缩进后）为 `#` |
| `+` `# 里以 \`-\` 开头的旧行）称…` | **注释行** | 同上 |
| `-` `# ⚠️ VS28 更正（原文为…）：` | **注释行** | 同上 |
| `+` `⚠️ VS28 更正：此处原有断言…` | **docstring 正文行** | 在 `"""` 内，非注释、非语句 |
| `+` `里以 \`-\` 开头的旧行）称…` | **docstring 正文行** | 同上 |
| `+` `与生产链路不符。更正为：事件只到 sink，` | **docstring 正文行** | 同上 |
| `-` `⚠️ VS28 更正（原文为…）：事件只到 sink，` | **docstring 正文行** | 同上 |

机器核对脚本判定（`$env:TEMP\vs33_linecheck.py`，规则：+/- 行去缩进后以 `#` 开头，或含 `⚠️` 标记，则视为注释/docstring）：

```text
diff +lines=5  -lines=2  hunk-header-lines excluded
non-comment-looking changed lines = 2
   +             ... `-` ...（docstring 第 2 行）
   +             ...（docstring 第 3 行）
LINECHECK EXIT=0
```

即：**2 个"看起来不像注释"的增行，恰是 docstring 的续行**（它们不以 `#` 开头是因为在三引号字符串内部），
无一行是 Python 语句。

### 5.2 更强的证据：AST 级"可执行语句零变化"

`$env:TEMP\vs33_ast_check.py` 用 `ast` 解析 `HEAD` 版本与工作区版本，**剥掉所有 docstring**（module/class/function 首条
字符串表达式）后比对 `ast.dump(..., include_attributes=False)`：

```text
[AST-after-docstring-strip] identical = True
[docstrings] total=24  changed=['chat_with_tools_loop']
[lines] HEAD=753  WORK=756  delta=3
AST EXIT=0
```

⇒ **除注释（AST 不表示）与 `chat_with_tools_loop` 一个 docstring 外，模块的可执行结构逐节点完全相同**：
语句、表达式、常量、类型注解、装饰器、控制流一律未变。附带 `python -m py_compile` 通过（`COMPILE EXIT=0`）。

### 5.3 边界声明（我主动划清的三条）

- **docstring 是字符串字面量，改它等于改 `chat_with_tools_loop.__doc__` 的内容**。这是任务卡点名的位置（`:533-538`），
  属"文案行"，不是"日志或错误字符串"，也不是可执行语句。已核实**无任何测试或代码读取该 docstring**：
  `git grep -n '__doc__' -- backend` 仅命中 `backend/tests/test_research_deadline_vs27.py:400`（读的是
  `research_orch.run_research.__doc__`，与本次改动的函数无关）。
- **未改任何日志/错误字符串**：diff 里没有任何引号字符串字面量（错误文案）行，唯一的字符串改动就是 docstring 正文。
- **VS-30 的两处结构化字段未动**：`git grep -n 'budget_exhausted|effective_budget_seconds' backend/app/services/llm_client.py`
  仍为 `:168-170`（文档）、`:180-181`（签名默认值）、`:184-185`（赋值）、`:282`（`_budget_exhausted_error`），
  且它们**不在** diff 的任何 hunk 内。

### 5.4 未触碰的其他在途改动

`git status` 显示 `frontend/src/pages/Discussion.tsx` 也是 modified——**那是 VS-32（在制卡）的改动，不是我的**。
我全程只写入 `backend/app/services/llm_client.py` 与本文档。（该文件在我两次 `git diff --stat` 之间从
`26 +/2 -` 变为 `24 +/3 -`，说明 VS-32 正在同一工作树里并发写作——**我没有读取它的内容、也没有把它计入我的门禁**。）

---

## 6. 验收④：门禁原始输出

前置：`$env:no_proxy='localhost,127.0.0.1,::1'`；**未跑全量 pytest / `tests/test_api.py`**；输出 tee 到 `$env:TEMP`。

### 6.1 聚焦 pytest（`test_llm_client.py` + `test_chat_tools.py`）

第一次按仓库默认配置跑（含 `--cov`，`fail-under=80`）：

```text
$ cd backend; python -m pytest -q tests/test_llm_client.py tests/test_chat_tools.py
..........................................................................  [100%]
...
TOTAL                                 13036  11310   3640    85  11.7%
FAIL Required test coverage of 80.0% not reached. Total coverage: 11.71%
74 passed in 34.42s
PYTEST EXIT=1
```

**读法（重要，别当成失败）**：`74 passed`，**零 failed / 零 error**。退出码 1 **只来自覆盖率的 `fail-under=80`**——
它是对**全仓 13036 条语句**算的分母，而我只跑了 2 个测试文件（覆盖 11.7%），**这个阈值在"只跑聚焦文件"的跑法下必然不达标**，
与本次改动无关（本次改动只可能让 `llm_client.py` 的覆盖**持平或微增**：改动全在注释/docstring，`:132/:562` 所在行本来就不是可执行语句）。
为拿到无歧义的通过信号，补跑一次关掉覆盖率门禁：

```text
$ cd backend; python -m pytest -q -p no:cacheprovider --no-cov tests/test_llm_client.py tests/test_chat_tools.py
..........................................................................  [100%]
74 passed in 9.58s
PYTEST(nocov) EXIT=0
```

用例构成（`--collect-only`）：`tests/test_llm_client.py` = **67**，`tests/test_chat_tools.py` = **7**，合计 74 —— 与 VS-28 交付时记录的 "7+67 passed" **一致**。

> 副作用如实披露：默认跑法让 pytest-cov 按 `pyproject.toml` 配置重写了 `backend/htmlcov/`（该目录**改前已存在**，
> 时间戳 2026-09-12 02:08）与 `backend/.coverage`。两者都在 `.gitignore` 内（`.gitignore:14` `htmlcov/`、`.gitignore:12` `.coverage`），
> **未新增/未修改任何被跟踪文件**（`git status` 只列出 `backend/app/services/llm_client.py` 与 VS-32 的 `Discussion.tsx`）。
> 我的门禁**输出文本**全部落在 `$env:TEMP`。已按删除铁律**不做删除**（回收一个改前就存在的构建产物目录无必要，且可能干扰并发的他卡）。

### 6.2 `ruff check .`

```text
$ cd backend; python -m ruff check .
All checks passed!
RUFF EXIT=0
```

（`ruff check .` 的作用域是整个 `backend/`——与在制的 VS-32（前端 `Discussion.tsx`）**不相交**，故本次 ruff 结果不受他卡影响。
反过来，我的改动也不进入 VS-32 的 vitest/build 作用域。两侧作用域隔离成立。）

### 6.3 收尾进程核对

```text
$ Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select-Object ProcessId,CommandLine
（空）
```

无遗留 `-m pytest` 进程，**未执行任何 `Stop-Process`**（因此不存在"按排除法误杀他卡进程"的风险）；
常驻服务未被触碰。

---

## 7. 未解决问题 / 风险

### 7-1（A 的唯一真实成本）逐字原文改为依赖 git 历史可达
取回命令 `git show 3109b6e -- backend/app/services/llm_client.py`（看 `-` 开头的旧行）或
`git show 3109b6e~1:backend/app/services/llm_client.py`（看该文件在更正前的完整内容）——**两条我都实测有效**：
前者输出 `-# ...使"提前结束"在**事件通道**上同样显式、不可静默。` 与 `-            同时发出受控事件 \`tool_loop_truncated\`（…）。`
若该提交将来被 rebase 或仓库被浅克隆，取回失效。**缓解**：`docs/ai/evo/IMPLEMENT_RESULT_VS28.md:28-29, 89-90` 与
`EVALUATION_RESULT_VS28.md:72-73` 里保留了逐字原文与提交号，属历史档案、不随本卡改动。**结论：即使 git 取回失效，"旧说法错在哪"也不丢**（§4 表全部信息点在源码内）。

### 7-2 只有"结论面"能被机器判据保护，没有自动回归
本卡不新增测试（加断言去锁"注释里不许出现某字符串"属于典型的**把匹配当事实**——正是本卡要治的病；
且"注释内容"不是行为契约）。因此**未来若有人再次把旧句抄回注释**，不会有测试变红。
判据依赖的是一次 grep。**若需要机器守护**（我不建议在本卡做，属新需求），可考虑在 `scripts/audit.py` 加一条
"代码面不得出现历史不实说法"的清单检查——但那要先定义清单，**别用短片段**（§3.1 的 `同样显式` 就是反例）。

### 7-3 我做出的判断，明确标为**判断**而非事实
- "B 治不了本卡要治的病"是**我的判断**（依据是本会话记录里至少两次"grep 到即当事实"的假阳性模式）。
  反方意见（B 自包含、不依赖 git）成立，代价是保留字面命中。**若验收者更看重自包含性，B 是合法的另一选择**，
  切换成本是 2 个 hunk 的文案回改。
- "历史档案里的命中不会被误认为现行声明"是**我的判断**，依据是那些行的语义（"不实说法""已改正""不成立"）与
  VS-28 明确的历史冻结决策；我**不能证明**任何未来的审计者都会这样读。

### 7-4 我**没有**做的事（边界）
- 未改 `docs/API_CONTRACT.md`（实测无同源引文，§2.3）。
- 未改 `docs/ai/evo/*`、`task/CHANGELOG.md`（历史档案/追加式日志；改写＝伪造记录）。
- 未改 `backend/app/routers/chat.py:218-220`（那里的文字是**更正后的现行声明**"事件通道不外发"，
  不是旧句引文；改它反而会削弱现行声明）。
- 未 commit。
- 未触碰 `frontend/src/pages/Discussion.tsx`（VS-32 在途），未把 vs-32 计入任何门禁。

---

## 8. 复现清单（全部命令可原样粘贴）

```powershell
# 1) grep 前后对照（改前 = HEAD 树；改后 = 工作区）
cd E:\Code_file\Projects\finquant-hub
git grep -n -- '同样显式|不可静默|两条都不静默' HEAD -- backend/app backend/tests frontend/src docs/API_CONTRACT.md
git grep -n -- '同样显式|不可静默|两条都不静默'      -- backend/app backend/tests frontend/src docs/API_CONTRACT.md

# 2) 零行为改动：AST 去 docstring 后比对 + 逐行分类（脚本在 $env:TEMP，不在仓库内）
& backend\.venv\Scripts\python.exe "$env:TEMP\vs33_ast_check.py" (Get-Location).Path
& backend\.venv\Scripts\python.exe "$env:TEMP\vs33_linecheck.py" (Get-Location).Path

# 3) 门禁
cd backend
$env:no_proxy='localhost,127.0.0.1,::1'
& .venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --no-cov tests/test_llm_client.py tests/test_chat_tools.py
& .venv\Scripts\python.exe -m ruff check .

# 4) 收尾
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Select-Object ProcessId,CommandLine
```

留档文件（均在 `$env:TEMP`，**不在仓库目录**）：`vs33_grep_before.txt`、`vs33_grep_before_codeface.txt`、
`vs33_grep_after.txt`、`vs33_diff.txt`、`vs33_pytest.txt`、`vs33_pytest_nocov.txt`、`vs33_ruff.txt`、
`vs33_ast_check.py`、`vs33_linecheck.py`。
