# EVALUATION_RESULT_EOL — `.gitattributes` 补 `*.bat/*.cmd text eol=crlf` 独立复验

- **评估对象**：commit `62d5def`（`补 .gitattributes 缺失规则：*.bat/*.cmd text eol=crlf`，仅改 `.gitattributes`，+5 行）
- **对照基线**：commit `39699e4`（其父提交，`.gitattributes` 只有 `*.sh text eol=lf` / `*.ps1 text eol=lf`）
- **角色**：EVALUATOR（独立验收，不采信编排者自述，自行复现测量）
- **最终判定**：**ACCEPT**
- **复验时间**：2026-09-11（本机 `core.autocrlf=true`，来源 `D:/Technology_application/Git/etc/gitconfig`，非仓库级配置）

> 本文件为评估产物，未修改任何被验文件。所有 git 探测均使用 `GIT_INDEX_FILE` 指向索引副本，真实 `.git/index` 前后 SHA256 与 `git write-tree` 均已核对未变。

---

## 1. 复现对照测量（两次真实克隆，原始数字）

方法：两次独立克隆，均显式强制 `core.autocrlf=false`；克隆后用**仓库内**的 `.gitattributes` 做检出（未使用 `git checkout-index --work-tree`，该方法会在临时目录里找 `.gitattributes`，得不到仓库规则）。

```
git -c core.autocrlf=false clone --no-checkout --no-hardlinks <repo> <tmp>
git -C <tmp> -c core.autocrlf=false checkout <commit>
```

| 检出 commit | 生效规则 | `start.bat` 字节数 | CRLF | 裸 LF |
|---|---|---|---|---|
| `62d5def`（**有**规则） | `*.bat text eol=crlf` | 12147 | **190** | **0** |
| `39699e4`（**无**规则） | 仅 sh/ps1 | 11957 | **0** | **190** |

- 字节差 `12147 - 11957 = 190`，恰好等于行数（每行多一个 `\r`），两方向自洽。
- 两个克隆内 `git ls-files --eol start.bat`：
  - 有规则：`i/lf    w/crlf  attr/text eol=crlf`
  - 无规则：`i/lf    w/lf    attr/`
- **对照有效性（关键）**：本机全局 `core.autocrlf=true`。两次克隆都显式传了 `-c core.autocrlf=false`。
  - 若该标志未生效，**无规则**克隆本应得到 190 个 CRLF，实测是 **0 个 CRLF** ⇒ 标志确实生效。
  - 因而**有规则**克隆的 190 个 CRLF 只能归因于 `.gitattributes` 规则，**不是**本机 `autocrlf` 的产物。
- 结论：独立复现出与编排者相同的数字（190 / 190），但由我自行测得，未采信其自述。

---

## 2. 规则是否得当（含 `reference/` 只读约定）

### 2.1 是否改动 `reference/` 里文件的内容 → **没有**

- `git diff --stat 39699e4 62d5def` ⇒ `.gitattributes | 5 +++++`，**仅 1 个文件**。`62d5def` 未改动任何 `reference/` 文件内容。
- 仓库内 `*.bat` 受规则命中的全部 4 个文件，索引侧均为 LF（**未被规则改写**）：

```
i/lf    w/crlf  attr/text eol=crlf    	reference/ai-berkshire/scripts/install-claude-commands.bat
i/lf    w/crlf  attr/text eol=crlf    	reference/ai-berkshire/scripts/install-codex-prompts.bat
i/lf    w/crlf  attr/text eol=crlf    	reference/ai-berkshire/scripts/install-codex-skills.bat
i/lf    w/crlf  attr/text eol=crlf    	start.bat
```

- `git check-attr -a reference/ai-berkshire/scripts/install-claude-commands.bat` ⇒ `text: set` / `eol: crlf`（规则生效，但仅作用于检出）。
- 机制：`text eol=crlf` 只在 **checkout** 方向产出 CRLF，**clean**（入库）方向仍把 CRLF 归一化为 LF ⇒ 索引 blob 不变。
- 已确认 `reference/` 是普通跟踪文件（非 submodule，无 `.gitmodules`），`reference/ai-berkshire/` 下无嵌套 `.gitattributes`。

### 2.2 是否造成假的"已修改" → **没有**

- `git status --porcelain` 中，上述 3 个 `reference/*.bat` **一行都没有出现**。
- 全仓扫描：`i/crlf` 且带 `attr/text` 的条目 **0 个**；`i/lf` 且带 `attr/text` 的条目 34 个 —— 即所有受 `text` 属性管辖的文件索引侧都已归一化，clean 后与索引一致，不会产生假修改。

### 2.3 附带观察（N1，非缺陷，不阻塞）

对 `autocrlf=false` 的新克隆者，`reference/ai-berkshire/scripts/*.bat` 这 3 个文件的**磁盘字节**会从 LF 变成 CRLF。仓库内容（blob）未变，`git status` 也不脏；`reference/` 只读约定约束的是**已提交内容**，且 `.bat` 拿到 CRLF 本身是正确行为。仅作记录。
若确有必要连检出字节也不动，可在 `*.bat` 之前加 `reference/** -text`；但这会让 Windows 批处理回到 LF，**不建议**。本项不构成拒绝理由。

### 2.4 附带观察（N2，非缺陷）

仓库目前**没有任何 `*.cmd` 文件**（`git ls-files "*.bat" "*.cmd"` 只返回 4 个 `.bat`），故 `*.cmd text eol=crlf` 当前不匹配任何文件，属预防性规则，无害。

---

## 3. 无 renormalize 遗留

### 3.1 索引侧扫描

- `i/crlf` 且带 `attr/text`：**0 个**（需要重新规范化的一类文件数量为零）。
- `i/lf` 且带 `attr/text`：34 个（均已规范化）。

### 3.2 `git add --renormalize .` 是否为空操作 → **就行尾而言是空操作**

为不污染真实索引，把 `.git/index` 复制到临时路径并设 `GIT_INDEX_FILE` 指向副本再执行；真实索引 SHA256 前后一致（`real_index_unchanged=True`），`git write-tree` 亦与 HEAD tree 相同、`git diff-index --cached HEAD` 为 0。

| 步骤 | tree hash |
|---|---|
| HEAD tree | `dcb881f9e04a764c9f6f7cd0c0f5bcf73b204e31` |
| 索引副本（renormalize 前，对照） | `dcb881f9e04a764c9f6f7cd0c0f5bcf73b204e31` ✅ 等于 HEAD |
| 索引副本（`git add --renormalize .` 后） | 仅比 HEAD 多出下面 3 个路径 |

renormalize 后相对 HEAD 的差异**只有 3 个**，且全部是既有内容改动、与行尾无关：

```
M	frontend/src/pages/Chat.tsx
M	frontend/src/pages/Dashboard.tsx
M	frontend/src/pages/ResearchWorkspace.tsx
```

判定这 3 个不是行尾变化的证据：

- `git diff --stat` / `--ignore-all-space` / `--ignore-cr-at-eol` 三者**行数完全一致**（24/1、4/2、3/0）；若是行尾变化，加 `--ignore-cr-at-eol` 后应显著缩小。
- 差异正文是真实的 VS-16 深链代码（`?session=<id>` 解析、`sessionsResolved` 等），本评估期间 HEAD 已被编排者推进到 `20f80e0`，这 3 个文件仍处于未暂存状态。
- 其 `attr/` 为空（不受 `.gitattributes` 管辖）。

**⇒ 没有任何文件因为这次 `.gitattributes` 改动而需要重新规范化。零行尾 renormalize 遗留。**

### 3.3 附带观察（N3）

在当前工作树直接执行**未限定范围**的 `git add --renormalize .`，会把上述 3 个与本次改动无关的 VS-16 文件一并暂存。这不是本次改动引入的问题，但复验/收尾时应避免：用 `git add --renormalize -- start.bat` 之类限定路径，或直接比对 `git write-tree` 与 HEAD tree。

### 3.4 工作区现状

```
 M frontend/src/pages/Chat.tsx
 M frontend/src/pages/Dashboard.tsx
 M frontend/src/pages/ResearchWorkspace.tsx
?? docs/ai/evo/IMPLEMENT_RESULT_VS16.md
?? frontend/tests/ChatSessionDeepLink.test.tsx
```

3 个已改文件 + 2 个未跟踪文件**均属 VS-16 任务**，与本 `EOL` 改动无关；`git diff-index --cached HEAD` 为 0（无暂存内容）。除 VS-16 的在途改动外，无遗留。

---

## 4. 行尾现状

- `git ls-files --eol start.bat` ⇒ `i/lf    w/crlf  attr/text eol=crlf` ✅ 含 `attr/text eol=crlf`。
- 当前工作副本：字节数 12147，**CRLF = 190，LF-only = 0** ✅ 完整。
- `git hash-object start.bat` = `git rev-parse HEAD:start.bat` = `6426982adcc43c61aef056a01fd1b925fe9e894f` ⇒ 工作副本经 clean 后与索引 blob 完全一致，工作副本未被改动。
- `62d5def..HEAD` 区间内 **没有任何** commit 触碰 `*.bat` / `*.cmd` / `reference/`；`62d5def:.gitattributes` 与 `HEAD:.gitattributes` 同为 `b950c99111163babd6743c1b2ef6684e8b092507`，`start.bat` blob 同为 `6426982a...` ⇒ 期间编排者的推进未影响被验对象，`62d5def` 仍是 `HEAD` 的祖先。

---

## 5. 判定

### ACCEPT

四项待验事项全部通过，且均由我独立测得：

1. 对照测量复现：**有规则 CRLF=190 / 裸LF=0**，**无规则 CRLF=0 / 裸LF=190**（真实克隆 + 显式 `-c core.autocrlf=false`，双向对照证明本机 `autocrlf` 被正确屏蔽）。
2. `reference/` **内容未被改动**，未产生假"已修改"；`i/crlf` + `attr/text` 条目为 0。
3. **零 renormalize 遗留**；`git add --renormalize .` 相对 HEAD 只多出 3 个与本改动无关的 VS-16 内容改动。
4. `git ls-files --eol start.bat` 已含 `attr/text eol=crlf`；工作副本 CRLF=190、LF-only=0。

### 观察项（均不阻塞）

- **N1** `.gitattributes:6` — `*.bat` 为全局规则，会让 3 个 `reference/ai-berkshire/scripts/*.bat` 在 `autocrlf=false` 的新克隆上以 CRLF 落盘。仓库内容不变、status 不脏，`reference/` 只读约定针对已提交内容，**建议保持现状**；若要求检出字节也完全不动，可在第 6 行前加 `reference/** -text`（不推荐，会让批处理退回 LF）。
- **N2** `.gitattributes:7` — 仓库暂无 `*.cmd` 文件，该行为预防性规则，无害。
- **N3** 复验/收尾时勿执行未限定路径的 `git add --renormalize .`，否则会连带暂存 3 个在途的 VS-16 文件。

### 清理

两处临时克隆（`%TEMP%\eol_eval_8648a085`、`%TEMP%\eol_eval_without`）已先清除只读属性，再经 `FileSystem.DeleteDirectory(..., SendToRecycleBin)` **送回收站**（未使用 rm/del/rmdir）；临时索引探针文件同样已回收。被验文件与真实索引均未改动。
