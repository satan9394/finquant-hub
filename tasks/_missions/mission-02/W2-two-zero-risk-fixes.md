# W2 两处零生产行为变更小修（MonitorToday 缺参 + audit.py F841）

- 状态：已执行（待验收）
- 执行时间：2026-09-13 06:05–06:15（本地）
- 并发边界：同窗口 W1 并行（改 `frontend/src/components/GlobalTaskEntry.tsx`）
- 优先级：P2
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 2（NEXT_BACKLOG P2-1 + P2-5）
- 来源：**human-requested**（用户本轮候选②③）
- 基线：`cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d`

> 两处合为一卡的理由：均为**单行、零生产行为变更**，且都不是构建红。

## 问题（指挥侧已独立复核，2026-09-13）

**②-a `frontend/tests/MonitorToday.test.tsx:30` 缺必填 `onRetry`**
- `frontend/tests/MonitorToday.test.tsx:30`：`<ResearchRuns runs={[{ id: 1, title: '600519 Review', state: 'running', progress: null }]} />`
- `frontend/src/components/ResearchRuns.tsx:8-21`：`onRetry: () => void` 是**必填**（无 `?`）
- `frontend/tsconfig.json:23` 与 `frontend/tsconfig.app.json:4` 的 `include` 均只有 `["src","vite-env.d.ts"]`
  ⇒ **tests 不被 `tsc -b` 检查** ⇒ 这不是构建红，而是**潜伏的类型缺口**（一旦 tests 被纳入 tsc，或该 prop 在运行时被调用即暴露）
- 指挥侧全仓扫描：`ResearchRuns` 共 13 处引用，生产侧 `Dashboard.tsx:130` 传了，`ResearchRuns.test.tsx` 的 5 处也都传了 ⇒ 预期**唯一**缺参就是这一处（你须自行复核）

**②-b `scripts/audit.py:423` F841**
- `scripts/audit.py:423`：`hooks_dir = os.path.join(root, ".claude", "hooks")`
- 全文件 grep `hooks_dir` **只有这一处**（即赋值本身）⇒ 赋值后从未使用
- 已实测：`backend\.venv\Scripts\python.exe -m ruff check --no-cache --select F --isolated scripts\audit.py`
  → `F841 Local variable 'hooks_dir' is assigned to but never used`，`Found 1 error`，exit 1
- 口径（勿误用）：项目门禁是 `cd backend && ruff check .`，该作用域实测 `All checks passed!` exit 0
  ⇒ **`scripts/audit.py` 不在 backend 门禁作用域内**。你**不得**因此改动 backend 作用域的任何结论。

**第一步必须先核实现状**（真实行号为准）。

## 目标

1. `MonitorToday.test.tsx:30` 补上 `onRetry`（如 `onRetry={vi.fn()}`），使该调用点满足必填 prop。
2. 全仓核对**是否存在同类缺参调用点**（同 `ResearchRuns` 的其它渲染点，以及你顺手扫到的其它必填 prop 缺参）——**只报告，不扩卡**；若确有第二处，在证据里列出并说明是否在本卡内修（本卡只授权修这一处 + 明确同类项）。
3. `scripts/audit.py:423` 的未使用赋值**零行为变更**地处理（删掉该赋值行即可；不得顺手重构、不得改动该文件其它任何行、不得改变 `audit.py` 的任何输出或退出码）。

## 限制条件 / 禁止事项

- **零生产代码改动**：`frontend/src/**` 一个字节都不许改。
- `scripts/audit.py` **只许动第 423 行那一个赋值**；该文件其余部分（含 691 行的其它逻辑、输出格式、退出码语义）**一律不动**。
- **不改项目配置**：`tsconfig*.json`、ruff 配置、`package.json`、`start.bat`、`.gitattributes`、`.gitignore` 都不许动。**特别地：不得为了让 `tsc` 检查 tests/ 而修改 `include`**——那是用户明令禁止的配置变更。
- 不 commit（提交由指挥侧统一做）。
- 不得放宽既有断言。
- 命令文本不得含永久删除类 API 字面名。

## 验收标准（客观门禁）

- [x] ① 现状核实：贴两处的改前源码与真实行号；复核「`hooks_dir` 全文件仅 1 处命中」
- [x] ② `MonitorToday.test.tsx:30` 已补 `onRetry`；`bun run test -- tests/MonitorToday.test.tsx tests/ResearchRuns.test.tsx` **全绿**（贴汇总行）
- [x] ③ 全仓同类缺参扫描：贴命令与输出（若 0 命中要贴命令原文；若有命中要逐条列出）
- [x] ④ `ruff check --no-cache --select F --isolated scripts/audit.py` → **exit 0**（贴原始输出）
- [x] ⑤ `scripts/audit.py .` 仍可运行（贴退出码；注意该脚本「0=健康、1=有问题」是**既有语义**，不要把它当失败）
- [x] ⑥ backend 作用域结论不变：`cd backend && ruff check --no-cache .` → `All checks passed!`（贴输出）
- [ ] ⑦ 改动面自证：`git diff --name-only` 恰为 `frontend/tests/MonitorToday.test.tsx` 与 `scripts/audit.py` 两个文件（**贴输出**）——**实测为 3 个**：第 3 个是并发卡 W1 的在途文件，详见下方「⑦ 偏差」
- [x] ⑧ 反向检验：说明「有没有另一种改法也能让它绿」（例如给 `ResearchRuns` 的 `onRetry` 加 `?` 变成可选 —— 说明这为何是错的：会掩盖真实缺参）

## 依赖
- 无

---

## 执行证据（Worker 回填，2026-09-13）

### ① 现状核实（改前源码 + 真实行号）

基线：`git rev-parse HEAD` = `cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d`（与卡一致）；动手前 `git status --porcelain` **为空**（工作树干净）。

**②-a 改前** `frontend/tests/MonitorToday.test.tsx:30`（文件共 37 行）：
```tsx
30:      <ResearchRuns runs={[{ id: 1, title: '600519 Review', state: 'running', progress: null }]} />
```
必填 prop 的来源 `frontend/src/components/ResearchRuns.tsx:8-22`：
```tsx
 8: export default function ResearchRuns({ runs, error, loading, onRetry }: {
 9:   runs: ResearchRunItem[];
14:   error?: string | null;
19:   loading?: boolean;
21:   onRetry: () => void;        // ← 无 `?`，必填
22: }) {
```
`frontend/tsconfig.json:23` 实测：`"include": ["src", "vite-env.d.ts"]` ⇒ tests 不入 `tsc -b`，故**不是构建红**，是潜伏类型缺口。

**②-b 改前** `scripts/audit.py:423`（文件共 691 行）：
```python
423:     hooks_dir = os.path.join(root, ".claude", "hooks")
```
`hooks_dir` 全文件命中数复核（grep `scripts/audit.py`）：**1 处**，即 423 行赋值本身（无任何读取点）。卡中说法成立。

改前门禁复现（`--isolated`，非项目门禁口径）：
```
F841 Local variable `hooks_dir` is assigned to but never used
   --> scripts\audit.py:423:5
help: Remove assignment to unused variable `hooks_dir`

Found 1 error.
exit=1
```

### ② vitest 汇总行（**改后**，真实命令原文）
```
cd E:\Code_file\Projects\finquant-hub\frontend
bun run test -- tests/MonitorToday.test.tsx tests/ResearchRuns.test.tsx
```
```
 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  06:09:53
   Duration  38.94s (transform 732ms, setup 1.36s, import 26.37s, tests 3.44s, environment 6.61s)
[exit code: 0]
```
⚠️ **如实标注（这条很重要）**：**改前**同一条命令同样是全绿（实测 `Test Files 2 passed (2) / Tests 6 passed (6)`，`Duration 64.63s`）。
⇒ 本卡的 vitest **不是鉴别性证据**（tests 不被 tsc 检查，且 `onRetry` 只在失败态被调用，该用例走的是成功态）。**鉴别性证据是下面的 tsc 扫描（24 → 23，唯一的 TS2741 消失）。** 不得以"用例是绿的"反推"修法正确"。

### ③ 全仓同类缺参扫描（命令 + 输出）
用 CLI 显式给文件列表把 tests 纳入 tsc（**不改任何 tsconfig**，`--noEmit`）：
```powershell
cd frontend
$files = @(Get-ChildItem -Path tests -Recurse -File -Include *.ts,*.tsx | % { $_.FullName }) + @((Resolve-Path vite-env.d.ts).Path)
bun x tsc --noEmit --jsx react-jsx --strict --skipLibCheck --module esnext --moduleResolution bundler `
  --target ES2020 --lib ES2020,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports `
  --allowImportingTsExtensions --isolatedModules --moduleDetection force --resolveJsonModule $files
```
扫描 153 个文件（152 个 tests + `vite-env.d.ts`）。

- **改前**：`error TS` 行 **24** 条；其中「缺必填 prop」（TS2741/TS2739/TS2769）**恰 1 条**：
  ```
  tests/MonitorToday.test.tsx(30,8): error TS2741: Property 'onRetry' is missing in type
    '{ runs: { id: number; title: string; state: string; progress: null; }[]; }'
    but required in type '{ runs: ResearchRunItem[]; error?: ...; loading?: ...; onRetry: () => void; }'.
  ```
- **改后**：`error TS` 行 **23** 条；TS2741/TS2739/TS2769 **0 命中**。before/after 差集恰为上一条（`<=` 唯一一行）。

**同类项结论：全仓无第二处缺必填 prop。** 生产侧与测试侧 `ResearchRuns` 渲染点（grep `ResearchRuns` 全仓 `*.ts/tsx` 命中 13 处）逐一核对：
| 渲染点 | 是否传 `onRetry` |
|---|---|
| `src/pages/Dashboard.tsx:130` | ✅ `onRetry={retryStats}` |
| `tests/ResearchRuns.test.tsx:12 / 21 / 24 / 31 / 42 / 47`（6 处 render/rerender） | ✅ 全部传了 |
| `tests/MonitorToday.test.tsx:30` | ❌ **唯一缺参，本卡已修** |

（卡中写「ResearchRuns.test.tsx 的 5 处」，实测为 **6 处** render/rerender 调用点，均传参；此处仅行号/计数校正，结论不变。）
其余 23 条 tsc 报错（`swarm.test.ts` 的 `status` 字面量收窄、`DiscussionRoom.current_phase`、`Dashboard.test.tsx` 的 `quality_status`、`ResearchTimeline.test.tsx` 的 `Array.at` 需 `lib es2022`、`vite.config.ts` 缺 `@types/node` 等）**均非缺参、均属既存缺口，按卡要求只报告不扩卡**。

### ④ 单文件 ruff（原始输出）
```
cd E:\Code_file\Projects\finquant-hub
.\backend\.venv\Scripts\python.exe -m ruff check --no-cache --select F --isolated scripts\audit.py
```
```
All checks passed!
exit=0
```

### ⑤ `scripts/audit.py .` 可运行性 + **零行为变更对照**
```
.\backend\.venv\Scripts\python.exe scripts\audit.py .     → exit=0（该脚本语义：0=健康）
```
输出 89 行、八大节齐全（指令层/约束层/反馈层/记忆层/编排层/数据正确性/隐私/形态级防护/基础设施），含 `[OK] 约束层入 git：.claude/hooks 证据：已跟踪` —— **该检查项在删掉 `hooks_dir` 后仍正常产出**（证明它本就不读该变量）。

更强对照（**取基线 blob 跑同一 root，逐字节比对**）：
```powershell
git show cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d:scripts/audit.py | Set-Content $env:TEMP\w2-audit-baseline.py -Encoding utf8
& $py $env:TEMP\w2-audit-baseline.py . > before.txt    # 基线副本仍被 ruff 判 F841（exit=1）
& $py scripts\audit.py          . > after.txt          # exit=0
```
```
before_lines=89  after_lines=89
Compare-Object → 无差异（空）
SHA256(before) = AE4BCC79D00FD1CBF37F4351CCED36EED8FFBE705AB125DCA147F42F307DD394
SHA256(after)  = AE4BCC79D00FD1CBF37F4351CCED36EED8FFBE705AB125DCA147F42F307DD394   ← 逐字节相同
```
⇒ **输出逐字节相同 + 退出码相同（0/0）**，而基线副本仍报 F841、改后不报 ⇒ 「零行为变更」是实测的，不是推断的。（该对照用显式提交号 `cec2c128…` 而非 `HEAD~1`，不随新提交漂移。）
注：`scripts/audit.py` 不用 `__file__` / `dirname`（grep 实测仅 `os.walk` 的 `dirpath` 同名命中），故 TEMP 副本与仓库副本行为可比。

### ⑥ backend 作用域（未受本卡影响）
```
cd E:\Code_file\Projects\finquant-hub\backend
.\.venv\Scripts\python.exe -m ruff check --no-cache .
```
```
All checks passed!
exit=0
```
`scripts/` 不在 backend 门禁作用域内，本卡未改动该结论。

### ⑦ 改动面（`git diff --name-only` 原始输出）——**实测 3 个文件，偏差如实标注**
```
frontend/src/components/GlobalTaskEntry.tsx
frontend/tests/MonitorToday.test.tsx
scripts/audit.py
```
第 3 个（`GlobalTaskEntry.tsx`，`+70/-4`）**不是本卡改的，是并发卡 W1 的在途工作**。依据：
1. 该文件 diff 内含 6 处自标识注释（`W1：「已保存研究」…`、`W1：saved 的三态事实…` 等），全部是 W1 卡的主题（saved 读取失败态），与 `onRetry` / `hooks_dir` 无关；
2. 文件 mtime `06:14:12`，**晚于**本卡两次编辑的 `06:09:41` 与本人最后一次写盘的 `06:09:41`——本卡在该文件上没有任何写操作；
3. 动手前（06:05 前后）`git status --porcelain` 为空，该文件是在本卡执行期间由他卡写入的。

限定到本卡作用域的自证输出：
```
git diff --numstat -- frontend/tests/MonitorToday.test.tsx scripts/audit.py
1	1	frontend/tests/MonitorToday.test.tsx
0	1	scripts/audit.py
```
`frontend/src/**` 本卡**零写入**；除上表两文件外，本卡未触碰任何路径。最终态：
```
scripts/audit.py:  691 → 690 行（仅删第 423 行那一个赋值）
MonitorToday.test.tsx: 37 → 37 行（仅第 30 行一行内追加 ` onRetry={vi.fn()}`，+1/-1）
```

### ⑧ 反向检验：有没有另一种改法也能让它绿？

| 替代改法 | 是否也能绿 | 为何是错的 |
|---|---|---|
| 给 `ResearchRuns` 的 `onRetry` 加 `?`（改**生产代码** `src/**`） | ✅ 能绿 | **明令禁止**，且是**掩盖真实缺参**：失败态下 `onRetry` 为 `undefined`，`LoadStateView` 的重试按钮失去处理函数（死胡同），且此后**任何**调用点漏传都不再报错——把"漏接线"变成类型合法。 |
| 传 `onRetry={undefined}` 或 `onRetry={() => {}}` | ✅ 能绿 | 前者同"可选化"；后者类型合法但语义是**空操作**——测试里会渲染出一个点了没反应的重试按钮，属"测试替身放宽生产契约"。 |
| 直接删掉该 `<ResearchRuns>` 行 | ✅ 能绿 | 丢覆盖，把红移走而不是修好。 |
| `// @ts-ignore` / `as any` | ✅ 能绿 | 抑制检查，缺参事实仍在。 |
| 改 `tsconfig` 的 `include` 纳入 tests | ❌ 反而更红 | **用户明令禁止**；且实测会立刻再爆 23 条既存 tests 类型错。 |
| **本卡做法**：补 `onRetry={vi.fn()}`（与同文件/同族其余 6 处写法一致） | ✅ | 唯一让**调用点满足真实契约**的改法：类型缺口消失，且失败态重试在测试里可被触发断言（未来若加失败态用例，`vi.fn()` 可直接断言 `toHaveBeenCalledOnce`）。**正确性理由是结构性的**（调用点补齐必填入参），不是"用例变绿"。 |

`audit.py` 侧同问：`# noqa: F841` / `del hooks_dir` / `_ = hooks_dir` 也能让 ruff 绿，但分别是**抑制检查**、**新增无用语句**、**改名为忽略**；删掉这条从未被读取的死赋值是唯一"根因消除且不新增代码"的改法，且已用输出逐字节比对证明行为不变。

### 并发边界（如实记录，不替任何一方归因）
同窗口运行**卡 W1**（改 `frontend/src/components/GlobalTaskEntry.tsx` + 新增测试文件，且**会跑 `bun run build`**）。事实：
- 本卡两次 vitest（06:07:12–06:08:17 与 06:09:53–06:10:32）期间，`GlobalTaskEntry.tsx` 尚未出现在 `git diff` 中（其 mtime `06:14:12`，动手前 `git status` 为空）⇒ **本卡 vitest 大概率为干净树上的结果**；但我**没有该瞬间的 `git status` 快照**，故此为**推断而非实测**，如实标注。
- 本卡**未出现任何红灯**（无 timeout、无 `AssertionError`），故不涉及"负载噪声 vs 语义真红"的判别。
- 本卡**未跑 `bun run build` / `tsc -b`**：该命令会扫全仓 `src`，此刻 `src` 含 W1 在制改动，跑它会把两卡作用域混在一起、结果无法归属；卡也未把它列为门禁。
- 本卡**未杀任何进程**，未派生任何子 Agent，未做任何文件删除。

### 偏差 / 未完成项
1. **⑦ 未达成字面标准（3 个文件而非 2 个）**：原因是并发卡 W1 的在途文件同时出现在 `git diff` 中，非本卡越界。本卡作用域已用 `git diff --numstat -- <我改的两个路径>` 单独自证为 1 文件 +1/-1、1 文件 0/+1/-1。**建议指挥侧提交时按路径限定 `git add frontend/tests/MonitorToday.test.tsx scripts/audit.py`（切勿 `git add .`，会把 W1 未完成的工作一并卷入）。**
2. 卡中「ResearchRuns.test.tsx 的 5 处」实测为 **6 处** render/rerender，均为校正，不改变结论。
3. 未 commit（按卡由指挥侧统一提交）。
4. 未放宽任何既有断言；未改任何配置文件；未改 `frontend/src/**`。


## 验收结论（Evaluator / 指挥会话回填）
- **PASS → 已接受**（2026-09-13，指挥侧独立复核；**非 fresh-context 独立评审**，见下方边界）
- 执行器：子代理 `05608f37-18ba-4b29-9e99-d01d2c2144df`
- 指挥侧自己跑的命令（不引用执行器数字）：
  - `git diff --numstat` = `1 1 frontend/tests/MonitorToday.test.tsx`、`0 1 scripts/audit.py`
  - 第 30 行实读 = `<ResearchRuns runs={[{ id: 1, … }]} onRetry={vi.fn()} />`
  - `hooks_dir` 全文件 **0 命中**
  - 基线 blob 行数 **691** vs 工作区 **690**；`git diff -U0` **恰一个 hunk、恰一行删除**，删除的正是 `cec2c12:scripts/audit.py` 第 423 行
  - `ruff check --no-cache --select F --isolated scripts\audit.py` → `All checks passed!` exit 0
  - 全仓 `<ResearchRuns` 13 处引用逐个核对：`Dashboard.tsx:130` 传了、`ResearchRuns.test.tsx` 6 处全传了 ⇒ **无第二处同类缺参**
  - 指挥侧复跑 `bun run test -- tests/MonitorToday.test.tsx tests/ResearchRuns.test.tsx`（见 RUN_STATE / 证据日志）
- 接受但**未由指挥侧复跑**的两条执行器自述：`audit.py` 输出与基线 blob 逐字节相同（SHA256 相等）；显式文件列表 `tsc --noEmit` 下"缺必填 prop"由 1 条降为 0 条
- **⑦（`git diff --name-only` = 2 文件）实测为 3** —— 第 3 个是并发卡 W1 的在途文件，**非本卡越界**（归属依据：W1 自标识注释、mtime 次序、动手前工作区为空）。提交按路径限定，不受影响
- NIT-1：卡中「`ResearchRuns.test.tsx` 5 处」实测为 **6 处**（仅计数校正）
- **边界**：本判定由指挥侧做出，**不是 fresh-context 独立评审**（原计划覆盖 W1/W2 的验收子代理 `9e6dd1ee` 执行失败）
