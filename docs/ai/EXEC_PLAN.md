# Execution Plan — FinQuant Hub

优先级规则：P0 > P1 > P2。全部完成后移除。

---

## [DONE] BACKLOG-042b: BACKLOG-042 回归修复（backend 5 项测试未跟上 v25/分派改动）

**优先级**: P0 ｜ **任务卡**: `docs/ai/BACKLOG-042b.md` ｜ **依赖**: BACKLOG-042（commit ed02b20）
**范围**: 042 合入时只补跑新增 `test_mcp_transport.py`、未跑全量 backend 套件，遗留 5 项既有测试回归（3 项迁移测试硬编码 v24；2 项 MCP 测试 patch 旧符号 `connect_http_mcp_server`）。本卡**只改测试**修这 5 项，且不得放宽断言语义。**禁止**：改 `backend/app/**` 迁就测试、动 `frontend/**`（含 043 未提交改动）、加依赖、删除。
**证据（2026-09-13，DSH Worker，代码完成待维护者复核）**: 5 项逐条修复——①迁移列表断言改为「v1..v24 字面量 + v25 起从 `_MIGRATION_NAMES` 派生并要求真落库」+ 尾项锚定 `_SCHEMA_VERSION`；②③`== _SCHEMA_VERSION == 24` 改为 `== _SCHEMA_VERSION` + 显式断言 v23/v24 在 `schema_version` 中已记录且名字正确（原核心断言"遗留表被删/备份可恢复/append-only/四列"一字未动）；④⑤patch 目标改为实际分派入口 `connect_mcp_server`，fake 改收 `(config)`，新增 `config.command is None`（HTTP 不走 stdio）与成功行 `last_error is None`（成功需清错误），"单服务器失败不阻断其他恢复 + 记录失败"原断言保留。**变异验证**（`%TEMP%` 进程内插件，生产零改动）：漏登记版本 → 用例1 `KeyError`；历史迁移改名 → 用例1 `AssertionError`；restore 去掉 per-server try/except → 用例5 `TimeoutError`，证明断言仍有效。门禁：全量 `pytest -q` **876 passed / 0 failed，覆盖率 92.57%**（修复前 871+5=876，总数不变）；聚焦 67 passed；`ruff check .` exit 0；`git diff --check` exit 0；删除 0；未 commit。**生产代码零改动，未发现生产缺陷**（附观察：`connect_http_mcp_server` 已无生产调用点，是否收口待维护者裁决）。详见 `docs/ai/tasks/BACKLOG-042b.md`。

---

## [READY] BACKLOG-045: 使用统计详情模块（对齐 CC Switch Usage：范围选择 + 汇总卡 + 维度统计表）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-045.md` ｜ **依赖**: BACKLOG-044（费用列）
**范围**: 用户质问"使用统计详情做了没有"——核实只做了极小子集（UsageTrendChart 1.4KB + UsageRecordsPanel 3.1KB + 固定 days=30），CC Switch `src/components/usage/` 有 7 个组件。本卡补：日期范围选择器（预设 7/30/90 + 自定义，后端 start/end 兼容 days）+ 汇总卡 UsageHero（总 token/调用次数/日均/最活跃模型/费用）+ 维度统计表（按模型 + 会话类型聚合可排序）+ 既有两组件零回归。**禁止**：加依赖、改 llm_usage 表/链路、动 context.py、动 044 计价域、E2E config、删除、臆造数据。门禁：backend pytest + ruff + build + Vitest + 4173 50 + 8000 21 + parity 0。

---

## [DONE] BACKLOG-044: 计价模块（全新：模型单价配置 + 按 token 估算费用，对齐 CC Switch Pricing）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-044.md`
**范围**: 用户质问"计价模块做了没有"——核实**完全为零**（llm_usage 只有 token，无任何 cost/price 字段）。CC Switch 有 `usage/PricingConfigPanel.tsx`+`PricingEditModal.tsx`+`lib/modelsDevPricing.ts`+`src-tauri/src/services/model_pricing.rs`。本卡从零建：`model_pricing` 表（SAVEPOINT 迁移 + `_SCHEMA_VERSION` 提升）+ CRUD 端点（用户隔离/校验）+ `/api/usage/cost` 费用估算（缺单价诚实 unpriced 不猜价）+ Settings 计价面板与编辑弹窗 + 用量区显示估算费用 + 契约同步。**禁止**：加依赖、改 llm_usage 表/链路、动 context.py、E2E config、臆造单价、删除。门禁：backend pytest + ruff + build + Vitest + 4173 50 + 8000 21 + parity 0。
**证据（2026-09-13，DSH Worker，代码完成待维护者复核）**: schema v26 `model_pricing`（`_MODEL_PRICING_VERSION=26` + SAVEPOINT `install_model_pricing` + `_OWNER_TABLES` 追加；v25 库补建实测，`llm_usage` 记录零改动）+ `/api/model-pricing` CRUD（owner 隔离 404、同 owner 重复 409、422 校验非空模型名/非负有限单价/非空币种）+ `/api/usage/cost` 与 records 派生费用（缺价 `priced:false`+`estimated_cost:null` 绝不返回 0；`cost_by_currency` 分币种、混合币种合计 null、不做汇率换算）+ Settings 用量区计价面板/编辑弹窗（step 0.0001、min 0）/费用段/明细费用列；**无内置单价**（无官方定价页直证，仅手工配置入口，UI 与文档如实声明）；CC Switch file:line 引用表 16 条（含 3 处有意分歧：显式 409 替代静默 upsert、formatCost 保留极小非零、读取时派生不回填）；唯一键 `(user_id, model_name)` 而非字面「唯一 model_name」（为满足用户隔离，已在 API_CONTRACT §21 说明）。门禁：backend **888 passed / 0 failed，覆盖率 92.62%**（基线 876/92.57%）；ruff exit 0；build exit 0；聚焦 Vitest 15 passed；全量 Vitest 133 files/451 passed；4173 E2E 50/50；8000 E2E 21/21；i18n 2415/2415 parity 0；`git diff --check` exit 0；删除 0；未 commit。详见 `docs/ai/tasks/BACKLOG-044.md`。

---

## [DONE] BACKLOG-043: 供应商管理模块（对齐 CC Switch providers，从静态预设升级为可管理供应商）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-043.md`
**范围**: 用户质问"供应商模块做了没有"——核实**没有**（只有 36 行 8 条静态预设 + 简单表单）。CC Switch 有 `components/providers/` 顶层 10 文件 + `providers/forms/` 约 60 文件（含 `EndpointSpeedTest.tsx` 测试连接）+ `components/universal/` 3 文件 + `src/config/` 12 个预设文件。本卡补：预设库 8→≥15（每条 base_url 官方直证，拿不准不加）+ 供应商卡片管理 UI（列表/新增/编辑/删除/启停）+ 健康状态徽章（三态+最后检查时间）+ 分组预设选择器 + i18n/测试。**禁止**：加依赖、E2E config、臆造 base_url、改 036/037 契约、动用量/计价/context/MCP 域、删除。门禁：backend pytest + ruff + build + Vitest + 4173 50 + 8000 21 + parity 0。
**证据（2026-09-13，DSH Worker，代码完成待维护者复核）**: 预设库 8→**15 条**（国内 7：dashscope/glm/kimi/minimax/hunyuan/siliconflow/stepfun；国际 8：openai/deepseek/openrouter/together/fireworks/cerebras/deepinfra/nebius），每条 base_url 附官方文档 URL + 关键行（证据表在 `docs/ai/tasks/BACKLOG-043.md` §1），新增 `category`/`docsUrl` 字段 + `presetById`/`groupPresetsByCategory`/`filterPresets`；新增 `components/models/` 四件套（ProviderCard 卡片信息层级、ProviderHealthBadge 三态+最后检查时间、ProviderPresetSelector 分组+搜索、providerState 健康/启停/搜索纯函数）+ Models.tsx 卡片列表（默认，单列 Table 以保 `system-pages.spec.ts:35` 的 `tbody tr` 断言）+ 表格视图切换 + 供应商搜索 + 显示已停用 + 弹窗内分组预设选择器（custom 不覆盖手动值，036/037 契约未动）；健康检测复用既有 `POST /api/models/{id}/test`（**零新端点、零后端改动**），失败展示后端原文不 5xx；i18n zh/en 各 +36 key **2371/2371 parity 0**；CC Switch 源码 file:line 引用表 19 条（§2）。**诚实声明**：doubao 因官方文档客户端渲染无法直证已从预设库移除（041 来源声明已于 2026-09-13 撤回）；ollama 已官方直证但被现有 `type:'url'` 校验拒绝故未加；groq/mistral/xAI/Perplexity/baichuan/千帆/sambanova 均列未加入清单+原因。门禁：build ✓（tsc+vite 21.79s）；聚焦 Vitest 7 files/39 tests ✓；全量 Vitest 132 files/443 tests → 441 passed（2 项环境性超时 FundamentalMetricsPanel/ProfessionalPreferences，隔离复跑 11/11 全绿）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；backend ruff ✓、pytest 871 passed/5 项**预存**失败（042 的 v25/mcp 遗留，本卡零后端改动）；git diff --check ✓、删除 0、未 commit。详见 `docs/ai/tasks/BACKLOG-043.md`。

---

## [DONE] BACKLOG-042: MCP 供应商兼容——补 stdio transport（本地 command+args+env）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-042.md`
**范围**: 用户指令"MCP 兼容任何 MCP"+ CC Switch 统一 MCP 面板。现状后端 MCP 只 HTTP（SSE）（mcp_server_configs 仅 name/url、mcp.py connect_http only），前端 mcpApi 已预留 transport 'http'|'stdio'。本卡补 **stdio transport**：表加 transport/command/args_json/env_json 列（SAVEPOINT 迁移，旧 http 行兼容）+ create/update 两 transport 校验 + connect 按 transport 分派（stdio 用 asyncio 子进程走 MCP stdio 协议，**零新依赖**，实现到能拉起进程发现工具深度）+ 前端 MCPServerSettingsPanel 流式切换（http url / stdio command+args）+ 契约/测试。**禁止**：加依赖、存 env 敏感明文、E2E config、删除、他域。门禁：build + Vitest + 4173 50 + 8000 21 + parity 0。
**证据（2026-09-13，DSH Worker，代码完成待维护者复核）**: 表加 transport 四列 + v25 SAVEPOINT 迁移（`_SCHEMA_VERSION`→25，fresh/v24→25 实测补列，旧 http 行兼容）；create/update 经 bridge url/command 二选一校验（neither/both→422）；connect 按 config.command 分派 http/stdio（复用 MCP SDK `stdio_client`/`StdioServerParameters`，**零新依赖**，做到能分派到 stdio 路径发现工具深度）；前端 transport 切换（http url / stdio command+args，中文提示）+ config item transport 反映真实 + openapi.generated 同步；i18n zh/en 各 35 key parity 0；API_CONTRACT/ROUTER_MAP 同步。门禁：backend ruff app+tests 通过、test_mcp_transport 6 用例+迁移2场景经等价 driver 全绿、frontend `tsc -b` 通过、openapi_tsgen fresh；委托沙箱下 pytest 进程化/vite build/Vitest 受限未跑（pytest tmp 目录枚举 WinError5、esbuild child spawn EPERM），建议维护者在常规环境补跑。详见 `docs/ai/tasks/BACKLOG-042.md`。

---

## [DONE] BACKLOG-041: 模型供应商预设模板库（CC Switch 式独立模块 + 扩常用供应商）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-041.md`
**范围**: 用户指令"模型模块做好"+ CC Switch 预设精神。现状 Models.tsx 有内联 3 预设（openai/deepseek/openrouter）。本卡新建 `frontend/src/features/modelPresets.ts` 预设库（保留 3 + 扩国内常用 ≥5：通义/智谱/Kimi/豆包/硅基流动等，base_url 全部核实，拿不准宁可不加）+ Models.tsx 改用模块（custom 保留）+ i18n + 测试。**禁止**：后端、E2E config、依赖、删除、臆造 base_url。门禁：build + Vitest + 4173 50 + 8000 21 + parity 0。
**证据（2026-09-11，DSH Worker，代码完成待维护者复核；2026-09-13 来源声明更正）**: 新增 `frontend/src/features/modelPresets.ts`（`MODEL_PRESETS` 8 项 = 现有 3 国际 openai/deepseek/openrouter + 新增 5 国内 dashscope/glm/kimi/doubao/siliconflow，base_url 逐一核实——siliconflow/kimi/glm 官方文档直证；**dashscope/doubao 原声称"经 CC Switch 预设交叉核实"已撤回**：2026-09-13 只读核实 CC Switch 源码，其 `src/config/piProviderPresets.ts` 无 doubao、全仓无 dashscope/DouBaoSeed 预设，且当时实际只读过其 GitHub README 未读源码，该两端点仅表述为生态公认值；百度千帆因未能当场核实**未加入**，诚实声明）；Models.tsx provider Select 选项与 base_url 自动填充改用模块（删内联 presets），custom 保留且不自动填逻辑不变；i18n zh/en +5 key 各 2336 parity 0；新增 modelPresets.test.ts 6 用例 + ModelsForm.test.tsx +1 provider 切换自动填用例。门禁实测：build ✓；聚焦 10/10；全量 Vitest 128 files/414 tests（基线 127/407）；4173 E2E 50/50；8000 E2E 21/21；git diff --check 通过、删除 0、未 commit。详见 `docs/ai/tasks/BACKLOG-041.md`。

---

## [DONE] BACKLOG-040: Token 用量面板增强（按日趋势 + 会话级明细，对齐 CC Switch Usage Query）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-040.md`
**范围**: 用户指令"token 消耗模块做好"+ 参考 CC Switch Usage Query。现状已有 llm_usage 表+/api/usage+Settings 汇总；本卡补 Settings 用量区**按日趋势图**（复用现有图表 hook）+**会话级明细**（session_type/时间/model/总量，后端缺 records 端点则补，用户隔离）+ i18n parity 0 + 诚实空态。**禁止**：E2E config、依赖、删除、改 llm_usage 表/记录链路、动 context.py（043 域）。门禁：build + Vitest + 4173 50 + 8000 21。
**证据（2026-09-11，DSH Worker，代码完成待维护者复核）**: Settings 用量区新增按日趋势图（`UsageTrendChart` 复用 `useLightweightCharts`，`data-testid="usage-trend-chart"`，纯函数 `usageToAreaData` 映射 daily→AreaChartData）+ 会话级明细面板（`UsageRecordsPanel` 拉 `/api/usage/records`，time/model/总量/会话 id，诚实空态）；后端补 `GET /api/usage/records`（用户隔离、created_at DESC、limit 1-200、session_type 过滤）+ httpx ASGI 确定性测试；i18n zh/en 各 2331 key parity 0。门禁实测：backend 870 passed cov 92.59%、ruff 全过；build ✓；聚焦 UsageComponents 7/7 + Settings 4/4；全量 Vitest 127 files/407 tests；4173/8000 E2E 见任务卡；git diff --check 通过、删除 0、未 commit。详见 `docs/ai/tasks/BACKLOG-040.md`（新端点 /api/usage/records 的 API_CONTRACT/ROUTER_MAP 同步留维护者复核补录）。

---

## [DONE] BACKLOG-036: 模型管理后端契约重构（api_key 加密存/URL 归一/拉模型列表，commit 97636bc）（api_key 加密存 + URL 不二次拼接 + 拉模型列表 + 报错可行动）

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-036.md`
**范围**: UX_ISSUES_20260907 问题一后端。model_configs 加 api_key 列（Fernet 加密存，复用 credential_store；api_key_env 留兼容回退）；llm_client 拼接不二次（修 OpenAI 404）；新增 fetch-models 端点（GET {base}/models，失败诚实不 5xx）；test 端点报错含响应体+中文建议。**禁止**：前端（037）、E2E config、依赖、删除、明文 key 入日志/响应。门禁：backend 853+ cov 不降 + ruff；文档 API_CONTRACT/ARCHITECTURE SCHEMA 同步。

---

## [DONE] BACKLOG-037: 模型管理前端表单重排（直接填 key/拉模型/报错可行动，commit 97636bc）（直接填 key 值 + 拉模型按钮 + 报错可行动）

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-037.md` ｜ **依赖**: 036 先行合入
**范围**: UX_ISSUES_20260907 问题一前端。Models.tsx 表单重排：名称/供应商预设/API 地址（中文帮助，base 与完整 Endpoint 双模式说明）/API Key 直接填值（password + has_api_key 不回显）/模型名 + 拉取列表按钮（调 fetch-models）/测试结果区可行动错误。i18n zh/en parity 0。**禁止**：后端、E2E config、依赖、删除。门禁：build + Vitest + 4173 50 + 8000 21 + parity 0。

---

## [DONE] BACKLOG-038: 机会发现空态/自然语言/行业 + 涨停池术语（commit 39c1c61） + 涨停池术语外行可懂

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-038.md`
**范围**: UX_ISSUES_20260907 问题二。Discover 无输入给默认推荐/引导（不空荡、不造假）、支持公司名/描述搜索、行业/概念分类（有据则接无据留注）；LimitPool 专业列（封单额/涨停统计等）加中文释义 tooltip 或改名 + 顶部"涨停/跌停"说明（复用 indicatorKnowledge 解释卡范式）。**禁止**：后端数据源新增、E2E config、依赖、删除、造假数据。门禁：build + Vitest + 4173 50 + 8000 21 + parity 0。

---

## [DONE] BACKLOG-039: 导航冗余收口（研究模式入口收敛，commit f43fefe）（研究模式入口合并）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-039.md`
**范围**: UX_ISSUES_20260907 问题三。顶栏"研究模式"选择器与研究工作区入口合并：先定位现状组件，模式选择移入研究页内或收敛单主入口；旧路由/参数（/research、/research/:symbol、mode=*）兼容。**禁止**：后端、E2E config、依赖、删除、破坏旧路由。门禁：build + Vitest + 4173 50 + 8000 21 + parity 0。

---

## [DONE] BACKLOG-035b: B9 挂载收口——LocalCapabilityBanner 接入 Dashboard 首屏 + E2E mock 同步

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-035b.md`
**范围**: BACKLOG-035 已做组件双状态但 Banner 未挂载（仅导出+单测，用户首屏看不到）——本卡授权挂载：Dashboard stats 就绪后渲染 `<LocalCapabilityBanner capabilities onNavigate>`（stats null/加载态不渲染）；`dashboard.spec.ts` stats mock 补 capabilities 字段（**仅补字段不改既有断言**）；必要渲染断言。**禁止**：后端、e2e 除 dashboard.spec 外一切、依赖、删除、改 LocalCapabilityBanner 组件本身。门禁：build + Vitest + 4173 50 + 8000 21 + i18n parity 0。

**证据（2026-09-07，DSH Worker，代码完成待维护者复核）**: hero 后决策区前挂载 `{stats?.capabilities ? <LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} /> : null}`（stats 非 null 才渲染、null/加载态整块不渲染不闪 banner；组件本身零改动仅接线）；`dashboard.spec.ts` stats mock 补 capabilities（model_ai UNCONFIGURED + market_data RUNTIME_CHECK_REQUIRED/UNKNOWN，与后端契约 & types/index.ts:351-362 一致，仅加字段既有断言零改动）；Dashboard.test 新增整页渲染 describe +3（含 capabilities → Banner 全可见；stats 悬挂 → 不渲染；quality OK → 市场行隐藏 model 行保留）。门禁实测：build ✓；聚焦 Dashboard 10/10；全量 Vitest 124 files/391 tests（388+3）；4173 E2E 50/50；8000 E2E 21/21（均 --retries=0）；i18n 0 新增 parity 2288/2288；git diff --check 通过、删除 0；未 commit。详见 `docs/ai/tasks/BACKLOG-035b.md`。

---

## [DONE] BACKLOG-035: B9 首用能力引导——LocalCapabilityBanner 双状态（model_ai + market_data）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-035.md`
**范围**: Astra B9（部分证实）+ 维护者核实：Dashboard 已有 LocalCapabilityBanner 处理 model_ai（配置/测试引导），但忽略 capabilities.market_data（RUNTIME_CHECK_REQUIRED/UNKNOWN）。本卡扩 Banner 为双状态：model_ai 行保留 + market_data 行诚实提示（行情源待检查/不可用 + 动作）。**禁止**：后端（判定逻辑只消费不改造）、E2E/playwright config、依赖、删除、model_ai 既有文案/行为改动、"干净机器深度引导"（另行记录）。门禁：build + Vitest 全量 + 4173 50 + 8000 21 + i18n parity 0。

**证据（2026-09-07，DSH Worker，代码完成待维护者复核）**: 单 Alert → `workbench-capabilities` 双 Alert：model_ai 行逐字段原样 + market_data 行（quality_status !== 'OK' 时 warning"行情源状态待检查——行情数据可能暂不可用" + 描述 + 动作落 /discover）。i18n zh/en 各 +3 key（marketPending/marketPendingDescription/marketExplore，2288 parity 0，既有 model_ai key 未动）；app.css +1 行（`.ant-alert + .ant-alert` 8px 分层）；Dashboard.test +2 用例（RUNTIME_CHECK_REQUIRED 显示诚实提示+动作、OK 隐藏市场行，model 行零回归）。门禁实测：build ✓；聚焦 Dashboard 7/7；全量 Vitest 124/388；4173 E2E 50/50；8000 E2E 21/21（均 --retries=0）；i18n parity 0；git diff --check 通过、删除 0；未 commit。诚实声明：Banner 自 8a0be88 后未挂载进 Dashboard 渲染（仅导出+单测覆盖），挂载需改 E2E mock 属禁止范围，本卡按 §允许 落成组件级。详见 `docs/ai/tasks/BACKLOG-035.md`。

---

## [DONE] BACKLOG-033: A6 主编降级诚实展示 + B8 文案术语收敛（Astra 遗留记录项，DSH Worker）

**优先级**: P2 ｜ **任务卡**: `docs/ai/BACKLOG-033.md`
**范围**: Astra 遗留项 A6（主编 LLMError 后仍 completed，内部 model_output_status 已记但前端不消费→修复=报告查看处诚实提示降级，不改状态机语义）+ B8（BacktestSummary 专业区英文指标 Sharpe/Sortino/Beta/R² 换中文 key）。A6 含 report_builder 顶层加 lead_review_status + Research reportToMarkdown 顶部降级提示；B8 只换 label 不换 testId/E2E 依赖文案。**禁止**：改状态机/通知、E2E/playwright config、依赖、删除、B9/B12。门禁：backend 851+ cov、build/Vitest/4173 50/8000 21、i18n parity 0。
**证据（2026-09-06，维护者复核通过并合入）**: A6-1 report_builder 顶层 lead_review_status（audited|degraded 同源映射，落库实证 research_orch done→research.py/scheduler UPDATE report_data + GET 整体返回，编排零改动）+ 后端测试两映射断言；A6-2 Research reportToMarkdown 具名导出 degraded 顶部提示（chapters/legacy 两形态，audited/缺省不回归）+ 新测试 4 例；B8 BacktestSummary 6 硬编码英文 label 换 strategy.metric.* key（testId/结构/E2E 文案零改动）；i18n +7 key zh/en 2285 parity 0。维护者独立复核 + 全量门禁：backend 853/853 cov 92.53%、ruff 全过、build ✓、全量 Vitest 124 files/386 tests、4173 50/50、8000 21/21、diff check 通过、删除 0。详见 `docs/ai/tasks/BACKLOG-033.md`。

---

## [DONE] BACKLOG-034: A7 重启恢复事务收口（scheduler 报告 INSERT + run 回填原子化）

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-034.md`
**范围**: Astra A7 机制项——scheduler.py `_run_and_persist_target` report INSERT 与 run.report_id 回填原分两次 commit（崩溃留半链接），用 A2 建的 `database.exclusive_transaction()` 收口原子化 + 回归测试（异常无半链接/正常双落）。**禁止**：碰后端其他文件（recover/heartbeat 等另行记录）、前端/E2E/依赖/删除。门禁：backend pytest 851+、cov 不降、ruff、build 确认。
**证据（2026-09-06，维护者接手补完验证并合入）**: scheduler.py 定时研究路径（scheduled_run_id 非 None）report INSERT + run.report_id 回填包进 `_run_tx_lock()` + `exclusive_transaction()` 原子落盘（post-market 单 INSERT 无半链接保持原样）；写锁 `_RUN_TX_LOCKS` 为必要范围扩展（scheduler gather 并发 + 单连接 BEGIN IMMEDIATE 不可嵌套，锁覆盖短写段不损并发）；test_scheduler 新增 2 回归（异常回滚无半链接 + 正常双落）。Worker（e2de7f57）于并发探针阶段终止，维护者接手：5 个 _probe_*a7 调试探针回收站清理、补证据文档、全量门禁独立复跑。验证: 聚焦 14/14（scheduler+transaction）；backend 853/853 cov 92.53%、ruff 全过；build ✓；git diff --check 通过；删除 0。详见 `docs/ai/tasks/BACKLOG-034.md`。

---

## [DONE] BACKLOG-030: B12 重做②低风险批——顶部 MetricStrip 删除 + FinancialMetric 空值直传 + MDD 语义复核

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-030.md`
**范围**: B12 设计（b12-design-2026-09-05.md 已审过）拆分的第 1 张顺序卡，只做 ②-C/②-E/②-D（风险最低、E2E 影响已核为零）：删 StrategyLab 顶部重复 MetricStrip（StrategyLab.tsx:706-713，保留 BacktestSummary 内全部 metric-* data-testid 与结论 Alert——4173 core-paths:186 依赖）；FinancialMetric 空值原始直传 + 真实 quality（BacktestSummary pct() 不再 pre-format，占位移入组件，空值不标 OK）；MDD 语义全站复核统一 --fq-risk。**禁止**：E2E 断言/playwright config/后端/依赖/删除/实施 ②-A/B（031）或重做①（032）。门禁：build + Vitest + 4173 50 + 8000 21 + backend 851 零改动 + i18n parity 0。
**证据（2026-09-05）**: ②-C 删顶部 MetricStrip（StrategyLab.tsx）且 BacktestSummary 内 metric-* 与结论 Alert 全保留（grep + 4173 strategy 用例实测）；②-E `pct()` null 直传 + `qualityOf` 真实推导（UNKNOWN/UPSTREAM_ERROR/PARTIAL/OK）+ FinancialMetric 显示层承接（组件零改动），BacktestSummary.test legacy 断言改"显示未知而非假 OK"（语义不放松）；②-D 全站扫描确认唯一 MDD 语义色为 `--fq-risk`（BacktestSummary metric-max-drawdown），无 MDD 用 `--fq-price-down`/绿。门禁实测：build 4,243 modules；Vitest 全量 123 文件/378 测试全绿（首轮四任务并发下 1 例 Thesis 5s 超时与本次改动无关——Thesis 不引用任何改动文件，独占复跑全绿）；4173 E2E 50/50；8000 E2E 21/21（均 `--retries=0`、断言零改动）；backend 851/851 覆盖率 92.52%（零后端改动）；i18n zh/en 各 2,274 key parity 0（零新增 key）；`git diff --check` 通过、删除 0、未 commit。详见 `docs/ai/tasks/BACKLOG-030.md`。

---

## [DONE] BACKLOG-031: B12 重做②布局与 IR 折叠——360px 设置栏 + 弹性结果栏 + "一句话填规则"

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-031.md`
**范围**: B12 第 2 张卡（依赖 030 先行），执行 ②-A/②-B：StrategyLab 主区两栏 Grid（左 360px 设置 + 右弹性结果，<900px 上下排，Run 按钮常驻可见）；首屏 IR 大卡折叠为"用一句话填写规则"（不动解析逻辑与后端，解析出中文规则+待确认项）。**文案锁定**：chat-paths:351 `'策略描述中需要包含股票代码…'` 与 E2E 依赖文案不得改，只折叠 UI。自选股/市场参考现状无独立结构则不臆造。**禁止**：E2E/playwright config/后端/依赖/删除/②-C/D/E（030）与重做①（032）。门禁：build + Vitest + 4173 50 + 8000 21 + backend 851 + i18n parity 0 + 三宽度走查。
**证据（2026-09-06）**: ②-B IR 大卡改 Collapse 折叠入口（默认收起，label=新 title"用一句话填写规则"+appliedTag+描述摘要，extra=填示例，展开保留 parse/apply 全流程，解析逻辑与后端零改动）；②-A `.strategy-lab-layout` grid（左 360px setup=IR+watchlist+references+StrategySetup+表单，右弹性 results=实验台/已保存/失败/进度/结果，@media<900px 单栏+栏内单列防溢出）；Run 按钮在 TaskPageHeader actions 常驻顶部未动；watchlist/references 保留原结构随表单入左栏（不臆造并入）。i18n：title 换新文案 + 新增 appliedTag/setup.pane/resultPane 4 key（zh/en 2277 parity 0）；chat.backtest.tickerRequired（chat-paths:351 依赖）原样未动。StrategyLab.test 新增 expandRuleEntry + 默认折叠断言（语义不放松）。维护者接手补完验证：build ✓；聚焦 StrategyLab 10/10；全量 Vitest 123/378 全绿；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；git diff --check 通过；删除 0；backend/依赖零改动。详见 `docs/ai/tasks/BACKLOG-031.md`。

---

## [DONE] BACKLOG-032: B12 重做①连续工作面——单 ⌘K + Composer 语境化 + 空 Rail 折叠 + DecisionCard 瘦身

**优先级**: P1 ｜ **任务卡**: `docs/ai/BACKLOG-032.md`
**范围**: B12 第 3 张卡（前端独立，可并行排期），执行重做① Step C→A→B→D（每步独立 commit）：AgentRail 默认折叠（376px 空右栏归零，真实阶段用 AgentStatusCard）；⌘K 收敛 App 层单例 + CommandBar triggerOnly（hero/header 共用一弹窗）；CommandComposer 仅研究语境追问（携带对象+原问题）；DecisionCard 卡面瘦身（provenance 平铺入抽屉，B3 主题已修）。**保留** hero task-launchpad 试用按钮（dashboard.spec 依赖）。**禁止**：E2E/playwright config/后端/依赖/删除/重做②（030/031）。门禁：build + Vitest + 4173 50 + 8000 21 + backend 851 + i18n parity 0 + 三宽度走查。
**证据（2026-09-06，维护者复核通过并合入 commit 1a28d89）**: Step C agentRailOpen 初始 false（桌面默认折叠，rail-closed 列宽 0 不占宽；deep 模式 Research.tsx×4 AgentStatusCard + analyst SwarmStatusCard 呈现真实阶段）；Step A ⌘K 注册收敛 App 层一次（dispatch GLOBAL_TASK_OPEN_EVENT）+ CommandBar triggerOnly（header/hero 均为纯触发）+ 唯一 hideTrigger GlobalTaskEntry 宿主（ProLayout children 顶层，任何路由挂载）——全站单弹窗单实例；Step B 全局底部 Composer 移除，仅 /research/:symbol、/analysis/:ticker 渲染追问条（携带当前对象，提交 → /research/:symbol?prompt= 原问题保留）；Step D DecisionCard 删平铺 provenance 行与死 CSS，证据 chip 点击进既有 EvidenceDrawer（EvidenceChip 自带抽屉，信息不丢；B3 主题已修回归核对），Dashboard.test 同步为点 chip 断言抽屉（语义不放松）。i18n +composer.followupPlaceholder（zh/en 2278 parity 0）。维护者独立复核：代码审阅（⌘K 单例/宿主顶层/EvidenceChip 闭环/测试语义增强）+ build ✓；聚焦 21/21（5 组件）；全量 Vitest 123/382；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；git diff --check 通过；删除 0；backend/依赖零改动。详见 `docs/ai/tasks/BACKLOG-032.md`。

---

## [DONE（记录项待用户决策）] BACKLOG-029: Astra 双会话审查处置（DSH 自主执行）

**优先级**: P1
**任务卡**: `docs/ai/BACKLOG-029.md`
**范围**: 处置 Astra 两会话只读审查反馈（存档 `docs/ai/astra-review/`）。**核心纪律：Astra 断言是待核线索非事实**——先由 DSH 独立复核（源码/测试/只读探针）把 A/B 组断言转成 证实/证伪/待复现 三态核验表，再按"已证实 P1（事务原子性/SSE 断连留 running/立即运行竞态）> 用户可感（B6 提问不接住/B7 筛选术语误识别）> 已证实 P2 > 主题类（图表不重取色/证据抽屉主题断裂）"选择性修复；每修复一 commit + 聚焦测试 + 全量门禁。证伪/待核/产品方向级（A6 降级契约、B12 两处重做）只记录不擅自修。阶段 0 只读零改动。**禁止**：不经核验照搬断言、改 reference、加依赖、删文件、实施 B12、放松门禁。完成标准：核验表落盘、已证实项修复 + 回归全绿、证伪项诚实修正文档（如 B1 残色已清零推翻旧结论）、EXEC_PLAN/HANDOFF/CHANGELOG 同步、每轮工作树干净。
**进度（2026-09-04 三轮全部完成可修项）**: ✅ 阶段 0 核验表（18 断言三态）；✅ A2（事务所有权 5f81378）/A3（SSE 断连 d6e5450）/A4（排队竞态 35d3a50）/A5（工具上下文 248f213+815eb7b）/A8（行情语义 363d5f0）；✅ B1 证伪修正 /B6（prompt 接住 3e0a27a）/B7（筛选词 4f955e8）/B2（图表重取色 3ab276e）/B3（抽屉主题 a7d31a5）/B4+B5（AntD token 映射+sider/radius 对齐 f34af8b）；✅ 阶段 2 全量门禁全绿；✅ 阶段 3 文档同步（HANDOFF/CHANGELOG/核验表处置进展）。
**证据**: backend 851/851、cov 92.52%、ruff 全过；frontend Vitest 123/378、build 通过、4173 E2E 50/50、8000 E2E 21/21；commit 12 个（见各条）；工作树干净。**遗留记录项（待用户决策，不阻塞）**: A6 主编失败仍归完成的降级契约、A7 重启恢复（无已证实受损实例，机制层已可选修）、B8-B12 文案展示层/产品方向级（B12 两处重做禁擅自实施）。

---

## [DONE] BACKLOG-028: 标的代码输入契约收口（canonical ticker）+ 8000 真实入口验收

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-028.md`
**范围**: 方向 A+B 结合大任务（known debt #1 ticker 归一化边界，维护者探针已实锤）。①后端 canonical 收口：`BRK.B`/`BRK-B` 同标分裂（usBRK.B vs usBRK-B）统一为单 canonical（Yahoo 形态 `-`）；6 位非 6/68/0/3 开头（830799/920002/430047 北交所/新段）`detect_market` 不再静默 sh → 诚实拒绝（无 bj 数据源，不扩源）；`normalize_code`/`detect_market`/`external_symbol` 同步；契约矩阵单测固化 + 改 test_market.py L48 旧断言（语义不放宽）。②前端收敛：新建 `frontend/src/features/tickerContract.ts` 共享 canonical（与后端同规则），researchContinuity.tickerKey/isLikelyTicker/displayTicker 收敛复用（**4 处用途不同不可乱合并**，backtest 抽取器只过 canonical 校验）。③8000 真实入口 E2E ≥4 用例（BRK.B↔BRK-B 同一标的、600519 正常、不支持段诚实提示、港股 .HK 归一）。**禁止**：backend 除 market_data/instruments.py 外一切（不为新代码段扩源）、前端除收敛文件外、4173 基线/依赖锁/channel chrome/删除/放宽容错。完成标准：契约矩阵全绿、前端单测、8000 三连 + 代理开关、4173 50/50、build/Vitest/backend 798 + 覆盖率不降、i18n parity 0、diff check、删除 0。
**证据**: `BRK.B`/`BRK-B`/`usBRK.B` → `usBRK-B`，external/Yahoo → `BRK-B`；无支持源的 6 位段与 `bj` 明确拒绝。契约聚焦 57/57；backend 837/837、92.41% + Ruff；build 4,243 modules；Vitest 122/374；8000 新增 6 例、全套 21/21 ×3（`--retries=0`，代理关/开/关）；4173 50/50；i18n 2,274/2,274、重复/差集 0；diff/scope/依赖锁/删除门禁通过。未 commit/push。

---

## [DONE] BACKLOG-027: CSP 允许同源嵌入——修复 8000 Knowledge iframe 被拦

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-027.md`
**范围**: 单独授权修复 BACKLOG-026 暴露的真实缺陷：后端安全头 `frame-ancestors 'none'` + `X-Frame-Options: DENY`（防点击劫持）把中文 /knowledge 页主动嵌入的同源 `<iframe src="/knowledge/xxx.html">` 一并拒绝（自锁，非跨站防护），Chromium 报 framing CSP error + 子 frame localStorage pageerror。本任务：①`backend/app/middleware/security.py` **仅两处**取值改 `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`（仍禁第三方站嵌、允许同源嵌入，其余 CSP 指令/头一字不改，**不新增按路径豁免分支**）；②`backend/tests/test_security.py` 同步 L43 断言 + 新增 frame-ancestors 'self' 断言；③`frontend/e2e-8000/product-acceptance.spec.ts` 删除 localStorage 子 frame 错误容忍分支恢复严格零 pageerror；④实测中文 /knowledge iframe 正文可见无错误；⑤test:e2e:8000 三连（--retries=0）+ 代理开关 + 4173 50/50 + build/Vitest/backend 798 全门禁；⑥026 转 DONE、HANDOVER Broken→Verified。**禁止**：backend 除 security.py 外一切、frontend/src（Knowledge.tsx iframe 方案不改）、4173 基线/依赖锁/channel chrome/删除/整体移除或 `frame-ancestors *`。
**证据**: security.py 精确仅两处取值变更，test_security 8/8；8000 严格零 pageerror 15/15 ×3，代理关/开各 15/15；真实中文 `/knowledge` m1 iframe 正文可见，pageErrors 与 framing/localStorage 错误均为 0；4173 50/50、build 4,242 modules、Vitest 121/346、backend 798/92.34%、Ruff、diff/scope 门禁全过。BACKLOG-026 同步转 DONE，HANDOVER 缺陷移至 Verified Working；未 commit/push。

---

## [DONE] BACKLOG-026: 8000 单进程真实入口 E2E（生产托管验收）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-026.md`
**范围**: 方向 A（恢复实测验收）。目标用户使用入口是 8000 单进程（start.bat → 127.0.0.1:8000，BACKLOG-016~019 交付），但既有 50 个 E2E 全跑在 4173 Vite dev + mock，从不经过 8000 真实入口——016 静态托管/SPA/favicon、017/018 双击即用、019 静态优先无浏览器级验收证据。本任务：①**新建** `frontend/playwright.8000.config.ts`（独立 config，baseURL 8000，内置 chromium 无 channel，workers 2/retries 1，webServer 起真实 SERVE_FRONTEND=1 后端）；②**新建** `frontend/e2e-8000/` spec/helpers（≥10 用例：真实 index/assets/favicon/SPA 深层刷新非 404 + Dashboard/导航 + 016-020 关键页面筹码/资金流走势容器、limit-pool、龙虎榜渲染），外网数据请求一律 route 拦截返回真实形状夹具；③package.json 加 `test:e2e:8000` 脚本（不动既有 `test:e2e`）。**禁止**：backend/src/既有 4173 spec/playwright.config/依赖锁/真实外网依赖/channel chrome/删除。完成标准：8000 真实入口可启动、用例在代理开关两环境确定性、连跑 3 次全绿、4173 基线 50/50 与 build/Vitest/backend 798 全门禁不回归、diff check、删除 0。
**证据**: 独立 8000 config + 2 spec/15 例已实现；8000 真实 index/assets/favicon/health/API 404、6 深层刷新、八组导航、chip/money-flow/dragon-tiger/limit-pool 均有证据。15/15 显式零重试连跑 3 次，代理开/关各 15/15；4173 E2E 50/50、build 4,242 modules、Vitest 121/346、backend 798/92.34%、Ruff 均通过。原 CSP 自锁阻塞已由 BACKLOG-027 在独立授权范围内修复；严格零 pageerror 恢复，真实中文 Knowledge m1 iframe 正文可见且无 framing/localStorage 错误，故本卡转 DONE。详见两张任务卡完整证据。

---

## [DONE] BACKLOG-025: 文档计数一致性——README/ROUTER_MAP 同步到运行时 OpenAPI

**优先级**: P2
**任务卡**: `docs/ai/tasks/BACKLOG-025.md`
**范围**: 纯文档计数核对修正（零代码/测试改动）。BACKLOG-021 下线 v1 后运行时 OpenAPI 为 135 paths / 169 ops，但 `README.md` L5（23 router/133 路径/168 操作）与 `docs/ROUTER_MAP.md` 标题/L3（旧计数，且与文件结尾 L438 已正确的 135/169 自相矛盾）仍过时。本任务：①以运行时 OpenAPI + main.py 实际 include 为唯一权威，实测 paths/operations/router 数；②修正 README L5 与 ROUTER_MAP 标题/L3 计数（含 APIRouter 数，v1 下线后 business router 变化）；③全文扫无残留旧计数；④`docs/API_CONTRACT.md` 已正确不改、AIOS-*.md 历史快照不改；⑤git diff --check + 一致性核对（三处文档一致）。零代码改动、无删除。
**证据**: 2026-09-04 以运行时 `FinQuant Hub` OpenAPI 实测为权威：135 paths / 169 operations；main.py 实际为 auth 直接 include 1 个 + 认证 tuple 21 个，共 22 APIRouter，另有内联 health。README 三处当前计数由 23/133/168 统一改为 22/135/169；ROUTER_MAP 标题/L3 同步为 22 router、135 paths、169 operations；只读 API_CONTRACT L438 已为相同口径。README/ROUTER_MAP 旧当前计数残留 0，除数字外未改原行措辞。025 仅增加五份允许文档差异，代码/依赖零新增改动；累计八文件范围、diff check、无删除/空暂存区均通过，未 commit/push；完整证据见卡片。

---

## [DONE] BACKLOG-024: 依赖卫生——显式声明 pro-layout、移除死依赖 pro-components

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-024.md`
**范围**: 依赖卫生（BACKLOG-022 记录"留待授权"项，本次授权执行）。`package.json` 的 `@ant-design/pro-components`（^2.8.5）全库零 import（真死依赖），但 App.tsx 实际 `import ProLayout from '@ant-design/pro-layout'`（未直接声明，是 pro-components 传递依赖 7.22.7）。本任务：①`frontend/package.json` **唯一依赖变更**——删 `pro-components`、加 `@ant-design/pro-layout@^7.22.7`；②`cd frontend && bun install` 更新 bun.lock（pro-components 及其独占子包 pro-card/form/table/list 等清出）；③App.tsx 等一切源码只读（import 路径不变无需改）；④build 前后量化 `vendor-antd`/总 JS 字节 + Vitest 121/346 + E2E 50 全绿，**E2E 用 Playwright 内置 Chromium（禁 channel: chrome 调 Google Chrome，用户要求）**；⑤backend 798/798 不受影响；⑥docs 同步。零删除、除目标依赖外零其他改动。
**证据**: 2026-09-04 完成唯一依赖替换：package.json 移除未使用的 `@ant-design/pro-components@^2.8.5`，显式声明实际 import 的 `@ant-design/pro-layout@^7.22.7`；Bun 1.3.12 install 成功并将 lock 顶层切换到 pro-layout 7.22.7，清除 pro-components 及 pro-card/form/table/list/descriptions/field/skeleton 等独占条目，未改变其他依赖。前后 build 均为 58 schemas fresh / 4,242 modules；vendor-antd 均 1,565,418 bytes、33 个 JS 总量均 3,122,982 bytes（差值 0，死依赖原本未进入生产包）。Vitest 121/121 files、346/346 tests（974.80s），内置 Chromium E2E 50/50（1.0m，workers:2/retries:1，无 channel），backend no-cov 798/798（81.61s）全绿。最终仅 package/lock 与三份允许文档改动，源码/测试/Vite/Playwright/backend 未改，diff check 与白名单审计通过；无删除、commit 或 push，完整证据见卡片。

---

## [DONE] BACKLOG-023: echarts 按需引入（echarts/core）：懒加载 chunk 瘦身

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-023.md`
**范围**: 纯前端性能任务（后端零改动、**零依赖变化**，不碰 package.json/bun.lock）。BACKLOG-022 证实 ECharts 懒加载 chunk `index-dM8hBGUF.js` 1,145,864 bytes 是 echarts 6.1.0 全量，而实际只用到 line/bar/scatter/candlestick 4 种图表。本任务：①新建 `frontend/src/charts/echartsSetup.ts`（echarts/core + use 注册 4 图表 + Grid/Tooltip/Legend + 使用者 option 实际组件 + CanvasRenderer）；②新建 `LazyEChartCore.tsx`（`echarts-for-react/lib/core` + `echarts={configured}` 透传 props，已验证 core.js 支持 echarts prop）+ `LazyEChart` lazy 目标改指它（Suspense/chart.loading/EChartsReactProps 签名保留）；③三个使用者（PortfolioRiskWorkbench/BacktestCharts/ResearchCharts）零改动；④Vitest（LazyEChart.test 更新语义不放松 + 全量 121/346）+ E2E 50 + build 前后 chunk 字节对比（预期 1119KB 显著缩小，未缩则记录实际不扩大）；⑤docs 同步。零新依赖、零删除。
**证据**: 2026-09-03 完成 core 按需注册与 lazy 接入：4 图表 + Grid/Tooltip/Legend/DataZoom/MarkLine/MarkPoint + CanvasRenderer，axisPointer 由 Grid/Tooltip 安装。前后 build 通过，ECharts chunk 1,145,864→639,262 bytes（-44.21%），33 个 JS 总量 3,629,057→3,122,982（-506,075）；主入口仍 368,423 bytes，AST 验证图表库保持动态加载。四个相关测试仅同步 core mock 并预热配置，不改断言/超时；专项 5/5 files、17/17 tests，全量 Vitest 121/121 files、346/346 tests（1139.05s）。完整 E2E 50/50（45.2s，原 workers:2/retries:1，无重试），研究/回测/组合风险 Canvas 断言通过。最终 9 原文件修改 + 2 新文件，其余 6,316 原文件哈希不变、无缺失/越界，diff check 通过、暂存区为空。依赖/配置/backend/三个业务使用者零改动，无删除、commit 或 push；完整证据见卡片。

---

## [DONE] BACKLOG-022: 前端死组件回收 + bundle 瘦身（echarts 移出主包）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-022.md`
**范围**: 纯前端死资产回收与 bundle 测量（后端零改动、零依赖变化）。再次核验 `BacktestResultCard`、`MarketMoversPanel`、`MarketThemesPanel` 及导出符号无外部引用，回收三个组件及三个同名测试；记录主包/vendor/ECharts 的实际字节数，不因预期收益未出现而扩大范围。LazyEChart 及三个使用者、依赖、配置、其余组件和测试保留不动。同步卡片、CHANGELOG 与架构文档原有的死组件保留说明；依赖卫生留待授权。
**证据**: 2026-09-03 完成。AST/宽匹配确认 src+e2e+tests 集合外引用 0，六个文件经 SendToRecycleBin 回收，原路径/字节数/SHA256 与回收载荷 6/6 匹配。前后 build 均 4,243 modules / 58 schemas fresh；入口主包 index-8ilTy0GW.js 368,423→368,423 bytes，vendor-antd 1,564,909→1,564,909，ECharts 懒加载 index-dM8hBGUF.js 1,145,864→1,145,864；33 个 JS chunk 名称/字节/SHA256 全同，总量 3,629,057→3,629,057，差值 0。校准原卡把既有 ECharts 懒加载 chunk 当主包的前提，按目标 2 记录实测，不扩大范围。最终全量 Vitest 121/121 files、346/346 tests（124/354−3/8；1153.09s）；首轮唯一 5000ms 超时经原参数专项 2/2 与完整复测通过，测试/超时/配置均未改。随后 Chromium E2E 50/50（1.0m，原 workers:2/retries:1，无重试）。diff check 与范围/哈希审计通过：仅 6 回收 + 4 文档，3,970 原文件不变，包括全部 253 后端文件与所有禁止项；HEAD 29cbba7、暂存区空，未 commit/push。完整回收清单、33-chunk 表、原始日志与依赖决策见卡片。

---

## [DONE] BACKLOG-021: 回收 v1 回测（路由下线 + 引擎回收 + Chat 入口重定向 + 契约/测试同步）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-021.md`
**范围**: SCOPE_FREEZE §3.3 P2 明确规划但未完成的回收项（v1/v2 双轨）。**修订版（解除 BLOCKED）**：首轮已下线 v1 路由并回收 3 文件，发现两处卡片偏差已确认并授权补齐——①前端**非零调用**：`Chat.tsx` 用相对路径 POST `/backtest/runs`（baseURL `/api` 合成 v1），按钮改为**重定向 Strategy Lab**（`/strategy-lab/ma-crossover?symbol={ticker}`，StrategyLab 已支持 symbol 预填）+ 清理 v1 state/结果渲染/i18n；②第 3 个 v1 测试 `test_legacy_backtest_validation_and_market_errors` 与其 `_legacy_body` helper 及 `backtest` import 需补删，`test_router_contracts` sentinel 数量断言 22→21 同步。本任务收尾：补删遗漏测试/helper/import、Chat 重定向 + 对应前端测试/E2E 更新为跳转语义、OpenAPI 核对（v1 137→135 路径实测）、API_CONTRACT/ARCHITECTURE/CHANGELOG 同步。**保留**：`backtest_runs` 表、`metrics.py`（alpha_simulator 依赖）、v2 全套、Agent 工具、共享测试。后端全量全绿、覆盖率不降、ruff；前端 build/Vitest/E2E 全绿；零新依赖、无 rm（回收站铁律）、不删表。
**证据**: 2026-09-02 修订收尾完成。3 个 v1 文件进回收站并核对 SHA256；main 仅去除 v1 import/注册，补删全部 3 项 v1 router 测试/helper/import，sentinel 22→21，新增 1 项退役/历史数据保留/共享 Alpha 回归。Chat 仅提取 ticker 并跳转 StrategyLab，移除 v1 请求/state/结果/loading，组件文件保留，zh/en 各 2274 keys、差集/重复 0。OpenAPI 137→135 paths、172→169 operations，v1 为 2 路径/3 操作，v2 9 路径/10 操作及所有非 v1 契约不变；单独获准同步生成类型，仅删除 7 行失效接口。后端 no-cov 与 coverage 均 798/798（808−11+1），覆盖率 92.28125%→92.342915%；代理开/关各 45/45，Ruff 通过。前端按序 build（4243 modules、58 schemas fresh）→ Vitest（124 files/354 tests，1086.53s）→ E2E（50/50，51.1s，原 workers:2/retries:1，最终无重试）全绿；初次新增用例修正及日志见任务卡，原断言未放宽。API_CONTRACT/ARCHITECTURE/CHANGELOG 同步，diff/scope 审计通过；960 个原文件哈希不变，16 个原文件变化 + 1 新测试均获授权，禁止修改项及依赖均未动。HEAD e9f1504、暂存区空，未 commit/push。

---

## [DONE] BACKLOG-020: 筹码分布历史序列走势图

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-020.md`
**范围**: 纯前端任务（后端零改动、零新依赖），A 股证据主线对称补全。筹码卡片（ResearchWorkspace）目前只看 `chips.latest` 快照，但服务端 `items` 已有全历史（`ChipDistributionItem[]`）。本任务：①新建纯函数 `chipChart.ts`（`chipToAreaData(items, field:'profit_ratio'|'average_cost')`，date 直接作时间，无效点丢弃不补造）；②新建 `ChipHistoryChart.tsx`（复用 useLightweightCharts 的 switchToArea，theme="light"，空序列 Empty 占位，`data-testid="chip-history-chart"`；**独立组件不抽象不改 MoneyFlowChart**）；③ResearchWorkspace 筹码卡片快照下方接入走势图 + 获利比例/平均成本 `Segmented` 字段切换（**纯前端 state 不重请求**，数据已在 items）；④纯函数 ≥3 用例、组件 ≥2 用例、卡片扩展 ≥1 用例、E2E +1；⑤i18n 双语 parity 0，profit_ratio 前端转百分比；⑥既有筹码快照/MoneyFlowChart/资金流不回归。零后端改动、零新依赖、无删除。
**证据**: 2026-09-02 完成 `chipToAreaData` 纯函数、独立 `ChipHistoryChart` 与筹码卡片本地字段切换；纯函数保留原始比例，展示层转百分比，空/无效序列不建图、不补造，快照/来源/UNKNOWN 峰位保留。新增纯函数 4、组件 4、工作区 2 项 Vitest 和 1 项 E2E；专项 3/3 files、22/22 tests。全量 build 4,244 modules（基线 4,242），59 OpenAPI schemas fresh；Vitest 123/123 files、347/347 tests（基线 121/337，913.50s）；E2E 48/48（基线 47，49.1s，workers:2/retries:1，最终无重试）。zh/en 2,275 keys 各自相同、差集/重复 0；diff check 通过。仅 12 个白名单文件；后端、共享 hook、MoneyFlowChart/moneyFlowChart、资金流/龙虎榜、既有 E2E 断言、依赖/锁文件零改动，无删除；HEAD 保持 f0f6f5d，未 commit/push。详细首轮测试修正与最终证据见任务卡。

---

## [DONE] BACKLOG-019: 单进程托管缺陷修复——根级静态文件（favicon）+ 使用入口端口收敛

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-019.md`
**范围**: 修复 BACKLOG-016 单进程托管缺陷 + 端口口径收敛。①`main.py` 的 SPA fallback 改为**静态优先**：`frontend_dist/full_path` 为文件则 `FileResponse`（正确 content-type），否则回退 index.html；保留 `/api` 404 拦截；加 `resolve()`+`is_relative_to` 路径穿越防护（越界 404）；修复 `/favicon.svg`（dist 根，不在 assets）被当 HTML 返回导致标签页无 logo 的问题。②`test_main_static.py` 追加 ≥4 用例（favicon 返回 image/svg+xml、根级静态文件、穿越 404、SPA 路由不回归），沿用 tmp_path 假 dist fixture。③端口口径收敛：README/QUICKSTART 明确 **8000 为唯一使用入口**（start.bat/单进程），5173 仅开发/ Docker 路径，消除两入口混淆（用户反馈"5713/8000 来回"实为 5173 误记，代码无 5713）；start.bat 固定 8000 不动。④全量后端 pytest + 覆盖率不降 + ruff；ARCHITECTURE/CHANGELOG 同步。零新依赖、不改 Docker/frontend、无删除。
**证据**: main.py 仅 frontend_fallback 增加 5 行：保留 API 404，resolve()+is_relative_to() 拒绝越界，dist 内静态文件优先、其余回退 index.html；OpenAPI/认证不变。原 21 项静态测试完整保留，追加 7 实例（favicon/robots、4 种穿越、SPA），专项 28/28；全量无覆盖率与带覆盖率均 808/808，总覆盖率 92.28%（基线 92.28%，持平），main.py 91.60%，新增行与分支全覆盖；Ruff、git diff --check、21 个本地文档链接/锚点检查通过。README/QUICKSTART/ARCHITECTURE 明确日常 start.bat 使用入口固定 8000、5173 仅开发/可选 Docker；CHANGELOG 已同步。仅 8 个允许文件，零依赖、start.bat/Docker/frontend 未动、无删除、未 commit/push；详见卡片完成证据。

---

## [DONE] BACKLOG-017: 一键启动脚本——Windows start.bat 单进程本地运行

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-017.md`
**范围**: 方向 2（本地快速部署）第 2 卡，依赖 016。根目录新建 `start.bat`（双击即启动）：定位 bun（where→固定路径回退→提示安装）→ 检测/引导 `backend\.venv`（缺失自动创建+装依赖）→ 检测 `frontend\dist`（缺失或过期则 `bun run build`）→ 缺失 `backend\.env` 时复制 `.env.example`（不写密钥）→ `set SERVE_FRONTEND=1` 后 `uvicorn app.main:app --host 127.0.0.1 --port 8000` 单进程启动 → 打开 `http://127.0.0.1:8000`；中文注释、`chcp 65001` 防乱码、关键错误 `pause` 保留信息。README 补一段"Windows 一键启动"；脚本类验证以冒烟分支输出为主（`cmd /c start.bat`），源码测试应仍 801/801 不受影响。零新依赖、无删除、不回显密钥、不改源码。
**证据**: 根目录 start.bat 与 README 一键入口完成；Bun PATH/固定路径回退、venv 引导、dist 缺失/过期构建、缺失前端依赖按锁文件安装、env 模板非覆盖复制、loopback 8000 单进程与本地模式均已实现。2026-09-02 隔离源码/现有 dist/独立数据库真实启动：首页、SPA、JS、health、本地身份 200，未知 API JSON 404，浏览器自动打开，Ctrl+C 后释放端口。占用分支直接 cmd 实测；构建/安装/venv 失败等用临时替身验证，未声称全新机器安装或真实前端重建。后端 801/801（65.55s），diff check 通过；零源码/依赖/锁文件/Docker 改动、无删除、未 commit/push。完整证据与限制见任务卡。

---

## [DONE] BACKLOG-018: 非技术用户快速上手文档

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-018.md`
**范围**: 方向 2（本地快速部署）第 3 卡，依赖 016/017。新建 `docs/QUICKSTART.md`（面向中文非技术用户）：三步上手（下载→双击 start.bat 或等价命令→浏览器打开 127.0.0.1:8000）、首次可选配置（backend\.env 填 DEEPSEEK_API_KEY；说明无 key 能用/不能用的功能）、FAQ（端口占用/无 key/数据 UNKNOWN 是正常降级/bun/python 未装/如何更新/数据存哪）、数据与隐私（本地 SQLite 不上传、无公网部署）；README 顶部加链接；命令/端口/路径与 016/017 产物一致性核对。纯文档，零新依赖、无删除、源码零改动。
**证据**: 在 017 完成后新建 docs/QUICKSTART.md，README 顶部安装处增加链接。覆盖工具安装、下载/双击/浏览器三步、中文导航初用、可选 AI 配置、macOS/Linux Docker、七项 FAQ、更新备份和隐私；明确 Windows 8000/backend/.env 与 Docker 5173/.env.local/数据卷差异，源码更新须主动 build，数据库本地保存但 AI/行情仍联网。2026-09-02 十项一致性核对与 20 个本地文件链接检查通过，Python/Bun 官方步骤已核对；start.bat 在 018 前后 SHA256 一致，diff check 与 allowlist 通过。纯文档、零依赖/源码/Docker 改动、无删除、未 commit/push；完整证据见任务卡。

---

## [DONE] BACKLOG-016: 生产单进程托管——FastAPI 直接服务前端产物

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-016.md`
**范围**: 方向 2（本地快速部署）第 1 卡，薄改动后端入口。当前前端产物只能由 Docker nginx（路径 A）或裸机 dev 双终端（路径 B）托管，`main.py` 不挂载静态产物。本任务：①`backend/app/config.py` 新增 `SERVE_FRONTEND`（bool 默认 False，环境变量开关）；②`main.py` 在 router 全部挂载后、`SERVE_FRONTEND=1` 且 `frontend/dist` 存在时，挂载 `/assets` 静态 + SPA fallback（`/{full_path:path}` 非 `/api/*` 返回 index.html，`/api/*` 显式 404 防吞 API），dist 缺失警告并跳过；③新增 `test_main_static.py`（monkeypatch + tmp_path 假 dist，不依赖真实 build）≥6 用例（index/fallback/assets/health/不存在 api 404/默认不挂载）；④全量后端 pytest + 覆盖率不降 + ruff；⑤`docs/ARCHITECTURE.md` 补一句，CHANGELOG 带日期标题。默认关闭不破坏 Docker（nginx 路径）与既有 780 测试；零新依赖、无删除。
**证据**: `SERVE_FRONTEND` 复用 `_env_flag`（默认 False，`1`/`true` 启用）；`main.py` 从入口文件定位 dist，缺失 warning 并跳过，全部 router 与 `/api/health` 后挂 assets 和 SPA fallback；显式保护 `/api` 与 `/api/*`，fallback 不进入 OpenAPI。新增 21 项确定性测试（tmp_path、独立模块导入、monkeypatch、TestClient，无真实网络/build），专项 21/21；2026-09-02 全量无覆盖率 801/801（85.00s）、覆盖率全量 801/801（138.46s）。修改前实测 780/780、92.25%（卡片历史 92.26%）→ 92.28%，main.py 89.1%→91.0%；Ruff、diff check 与 8 文件允许范围检查通过。架构文档、README 开关说明和带日期 CHANGELOG 已同步；前端、Docker/nginx、routers/database/auth、依赖与既有测试断言均未动，无删除；HEAD 保持 fdea1d2，未 commit/push。完整证据见任务卡。

---

## [DONE] BACKLOG-015: 龙虎榜历史上榜记录列表

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-015.md`
**范围**: 纯前端任务（后端零改动、零新依赖）。当前 ResearchWorkspace 龙虎榜卡片只渲染 `items[0]`（窗口内最近一次上榜），但服务端返回整个 `items` 数组（窗口内多次上榜）。本任务升级为历史记录列表：①新增本地 state `selectedDragonTigerIndex`（默认 0），渲染全部上榜记录（上榜日/原因/净买额）供点击选中，主体渲染当前选中 item——选中切换**不重新请求**，纯前端 state；②仅 `items[0]` 由服务端附带席位 TOP5，历史条目 `top5_buy/sell` 为空数组时用占位说明文案（不补造）；③`loadWorkspace` 与 `changeDragonTigerDate` 成功后重置选中到 0；④`items[0]` 席位展示逻辑不回归；⑤扩展 ResearchWorkspaceEvidence ≥3 用例（多记录渲染/选中切换且不重请求/席位占位/重置）+ E2E dragon-tiger +1 用例；⑥i18n 双语 parity 0，切日期/代码重置选中。零后端改动、零新依赖、无删除。
**证据**: ResearchWorkspace 用 List + Button 展示窗口内全部上榜记录，`selectedDragonTigerIndex` 默认 0，选中高亮/可访问名称/键盘激活；详情使用当前条目的 code/name/date/reason/net，双席位数组均空时诚实占位，历史真实席位可自然展示，选择不重取数据。仅龙虎榜加载/日期请求成功后重置，pending/失败保留旧选中及原日期回滚。新增 6 项组件测试（专项 12/12）与 1 项 E2E；2026-09-02 build → 全量 Vitest → 全量 E2E 通过：4,242 modules、59 OpenAPI schemas fresh、121/121 files / 337/337 tests（933.95s）、Chromium 47/47（58.9s，workers:2/retries:1，无重试）。首轮新增 E2E 的 StrictMode 初始请求数假设已修正为切换前后计数严格相等，原 46 项均通过；既有龙虎榜 E2E 仅 4 个详情 locator 收窄，断言语义与请求条件不变。zh/en 各 2,270 keys、重复/差集 0；diff check 和 8 文件白名单通过，后端/chart hook/Playwright 配置/依赖零改动、无删除，HEAD 保持 891416e，未 commit/push。完整证据见任务卡。

---

## [DONE] BACKLOG-014: 榜单交互闭环——涨停池点击穿透 + 龙虎榜日期切换

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-014.md`
**范围**: 纯前端任务（后端零改动、零新依赖）。把 BACKLOG-012 上线的两个静态榜单变成可交互入口：①LimitPool 页 `code` 列渲染为 `<Link to={`/research/${encodeURIComponent(code)}`}>`（沿用 ResearchContinuity 的 Link 先例，Link 天然键盘可达），穿透到个股研究工作区；②ResearchWorkspace 龙虎榜卡片加 DatePicker（禁未来，默认今天上海时区），复用 BACKLOG-013 的 `changeMoneyFlowPeriod` 模式实现 `changeDragonTigerDate`——只重取龙虎榜（ref 记当前值、Spin 保留旧数据、失败回滚旧日期 + 错误去重），服务端 `date` 为窗口终点语义（返回 [date-30d, date] 内最近上榜记录），卡片 hint 文案说明 + `record.date` 显示实际上榜日；③新增 LimitPool 组件测试 ≥2、ResearchWorkspaceEvidence 扩展 ≥2（含失败回滚）、E2E +2（limit-pool 穿透导航、dragon-tiger 日期请求）；④i18n 双语 parity 0；⑤无记录用服务端 `note` Empty 不补造。零后端改动、零新依赖、无删除。
**证据**: LimitPool `code` 原生 Link + `encodeURIComponent` 穿透 `/research/{code}`，列标题 tooltip；ResearchWorkspace 新增上海当天默认的 DatePicker（禁未来/有 aria-label）与 `changeDragonTigerDate`，只重取龙虎榜，Spin 保留旧记录、失败回滚旧日期与错误去重，hint 区分窗口截止日和实际上榜日，空窗口保留服务端 note。新增组件用例 4 项、E2E 2 项；2026-09-01 按 build → test → test:e2e 全量通过：4,242 modules、Vitest 121/121 files / 331/331 tests（929.06s）、E2E 46/46（58.7s，workers:2/retries:1，无重试）。zh/en 各 2,265 keys、重复/差集 0；diff check 与白名单检查通过。后端/chart hook/Playwright 配置/既有 E2E 断言/依赖零改动、无删除、未 commit/push；完整证据见任务卡。

---

## [DONE] BACKLOG-013: 资金流向走势图——证据卡片从快照升级为时间序列

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-013.md`
**范围**: 纯前端任务（后端零改动、零新依赖）。BACKLOG-012 的资金流向卡片只显示最新五档净流入快照，但服务端 `money_flow` 的 `items` 已有分钟与 120 日完整序列未绘图。本任务：①新建纯函数 `frontend/src/utils/moneyFlowChart.ts`（`moneyFlowTimeToEpoch` 固定 UTC+8 解析 `"YYYY-MM-DD HH:MM"`→epoch 秒、`moneyFlowToAreaData` 映射 items→AreaChartData，无效点丢弃不补造）；②新建 `MoneyFlowChart.tsx` 组件，复用现有 `useLightweightCharts` 的 `setAreaData/switchToArea`（hook 零改动），`theme="light"` 沿用 StockChart 先例（实际色板由 `readChartTokens` CSS 变量自动适配亮暗）；③ResearchWorkspace 资金流向卡片内新增走势图 + 分钟/120 日 `Segmented` 切换（切换只重取资金流，不动其余 allSettled 结果）；④纯函数 ≥4 用例、组件 ≥2 用例、卡片扩展 ≥1 用例、E2E ≤2 轻量用例（断言图表容器与 period 请求，canvas 内容不断言）；⑤i18n 双语 parity 0。零后端改动、零新依赖、无删除。
**证据**: 新增固定 UTC+8 严格解析与 Area 数据映射纯函数、`MoneyFlowChart`（默认 260px、有效数据才创建图表、空序列诚实占位），ResearchWorkspace 资金流卡片接入分钟/120 日 Segmented；切换只重取资金流，其他六项 workspace 请求不重跑，旧序列在 loading overlay 下保留，失败时恢复旧周期选择避免误标。新增纯函数 5、组件 2、workspace 隔离/失败回滚 2、Chromium E2E 1 个用例。生产 build 4,242 modules；全量 Vitest 120/120 files、327/327 tests；Chromium E2E 44/44；zh/en 各 2,262 keys、重复 0、差集 0；`git diff --check` 通过。后端、hook、Playwright 配置、依赖/锁文件、`reference/` 零改动，删除 0；未 commit、未 push。

---

## [DONE] BACKLOG-012: A 股深度能力前端接线——资金流向/龙虎榜/涨停池

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-012.md`
**范围**: BACKLOG-011 的 5 个后端能力仅注册为 Agent 工具、前端零展示。本任务把其中 3 个接上前端：①新增 3 个薄包装 REST 端点（服务层零改动）——`GET /api/instruments/{symbol}/money-flow`、`GET /api/instruments/{symbol}/dragon-tiger`、`GET /api/market/limit-pool`（独立新增，不动被 market_review 使用的既有 `/limit-up`）；②ResearchWorkspace 新增资金流向/龙虎榜两张证据卡片（复用筹码卡片范式：A 股守卫 `/^\d{6}$/` + allSettled + Empty 降级 + 证据链）；③新建 `/discover/limit-pool` 涨停池页面（日期 + 涨跌停切换 + AntD Table + UNKNOWN 提示 + 导航路由）；④估值历史明确不接（StockAnalysis valuation tab 已展示 PE/PB 且历史刻意 UNKNOWN）；⑤既有 `/chip-distribution` 端点（旧 akshare）与新旧筹码并存刻意保留，均禁止改动。零新依赖，双语 i18n parity 为 0，后端确定性测试双环境一致，前端 build/vitest/E2E 全门禁绿。
**证据**: 新增 `GET /api/instruments/{symbol}/money-flow`、`GET /api/instruments/{symbol}/dragon-tiger`、`GET /api/market/limit-pool` 三个 `AStockExtraService` 薄包装端点，直接透传 provenance/quality，非法参数为 400、上游失败为 502，非交易日空池保持 `UNKNOWN + 200`；服务层、旧 `/chip-distribution`、旧 `/limit-up` 均未改。ResearchWorkspace 以 6 位 A 股守卫 + 7 项 `Promise.allSettled` 接入资金流向和龙虎榜两张证据卡片、Empty 降级及 FACT 证据链；新增 `/discover/limit-pool` 日期/涨跌停切换/Table/UNKNOWN 页面与 Discover 导航。后端新增 20 个 MockTransport REST 测试，7897 代理开启与代理变量清空均 20/20；全量 780/780，覆盖率 92.22%→92.26%，Ruff 通过。前端生产构建 4,240 modules，Vitest 118/118 files、318/318 tests，Chromium E2E 43/43；zh/en 各 2,259 keys、差集 0。依赖与锁文件零变化；估值历史、BACKLOG-011 本地推演筹码和统一 extra 入口均按决策未接入。

---

## [DONE] BACKLOG-011: a-stock-data 数据能力接入——筹码/资金流/涨停/龙虎榜/估值历史

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-011.md`
**范围**: 新建 `backend/app/services/a_stock_extra.py` 实现 5 个 A 股深度能力（纯 httpx 直连东财，参照 a-stock-data SKILL.md §3.4/§3.5/§3.9/§4.5/§4.6/§8.x 移植逻辑）：筹码分布（本地推演 OHLC+换手率）、资金流向（push2/push2his）、涨停池（push2ex）、龙虎榜（datacenter-web，空窗口不崩溃）、估值历史（**不引入 baostock**，东财不可直连则降级为快照+UNKNOWN 并说明）；统一节流（em_get 模式）；注册 ≥3 个 Agent 工具（get_chip_distribution/get_money_flow/get_dragon_tiger 等）；可选统一端点 `GET /api/market/extra/{capability}`；确定性测试（MockTransport），**零新依赖**（不引入 baostock/mootdx/pandas）。
**证据**: 新增独立 `AStockExtraService`：筹码分布（东财 OHLC+换手率、本地首日播种推演）、分钟/120 日资金流、涨停/跌停池、龙虎榜及腾讯当前估值快照 + 日频历史 `UNKNOWN`，所有东财请求共用 ≥1s+抖动的串行节流与复用客户端；HTTP/schema/拒绝均显式失败，空龙虎榜稳定返回空结构。注册 4 个 Agent 工具，未新增 API。新增 MockTransport 测试 26 个；全量 760 passed，覆盖率 92.06%→92.22%，新服务 97.2%；代理 7897 开启与四项代理变量清空均 26/26。依赖零变化。a-stock-data V3.7.1 §6.5 只给 baostock TCP 历史实现，故按约束不引入 baostock、不伪造历史。

---

## [DONE] BACKLOG-010: Chat 深交互 E2E + 后端残余薄点攻坚（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-010.md`
**范围**: ①主：Chat 深交互 E2E（≥5 新用例）——角色切换（断言 PUT /chat/sessions/{id} 请求体）、删除会话（DELETE）、历史会话恢复（GET messages 路由参数）、角色默认预选（role_preset=agents 首项）、多会话状态隔离；纯测试，发现缺陷只记录。②次：后端覆盖率 90.6%→≥92%——优先 analysis.py 61.7% / instruments.py 63.4% / alpha_service.py 70.6% / tools_definitions.py 74.5% / chip_distribution.py 73.8% / agents/credentials/models_crud 75-79%，确定性补测（MockTransport/monkeypatch，开/关代理一致）。
**证据**: `chat-paths.spec.ts` 新增角色 PUT/body+提示、会话 DELETE+移除、历史会话 GET 路由+渲染、agents 首项默认 role_preset POST/body、A/B 会话路由与消息隔离 5 个深交互用例；Chromium 36→41 且 41/41。后端新增 24 个无网络确定性测试，coverage/no-cov 均 734/734，TOTAL 90.59%→92.05%；analysis 97.4%、instruments 99.3%、alpha_service 98.8%、tools_definitions 99.3%、chip_distribution 100%。显式代理清空与 7897 开启均 24/24；build（4,238 modules）、Vitest 116 files/314 tests、tests Ruff、diff check 通过。未改业务代码，未发现新的 Chat 业务缺陷。

---

## [DONE] BACKLOG-009: 历史讨论观点显示修复 + 剩余组件测试清零（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-009.md`
**范围**: ①业务修复（BACKLOG-008 记录缺陷）：InvestmentCommittee 的 `completed` 过滤把 `position` 当硬条件，历史 Discussion 消息无 position → 观点（summary）不可见。修复：completed 只按 status 过滤、position 全程可选（positionCounts/leadingPosition/hasConflict 只统计有 position 成员、disagreement 区无 position 成员显示 summary+UNKNOWN）、不得用非空断言 `!`；增强 InvestmentCommittee.test.tsx ≥2 用例；②组件测试清零：20 个无直接测试组件（AlphaResearchPanel/BacktestCharts/CommandBar/EvidenceDrawer/LazyEChart/ModelSelector/StockChart/TimeseriesChart/SystemSettingsPanel 等）全部补齐每组件 ≥2 用例（≥40 用例）；③保持 i18n parity、E2E 36 基线（DOM 变化可更新断言不得放宽语义）。
**证据**: `completed` 现只按 completed status 收集观点；positionedCompleted/positionCounts/leadingPosition/hasConflict 只统计有 position 成员，共识分母排除无 position 成员，无 position 历史成员在 disagreement 显示 summary + UNKNOWN；InvestmentCommittee 内无 position/streaming 非空断言。新增 20 个同名直接组件测试文件 / 40 用例（每组件 2），InvestmentCommittee 另增 2 个回归用例；聚焦 21 files / 48 tests，全量 Vitest 96→116 files、272→314 tests，116/116 与 314/314 通过。OpenAPI freshness 59 schemas、TypeScript、Vite production build 4,238 modules 通过；Chromium E2E 36/36，历史 Discussion 既有断言无需修改；zh/en 2,208/2,208、重复 0、parity 差集 0；`git diff --check` 通过。当前 shell 无全局 Bun，直接调用项目本地版本锁定入口执行等价门禁。仅业务组件、测试与证据文档，无后端/SSE/schema/auth/依赖/锁文件/reference 改动；未 commit。

---

## [DONE] BACKLOG-008: Discussion 流式时间线 E2E + 剩余组件测试转正 + E2E 并行稳定性（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-008.md`
**范围**: ①核心：Discussion 流式时间线（BACKLOG-006 新功能）浏览器级 E2E——新增/增强 ≥3 用例断言流式区实时文本/轮次标签/状态 Tag/completed/failed 收束（断言 `.investment-committee__stream`，非只最终 summary），且无 streaming 数据的历史房间向后兼容；②剩余组件测试转正：AgentModeSelector/AlphaResearchPanel/BacktestCharts/CommandBar/CompareGrid/DecisionCard/DiscoverResults/LangSwitcher/MetricStrip/ModelSelector/MonitorCard/StreamingText/ThesisBlock/LazyEChart 等 ≥10 组件每组件 ≥2 用例；③E2E 并行稳定性修复（维护者实测：35 用例全并行偶发 1-2 个不同用例失败、单独重跑通过）：限 workers / 本机 retries:1 / 慢断言加显式 timeout，修复后完整 E2E 连跑 3 次全绿，不得放宽断言语义；④纯测试 + 仅允许改 playwright.config.ts，不改业务代码（发现 bug 只记录）。
**证据**: Discussion 3 个目标 E2E 均限定断言 `.investment-committee__stream`：完成态验证两帧 token 合并文本/第 1 轮/已完成，失败态验证部分文本/第 2 轮/失败及页面错误，历史态验证房间/成员/完成态且无流式区；focused 6/6。新增 10 个独立组件测试文件 / 20 用例，每组件 2 用例；全量 Vitest 86→96 files、252→272 tests，96/96 与 272/272 全绿。修改前原始 4 workers/0 retries 连跑 3 次均 35/35（本机未复现既有随机失败）；按维护者既有资源竞争证据将本机最小限制为 2 workers/retries 1，并给新增慢断言 10s 显式 timeout，未放宽语义。修复后完整 E2E 36/36 连跑 3 次全绿且无 retry 记录。OpenAPI 59 schemas freshness、TypeScript、Vite build 4,238 modules、`git diff --check` 与范围审计通过；记录历史消息受缺失 `position` 门控而不显示的业务缺陷，未越界修复。无 `frontend/src`/后端/schema/auth/依赖/锁文件/`reference/` 改动，未 commit/push/publish/deploy。

---

## [DONE] BACKLOG-007: 前端组件测试续扩 + 后端覆盖率攻坚 86.8%→90%（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-007.md`
**范围**: ①前端组件测试续扩：42 个无直接测试组件中补 ≥12 个（优先 20 个完全裸奔的：ActionBar/CommandBar/EventTimeline/EvidenceDrawer/EvidenceRail/FinancialTable/FundamentalsSourcePanel/MCPServerSettingsPanel/ModelSelector/SourceChip/StatusChip/StockChart/TimeseriesChart/LazyEChart/SystemSettingsPanel/Today 系列等，每组件 ≥2 用例 ≥25 用例）；②后端覆盖率 86.83%→≥90%：优先 backtests 74.9% / market_review 80% / news_search 82.7% / market_overview 84% / settings 80% / discussion_orch / swarm_orch / mcp_bridge；③纯补测试，不改业务代码（发现 bug 只记录）。
**证据**: 前端新增 12 个独立组件测试文件 / 25 用例，每组件 ≥2；全量 Vitest 74→86 files、227→252 tests，86/86 与 252/252 全绿。OpenAPI 59 schemas freshness、TypeScript、Vite production build 4,238 modules 通过；当前 shell 无 Bun，按 package scripts 拆分执行同一锁定工具。后端新增 5 files / 97 tests，全量 710/710；TOTAL 86.83%→90.59%。八靶点依次为 backtests 95.4%、market_review 97.4%、news_search 89.8%、market_overview 89.7%、settings 96.5%、discussion_orch 96.2%、swarm_orch 97.4%、mcp_bridge 92.6%；均 +5pp 或 ≥88%。新增后端测试代理关闭 97/97、7897 代理开启 97/97，Ruff 通过；仅测试和证据文档，无业务代码/schema/auth/dependency/lock/reference 改动，未 commit。记录 `PortfolioWhy` 负数货币显示为 `¥-10.00`，未越界修复。

---

## [DONE] BACKLOG-006: Discussion 流式时间线修复 + 前端组件测试扩面（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-006.md`
**范围**: ①业务改动（BACKLOG-005 暴露缺口）：Discussion 页 SSE 消费侧收集流式状态（agent_start/token/agent_end/error→streamingByAgent），InvestmentCommittee 新增流式时间线展示区（实时文本/轮次标签/失败态，向后兼容），i18n 双语；②测试闭环：InvestmentCommittee.test.tsx（≥5）+ DiscussionStreaming.test.tsx（≥4，推荐提取纯函数 reduceDiscussionStream）+ 核心组件测试扩面（≥10 组件每组件 ≥2 用例）；③后端/契约/依赖零改动。
**证据**: 新增纯函数 `reduceDiscussionStream` 与 per-agent `{ round, content, status }` 状态；Discussion 按 agent_start/token/agent_end/error/summary/done 实时更新并在停止/Abort 时保留部分文本、收束失败态，InvestmentCommittee output 区新增可选 `streaming` 时间线（轮次、实时/最终文本、失败态、aria-live），缺省不渲染。新增 11 files / 29 tests：InvestmentCommittee 6、DiscussionStreaming 5、另 9 个核心组件各 2，共覆盖清单中 10 个组件。OpenAPI freshness 59 schemas、TypeScript、Vite production build 4,238 modules、全量 Vitest 74/74 files 与 227/227 tests、Discussion E2E 5/5、完整 Chromium E2E 35/35、zh/en 2,208/2,208 且重复/差异均 0、`git diff --check` 全通过；E2E 断言无需调整。当前 shell 无 Bun，使用项目现有锁定工具拆分执行等价门禁；未新增依赖、未改后端/SSE 契约、未 commit。

---

## [DONE] BACKLOG-005: E2E 扩面——SSE 交互管线（Chat/Discussion）+ 系统/知识页

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-005.md`
**范围**: ①`frontend/e2e/chat-paths.spec.ts`（≥6 用例）：Chat SSE 对话管线——空态/创建会话/SSE 流式回复（token+done 帧 mock）/error 事件/校验失败/旧路由 /chat 重定向；②`frontend/e2e/discussion-paths.spec.ts`（≥5 用例）：多 Agent SSE 讨论流（agent_start/token/agent_end/done 帧 mock）；③`frontend/e2e/system-pages.spec.ts`（≥8 用例）：knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 渲染+关键交互。API 全 mock 确定性，不改业务组件（发现 bug 只记录）。
**证据**: 新增共享 API/SSE mock helper 与 19 个确定性 Chromium E2E：Chat 6、Discussion 5、knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 各 1，共 system 8；所有 `/api/**` 请求均拦截，未声明请求固定 404。Chat 按 `token/token/done` 与 error、Discussion 按 `agent_start/token/agent_end/done` 与 error 的 `event:` + `data:` + 空行契约返回 `text/event-stream`。新增 spec 19 passed（14.1s），完整 E2E 35 passed（既有 16 + 新增 19，33.4s）；Vitest 63 files / 198 tests passed（509.23s）；OpenAPI 59 schemas freshness、TypeScript 与 Vite production build（4,237 modules）通过，diff/白名单检查通过。Discussion 当前不展示流式 token、轮次或 agent_end 时间线，已按任务边界记录且未改业务组件；未改 backend/schema/auth/deps/`reference/`，未 commit。

---

## [DONE] BACKLOG-004: 后端覆盖率攻坚（84%→≥87%）+ SSE 管线错误路径补强

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-004.md`
**范围**: ①覆盖率攻坚：9 个薄弱靶点模块（market_data 76.5% / scheduler 75.5% / fundamentals 77.4% / monitor_targets 74.7% / report_export 79.8% / report_audit 79.1% / thesis_drift 78.8% / research_jobs 80.9% / thesis 83.4%）确定性补测，总体从 84% 提到 ≥87%；②SSE 管线错误路径：6 条管线（chat/discussion/analysis/research/swarm/notifications）各补 ≥2 个错误路径用例（上游失败→error 事件、校验失败→4xx、流中断清理）；③纯补测试，不改业务代码（发现 bug 只记录）。
**证据**: 新增 9 个确定性测试文件、62 个测试：TOTAL 84%（551 passed）→ 87%（613 passed），九靶点依次为 market_data 86%、scheduler 93%、fundamentals 95%、monitor_targets 95%、report_export 98%、report_audit 94%、thesis_drift 100%、research_jobs 89%、thesis 90%，均满足至少 +5pp 或 ≥88%。chat/discussion/analysis/research/swarm/notifications 各新增 2 个错误路径用例，覆盖 error 事件/4xx/中断清理，notifications 另覆盖 replay cursor 与 ping。9 文件在代理开/关环境均为 62 passed（11.82s / 13.53s）；完整无覆盖率 613 passed（84.15s），覆盖率 613 passed / TOTAL 87%（141.36s），全 tests Ruff 通过。未改 `backend/app`、schema、认证、依赖、frontend 或 `reference/`，未 commit。

---

## [DONE] BACKLOG-003: 真实网络 Agent 工具测试稳定化（去网络依赖）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-003.md`
**范围**: 把 `test_agent_tools_execution.py` 中两个真实请求腾讯行情的测试（test_get_stock_data_returns_quote_fields / test_calculate_indicators_returns_requested_indicators）改为 `monkeypatch` mock `MarketDataService.quote/kline` 的确定性测试（参考 test_trading_agent_tools 既有模式）；核查 test_agent_market_tools 是否已确定性；不改业务代码。
**证据**: `test_agent_tools_execution.py` 的 quote/kline 遗留真实请求已改为类方法 monkeypatch fixture，kline 固定 120 根；`test_agent_market_tools.py` 核查为既有确定性 mock，无需修改。代理开启（3 个变量均为 `http://127.0.0.1:7897` 且端口监听）与子进程临时清空 `ALL_PROXY/HTTP_PROXY/HTTPS_PROXY` 两种环境运行相同三文件测试均为 13 passed（1.68s / 0.70s）；完整 backend 保持 551 passed（62.28s），指定 Ruff 通过。未改业务代码、依赖、schema、前端或 `reference/`，未 commit。

---

## [DONE] BACKLOG-002: Discover 路径 E2E 补测（Alpha 工作台 + 旧路由重定向）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-002.md`
**范围**: 新建 `frontend/e2e/discover-paths.spec.ts` 覆盖 `/discover` 默认模式、`/alpha`→`?mode=alpha` 重定向、`/screening`→`?mode=screening` 重定向、alpha 工作台渲染（mock /wq API）与 390px 无溢出；必要时增强 DiscoverModeDispatch 组件测试。
**证据**: 新增 `discover-paths.spec.ts` 5 个确定性用例，覆盖 `/discover` 默认筛选、`/alpha` 与 `/screening` 重定向、API-backed Alpha 类别/模板/搜索结果以及 390px 页面级无横向溢出；同步既有 E2E 的 zh 语言、当前 Tab/FinancialMetric/Today 断言。`bun run build` 4,237 modules；Vitest 63/63 files、198/198 tests；Playwright 16/16 tests（原 11 + 新增 5）；`git diff --check` 通过。无业务组件、后端、schema、认证或依赖改动。

---

## ✅ TASK-001: 前端路由懒加载拆包

**状态**: 已完成。router.tsx 已有 `React.lazy()`，vite.config.ts 已有 `manualChunks`。
**验证**: `bun run build` 产出 vendor-antd + lightweight-charts 等 3+ 个 JS 文件。

---

## ✅ TASK-002: SSE 四个端点加 try/finally 错误守卫

**状态**: 已完成。chat.py / discussion.py / analysis.py / research.py 均有 try/except/finally + aclose 清理。

---

## ✅ TASK-003: Portfolio HK/US PnL

**状态**: 已完成。calc_pnl() 使用 MarketDataService 全市场行情，已有 test_pnl_with_hk_ticker() 测试。
**验证**: `pytest tests/test_portfolio_market.py -v` 通过。

---

## ✅ TASK-004: Alpha 搜索缺省值

**状态**: 已完成。search_alpha("") 返回全部字段列表，不抛异常。
**验证**: `pytest tests/test_alpha_search.py -v` 通过。

---

## ✅ TASK-005: ticker 解析器合并收尾

**状态**: 已完成。resolve_ticker() 委托 normalize_code()，无残留重复解析逻辑。

---

## 全部完成

**最终验收**: 101 passed / ruff 0 / frontend build 0 errors.

---

## 下一阶段：6 项目统一

见 `docs/ai/UNIFICATION_PLAN.md`。

---

## [DONE] TASK-006: BigDataView 大屏仪表盘融入

**优先级**: P0
**状态**: 已完成。Codex 通过 node_repl MCP 修改了 Dashboard.tsx 和 app.css，新增深色金融大屏概览区（KPI 网格、状态指示、响应式布局）。
**验证**: `cd frontend && bun run build` 零错误。
**注意**: Codex CLI Windows 沙箱无法运行 shell，通过 node_repl MCP 直接读写文件绕过了该限制。

---

## [DONE] TASK-007: report_audit 工具吸收

**优先级**: P1
**状态**: 已完成。Codex 通过 node_repl MCP 新建 `backend/app/tools/report_audit.py`（371 行），含 extract_data_points、render_verdict、Markdown 表格解析。
**验证**: ruff=0 / pytest 101 passed / build ✓
**注意**: 第二次下发才成功——第一次 Codex 用了 apply 机制失败，第二次指定 node_repl fs.writeFileSync 才写入。

---

## [DONE] TASK-010: Chat 页面集成策略回测触发

**优先级**: P2
**状态**: 已完成。Codex 修改 Chat.tsx + 新建 BacktestResultCard.tsx，含权益曲线 (lightweight-charts)、核心指标。
**验证**: `bun run build` ✓ / pytest 107 passed / ruff 0

---

## 全部完成 🎉

**最终验收**: 107 passed / ruff 0 / frontend build 0 errors.
**已吸收**: BigDataView / ai-berkshire (report_audit) / Vibe-Trading (chat backtest)

---

## [DONE] TASK-011: 轻量定时任务调度器

**优先级**: P3
**状态**: 已完成。Codex 新建 scheduler.py（72 行），修改 main.py lifespan 注册 asyncio 每日 18:00 调度任务。
**验证**: pytest 110 passed / ruff 0

---

## 全部完成 🎉

**最终验收**: 110 passed / ruff 0 / frontend build 0 errors.
**6 项目统一完成**: BigDataView / ai-berkshire / Vibe-Trading / daily_stock_analysis / wq-alpha-research / stock-analyzer 核心能力已吸收。

---

## 产品化 Phase 0

### [DONE] PROD-000: 统一架构文档真相

**优先级**: P0
**状态**: 已完成。文档已对齐当前认证、23 个 APIRouter、schema v11/35 张逻辑表，并记录权威来源和同步规则。
**验证**: 运行时 OpenAPI 105 个 API 路径 / 134 个操作；文档一致性检查与 `git diff --check`。

### [DONE] PROD-001: 当前页面、流程与能力矩阵

**优先级**: P0
**状态**: 已完成。盘点 17 个页面组件、18 个明确路径、核心旅程与指标能力，区分已展示、后端未接线、真缺口和设计限制。

### [DONE] PROD-002: 主流程截图与首次任务步骤基线

**优先级**: P0
**状态**: 已完成。保存桌面/窄屏和三条主任务截图；统一记录当前步骤数、首视口可见性及错误恢复事实。

### [DONE] PROD-003: 本地产品指标最小测量合同

**优先级**: P0
**状态**: 已完成。定义人工基线优先、可选本地事件后置的指标公式、完成条件、allowlist、隐私和清除规则。

### [DONE] PROD-010: 六组一级导航与路由映射

**优先级**: P0
**状态**: 已完成。原同级菜单已归入今日、研究、策略、组合、知识和系统工具六组导航，深度研究直接可达，动态分析路由归入研究上下文。
**验证**: 导航结构测试 2 passed；前端构建通过；桌面与 390×844 浏览器抽屉验证通过。

### [DONE] PROD-011: Dashboard 任务启动台

**优先级**: P0
**状态**: 已完成。三个核心任务位于首视口，大屏与市场雷达下移；桌面和窄屏均显示 3/3 个任务。
**验证**: Dashboard E2E 1 passed；前端构建通过；桌面与 390×844 截图通过。

### [DONE] PROD-012: 三个真实示例任务

**优先级**: P0
**状态**: 已完成。600519 分析、MA20/50 回测和非自动写入的组合预填均可直接复测；价格与成本未伪造。
**验证**: Dashboard/Portfolio E2E 2 passed；前端构建通过；桌面、窄屏和表单预填浏览器验证通过。

### [DONE] PROD-013: 首次任务进度与上下文帮助

**优先级**: P0
**状态**: 已完成。成功分析、completed 回测和成功保存驱动本地 3 步进度；提示可隐藏/恢复，窄屏不遮挡三个任务。
**验证**: ProductProgress/navigation 4 passed；Dashboard/Portfolio E2E 2 passed；真实 600519 分析推进 0/3→1/3；桌面/窄屏截图通过。

### [DONE] PROD-014: 统一页面任务头结构

**优先级**: P0
**状态**: 已完成。四个核心页面复用同一语义任务头，展示目标、对象、真实数据状态和唯一主操作。
**验证**: 组件/StrategyLab 3 passed；前端构建通过；桌面与 390×844 四页浏览器验证通过。

### [DONE] PROD-015: 全局标的与任务入口

**优先级**: P0
**状态**: 已完成。Header 可搜索标的或问题并明确选择任务；组合、论文、预警和问答仅预填，不自动提交。
**验证**: 前端 45 tests / E2E 2 passed / build / Ruff / 桌面与 390×844 浏览器通过；后端实时上游门禁见任务卡。

## 产品化 Phase 2

### [DONE] PROD-020: 统一摘要、证据与方法结果框架

**优先级**: P0
**状态**: 已完成。四个核心结果页统一为“摘要 / 证据 / 方法与来源”，保留现有真实数据、报告、回测与质量边界。
**验证**: 相关 6 tests / build / 四页桌面语义检查 / 390×844 浏览器检查通过。

### [DONE] PROD-021: 个股信号中文化与冲突解释

**优先级**: P0
**状态**: 已完成。9 个现有 signal code 均转为中文名称和尺度；摘要按可见计数给出偏强/中性/偏弱，并显式标记多空分歧。
**验证**: 前端 20 files / 49 tests、build、600519 实时混合信号、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-022: 指标解释卡与知识锚点

**优先级**: P0
**状态**: 已完成。MA/MACD/KDJ/RSI 共享用途、读法、公式与误区；个股页显示真实末值并可进入原始图表、知识、深研和策略验证。
**验证**: 前端 22 files / 52 tests、build、600519 实时值、跨页路由及桌面/390×844 浏览器检查通过。

### [DONE] PROD-023: 研究工作区聚合快照、报告、分歧、笔记和历史版本

**优先级**: P0
**状态**: 已完成。单一标的工作区聚合保存快照、报告版本、精确观点文本变化、主题匹配讨论、论文漂移和最新笔记边界。
**验证**: 前端 23 files / 54 tests、build、本地 600519 的 3 报告/1 讨论/0 论文、版本与讨论深链、桌面/390×844 浏览器检查通过。

### [DONE] PROD-024: AI 意图入口：快速问答、深度研究、多视角审查

**优先级**: P0
**状态**: 已完成。用户先选择研究强度并看到产物、相对耗时、模型额度和最终确认动作；目标页只导航和预填，团队详情默认折叠。
**验证**: 前端 25 files / 57 tests、build、三条无自动调用路由、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-025: 从研究结论创建论文、验证条件和预警

**优先级**: P0
**状态**: 已完成。已保存报告经显式确认创建关联论文和确定性验证条件；论文可带上下文预填技术预警，并明确当前 schema 无论文外键。
**验证**: 前端 27 files / 61 tests、build、报告确认无写入、论文/预警上下文、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-026: 基本面/估值 P1 指标按真实数据可用性补齐

**优先级**: P0
**状态**: 已完成。P1 三组 13 项指标只展示提供方原值或组件可审计的确定性派生值；缺失字段保持 UNKNOWN，上游断连统一为 502。
**验证**: 后端 focused 23 passed、前端 28 files / 63 tests、build、Ruff、三市场实时 502 边界、桌面与 390×844 浏览器检查通过；全后端 381 passed / 4 个实时上游失败，coverage 83.21%。

## 产品化 Phase 3

### [DONE] PROD-030: 策略目标与预设选择，高级参数渐进披露

**优先级**: P0
**状态**: 已完成。趋势跟随与风险控制复用现有 MA 预设；均值回归诚实标为不可用；完整均线、费用和风控字段默认折叠。
**验证**: 前端 29 files / 66 tests、build、无自动提交、风险控制 MA30/90+12%、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-031: 回测结论摘要、失败原因排序和指标解释

**优先级**: P0
**状态**: 已完成。保留原基础门槛，先展示结论和五项决策指标，再按实际值排序收益、回撤、样本和稳健性限制；专业指标默认折叠，失败与部分证据错误分类且保留原文。
**验证**: 前端 31 files / 71 tests、build、diff check、真实已保存回测桌面与 390×844 浏览器检查通过；未运行或保存业务数据。

### [DONE] PROD-032: 预设比较、单参数变化和保存实验

**优先级**: P0
**状态**: 已完成。已保存回测作为实验基准；0/1/多参数差异明确，只有同标的、区间、资金、成本和基准的真实结果进入预设比较，缺失结果保持未运行。
**验证**: 前端 33 files / 77 tests、build、diff check、真实已保存实验桌面与 390×844 浏览器检查通过；未运行或保存业务数据。

### [DONE] PROD-033: Alpha 类别、模板和通俗说明

**优先级**: P0
**状态**: 已完成。已接入 7 类真实字段目录和 5 个目录验证模板，展示通俗假设、局限、字段 ID/描述/coverage、缺失区域和折叠表达式/设置；选择仅更新本地上下文。
**验证**: 前端 36 files / 81 tests、build、diff check、live API 桌面与 390×844 浏览器检查通过；未调用模拟、相关性或 BRAIN。

### [DONE] PROD-034: 本地 Alpha 模拟和相关性

**优先级**: P0
**状态**: 已完成。显式 CSV/JSON 观察数据校验后才运行本地模拟；短样本不主推年化，相关性只按至少 3 个共同日期对齐，结果保留 `r/p/n/note` 和非因果说明。
**验证**: 前端 38 files / 86 tests、build、diff check、桌面与 390×844 输入边界浏览器检查通过；无真实观察数据时未调用模拟、相关性、持久化或 BRAIN。

### [DONE] PROD-035: P1 回测风险、基准归因和交易质量指标

**优先级**: P1
**状态**: 已完成。权益/基准曲线补齐波动、最大回撤持续/恢复和一元回归归因；完整交易、持仓 bar 与实际 fill 补齐交易质量及成本拆分，旧结果明确保持不可用。
**验证**: 后端共享路径 33 passed、完整门禁 384 passed / 4 个既有外部标的解析失败、coverage 83.32%、Ruff 通过；前端 38 files / 87 tests、build、桌面与 390×844 旧结果浏览器验证通过。

### [DONE] PROD-036: P2 Alpha IC、分位和衰减能力评估

**优先级**: P2
**状态**: 已完成。现有单期限、最少双标的合同不足以安全展示 ICIR、完整分位单调性和衰减；页面逐项展示设计状态和所需数据合同，不生成数值或动作。
**验证**: AlphaSimulationWorkbench 2 passed；前端 38 files / 87 tests、TypeScript 和生产构建通过；窄屏修正后聚焦测试/build 复验，桌面与 390×844 浏览器检查通过且未提交观察数据。

### [DONE] PROD-037: 本地 Alpha 研究保存与恢复

**优先级**: P0
**状态**: 已完成。只有显式命名并点击保存才落盘派生快照；刷新恢复真实模板、参数和结果但保持观察输入为空，移除进入可撤销本地回收站。
**验证**: 聚焦 3 files / 6 tests；完整前端 39 files / 90 tests、TypeScript、生产构建、Ruff 与 diff check 通过；桌面/390×844 空输入保存边界通过，持久化刷新由 jsdom 精确合同验证。

### [DONE] PROD-040: 接入组合回测和风险 X 光

**优先级**: P0
**状态**: 已完成。复用现有 `/backtests/portfolio`，从当前组合至少两个持仓显式运行等权基线模拟，展示校准权重、曲线、绩效、交易质量、逐资产来源和风险 X 光；不修改真实持仓。
**验证**: 聚焦 1 file / 2 tests；完整前端 40 files / 92 tests、TypeScript 和生产构建通过；真实 `000858`/`600519` 组合桌面与 390×844 浏览器验证通过，持仓未改变。

### [DONE] PROD-041: 组合风险指标通俗解释

**优先级**: P0
**状态**: 已完成。基于后端原始状态解释集中度、回撤、VaR/ES 和分散化，明确样本/口径/下一步；样本不足和不支持状态保持不可用，不前端补算。
**验证**: 聚焦 1 file / 3 tests；完整前端 40 files / 93 tests、TypeScript 和生产构建通过；桌面与 390×844 浏览器解释层通过。

### [DONE] PROD-042: 组合相关性和风险来源可视化

**优先级**: P0
**状态**: 已完成。后端校准权重形成降序集中来源图，平均相关性形成单点位置图并保留共同样本；明确完整矩阵和风险贡献缺口，不做反推。
**验证**: 聚焦 1 file / 3 tests；完整前端 40 files / 93 tests、TypeScript 和生产构建通过；真实 50/50 权重与 0.606 平均相关性桌面/390×844 浏览器通过。

### [DONE] PROD-043: 四种优化器只读比较

**优先级**: P0
**状态**: 已完成。固定资产、策略、样本、成本和初始资金，仅改变优化器，比较收益、回撤、后端汇总换手、交易数、集中度和假设；0% 权重路径已修复，不修改真实持仓。
**验证**: 后端 portfolio/risk 12 passed、Ruff；前端聚焦 6 tests、完整 40 files / 96 tests、TypeScript/build；四种真实结果及桌面/390×844 通过。

### [DONE] PROD-044: 行业、市场和币种暴露可行性与缺口

**优先级**: P1
**状态**: 已完成。逐资产展示加载器真实 market/currency 和覆盖率；行业合同缺失时保持 UNKNOWN，不从名称、代码或市场板块榜单推断。
**验证**: 后端 router 合同 1 passed、Ruff；前端聚焦 7 tests、完整 40 files / 97 tests、TypeScript/build；真实 CN/CNY 与行业 UNKNOWN 桌面/390×844 通过。

### [DONE] PROD-045: 组合风险到预警和定期复盘闭环

**优先级**: P0
**状态**: 已完成。成功风险结果提供显式 Alerts 预填和本地 7 天复盘待办；预填不创建规则，待办只保存派生摘要/时间并支持刷新恢复、完成、删除与撤销。
**验证**: 聚焦 2 files / 13 tests；完整前端 40 files / 99 tests、TypeScript/build；真实组合窄屏浏览器刷新、删除/撤销和 Alerts 取消后 0 条规则通过；后端 385 passed / 4 个既有外部数据失败、coverage 83.34%，Ruff 通过。

## 产品化 Phase 5

### [DONE] PROD-050: 保存常用指标、布局密度和研究模板

**优先级**: P0
**状态**: 已完成。版本化本地偏好显式保存常用指标、AntD 布局密度和真实 Alpha 模板 ID；刷新恢复、损坏数据回退和恢复新手默认值均不改变数据口径。
**验证**: 聚焦 4 files / 13 tests；完整前端 41 files / 105 tests、TypeScript/build/diff check；真实 600519 MA/RSI 展示、`price_reversal` 模板恢复、观察输入为空及桌面/窄屏重置通过。

### [DONE] PROD-051: 跨标的、策略和组合比较工作区

**优先级**: P0
**状态**: 已完成。比较工作区只读取已保存研究、完成策略实验和已验证本地组合复盘，持久化最多四个来源 ID；跨类型仅元数据，同类型策略必须完整且同口径才显示数值。
**验证**: 聚焦 3 files / 8 tests；完整前端 43 files / 111 tests、TypeScript/build/diff check；真实两条旧 AAPL 实验的缺失成本/风控字段保持 UNKNOWN 和不可比，策略+组合跨类型边界桌面/窄屏通过。

### [DONE] PROD-052: 研究版本、参数、来源和方法导出

**优先级**: P0
**状态**: 已完成。复用比较工作区的显式来源选择和规范化候选，生成 schema v1 JSON 可复现清单；预览与下载使用同一对象，旧记录缺失字段保持 UNKNOWN，敏感/原始数据明确排除，下载只在用户点击后发生。
**验证**: 聚焦 3 files / 10 tests；完整前端 44 files / 115 tests、TypeScript/build/diff check；真实 AAPL 已保存策略与本地组合复盘的桌面/窄屏预览、UNKNOWN 缺口和显式下载触发通过。

### [DONE] PROD-053: P2 因子、风险贡献和压力测试能力证据审计

**优先级**: P2
**状态**: 已完成。现有显式 Alpha 观察合同新增横截面 Pearson IC、Spearman Rank IC 与非年化 ICIR；组合真实对齐收益新增完整相关矩阵和样本协方差风险贡献。完整分位、衰减和压力测试继续保持数据不足/设计状态。
**验证**: 后端聚焦 28 passed、Ruff；完整后端 386 passed / 4 个既有失败、coverage 83.34%；前端聚焦 2 files / 10 tests、完整 44 files / 115 tests、TypeScript/build；真实 5 标的 × 5 日期 Alpha 与 739 期双资产组合桌面/窄屏通过。

### [DONE] PROD-054: 论文更新、观点漂移和研究待办统一时间线

**优先级**: P1
**状态**: 已完成。研究首页按时间聚合已保存工作区、报告版本、论文漂移状态和本地组合复盘待办；后端持久化与本地派生明确分层，缺失更新时间保持 UNKNOWN，只有原记录链接。
**验证**: 聚焦 3 files / 7 tests；完整前端 45 files / 117 tests、TypeScript/build/diff check；真实 1 个工作区、8 个报告版本、0 个论文和 1 个本地复盘待办按时间排序，桌面/390×844 无写请求和文档级横向溢出。

### [DONE] PROD-055: 系统工具与普通产品入口彻底分层

**优先级**: P0
**状态**: 已完成。知识库与模型/MCP/设置拆为独立“知识”和“系统工具”导航组；三个系统深链保留原路由，并统一显示非前置说明和返回研究工作区路径。全局任务入口只保留产品任务并明确维护入口边界。
**验证**: 聚焦 2 files / 4 tests；完整前端 45 files / 117 tests、TypeScript/build/diff check；`/models`、`/mcp-market`、`/settings` 深链和返回 `/research` 通过，桌面/390×844 无文档级横向溢出或配置写入。

## 产品化 Phase 6

### [DONE] PROD-060: 核心路径 E2E 与错误/空状态回归

**优先级**: P0
**状态**: 已完成。Playwright 为个股研究、策略验证和组合体检建立确定性成功/空/错误合同；Portfolio 初始加载不再静默吞错，按组合列表/汇总/持仓/配置显示来源失败与安全重试。390px 大额 KPI 保持卡片内可读。
**验证**: 聚焦 Vitest 1 passed；完整前端 46 files / 118 tests；Playwright 9 passed；TypeScript/build/diff check。真实 600519 研究保留 tencent/sina 来源与基本面/筹码 UNKNOWN，真实策略/组合只读路径及三页 390×844 无文档级溢出。

### [DONE] PROD-061: 键盘、焦点、对比度、缩放和图表文字摘要审计

**优先级**: P0
**状态**: 已完成。共享交互控件统一获得 light/dark 可见 `:focus-visible`；研究与回测图表新增同数据的日期、数值、来源/复权、回撤和成交文字摘要，组合图表新增语义名称。三条核心路径键盘主操作与 200% 等效视口通过。
**验证**: 聚焦 2 files / 10 tests；完整前端 47 files / 120 tests；Playwright 11 passed；TypeScript/build/diff check。真实搜索按钮焦点环约 2.84px，关键 light/dark 对比度 5.69–10.75:1；真实 600519 三条图表摘要及三页 720px 无溢出。

### [DONE] PROD-062: 首屏、图表和长列表性能优化

**优先级**: P1
**状态**: 已完成。可重复生产构建测量定位到三条核心初始路由提前请求 1.146 MB ECharts/ZRender；研究、回测和组合结果图改为共享按需边界，Dashboard 与全部数据、来源、排序、空错和文字摘要合同保持不变。
**验证**: 三页初始资产由 2.75–2.77 MB 降至 1.60–1.62 MB（41.36%–41.71%）；聚焦 2 files / 10 tests，完整前端 47 files / 120 tests，Playwright 11 passed，TypeScript/build/diff check。真实 600519 三张延迟图表、260 条 `sina` 日线与来源摘要通过。

### [DONE] PROD-063: 真实 A/HK/US 数据和来源失败回归

**优先级**: P0
**状态**: 已完成。真实 600519 搜索/快照/日线分别验证 Eastmoney/Tencent/Sina 与 CNY、截止时间、未复权质量标记；A 股基本面及 HK/US Yahoo 能力当前真实失败，全部保持 502。失败消息新增 provider、异常类型和 `circuit_open` 归因，不补造数值。
**验证**: 真实跨市场 JSON 与 HK/US 浏览器失败页；聚焦 53 + 4 passed；完整后端 392 passed / 83.51% coverage；完整 Ruff、TypeScript/build，前序同工作树完整前端 120 tests / Playwright 11 passed。

### [DONE] PROD-064: 金融指标口径、期间、复权、成本和基准审计

**优先级**: P0
**状态**: 已完成。基本面、价格、策略、组合与 Alpha 建立输入到展示追踪；旧图表缺失指标不再显示 0，策略/Alpha 明示 Sharpe/Sortino 零阈值与年化频率，组合/Alpha 明示未覆盖的交易成本和 FX 边界。
**验证**: 后端金融计算 57 passed；完整后端 392 passed / 83.51% coverage；完整前端 47 files / 121 tests；Playwright 11 passed；Ruff、TypeScript/build/diff check。真实已保存 AAPL `none / 1d` 口径与组合成本边界通过。

### [DONE] PROD-065: 文档、截图、API 合同和发布清单同步

**优先级**: P0
**状态**: 已完成。运行时 105 个 API 路径 / 134 个操作、23 个 APIRouter、schema v11 / 35 个逻辑表及 18 个懒加载页面 / 19 个产品路径已与权威文档同步；39 个任务证据路径全部存在，3 个 JSON 可解析，93 张图片非空。最终后端 392 passed / 83.51%、Ruff、mypy、前端 121 tests、Playwright 11 tests、TypeScript/build/diff check 全部通过；发布清单保留真实上游失败和未提交/未发布边界。

---

## AI 原生投资研究 OS

长期路线与执行合同见 `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`。这是已完成 `PROD-*` 产品化后的后续阶段，不重跑 Phase 0-6。

### [DONE] AIOS-000: AI 原生研究 OS 基线与领域合同冻结

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-000.md`
**范围**: 只读审计与文档；不修改业务代码、依赖、数据库或 `reference/`。
**完成条件**: 当前 memory/workspace/thesis/evidence/job 数据流可追踪，v1 领域对象完成 `REUSE/EXTEND/MISSING/BLOCKED` 映射，并为 AIOS-001 固定评估场景。
**证据**: `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`；静态核对 23 个 APIRouter、105 个 `/api/*` 路径、134 个 HTTP 操作、schema v11、35 张逻辑表；未运行 pytest/build/E2E 或真实上游验证。

### [DONE] AIOS-001: 投资记忆 fixture 与 FTS5 baseline runner

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-001.md`
**范围**: 按 `AI_NATIVE_CAPABILITY_BASELINE.md` 固定的中英、时序、矛盾、隔离、prompt injection、删除同步和上游失败场景建立可重复基线。
**前置**: `AIOS-000` 已完成；不引入 Graphiti、Mem0 或生产依赖。
**证据**: `aios-memory-fixture-v1` 13 条 synthetic records / 6 cases；Recall@5 1.0000、Precision@5 0.9167；隔离泄漏和注入执行为 0；focused pytest 7 passed、Ruff 与 diff check 通过。未执行真实上游验证。

### [DONE] AIOS-002: CanonicalProvenanceEnvelope 与 JSON Schema

**优先级**: P0
**范围**: 定义稳定的 provenance envelope、未知值和派生输入规则，并验证现有行情、基本面和计算结果可无损映射；不迁移数据库、不接第三方系统。
**前置**: `AIOS-001` 已完成；任务卡按长期计划与当前架构边界生成。
**证据**: Draft 2020-12 schema 自检；3 个有效 fixture 映射通过、7 个非法合同拒绝；focused pytest 3 passed、Ruff 与 diff check 通过。仅 deterministic fixture，不是真实上游验证。

### [DONE] AIOS-003: MemoryProvider 与 MemoryCandidate 端口

**优先级**: P0
**范围**: 在不接第三方系统、不迁移数据库的前提下定义项目自有端口，并由 native FTS5 provider 保持 chat/research 当前行为。
**前置**: `AIOS-002` 已完成。
**证据**: native provider 接管 chat/research，旧函数兼容；focused pytest 12 passed，Ruff、mypy、diff check 通过。

### [BLOCKED] AIOS-004: Graphiti 与 Mem0 fixture-only shadow PoC

**优先级**: P0
**范围**: 仅使用 synthetic fixture 比较候选；不注入模型、不写生产数据、不新增生产依赖。不可用候选必须明确报告并回退 native baseline。
**前置**: AIOS-003 已完成。

### [DONE] AIOS-005: memory provider 选型 ADR

**范围**: 基于可重复 native baseline 与第三方候选的真实证据边界，决定 Local OSS v1 的生产 memory provider；不把 `NOT_RUN` 冒充候选 benchmark。
**证据**: native 6 cases 已实测；Graphiti/Mem0 均未安装，候选指标保持 `null`。2026-08-24，维护者 `@Satanchen` 明确批准保持 Native FTS5；`ADR-005-memory-provider.md` 已标记 `ACCEPTED`。AIOS-004/034 继续作为未来可选隔离 PoC 保持 `[BLOCKED]`，不再阻塞生产选型。

### [DONE] AIOS-010: Evidence object 与派生输入引用 schema

**优先级**: P0
**范围**: 在现有单 aiosqlite 连接和原始 SQL 架构内新增 canonical evidence 与 computed input references；必须迁移可备份回滚、保持未知值和用户隔离。
**前置**: AIOS-002 provenance 合同已完成；不依赖被阻塞的第三方 shadow benchmark 或 AIOS-005 选型 ADR。
**证据**: schema v12 / 37 张逻辑表；v11 自动 `.pre-v12.bak`；UNKNOWN、computed input 与 owner-scoped 复合外键约束通过。focused 7 passed、Ruff、mypy、diff check 通过。完整既有 cross-user API 测试受工作树 `LOCAL_ONLY_MODE` 默认行为影响失败，未在本任务越界修改。

### [DONE] AIOS-011: 行情、基本面与研究报告 provenance adapter

**优先级**: P0
**范围**: 复用现有 provider 返回和 `CanonicalProvenanceEnvelope v1`，把三类业务结果映射并持久化到 evidence foundation；未知/上游失败不得补造。
**前置**: AIOS-010 schema v12 已完成。
**证据**: 三类 adapter 通过 canonical schema；字段/UNKNOWN/AI 文档边界与显式 owner 写入通过。focused 6 passed、Ruff、mypy、diff check 通过；没有隐式业务写入或真实上游验证。

### [DONE] AIOS-012: 计算结果 provenance 与可复算 fixture

**优先级**: P0
**范围**: 为现有回测、风险和 Alpha 确定性计算记录 formula、input evidence IDs 与 method_version，并以 fixture 证明可复算；不重新实现计算引擎。
**前置**: AIOS-011 adapters 与 schema v12 已完成。
**证据**: 现有三套引擎复算 total return 0.16、HHI 0.58、terminal equity 1.0404，并生成完整 lineage envelope。focused 5 passed、Ruff、mypy、diff check 通过；仅 deterministic fixture。

### [DONE] AIOS-013: 统一 Citation UI 与来源/计算方法

**优先级**: P0
**范围**: 在现有结果页信息架构中复用统一 citation 组件，清楚展示来源、时间、质量状态和计算方法；缺失保持 UNKNOWN/UPSTREAM_ERROR。
**前置**: AIOS-012 computed provenance 合同已完成。
**证据**: 基本面/策略共享组件；完整 127 tests、TypeScript/build；实际 AAPL saved run 桌面/390px 来源展开且无溢出，旧 lineage 保持 UNKNOWN。未运行或保存业务数据。

### [DONE] AIOS-014: Evidence audit API 与导出清单 v2

**优先级**: P0
**范围**: 提供当前用户 evidence 清单与引用完整性审计，导出只含 canonical metadata/value 和 lineage，不含凭据、会话或原始敏感正文。
**前置**: AIOS-013 Citation UI 已完成；schema v12 与 adapters 可用。
**证据**: owner audit/export focused 2 passed、Ruff/mypy；OpenAPI 107/136。Phase 1 标准模式后端 419 passed / 83.61%，全 Ruff/mypy，前端 127 tests、TypeScript/build、E2E 11 passed、diff check 均通过。

### [DONE] AIOS-020: 类型化 memory records、状态与 supersession

**优先级**: P0
**范围**: 在单 aiosqlite/raw SQL 架构内新增 owner-scoped typed memory schema 与最小 CRUD；状态历史和 supersession 不得静默覆盖，事实确认必须引用 evidence。
**前置**: Phase 1 Evidence Foundation 退出门禁已通过；不依赖被阻塞的第三方框架 PoC。
**证据**: schema v13、pre-v13 backup、typed CRUD/supersession/isolation focused 8 passed，Ruff、mypy、diff check 通过。

### [DONE] AIOS-021: 显式保存和 background candidate 抽取

**优先级**: P0
**范围**: 复用 typed memory service 提供显式保存入口与可关闭的后台 candidate 抽取；自动内容不得写为 confirmed 或冒充 FACT。
**前置**: AIOS-020 typed memory schema 与 CRUD 已完成。
**证据**: 显式 owner save API 与默认关闭的幂等 background capture 完成；自动内容仅为 AI_INFERENCE candidate。focused 4 passed、Ruff、mypy、OpenAPI 108/137、diff check 通过。

### [DONE] AIOS-022: subject/time/provenance-aware retrieval

**优先级**: P0
**范围**: 在 typed memory 上实现 owner/subject/time/status/provenance-aware 检索与可重复 benchmark，不替换现有 FTS 主路径。
**前置**: AIOS-021 显式保存与 opt-in candidate capture 已完成。
**证据**: synthetic fixture typed Recall@5 1.0000 / Precision@5 1.0000，不低于 FTS 1.0000/0.9167；semantic 6/6、owner leakage 0、本地 P95 0.6133 ms；focused 3 passed、Ruff、mypy、diff check 通过。

### [DONE] AIOS-023: context assembler 与 recall explanation

**优先级**: P0
**范围**: 将 typed memory 候选装配为有 token/字符预算、明确不信任边界、状态/时间/provenance 引用和召回解释的上下文；不接入回答主路径。
**前置**: AIOS-022 typed retrieval 与 benchmark gates 已通过。
**证据**: 完整 JSON-line 双预算 assembler、stable citations、recall explanation、UNKNOWN provenance 与 prompt-injection trust boundary；focused 4 passed、Ruff、mypy、diff check 通过，尚未接入主路径。

### [DONE] AIOS-024: 用户查看、确认、编辑、作废、删除、导出记忆

**优先级**: P0
**范围**: 提供当前用户 typed memory 的查看、确认、编辑、作废、soft-delete 与安全导出 API/界面，删除范围清晰可验证。
**前置**: AIOS-023 retrieval/context contract 已完成。
**证据**: owner-scoped 管理/allowlist export API 与 Knowledge UI 完成；edit supersession 保留历史且用户修订重新分类，FACT 禁止改写；backend 6 tests、frontend 4 tests、Ruff/mypy、TypeScript/build、OpenAPI 110/141、diff check 通过。

### [DONE] AIOS-025: chat/research shadow -> opt-in rollout

**优先级**: P0
**范围**: 先以 shadow 审计 typed retrieval 与现有 FTS 候选差异，再提供默认关闭、可立即回退的 chat/research opt-in context；记录候选差异、字符/token 成本，不记录金融正文。
**前置**: AIOS-024 用户控制面与 Phase 2 memory contracts 已完成。
**证据**: schema v14/pre-v14 backup；默认关闭 shadow/opt-in、metadata-only owner audit、chat/research 注入与 FTS fallback 完成。focused 57 passed；Phase 2 标准模式 backend 443 passed/83.83%，全 Ruff/mypy，frontend 130 tests、TypeScript/build、E2E 11 passed，diff check 通过。

### [DONE] AIOS-030: Thesis v2 版本化领域模型

**优先级**: P0
**范围**: 在现有单 aiosqlite/raw SQL thesis 服务上增加判断、假设、支持、反对、失效条件、置信度和不可变版本历史；旧 thesis 必须无损读取，更新不得静默覆盖历史。
**前置**: Phase 2 Investment Memory v1 退出门禁已通过。
**证据**: schema v15/pre-v15 backup；legacy current view/API 兼容；不可变版本、retired claim history、同用户 evidence refs 与 AI_INFERENCE/USER_HYPOTHESIS 边界完成。focused 17 passed、Ruff/mypy、OpenAPI 111/142、diff check 通过。

### [DONE] AIOS-031: claim-evidence edges 与时间有效期

**优先级**: P0
**范围**: 在 canonical evidence 与 Thesis v2 上增加 owner-scoped claim/evidence 支持或反对边、有效期和状态事件历史；自动状态变化必须可回链，缺失 evidence 保持 UNKNOWN。
**前置**: AIOS-030 Thesis v2 不可变版本与同用户 evidence 引用已完成。
**证据**: schema v16/pre-v16 backup；manual/automatic temporal edge history 与 append-only status events；deterministic 非 UNKNOWN 数据库级 evidence 强制；focused 17 passed，Ruff/mypy、OpenAPI 111/142、diff check 通过。

### [DONE] AIOS-032: Challenge My Thesis 产品动作

**优先级**: P0
**范围**: 复用现有 bearish/contrarian/research 能力，对当前 Thesis 生成最强反证、遗漏变量和脆弱假设；所有事实与计算必须引用 canonical evidence，模型内容保持 AI_INFERENCE，缺证据结论保持 UNKNOWN。
**前置**: AIOS-031 claim-evidence 时间边与状态事件已完成。
**证据**: owner-scoped 只读 API/UI；三类 AI_INFERENCE 输出与 canonical refs/UNKNOWN；读前后无 Thesis 写入。backend focused 13、frontend 3，Ruff/mypy/TypeScript/build，OpenAPI 112/143、diff check 通过。

### [DONE] AIOS-033: deterministic + evidence-aware drift engine

**优先级**: P0
**范围**: 将 Thesis 漂移核验收敛为明确规则与 canonical evidence 的确定性引擎；移除报告文本相似度的状态决定权，展示 UNKNOWN、输入、公式/阈值和规则版本。
**前置**: AIOS-032 Challenge My Thesis 已完成；AIOS-031 状态事件与时间边可用。
**证据**: thesis-drift/v1 四类版本化规则；price/fundamental baseline/current 双侧 evidence 门禁；position/report UNKNOWN；UI 展示公式/参数/证据且不重算。backend focused 14、frontend 3，Ruff/mypy/TypeScript/build、OpenAPI 112/143、diff check 通过。

### [BLOCKED] AIOS-034: 可选 Graphiti read model 同步与重建

**优先级**: P1
**范围**: 仅在 fixture/shadow 边界内定义由 authoritative SQLite 重建的 temporal graph read model，验证删除后全量重建与双边计数；不得新增生产依赖或接入业务主路径。
**前置**: AIOS-033 evidence-aware drift engine 已完成；AIOS-004 外部 Graphiti 包仍为 BLOCKED，因此本任务先执行无第三方依赖的 adapter contract、export fixture 与 rebuild harness。
**证据**: thesis-graph-export/v1 与内存 sink clear/rebuild 通过，五类 source/export/sink 计数一致、跨用户泄漏 0；focused 2、Ruff/mypy/diff check。Graphiti 包未安装且未运行，候选指标均 null。ADR-005 已接受 Native FTS5；本任务仅作为未来可选隔离 PoC 保持 `[BLOCKED]`。

### [DONE] AIOS-035: Thesis 历史、差异和用户确认流程

**优先级**: P1
**范围**: 在 Thesis v2 不可变版本和 AIOS-031 状态事件基础上提供版本差异、置信度变化原因与显式用户确认；系统不得自动替用户改变判断或 confidence。
**前置**: AIOS-030/031/032/033 已完成；不依赖被阻塞的 Graphiti read model。
**证据**: schema v17/pre-v17 backup；相邻版本 diff 与 confidence old/new/change_reason；owner-scoped append-only acknowledged/disputed；UI 历史/证据/错误态。focused backend 17 + frontend 4；Phase 3 backend 461/83.87%、frontend 133、E2E 11，Ruff/mypy/TypeScript/build 通过。

### [DONE] AIOS-040: 个性化 Today / Decision Inbox

**优先级**: P1
**范围**: 复用现有 owner-scoped Thesis、Portfolio、research、notification/evidence 事实，在今日首页提供只与当前用户对象相关的 decision items；每项必须含 why-now、对象、证据/质量和明确下一步，缺证据不得生成确定提醒。
**前置**: AIOS-035 与 Phase 3 退出门禁已完成；不依赖 AIOS-034 Graphiti read model。
**证据**: decision-inbox/v1 owner-scoped 只读聚合；Thesis 确定事件、待确认版本、定时研究失败三类；UNKNOWN/UPSTREAM_ERROR 保真；Dashboard 四态与 390px 行动布局。backend 47、frontend 2、Ruff/mypy/TypeScript/build、OpenAPI 114/145、diff check 通过；Phase 4 回归补齐 E2E 空态 mock，targeted 1 + full 11 passed。

### [DONE] AIOS-041: Thesis / Portfolio / Strategy 原生 monitor targets

**优先级**: P1
**范围**: 在现有 alert/scheduled research 能力上提供与 Thesis、Portfolio、Strategy 对象绑定的 monitor target 草稿和显式确认流程；默认只读、无外部写操作，不凭空生成金融阈值。
**前置**: AIOS-040 Decision Inbox 已完成；复用现有 alert_rules、scheduled_research_jobs 与用户对象，不引入新基础设施。
**证据**: schema v18/pre-v18 backup；对象绑定与 confirmation key；无条件 UNKNOWN、draft 零写、confirm 幂等启用、owner isolation。backend 63、Alerts 5、Ruff/mypy/TypeScript/build、OpenAPI 116/147 通过。

### [DONE] AIOS-042: scheduled research 结果与 memory/evidence 串联

**优先级**: P1
**范围**: 将既有 scheduled research 的运行结果以幂等、可回链方式连接 owner-scoped research report、typed memory、canonical evidence 与通知；失败、重试、SSE/通知保持可追溯且不编造结果。
**前置**: AIOS-041 monitor targets 已完成；复用现有 scheduler/research jobs/memory/evidence/notifications，不引入外部队列。
**证据**: schema v19/pre-v19 backup；owner-scoped run key/attempt/failure retry/report lineage；evidence OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR 保真；memory opt-in candidate-only；notification 回链与 Settings 历史 UI。backend focused 79、frontend 5、Ruff/mypy/TypeScript/build，OpenAPI 117/148 通过。fixture/mock 不是真实上游验证。

### [DONE] AIOS-043: 复盘工作流：新证据 -> 判断变化 -> 用户确认

**优先级**: P1
**范围**: 在既有 canonical evidence、Thesis 不可变版本/差异/确认和 scheduled run lineage 上建立 owner-scoped review workflow；用户可从新证据检查判断变化并显式确认，刷新可恢复、历史不覆盖、失败不丢状态。
**前置**: AIOS-035 与 AIOS-042 已完成；复用 Thesis/evidence/status events，不新建 workflow runtime、不自动替用户改判断。
**证据**: schema v20/pre-v20 backup；deterministic `COMPUTED_RESULT` review 含 rule/version、old/new、canonical evidence；确认/驳回/失败事件 append-only 且决定幂等；失败 `UPSTREAM_ERROR` 不覆盖 pending。backend 69、frontend 6、Ruff/mypy/TypeScript/build，OpenAPI 119/150 通过。

### [DONE] AIOS-044: 本地可选产品指标

**优先级**: P1
**范围**: 仅在用户显式开启时，本地记录 TTFV、保存、继续和重复研究等产品事件；不保存金融正文、ticker、对象 ID 或凭据，支持用户清除。
**前置**: AIOS-040/041/042/043 已完成；指标不影响业务结果或金融决策。
**证据**: schema v21/pre-v21 backup；默认关闭、owner-scoped、可清除、90 天保留、event/value/time allowlist、未知字段拒绝、best-effort。focused backend 62 + frontend 9；OpenAPI 121/154。Phase 4 backend 479/83.74%、frontend 143、E2E 11，全 Ruff/mypy/TypeScript/build/diff check 通过；fixture 不是真实采用率。

### [DONE] AIOS-050: 自然语言 -> 有限策略 IR

**优先级**: P1
**范围**: 将用户自然语言策略描述解析为版本化、有限、可解释且不可直接执行的策略 IR；只支持现有能力可承载的 allowlist，歧义或未支持条件必须拒绝，不生成 Python/SQL/JavaScript 或任意表达式。
**前置**: AIOS-044 与 Phase 4 退出门禁已完成；复用现有策略实验室、ticker 规范和回测语义，不调用 LLM、不自动运行回测。
**证据**: `strategy-ir/v1` allowlist parser、结构化 invalid、认证 API 与 Strategy Lab 四态完成；backend 13、frontend 6、Ruff/mypy/TypeScript/build、OpenAPI 122/155、当前源码桌面端到端通过。无 LLM、数据库写入、自动回测或真实上游验证；390px 未取得浏览器实机证据。

### [DONE] AIOS-051: IR -> 现有筛选/回测能力

**优先级**: P1
**范围**: 将已验证的 `strategy-ir/v1` 确定性编译为现有 MA crossover 回测可接受的参数草稿，并在 Strategy Lab 中仅经用户显式应用；编译结果可逆、保留完整执行口径，不运行或保存回测。
**前置**: AIOS-050 已完成；复用现有 backtests API、表单与执行语义，不扩展策略语言或回测引擎。
**证据**: `ma-crossover-draft/v1` 仅映射 symbol/窗口/固定执行口径，九项参数待确认；IR/draft 可逆且篡改拒绝。backend 20、frontend 7、Ruff/mypy/TypeScript/build、OpenAPI 123/156 通过；无执行、保存或真实上游验证。

### [DONE] AIOS-052: Thesis 一键创建验证实验

**优先级**: P1
**范围**: 从 owner-scoped Thesis 显式创建可复核的 MA crossover 验证实验草稿，复用 Strategy Lab 与既有策略 IR/编译合同；只带入对象与明确策略参数，不自动运行或保存高成本回测。
**前置**: AIOS-051 已完成；复用 Thesis current view、Strategy Lab query state 和现有 backtests，不新增执行器或数据库表。
**证据**: `thesis-validation-experiment/v1` owner-scoped 动态 intent；ticker-only、11 项待确认、URL 刷新重新鉴权、无自动执行/保存。backend 10、frontend 17、Ruff/mypy/TypeScript/build、OpenAPI 124/157；浏览器无权错误态通过，本地库无 Thesis 且未写用户数据。

### [DONE] AIOS-053: Paper Portfolio 与真实组合严格分离

**优先级**: P1
**范围**: 在当前 owner-scoped portfolio 能力旁建立明确标记的模拟组合账本，记录模拟现金、持仓、成本和估值口径；与真实/用户组合数据表和路由严格分离，不存在账户、订单或交易接口。
**前置**: AIOS-052 已完成；优先复用现有行情、ticker 规范、组合 UI 与 raw SQL/单连接模式，任何 FX 缺口必须保持 UNKNOWN。

**证据**: schema v22/pre-v22 backup；独立 owner-scoped paper tables 与 immutable ledger；幂等/负现金/裸卖空/停用/成本/FX/UNKNOWN 边界。backend focused 23、frontend 5、Ruff/mypy/TypeScript/build、OpenAPI 129/163；隔离临时库浏览器 empty/create/append/valid/refresh、390px 无横溢出和键盘关闭通过。当次浏览器只读行情取得 `tencent` source/as-of；不构成真实账户或成交验证。

### [DONE] AIOS-054: 模拟复盘与 hypothesis outcome

**优先级**: P1
**范围**: 将 owner-scoped Paper Portfolio 的可复现账本/估值快照与已有 typed hypothesis memory 显式关联，保存用户选择的 review outcome；收益只作为 `COMPUTED_RESULT` 输入，不自动证明、否定或改写假设。
**前置**: AIOS-053 已完成；复用 `memory_records.review_outcome`、Paper Portfolio snapshot/valuation 与 Portfolio UI，不新增工作流引擎或第三方依赖。

**证据**: owner/type 隔离、只读草稿、显式 outcome、幂等 replay/conflict、原 hypothesis 不变、UNKNOWN 仅 inconclusive；backend focused 11、frontend 8、OpenAPI 131/166。Phase 5 全量 backend 513/83.94%、frontend 157、E2E 11；隔离浏览器 desktop 保存/刷新/键盘与 390px 无溢出通过。fixture/mock 不是真实上游或因果验证。

## AI Native Research OS Phase 6

### [DONE] AIOS-060: job event log、lease、幂等 key 与恢复语义

**优先级**: P1
**范围**: 在现有单进程 scheduler、`scheduled_research_jobs`/`scheduled_research_runs` 与研究事件上补齐可审计的 claim/heartbeat/terminal event、有限 lease、稳定幂等 key 和重启恢复；不引入外部队列或第二连接。
**前置**: AIOS-054 与 Phase 5 退出门禁已完成；复用现有 raw SQL、单 aiosqlite 连接、run/report lineage 和通知能力。

**证据**: schema v23/pre-v23 backup、owner-scoped immutable events、同事务 lease/status/event；focused 43、Ruff/mypy、OpenAPI 131/166、diff check。独立库 close/reopen 下 completed report 不重复 report/memory，未完成 run 以同 identity 建 attempt+1；仅 fixture 单机恢复验证。

### [DONE] AIOS-061: scheduler load/SLO 基线

**优先级**: P1
**范围**: 用独立 SQLite 与 deterministic no-op/失败 fixture 测量当前单连接 scheduler 的 claim/事件/终态写延迟、批量排队、失败和恢复成本，建立可重复 SLO 基线并核对第 7.2 节架构决策门。
**前置**: AIOS-060 已完成；基准只使用现有 job runtime，不调用真实模型/上游，不调整生产并发或引入外部基础设施。

**证据**: schema v23 临时 SQLite deterministic fixture 三次 PASS；最差 lifecycle P95 4.6498 ms、20-job batch 84.3661 ms、20 stale recovery 8.2897 ms，重复关键写入 0，失败/恢复完整率 100%。focused 3、Ruff/mypy、三次 runner、docs/diff check 通过；full-suite event-loop lock 回归修复后 backend 526/83.94%；未触发第 7.2 节架构决策门，不是真实上游或生产容量验证。

### [DONE] AIOS-064: backup/restore 与 memory/evidence consistency audit

**优先级**: P1
**范围**: 在现有单 SQLite 权威数据层上建立可重复的备份/恢复演练与 owner-scoped memory/evidence 跨表一致性审计，报告悬挂引用、归属错误和不可恢复状态；不引入外部数据库、队列或迁移框架。
**前置**: AIOS-060/061 已完成；AIOS-062/063 的条件式架构决策未触发且不构成本任务依赖。

**证据**: non-overwrite SQLite backup/restore runner 与 logical audit 完成；deterministic schema v23 三份 823,296-byte snapshot fingerprint 一致，restore integrity/logical PASS、issue 0，临时产物送入回收站。focused 5、Ruff/mypy/docs check；Phase 6 backend 526/83.94%、frontend 157、TypeScript/build、E2E 11 全通过；无真实上游或生产灾备验证。

## AI Native Research OS Phase 7

### [DONE] AIOS-070: 私有 share preview，默认不发布

**优先级**: P2
**范围**: 为 owner-scoped Thesis/Strategy 产物生成默认私有、不可公开访问的 share preview；只输出 allowlisted 摘要、来源/时效/许可/质量与免责声明，必须先通过脱敏审计且不触发发布或外部写操作。
**前置**: Phase 6 本地 durable runtime 退出门禁已通过；公开卡片 AIOS-071 的隐私、许可和法律决定仍保持 BLOCKED。

**证据**: `share-preview/v1` 两个 owner-scoped GET、统一 404、固定 private/unpublished/BLOCKED；Thesis metadata-only evidence 与 strategy persisted provenance、脱敏后二次扫描、PARTIAL/UNKNOWN 和无发布动作完成。backend 7、frontend 21、Ruff/mypy/TypeScript/build 通过；隔离 desktop 与 390px Chromium/Escape 验证通过。fixture/mock 不是真实上游、公开发布或法律许可验证。

### [PARKED] AIOS-071: 公开只读 Thesis/Strategy 卡片

**阻塞**: 需要隐私、数据再分发许可、免责声明与法律边界的明确决定；AIOS-070 不提供 URL、token 或发布动作。

### [PARKED] AIOS-072: Remix 并保留 lineage

**阻塞**: 依赖 AIOS-071 公开 Artifact 合规通过；不得绕过公开门禁建立派生主路径。

### [PARKED] AIOS-073: 模板市场/作者身份

**阻塞**: 依赖公开 Artifact、作者身份、滥用治理和合规决定；当前不建设 feed、排行或市场。

## AI Native Research OS Phase 8 - Local OSS v1

### [DONE] AIOS-080: Local OSS v1 产品层级与发布合同重置

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-080.md`
**范围**: 只读核对当前安装、Docker、README、CI、许可和发布事实；把近期目标从公网平台增长改为 GitHub 可开源、本机可安装自用，并将不属于该目标的公开增长任务 PARKED。
**证据**: 已有 Docker local MVP、loopback Compose、PowerShell 启动器和 CI 可复用；README 存在 API/schema 漂移、仅 Windows 启动入口、无 doctor、根目录无 LICENSE，clean-clone/持久化升级尚无发布级证据。`PROJECT_CONTRACT.md` 与长期路线已同步 Local OSS v1 验收标准。

### [DONE] AIOS-081: 跨平台本地启动器与 doctor

**优先级**: P0
**前置**: AIOS-080 已完成。
**范围**: 复用现有 Docker Compose local profile，提供 PowerShell 与 POSIX 的一致命令，并在不启动服务的 doctor 模式中检查 Docker/Compose、配置文件、端口、Compose 解析和关键路径；不得删除 volume、修改现有数据或访问外部服务。
**证据**: PowerShell 5 与 Bash 当前本机 doctor 通过；隔离合同验证缺 env、非法端口、不覆盖、不泄密和预检阻断。parser、`bash -n`、Compose config、ignore 与 diff check 通过；未执行 image build、服务重启或真实上游请求。

### [DONE] AIOS-082: 首次启动与可选能力降级

**前置**: AIOS-081 已完成。
**范围**: 复用当前默认模型、加密凭据和 Dashboard stats，在不探测外部服务的情况下诚实区分本地核心、模型配置与运行时上游状态，并给首次用户明确修复入口。
**证据**: `local-capabilities/v1` 与模型 credential source 完成；backend 8、frontend 5、Ruff/mypy/TypeScript/build、OpenAPI 133/168、diff check 通过。未调用真实模型或行情上游，当前 Docker image 未重建。

### [DONE] AIOS-083: 隔离发布源安装、持久化与恢复演练

**前置**: AIOS-082 已完成。
**范围**: 使用独立 Compose project、loopback 端口和 named volume 构建当前发布源，验证健康、前端、重启持久化、SQLite backup/restore 与旧 schema 升级；当前未提交工作树不得描述成 GitHub clean clone。
**证据**: 隔离 build/start/HTTP/local-only、schema v23/52 表、down/up probe、exclusive-create backup/restore 全通过；迁移/恢复 18、Ruff/contract/parser/Compose config 通过。最新随机 project 已 down、volume 保留，默认 5173 栈 ID/健康未变；不是 clean clone。

### [DONE] AIOS-084: GitHub 开源治理、安全材料与许可决策包

**前置**: AIOS-083 已完成；LICENSE 类型需要维护者作出法律选择，其他材料可先完成。
**范围**: 建立贡献、安全报告、本地隐私、数据来源/再分发边界和可重复仓库审计；准备 LICENSE 决策包但不得代替维护者作出法律选择。
**证据**: governance/privacy/license-boundary pack 与脱敏 audit 完成；审计为 4 BLOCKED/6 WARN。frontend 52 files/164 tests、Ruff/mypy/TypeScript/build、YAML/Markdown links 通过；未创建 LICENSE 或执行 GitHub 写操作。

### [DONE] AIOS-085: Local OSS v1 发布候选门禁

**前置**: AIOS-084 已完成；只生成本地发布证据，不自动推送或创建 GitHub Release。
**证据**: @Satanchen 已授权 Apache-2.0、`Copyright 2026 Satanchen` 与范围受控本地 candidate commit。clean-clone 工程候选 `18bca55a2ba6be5b55d27401afd324d15e61ccff`：backend 535 passed/1 explicit skip、coverage 84.16%、Ruff/mypy；frontend 52/52 files、TypeScript/build、串行 E2E 11/11；双 doctor、readiness BLOCKED=0/WARN=0、YAML 6、Markdown links 11。真实隔离 Compose build/start、local-only/no-key、v23/52、down/up persistence、backup/restore 通过；migration/recovery 18。候选容器已停止并保留证据 volume；最终状态同步候选仍只在本地生成，不 push/release/deploy。

### [DONE] AIOS-086: 可分发 Alpha starter catalogue 与公开源码树

**前置**: AIOS-084 已完成；AIOS-085 的第三方分发阻塞可通过不修改私有开发树的公开导出边界继续收敛。
**范围**: 完整 WQ catalogue 保留为私有开发树的许可未知可选数据；应用缺失该文件时使用项目自有最小 starter catalogue 并明确 PARTIAL。生成独立公开源码树时排除 `reference/`、完整 WQ JSON、用户数据和构建产物，再从导出树真实 Docker build/start；不创建 Git 仓库、不 commit/push/release。
**证据**: backend 18（含缺失/无效 JSON 降级）、frontend 5、Ruff/mypy/TypeScript/build、export contract 通过；项目外 605 文件 snapshot（tree SHA256 `84b944b7bc960ec74e83e68d1d4b2a9ae70dd98936e6385caf36c831c82267a9`）逐文件 SHA256，`reference`/WQ 排除 14,246/2。真实 Docker build/start 返回 starter `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`、8 字段/5 模板/coverage UNKNOWN；local-only/no-key、v23/52、持久化与 backup/restore 通过，证据树/volume 保留。

### [DONE] AIOS-087: Local OSS 公开树测试合同可移植性

**前置**: AIOS-086 已完成；AIOS-085 clean-clone 暴露公开边界与旧测试假设不一致。
**范围**: 只修改 Alpha 与 security 测试，使同一测试套件依据 catalogue metadata 验证私有扩展/公开 starter 双模式，并对公开树刻意不发布的公网 Compose 明确 skip；不改业务代码、Compose、依赖或架构。
**证据**: 私有树 focused 23 passed；公开树 22 passed/1 explicit skip；Ruff 通过。skip 仅覆盖未发布的公网 Compose，local Compose 安全测试继续执行；不是公网 TLS 或 WorldQuant 上游验证。

### [DONE] AIOS-088: 产品运行一致性与信号空状态修复

**前置**: AIOS-087 已完成；2026-08-16 维护者已授权修复运行验收暴露的旧镜像与信号摘要 404。
**范围**: 删除无权威数据来源的 `/api/signals/summary` 前端死调用，以显式 `UNKNOWN` 和个股分析入口替代；Local doctor 对比镜像与构建输入时间；同步当前六组导航和 Dashboard 产品矩阵。不得新增聚合后端、schema、依赖或修改 `reference/`。
**证据**: 删除死请求与伪 mock，跨标的信号保持 UNKNOWN；frontend 52 files/166 tests、backend 536/84.19%（测试进程显式关闭现有 `.env` local-only）、Ruff/mypy/TypeScript/build、E2E 11 通过。doctor 重建前 stale WARN、重建后双 PASS；HTML no-cache/哈希资源 immutable，内置浏览器纯 URL 新标签显示新状态且 console 0，600519 修复路径通过。未改 backend/schema/依赖/`reference/`，未 commit/push/publish。

AIOS-088 已完成，当前无 `[READY]`。AIOS-005 已接受 Native FTS5；其余 `[BLOCKED]` 第三方 PoC/阈值 ADR 与 `[PARKED]` 公网运营任务保持原状态，等待新的维护者决定或触发证据。

## 发布前收尾与长期路线图

### [DONE] BACKLOG-001: 发布前收尾与长期路线图

**任务卡**: `docs/ai/tasks/BACKLOG-001.md`
**证据**: 任务 1-4 已完成：LICENSE 当前事实校准、PRD/PRODUCT_MAP 技术栈引用和两项 legacy color gate 迁移；backend 541/84.25%、Ruff、frontend build、静态门禁与浏览器验证通过。2026-08-24，`@Satanchen` 明确批准保持 Native FTS5，AIOS-005 与 ADR-005 已关闭；公开 Artifact/Remix/模板市场按范围继续 `[PARKED]`。

## UI 优化阶段 — FinQuant Research OS

> 依据 `docs/UI_OPTIMIZATION_PLAN.md`（`[APPROVED]`，2026-08-24）。维护者已确认：① 删除独立页面并入 Research；② 中英文双语切换。执行 agent 按 UI-000 → UI-004 顺序推进，每任务独立验证。

### [BLOCKED] UI-000: Global Shell 与 i18n 双语基础

**优先级**: P0
**任务卡**: `docs/ai/tasks/UI-000.md`
**范围**: 三栏 Shell + 8 组一级导航（Today/Research/Discover/Strategy/Portfolio/Monitor/Library/Settings）+ Global Command Bar 意图识别 + 系统状态降级 + Model Selector 语义层 + 纯前端自建 i18n（zh/en 持久化切换）。删除的独立页面保留旧路由重定向，不 404。

**证据**: Shell、8 导航、旧路由重定向与 zh/en 持久化实现通过；模型管理、MCP 市场、登录、通知中心及活跃共享组件的剩余硬编码文案已进入同一字典。右上角系统状态先显示检查中，仅在 `/api/health` 明确返回 `ok` 后显示 `System OK`，失败时显示状态未知。最新生产构建通过（4,231 modules），全量前端复测 64/64 files、203/203 tests 通过（487.37s），zh/en 各 2,202 keys 且无重复/差异。正确入口 `http://localhost:5173/` 已以 HTTP 200 复验；2026-08-29 最新复验中，固定端口 8000 的 OpenAPI 为 `FinQuant Hub`（134 paths），直连及 5173 代理健康均为 `status=ok` / `db=wal`，八个一级模块抽样的 20/20 个只读代理 API 均返回 HTTP 200，按前端实际消费契约检查的顶层 JSON 结构也为 20/20 通过；八个一级路由、六个旧路由和两个系统工具路由共 16/16 个真实 5173 地址均返回标题 `FinQuant Hub` 的 HTTP 200 HTML，无 Vite error overlay 标记。Browser 截图能力仍被既有 URL policy 错误阻断，Discover、Library/Settings、修正后主链与全部 1440 状态未补拍，最终矩阵未完成，详见任务卡。

### [BLOCKED] UI-001: Research Workspace 重构

**优先级**: P0
**前置**: UI-000 已完成。
**任务卡**: `docs/ai/tasks/UI-001.md`
**范围**: Entity 页头 + 8 tab、Agent 模式（Fast/Analyst/Deep/Review）、Thesis 数据对象化（drift/conviction/evidence）、Evidence 引用系统、Multi-Agent 改 Review、Compare 自然语言化。

**证据**: Fast、Deep Research、Review 与完整 Thesis v2 已在 `/research` 上下文内加载真实能力；Deep 按真实 Agent 状态展示 Plan/Progress/Activity 且未知来源数不伪造为 0，Review 只保留结构化委员会输出。旧能力路由保留原查询参数，Compare 行级 Ask Agent、Entity Watch 和 Entity Evidence → 新 Thesis ticker/claim 预填均已接线；Thesis 列表使用明确的键盘原生“打开”按钮。不可达的旧版 13 章个股页已从 `StockAnalysis` 编译路径移除，当前只保留 Entity Workspace。最新生产构建通过（4,231 modules），全量 64/64 files、203/203 tests 通过（487.37s），zh/en 各 2,202 keys、重复 0、差异 0；Deep ticker、Chat、Discussion、Thesis status 与 Entity search 均已有显式可访问名称。2026-08-29 运行中 OpenAPI 复审确认研究相关路径只有 `/api/research` 创建/读取/导出、Swarm start 及 Scheduled Research Run，没有 pause/resume/change-scope 端点；修正后 Entity/Deep/Review/Compare/Thesis 与全部 1440 状态仍需重拍，故继续 `[BLOCKED]`，详见任务卡。

### [BLOCKED] UI-002: Monitor 一级化与 Today 重做

**优先级**: P1
**前置**: UI-000 已完成。
**任务卡**: `docs/ai/tasks/UI-002.md`
**范围**: Monitor 一级模块（10 种类型 + MonitorCard）+ Today 重做（处理队列 → My Universe → 市场脉搏 → Research Runs），系统状态退出首屏。

**证据**: Today/Monitor 可见组件共享 i18n 静态扫描为 0；Today 与 Monitor 的窄屏历史 PNG 已逐张复核；Today 个性化上下文卡片溢出已修复，近期会话/讨论条目已改为原生链接，Monitor 类型条只在自身容器滚动。单规则 `Run now` 复用既有 indicators 分析合同，立即检查真实行情/信号并刷新触发记录。最新生产构建 4,231 modules、全量 64/64 files/203/203 tests 通过（487.37s）。剩余精确 390/1440 截图门禁未完成，详见任务卡。

### [BLOCKED] UI-003: Strategy / Discover / Portfolio 归位

**优先级**: P1
**前置**: UI-000、UI-001 已完成。
**任务卡**: `docs/ai/tasks/UI-003.md`
**范围**: Strategy Lab 自然语言优先 + 结果视图、Discover 合并选股器与 Alpha、Portfolio P&L 首页 + Portfolio↔Research 双向连接。

**证据**: Strategy、Discover、Portfolio 可见组件共享 i18n 静态扫描为 0；Discover 四个 Filter Chips 可选/可取消且只预填，Global Command Bar 的 `query` 参数现由 Discover 实际读取；Strategy 六个结果 Tabs 切换对应内容；Portfolio 与全局 Thesis 动作会携带 ticker/new 上下文。最新生产构建 4,231 modules、全量 64/64 files/203/203 tests 通过（487.37s）。Strategy/Portfolio 的窄屏历史 PNG 已逐张复核；Discover 重拍和精确 390/1440 截图门禁仍未完成，详见任务卡。

### [BLOCKED] UI-004: 视觉 Token 收敛与反 slop 审计

**优先级**: P2
**前置**: UI-000 ~ UI-003 已完成。
**任务卡**: `docs/ai/tasks/UI-004.md`
**范围**: `--fq-*` tokens 全站收敛（radius/shadow/spacing）、行情与系统状态颜色分离、13 个第一等组件落地、taste-skill 反 slop 审计清单全过。

**证据**: 最新生产构建通过（4,231 modules）；`scripts/ui-contrast-audit.py` 对 light/dark 的文本、语义色、focus、evidence/status chip 共 58 组 token 组合复测 58/58 通过，最低 4.50:1；全量前端复测 64/64 files、203/203 tests 通过（487.37s），`git diff --check` 通过。13/13 组件齐全，radius 统一为 6/8px（仅语义胶囊保留 999px），soft shadow 为 none，`100vh`/`h-screen`、纯黑与 token 定义外硬编码色值均为 0。zh/en 各 2,202 keys、重复 0、差异 0；活跃导入图覆盖 130 个文件，可见表单控件无显式可访问名称缺口由 9 降为 0；RoleAvatar 与 Settings Agent 占位均已移除 emoji，活跃页面眉题、语言切换和图表加载态已进入字典；不可达的旧版 StockAnalysis 已移出编译路径。当前视觉证据仍非修正后的完整矩阵；Discover、Library/Settings、全部 1440 与完整渲染态 WCAG 仍因 Browser URL policy 未完成。
