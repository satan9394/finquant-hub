# BACKLOG-044 完成证据 — 计价模块（模型单价配置 + 按 token 估算费用，对齐 CC Switch Pricing）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-044.md` ｜ 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（本次只读 4 个文件，未修改其中任何文件）

---

## 1. 结论与范围

计价能力此前**完全为零**（`llm_usage` 只有 token，`database.py` 无任何 price/cost 列）。本卡从零建：schema v26 的 `model_pricing` 表 + `/api/model-pricing` CRUD（owner 隔离 + 校验）+ `/api/usage/cost` 与 `/api/usage/records` 的费用派生字段 + Settings 用量区「计价配置」面板与编辑弹窗 + 用量区费用展示。

**关键取舍（需维护者知悉）**：`model_pricing` 唯一键用 **`(user_id, model_name)`** 而不是任务卡字面写的「唯一约束 model_name」。原因：完成标准 2 要求「CRUD 端点用户隔离」，全局唯一会让第二个用户无法为自己配置同名模型，与用户隔离直接冲突；用户隔离在本项目由 `_OWNER_TABLES` + owner 触发器统一保证。已同步写入 `docs/API_CONTRACT.md` §21。

---

## 2. 表迁移（schema v26，SAVEPOINT 增量 + 旧库兼容）

- `backend/app/database.py`
  - `_MODEL_PRICING_VERSION = 26`，`_SCHEMA_VERSION = _MODEL_PRICING_VERSION`（原为 `_MCP_STDIO_VERSION`）；`_MIGRATION_NAMES[26] = "install_model_pricing"`；`_OWNER_TABLES` 追加 `"model_pricing"`。
  - `_migrate_schema()` 新增 `if version < _MODEL_PRICING_VERSION:` 块：`SAVEPOINT install_model_pricing` → `_install_model_pricing()` → `PRAGMA user_version=26` → `_record_schema_version(26)` → `RELEASE`；异常 `ROLLBACK TO` + `RELEASE` + `raise`（与 v25 `install_mcp_stdio_transport` 逐行同构）。
  - `_install_model_pricing()`：`CREATE TABLE IF NOT EXISTS model_pricing`（`user_id` NOT NULL、`model_name` 非空 CHECK、`input_per_1m`/`output_per_1m` REAL NOT NULL ≥ 0 CHECK、`currency` 默认 `CNY`、`source` CHECK IN (`manual`,`builtin`) 默认 `manual`、`updated_at` 默认 `datetime('now')`、`UNIQUE (user_id, model_name)`）+ `idx_model_pricing_user_model`。
- **旧库兼容验证**（测试 `test_v25_database_gains_model_pricing_without_losing_usage`）：构造 v25 形态库（init → `DROP TABLE model_pricing` → `PRAGMA user_version=25` → 删 v26 审计行 → 重新 init）后断言：表被补建且含全部列、`user_version==26`、既有 `llm_usage` 行 `model-name/total_tokens` 一字未变。fresh 库与 v25 库两条路径都覆盖。
- `test_model_pricing_table_exists_with_expected_columns` 另断言 `_SCHEMA_VERSION == 26` 与 `schema_version(26) = install_model_pricing`。

---

## 3. 端点、校验、unpriced 与用户隔离

- 新增 `backend/app/routers/model_pricing.py`（`/api/model-pricing`，4 个操作）：GET 列表 / POST 新增（201）/ PUT 更新 / DELETE 删除；`ModelPricingInput`（pydantic，`extra="forbid"`）校验 `model_name` 去空格后非空（≤120）、`input_per_1m`/`output_per_1m` ≥ 0 且 `math.isfinite`、`currency` 非空（≤8，默认 `CNY`）；写入 `source` 固定 `manual`。
- 重复 `model_name` 处理**明确**：同 owner 创建重复 → 409；更新改成同 owner 已有模型名 → 409；更新为自身原名 → 允许。
- `backend/app/routers/usage.py`：新增 `GET /api/usage/cost?days&session_type`；`GET /api/usage/records` 每条追加 `priced`/`currency`/`estimated_cost`；`estimate_cost()` 纯函数作为唯一换算口径；`_window()` 抽公共窗口条件（`/api/usage` 行为不变）。
- **unpriced 诚实语义**（测试逐条断言）：单价缺失 → `priced: false`、`estimated_cost: null`、`currency: null`，并计入 `total.unpriced_models`/`unpriced_model_names`/`unpriced_total_tokens`；**不返回 0**。`model_name` 为 NULL 的用量行因 LEFT JOIN 不匹配同样判 unpriced。
- **币种不换算**：`total.cost_by_currency` 分币种累计，仅当已计价模型币种唯一时填 `total.currency` + `total.estimated_cost`；混合币种 → `mixed_currency: true` 且两者 `null`（测试 `test_cost_endpoint_reports_mixed_currencies_without_conversion`）。
- **换算正确性**：`input 2.0 / output 4.0`，`1,000,000 + 500,000` tokens → `4.0`；records 单条 `1,000,000 + 250,000` → `3.0`。
- **用户隔离证明**（测试 `test_pricing_is_isolated_per_user`）：other 用户列表为空、PUT/DELETE owner 行均 404、可为同名模型各自配置（owner 1/2、other 7/8），同一份用量按各自单价估算出 `3.0` vs `15.0`。
- 校验负例：空/纯空格模型名、负单价、非有限值（原始 body 发 `1e400` 与 `NaN`，因 JSON 标准无这两个字面量）、空币种 → 全部 422，且库内 0 行。

---

## 4. 前端：计价面板 + 编辑弹窗 + 用量区费用

- 新增 `frontend/src/services/usageApi.ts`：`listModelPricing/createModelPricing/updateModelPricing/deleteModelPricing/fetchUsageCost` + `formatCost()`。
- 新增 `frontend/src/components/settings/PricingConfigPanel.tsx`：Card + 表格（模型 / 输入单价 / 输出单价 / 币种 / 更新时间 / 操作）+ 新增按钮 + 编辑/删除（Popconfirm）+ 诚实提示条（「本机不内置任何模型单价……不会按 0 计费」）+ 空态 `Alert`（`data-testid="pricing-empty"`）。
- 新增 `frontend/src/components/settings/PricingEditModal.tsx`：字段 = 模型名 / 输入单价 / 输出单价 / 币种；`InputNumber step=0.0001 min=0`；校验 = 模型名去空格非空 + 非负有限数值 + 币种非空；提交前 `validateFields` 失败直接返回（不发请求）。
- `frontend/src/pages/Settings.tsx`：用量区新增「费用估算（按已配置单价）」段——3 个 Statistic（估算费用 / 未配置单价模型数 / 未计价 Token）+ 按模型费用表（有单价显示金额，无单价显示 Tag「未配置单价」）+ 币种说明 + 挂载 `PricingConfigPanel`（保存/删除后回调重取费用）。
- `frontend/src/components/settings/UsageRecordsPanel.tsx`：明细表新增「估算费用」列——`priced` 为真显示 `formatCost`，否则显示「未配置单价」。
- **formatCost 诚实性**：`null/NaN` → `-`；极小非零（`<0.000001`）→ `<0.000001` 而不是 `0`；`0` 才显示 `0`。测试 `formatCost` 4 例 + 记录表「未配置单价且不出现 `CNY 0`」1 例。

---

## 5. 内置单价来源表

**无内置单价。** 本卡未加入任何内置单价，`source` 只有 `manual` 一条写入路径，表在迁移中不 seed 任何行。理由（与任务卡「拿不准一律不加」一致）：本卡未对任何模型取得官方定价页直证，且官方价目页多为客户端渲染/频繁变更；UI 与文档均如实声明「本机不内置任何模型单价（无官方定价页直证），请按官方定价页手工填写」。

| 模型 | 官方定价页 URL | 结论 | 理由 |
|------|----------------|------|------|
| （全部） | — | **不加入** | 未取得官方定价页直证；避免臆造数字。只提供用户手工配置入口，缺价一律 `unpriced` |

---

## 6. CC Switch 源码引用表（每个借鉴点 → file:line → 我们的实现位置）

| # | 借鉴点 | cc-switch 文件:行 | 我们的实现位置 |
|---|--------|-------------------|----------------|
| 1 | 单价配置面板：表格列（模型/输入/输出/操作） | `src/components/usage/PricingConfigPanel.tsx:370-390`（表头）、`393-436`（行 + 编辑/删除按钮） | `frontend/src/components/settings/PricingConfigPanel.tsx` 表格 `columns` |
| 2 | 面板空态用 Alert 诚实提示而非空表 | `PricingConfigPanel.tsx:364-368`（`usage.noPricingData`） | `PricingConfigPanel.tsx` `pricing-empty` Alert（中文：「尚未配置任何模型单价……」） |
| 3 | 新增/编辑共用一个弹窗，靠 `isNew` 分支 | `PricingConfigPanel.tsx:444-454` + `PricingEditModal.tsx:88-115`（标题/底部按钮按 `isNew` 切换） | `PricingEditModal.tsx` 的 `item === null` 分支（标题、OK 文案） |
| 4 | 删除二次确认弹窗 | `PricingConfigPanel.tsx:456-482` | `PricingConfigPanel.tsx` `Popconfirm`（含模型名提示） |
| 5 | 编辑弹窗字段：模型 ID / 输入 / 输出单价 | `PricingEditModal.tsx:138-153`（modelId）、`172-204`（input/output cost） | `PricingEditModal.tsx` 的 `model_name` / `input_per_1m` / `output_per_1m` 表单项 |
| 6 | 单价输入精度与下限：`step=0.0001`、`min=0` | `PricingEditModal.tsx:20`（`PRICE_INPUT_STEP`）、`176-186`、`193-203` | `PricingEditModal.tsx` `PRICE_INPUT_STEP = 0.0001` + `InputNumber min={0}` |
| 7 | 提交前非负校验（前端即时反馈） | `PricingEditModal.tsx:51-63`、`PricingConfigPanel.tsx:141-155` | `PricingEditModal.tsx` `isNonNegativeAmount()` + Form validator |
| 8 | 模型 ID 必填校验 | `PricingEditModal.tsx:45-48` | `PricingEditModal.tsx` `model_name` validator（去空格后非空） |
| 9 | 后端拒绝非法/负价格（服务端独立校验） | `src-tauri/src/services/model_pricing.rs:106-123`（`normalize_decimal`）、`125-157`（`normalize_pricing` 必填字段） | `backend/app/routers/model_pricing.py` `ModelPricingInput`（`ge=0` + `math.isfinite` + 去空格非空）与表 CHECK 约束 |
| 10 | 唯一键冲突的显式处理 | `model_pricing.rs:240-271`（`INSERT … ON CONFLICT(model_id) DO UPDATE`） | **有意分歧**：改为显式 409（同 owner 重复模型名），不静默覆盖用户已填单价 |
| 11 | 删除：空 id 报错、按 id 删除 | `model_pricing.rs:442-472` | `model_pricing.py` `delete_model_pricing`（空/不存在/非 owner → 404） |
| 12 | 缺价即不计价（不用 0 冒充） | `src/lib/modelsDevPricing.ts:108-113`（cost 缺失 → 跳过/置 null）、`265-278`（`toModelPricing`） | `usage.py` `estimate_cost()` 返回 `None` → `priced: false`；前端渲染「未配置单价」 |
| 13 | 单价展示格式化（避免浮点噪声） | `modelsDevPricing.ts:96-101`（`formatPrice`） | **有意分歧**：`usageApi.ts` `formatCost()` 保留极小非零为 `<0.000001`，不塌成 `0`（CC Switch 该函数在 `value<=0` 时返回 `"0"`，本项目按任务卡禁止 0 冒充免费） |
| 14 | 模型名归一化后再匹配单价 | `modelsDevPricing.ts:86-94`（`normalizeModelIdForPricing`） | **未采纳**：本项目 `llm_usage.model_name` 即上游返回的模型名，直接精确匹配；不做隐式归一化以免把不同模型错配到同一单价 |
| 15 | 价格变更后回填历史用量成本 | `model_pricing.rs:309-314`、`415-427`（`backfill_missing_usage_costs`） | **有意分歧**：本项目**不回填**，费用在读取时按当前单价派生（任务卡禁止改 `llm_usage` 记录链路）；代价见 §9 风险 |
| 16 | 用户可维护的单价与内置价分离 | `model_pricing.rs:294-315`（文件存 override，DB 存 builtin） | 本项目只有 `manual` 来源、无内置行，语义更窄且诚实 |

---

## 7. 契约同步与 i18n

- `docs/API_CONTRACT.md`：§20 增加 `/api/usage/cost` 行 + records 费用字段说明 + 派生值/未配置单价/币种不换算的整段说明；新增 §21「模型单价 `/api/model-pricing`」（4 行）；原 §21 thesis 顺延为 §22；路由汇总表新增 `/api/model-pricing`（0/4）、`usage.py` 由 `0/1` 修正为 `0/3`、合计 `39/125 → 39/131`；运行时计数实测更新为「139 个 `/api/*` 路径、175 个 HTTP 操作（不含内联健康检查）」。
- `docs/ROUTER_MAP.md`：标题 22→23 APIRouter、136/170 → 139/175；`/api/usage` 行补 cost；新增 `/api/model-pricing` 行。
- `docs/ARCHITECTURE.md`（SCHEMA 段）：`schema v24（49 张逻辑表）` → `v26（50 张逻辑表）`；架构不变量「schema v24 的 49 张逻辑表」→「v26 的 50 张」；技术债段「当前目标 schema version 为 24」→ `26`（**顺手修正任务卡已知漂移**：原文仍写 v24，实际已 v25）；§2.8 LLM 用量条目补「费用只由 `model_pricing` 读取时派生」；新增 **§2.13 模型单价与费用估算（BACKLOG-044）** 说明表结构、端点、unpriced 语义与「无内置单价」。
- `frontend/src/types/openapi.generated.ts`：`openapi_tsgen.py` 重新生成（60 schemas，新增 `ModelPricingInput`），`--check` fresh（build 的 prebuild 通过）。
- i18n：zh/en 各 **+44 key**（`settings.usage.cost.*` 16 条 + `settings.usage.pricing.*` 28 条），实测 **2415/2415 parity 0**（zh-only 0、en-only 0）。

---

## 8. 门禁逐项

| 门禁 | 结果 |
|------|------|
| `cd backend && .venv\Scripts\python.exe -m pytest -q` | **888 passed / 0 failed**，覆盖率 **92.62%**（基线 876 passed / 92.57%，新增 12 例） |
| `cd backend && .venv\Scripts\python.exe -m ruff check .` | All checks passed!（exit 0） |
| `cd frontend && bun run build` | ✓ built（prebuild openapi `--check` fresh + tsc + vite，20.49s，exit 0） |
| 聚焦 Vitest（`PricingConfigPanel.test.tsx` + `UsageComponents.test.tsx`） | 2 files / **15 passed** |
| 全量 Vitest（`bun run test`） | 133 files / **451 passed**（基线 132/443，新增 1 file/8 例），无 AlphaSimulationWorkbench 超时 |
| 4173 E2E（`bun run test:e2e`） | **50 passed**（1.0m） |
| 8000 E2E（`bun run test:e2e:8000`） | **21 passed**（见 §10 备注） |
| `git diff --check` | exit 0（首轮发现 `usage.py` 文件尾多余空行，已修） |
| 删除文件数 | **0**（`git status` 无 `D` 条目；未使用 rm/del） |
| commit | **未 commit** |

---

## 9. 遗留与风险（交维护者裁决）

1. **不回填历史费用**：改单价后，历史用量在下次读取时按**新单价**重算（不落库）。好处是零改记录链路、永远与当前单价一致；代价是历史「已发生」的费用会随后续调价变化，不能当作审计凭证。CC Switch 的做法是落库回填（`model_pricing.rs:309-314`），本卡按禁止项未采纳。若需要「历史快照」，建议另开卡（例如在 `llm_usage` 旁加费用快照列或独立 ledger 表）。
2. **records 端点新增字段**属向后兼容的追加（`priced`/`currency`/`estimated_cost`），但仍是既有端点响应结构变化，已同步 API_CONTRACT。
3. **`(user_id, model_name)` 唯一键 vs 卡片字面「唯一 model_name」**：见 §1，为满足用户隔离要求的有意偏离。
4. **模型名精确匹配**：`llm_usage.model_name` 与 `model_pricing.model_name` 必须字面一致（含大小写）。未做归一化，避免错配；若上游模型名带版本后缀差异，用户需各配一行。属可用性权衡，未在 UI 做模糊提示。
5. **多币种合计为 null**：前端显示「多币种（不换算）」而不是给一个混合金额；符合「不做汇率换算」，但用户看不到单一合计数字。
6. **bun 偶发退出码**：一次在并发跑全量 Vitest 的同时执行 `bun run build`，vite 打印 `✓ built` 但 bun 以 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` 退出 9；单独复跑 build 为 **exit 0**（20.49s）。判定为 Windows 下 bun 收尾的并发性 flake，与本次改动无关。
7. **未加内置单价**（§5），因此新库初始状态下用量区费用全部显示「未配置单价」——这是预期行为，不是缺陷。

---

## 10. 备注

- 8000 E2E 的 webServer 由 playwright 启动 `bun run build && uvicorn app.main:app --port 8000`（`SERVE_FRONTEND=1`、`LOCAL_ONLY_MODE=1`），因此该轮同时覆盖了「构建产物 + 真实后端」路径。
- 只读参考源 4 个文件本次全部逐行读过；未修改 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src` 内任何文件。
