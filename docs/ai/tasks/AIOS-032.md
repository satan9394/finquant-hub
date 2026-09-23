# AIOS-032 - Challenge My Thesis 产品动作

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

用户可在当前 Thesis 上显式运行“挑战我的论文”，看到最强反证、待补的遗漏变量和最脆弱假设；每项都能检查其 evidence 引用，缺证据时明确显示 `UNKNOWN`，不会把模型或规则输出当成金融事实。

## 允许修改

- `backend/app/routers/thesis.py`
- `backend/app/services/thesis.py`（仅复用/暴露 AIOS-031 current view）
- `backend/app/services/thesis_challenge.py`（新建）
- `backend/app/tools/adversarial_review.py`（仅补齐复用所需的最小结构化输出）
- `backend/tests/test_thesis_challenge.py`（新建）
- `backend/tests/test_api.py`（仅补充 Thesis challenge 既有 fixture/API 回归）
- `frontend/src/pages/Thesis.tsx`
- `frontend/tests/Thesis.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_CHALLENGE_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、其他前端页面、`reference/`
- 新建 Agent runtime、自由 Agent 互聊、Graphiti/图数据库
- 用无 provenance 文本、历史聊天或模型输出冒充事实/计算结果
- 自动修改 Thesis、claim 状态、置信度或用户假设

## 完成标准

- owner-scoped Thesis challenge API 复用当前 Thesis、AIOS-031 edge/status history 与既有 `adversarial_review`，不重复建设研究编排器。
- 返回 `strongest_counter_evidence`、`omitted_variables`、`fragile_assumptions` 三类结构化项目；每项标记 `AI_INFERENCE`，携带可定位 canonical evidence refs 或 `UNKNOWN`/空引用及原因。
- evidence 引用只能来自当前用户且保留 kind/data_status/source/as_of/retrieved_at/quality；跨用户和无效引用为零。
- Challenge 是显式只读产品动作，不自动改变 Thesis、claim、版本、edge 或事件历史。
- Thesis UI 提供加载态按钮和可扫描结果；桌面、390px、键盘、空、错误和部分/UNKNOWN 状态可用。
- focused backend/frontend tests、Ruff、mypy、TypeScript、build、API/OpenAPI contract 与 diff check 通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_thesis.py tests/test_thesis_evidence.py tests/test_thesis_challenge.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/routers/thesis.py app/services/thesis.py app/services/thesis_challenge.py app/tools/adversarial_review.py tests/test_thesis_challenge.py
.venv\Scripts\python.exe -m mypy app/routers/thesis.py app/services/thesis.py app/services/thesis_challenge.py app/tools/adversarial_review.py
cd ..\frontend
bun run test -- Thesis.test.tsx
bun x tsc -b --pretty false
bun run build
cd ..
git diff --check
```

## 回退

删除 challenge 端点、服务和 UI 展示即可；本任务不新增表、不迁移数据，也不修改任何 Thesis 状态。

## 验证声明

本任务使用 deterministic fixture/mock 与本地 SQLite；不会把规则输出、静态测试或 mock 描述为真实金融上游或真实模型验证。

## 完成记录（2026-08-12）

- 新增 owner-scoped `POST /api/thesis/{id}/challenge`，只读复用 Thesis v2、claim temporal edges 和既有 `adversarial_review`。
- 三类结构化输出均为 `AI_INFERENCE`；evidence refs 保留 canonical provenance 元数据，无证据时为 `UNKNOWN`，跨用户读取为 404。
- 读取前后 edge/event/version 数量一致；不调用模型或上游，不修改 Thesis/claim/版本/置信度。
- Thesis UI 增加显式加载按钮、三栏可扫描结果、证据卡、`AI 推论`/`PARTIAL`/`UNKNOWN` 和持久错误态；`xs=24/md=8` 保证 390px 单列。
- backend focused 13 passed，Ruff、mypy；frontend focused 3 passed、TypeScript、production build；OpenAPI 112/143、diff check 通过。均为 fixture/mock/SQLite，不是真实上游或真实模型验证。
