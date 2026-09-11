# EVALUATION RESULT — Vertical Slice 3（报告质量降级提示）

> 独立验收（EVALUATOR），2026-09-14。工作目录 `E:\Code_file\Projects\finquant-hub`。假设实现有错，独立复核。
> 未修改任何生产代码。

## 判定：**REJECT**（1 处功能性缺陷，1 行修复）

验收标准 1、4、5 通过；标准 2、3 在**实时运行路径**上不成立——`done` 事件里前端读的 `data.report.quality` 在协议中不存在（quality 位于 `data.quality`），导致新跑一次研究后屏上 Alert **永不出现**、当次 Markdown 导出也**不带**"生成不完整"前缀。只有从历史记录重新打开报告（走后端持久化路径）才会显示。

## 证据

### 1. 协议层：quality 在 done_payload 顶层，不在 report 内（决定性）

`backend/app/services/research_orch.py:324-338`
```python
done_payload = {
    "ticker": ticker,
    "report": report_data,
    "quality": "degraded" if degraded else "audited",   # ← 顶层
    "agent_results": {...},
}
yield "done", done_payload
```

`backend/app/routers/research.py:275-291`：router 只把 quality 合并进**持久化**副本，向 SSE 前端 yield 的仍是原始 `data`：
```python
report = data.get("report", {})
quality = data.get("quality", "audited")
if isinstance(report, dict):
    report = {**report, "quality": quality}   # 仅用于 _complete_report(...) 落库
...
yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}   # ← 原始 data，report 无 quality
```

`report_data` 本身也不含 quality：`backend/app/services/report_builder.py:368` 只产出 `lead_review_status`；全仓 `quality` 字面量检索（backend/app/*.py）中 `research_orch.py:329` 是唯一写入点。

### 2. 前端据此读错字段

`frontend/src/pages/Research.tsx:302-308`
```tsx
case 'done': {
  const report = data.report ?? {};
  accContent = reportToMarkdown(report, t);      // report.quality 为 undefined → 无前缀
  setReportQuality(report.quality === 'degraded' ? 'degraded' : 'audited');  // ← 永远得到 'audited'
```
`ResearchStreamData`（同文件 54-62 行）也**没有** `quality` 字段，说明顶层 quality 从未被接入。

因此 `Research.tsx:437` 的 `done && reportQuality === 'degraded'` 在实时运行下恒为 false。**Alert 不是死代码，但在主用户场景（跑一次研究）中不可达。** 用户故事的原始痛点（"跑完的研究看起来和正常一样"）在该路径上未闭环。

### 3. 其余各项实测通过

- **双降级优先级正确**：`Research.tsx:71-75` 三元表达式 lead 优先，仅输出主编文案，无重复无并置；测试 82-86 行断言 `not.toContain('本报告生成不完整')`，真实通过。
- **audited / 缺 quality（旧数据）零提示**：`reportToMarkdown` 两分支均返回空前缀；state 侧 `!== 'degraded'` 归一为 `'audited'`（190、307 行）。测试 74-79 行覆盖。
- **流式中不提示**：Alert 由 `done &&` 守卫，且外层容器在 streaming 时 `reportQuality` 为 `null`，不会误报。
- **Alert 确实挂在报告输出区**：`Research.tsx:437-445` 位于 `(running || done || reportContent)` 块内、`.research-report-layout__content` 内、`ResultLayer layer="summary"` 之上——真实渲染路径，非死代码。
- **历史加载路径正确**：`research.py:278-281` 已把 quality 落库，`Research.tsx:190` 正确读取 `report.report_data.quality`；所以"历史重开"能看到提示（这也是本缺陷易被漏测的原因）。
- **新一轮重置**：`Research.tsx:245-248` `setDone(false) / setReportContent('') / setReportQuality(null)`。
- **i18n parity**：`zh.ts:2068-2069` 与 `en.ts:2068-2069` 均存在 `deep.report.degradedNotice` / `deep.report.qualityDegraded`，键名与行位一一对应，parity 0（本次新增 1 键 × 2 语言）。
- **实测门禁**：`bun x vitest run tests/ResearchReportToMarkdown.test.tsx` → `Test Files 1 passed (1) / Tests 8 passed (8)`，68 行 8 用例，均为真实断言（`startsWith` 前缀、`not.toContain('⚠️')`、双降级互斥），非永真测试。

### 4. 测试盲区（缺陷逃逸原因）

测试仅覆盖**纯函数** `reportToMarkdown`，没有任何用例覆盖 SSE `done` → `setReportQuality` 的映射，故字段读错不会被现有门禁拦住。R-1 建议补一条映射测试（注入 `{ quality: 'degraded', report: {...} }` 断言 state 为 degraded）。

## 建议修复（不修改代码，仅提出）

`frontend/src/pages/Research.tsx:302-308`，改读顶层并兼容两种形态：
```tsx
case 'done': {
  const report = data.report ?? {};
  const quality = data.quality ?? (report.quality as string | undefined);
  setReportTitle(...);
  accContent = reportToMarkdown({ ...report, quality }, t);
  setReportContent(accContent || t('deep.report.empty'));
  setReportQuality(quality === 'degraded' ? 'degraded' : 'audited');
  ...
```
并在 `ResearchStreamData`（54-62 行）补 `quality?: string;`。

不建议改后端：`report_data.quality` 落库形态已被历史读路径依赖，前端兼容双形态成本更低、回归面更小。

次要（不阻塞）：`Research.tsx:441` 用 `t('deep.report.qualityDegraded')` 作 Alert message，而该文案自带 `⚠️ `，叠加 `showIcon` 会出现双图标；建议屏上用无 emoji 的短文案或 `strip` 前缀。

## 复核结论

- ACCEPT 条件未全部满足：标准 2、3 在实时路径失效（`Research.tsx:307`、`Research.tsx:305`）。
- 修复后需重跑：聚焦 vitest + `bun run build`，并新增 done→quality 映射测试。

---

# 复评（EVALUATOR Re-evaluation）— 2026-09-14

> 针对上轮 REJECT（实时路径读错字段）独立复核实现者的修复。只读 `frontend/src/pages/Research.tsx`、
> `frontend/tests/ResearchReportToMarkdown.test.tsx` 两文件 + 跑 1 条命令；未修改任何生产代码。

## 判定：**ACCEPT**

上轮唯一阻断缺陷（done 事件读 `data.report.quality` 而非顶层 `data.quality`）已修复且可证；屏上 Alert 与当次导出前缀在实时路径上同时闭环。

## 逐项核对

1. **纯函数 `resolveReportQuality`（`Research.tsx:73-76`）** — 已导出；语义为 `data.quality ?? data.report?.quality`，
   **顶层优先**、回退 `report.quality`、非 `'degraded'` 一律归一为 `'audited'`（缺省/未知/null 全覆盖）。与要求逐字一致。
2. **done 分支改用该函数（`Research.tsx:314-323`）** — `const quality = resolveReportQuality(data);`（317 行），
   `setReportQuality(quality)`（322 行）；`ResearchStreamData` 也已补 `quality?: string;`（61 行，接口 60 行注释说明顶层协议）。
   上轮的 `report.quality === 'degraded'` 读空写法已不存在。
3. **当次导出带前缀（`Research.tsx:318-320`）** — `const report = { ...(data.report ?? {}), quality };` 后再传入
   `reportToMarkdown`，因此实时导出同样是 `**⚠️ 本报告生成不完整…**` 前缀（`reportToMarkdown:82-87` 读 `report.quality`）。
   与历史路径（202 行读落库 `report_data.quality`）语义一致，无双标准。
4. **屏上 Alert（`Research.tsx:451-459`）** — 仍位于"报告输出"块 `(running || done || reportContent)` →
   `.research-report-layout__content` → `ResultLayer layer="summary"` 之上，渲染路径真实可达；`done && reportQuality === 'degraded'` 守卫保留
   （流式中不误报）。**`showIcon` 已移除**（对比 509 行 `deep.method.warning` 仍保留 `showIcon`），而文案
   `zh.ts:2069` 自带 `⚠️ `，故双图标问题已消除，画面上为单图标。
5. **映射测试（`ResearchReportToMarkdown.test.tsx:96-117`）** — 新增 `resolveReportQuality` describe，4 用例 8 断言：
   顶层 degraded/audited（99-100 行，显式注释"后端 done_payload 形如 `{ report: {...}, quality: 'degraded' }`"）、
   `report.quality` 回退（104 行）、优先级 `top > report`（108 行）、缺省/null/undefined/未知值 → `'audited'`（112-115 行）。
   上轮指出的测试盲区（无 SSE 映射覆盖）已补上，且该函数被生产路径 317 行真实调用，非孤岛测试。
6. **门禁实测** — `bun x vitest run tests/ResearchReportToMarkdown.test.tsx` → `Test Files 1 passed (1) / Tests 12 passed (12)`，
   exit 0，与预期 12 passed 一致（上轮 8 → 本轮 12，新增 4 用例即上述映射测试）。

## 遗留（不阻塞 ACCEPT）

- 仅跑聚焦用例，未重跑 `bun run build`（本次限定"只读 2 文件 + 1 条命令"）；建议发布前补 `tsc -b && vite build`
  以确认新增导出与 `ResearchStreamData.quality` 无类型回归。
- `openStoredReport`（202 行）仍用内联三元而非 `resolveReportQuality`，但历史路径形态正确、行为等价，属风格统一项。

## 复核依据

- 生产代码：`frontend/src/pages/Research.tsx:61,73-76,314-323,451-459`
- 测试代码：`frontend/tests/ResearchReportToMarkdown.test.tsx:96-117`
- 门禁输出：12 passed (12)，exit 0
