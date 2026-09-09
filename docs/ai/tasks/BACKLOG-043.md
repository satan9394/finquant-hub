# BACKLOG-043 完成证据 — 供应商管理模块（对齐 CC Switch providers）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-043.md` ｜ 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（本次全程只读，未修改其中任何文件）

---

## 1. 预设清单表（id / category / baseUrl / 官方来源 URL + 关键行）

`MODEL_PRESETS` 共 **15 条**（国内 7 + 国际 8），每条 base_url 均由厂商**官方文档正文**直证；`docsUrl` 字段即下表“官方来源”列，UI 中「查看官方文档」直达该页。

| # | id | category | baseUrl | 官方来源 URL | 关键行（原文摘录） |
|---|----|----------|---------|--------------|--------------------|
| 1 | dashscope | domestic | `https://dashscope.aliyuncs.com/compatible-mode/v1` | https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope | 同页两处原文组合：①「华北2（北京）地域：从 `https://dashscope.aliyuncs.com` 迁移至 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com`……**现有域名仍可正常使用**」；②第三方客户端段「以 `/compatible-mode/v1` 结尾、不含 `/chat/completions` 的地址」。⚠️ 非单行直证，见 §5 诚实声明 |
| 2 | glm | domestic | `https://open.bigmodel.cn/api/paas/v4` | https://docs.bigmodel.cn/cn/guide/develop/openai/introduction | `base_url="https://open.bigmodel.cn/api/paas/v4/"`（官方 OpenAI 兼容页「创建客户端」代码块，多处同值） |
| 3 | kimi | domestic | `https://api.moonshot.cn/v1` | https://platform.kimi.com/docs/api/overview | 协议兼容性表：`\| OpenAI Chat Completions \| https://api.moonshot.cn/v1 \| /chat/completions \|` |
| 4 | minimax | domestic | `https://api.minimax.cn/v1` | https://platform.minimaxi.com/docs/api-reference/text-openai-api | `export OPENAI_BASE_URL=https://api.minimax.cn/v1` |
| 5 | hunyuan | domestic | `https://api.hunyuan.cloud.tencent.com/v1` | https://cloud.tencent.com/document/product/1729/111007 | 「base_url：`https://api.hunyuan.cloud.tencent.com/v1`。」 |
| 6 | siliconflow | domestic | `https://api.siliconflow.cn/v1` | https://docs.siliconflow.cn/docs/userguide/quickstart | `base_url="https://api.siliconflow.cn/v1"`（4.3 通过 OpenAI 接口调用） |
| 7 | stepfun | domestic | `https://api.stepfun.com/v1` | https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create | 「请求地址 `POST https://api.stepfun.com/v1/chat/completions`」 |
| 8 | openai | international | `https://api.openai.com/v1` | https://platform.openai.com/docs/api-reference | OpenAI 官方 OpenAPI 规范（官方仓库 openai/openai-openapi，`openapi.yaml`）：`servers:` → `- url: https://api.openai.com/v1` |
| 9 | deepseek | international | `https://api.deepseek.com` | https://api-docs.deepseek.com/ | 「Your First API Call」参数表：`\| base_url (OpenAI) \| https://api.deepseek.com \|` |
| 10 | openrouter | international | `https://openrouter.ai/api/v1` | https://openrouter.ai/docs/quickstart | `url="https://openrouter.ai/api/v1/chat/completions"`、`base_url="https://openrouter.ai/api/v1"` |
| 11 | together | international | `https://api.together.ai/v1` | https://docs.together.ai/docs/quickstart | 正文「point it at Together's base URL (`https://api.together.ai/v1`)」+ `base_url="https://api.together.ai/v1"` |
| 12 | fireworks | international | `https://api.fireworks.ai/inference/v1` | https://docs.fireworks.ai/getting-started/quickstart | `base_url="https://api.fireworks.ai/inference/v1"` |
| 13 | cerebras | international | `https://api.cerebras.ai/v1` | https://inference-docs.cerebras.ai/quickstart | `curl https://api.cerebras.ai/v1/chat/completions` |
| 14 | deepinfra | international | `https://api.deepinfra.com/v1/openai` | https://docs.deepinfra.com/quickstart | 「**Base URL**: `https://api.deepinfra.com/v1/openai`」 |
| 15 | nebius | international | `https://api.tokenfactory.nebius.com/v1` | https://docs.tokenfactory.nebius.com/quickstart | `base_url="https://api.tokenfactory.nebius.com/v1/"` |

### 未加入清单 + 原因（拿不准一律不加）

| 候选 | 端点 | 结论 | 原因（实测） |
|------|------|------|--------------|
| doubao（火山方舟） | `https://ark.cn-beijing.volces.com/api/v3` | **移除** | 官方文档 `www.volcengine.com/docs/82379/1298454` 与 `docs.volcengine.com/docs/82379/1494384` 均为客户端渲染，web_fetch 实测 HTTP 200 但正文为空；官方 Python SDK README（`volcengine/volcengine-python-sdk`）只给通用 Endpoint 规则，无 Ark base_url。BACKLOG-041 的“交叉核实”声明已于 2026-09-13 撤回，本次仍无法官方直证 → 从预设库移除 |
| ollama（本地自托管） | `http://localhost:11434/v1` | **不加** | 官方已直证（https://docs.ollama.com/api/openai-compatibility：`base_url='http://localhost:11434/v1/'`），但表单现有 base_url 校验为 AntD `{ type: 'url' }`，其正则显式排除 127/10/192.168 且不接受无点主机名，localhost 端点会被表单直接拒绝；放开校验属改 036/037 URL 契约范围，本卡不做 |
| groq | — | 不加 | `https://console.groq.com/docs/openai` 实测 **HTTP 403 Forbidden**，无官方直证 |
| mistral | — | 不加 | `https://docs.mistral.ai/getting-started/quickstart`（含 `.md`）本机 web_fetch 两次 `fetch failed`（网络不可达） |
| xAI (grok) | — | 不加 | `https://docs.x.ai/docs/overview(.md)` 本机 web_fetch `fetch failed` |
| perplexity | — | 不加 | `https://docs.perplexity.ai/getting-started/quickstart(.md)` 本机 web_fetch `fetch failed` |
| baichuan | — | 不加 | `https://platform.baichuan-ai.com/docs/api` 客户端渲染，正文为空 |
| 百度千帆 | — | 不加 | 沿用 041 结论：官方文档客户端渲染，本次仍无直证页面 |
| sambanova | — | 不加 | 官方 quickstart 中 base URL 为占位符 `"your-sambanova-base-url"`，无实值 |
| 讯飞星火 / 零一万物 | — | 不加 | 本次未核查到可直证的官方页面（未纳入，不臆造） |

---

## 2. CC Switch 源码引用表（借鉴点 → cc-switch 文件:行 → 我们的实现位置）

> 以下文件均在本次会话中**实际读取**（read 工具，非推测），行号为只读源文件真实行号。

| # | 借鉴点 | cc-switch 文件:行 | 我们的实现位置 |
|---|--------|-------------------|----------------|
| 1 | 卡片信息层级：图标 → 名称 → 状态徽章 → base_url 摘要 | `src/components/providers/ProviderCard.tsx:394-598`（图标 :412-423、名称与徽章 :425-514、URL 摘要 :582-597） | `frontend/src/components/models/ProviderCard.tsx`（头像 → 名称 + 默认/类型/停用标签 → 健康徽章 → base_url → 模型名·凭据） |
| 2 | 卡片右侧操作区（编辑/测试/删除等按钮组） | `src/components/providers/ProviderCard.tsx:601-737` | `ProviderCard.tsx` 右侧 `<Space>`：启用开关 + 编辑 / 测试 / 设为默认 / 删除 |
| 3 | 卡片 props 契约（onEdit/onDelete/onTest/isTesting） | `src/components/providers/ProviderCard.tsx:51-83` | `ProviderCard.tsx:21-32`（ProviderCardProps：onEdit/onTest/onSetDefault/onDelete/onToggleEnabled/testing） |
| 4 | 健康状态三态判定（正常 / 降级 / 熔断，按失败次数与 isHealthy） | `src/components/providers/ProviderHealthBadge.tsx:23-53` | `frontend/src/components/models/ProviderHealthBadge.tsx:20-35`（TONE：untested / ok / error 三态，未测试**绝不**显示为正常） |
| 5 | 徽章呈现：圆点 + 文案 + title 承载细节 | `src/components/providers/ProviderHealthBadge.tsx:60-76` | `ProviderHealthBadge.tsx:49-80`（圆点 + 标签 + 最后检查时间 + Tooltip 明细） |
| 6 | 状态徽章 tone 映射（info/muted/success/warning） | `src/components/providers/ProviderStatusBadge.tsx:9-28` | `ProviderHealthBadge.tsx:20-35`（--fq-opportunity / --fq-system-error / --fq-text-tertiary + 12% 背景） |
| 7 | 徽章 Tooltip 承载说明并可键盘聚焦 | `src/components/providers/ProviderStatusBadge.tsx:30-62` | `ProviderHealthBadge.tsx:54-58`（Tooltip 汇总“最后检查/原因/延迟”） |
| 8 | 预设搜索过滤（按显示名等字段） | `src/components/providers/forms/ProviderPresetSelector.tsx:72-85`、`:211-219`、`:324-344` | `frontend/src/features/modelPresets.ts:filterPresets`（标签/ID/base_url 三字段）+ `ProviderPresetSelector.tsx:64-75` 搜索框 |
| 9 | 预设排序/分组优先级拼接（official → 伙伴 → 其余） | `src/components/providers/forms/ProviderPresetSelector.tsx:87-127` | `modelPresets.ts:groupPresetsByCategory`（按 `PRESET_CATEGORIES` 顺序分组、空组丢弃） |
| 10 | 预设按钮网格 | `src/components/providers/forms/ProviderPresetSelector.tsx:397-456` | `ProviderPresetSelector.tsx:82-113`（`repeat(auto-fill, minmax(180px, 1fr))` 网格） |
| 11 | 显式 custom 入口（不自动填） | `src/components/providers/forms/ProviderPresetSelector.tsx:398-409` | `ProviderPresetSelector.tsx:115-122` + `Models.tsx` onChange 仅在 `presetBaseUrl(id)` 有值时才写 base_url |
| 12 | 搜索无结果空态 | `src/components/providers/forms/ProviderPresetSelector.tsx:411-417` | `ProviderPresetSelector.tsx:77-83`（Empty + `models.preset.noResults`） |
| 13 | 预设选择器底部说明文案 | `src/components/providers/forms/ProviderPresetSelector.tsx:502` | `ProviderPresetSelector.tsx:123-125`（`models.preset.hint`） |
| 14 | 供应商列表搜索过滤 | `src/components/providers/ProviderList.tsx:309-318` | `providerState.ts:filterProviders` + `Models.tsx` 工具栏搜索框 |
| 15 | 预设分类随选中预设变化 | `src/components/providers/forms/hooks/useProviderCategory.ts:33-91` | `Models.tsx` `Form.useWatch('provider')` → 选择器高亮 + 文档链接联动 |
| 16 | 测试连接结果形状与呈现（latency/status/error，失败显示“失败”而非编造） | `src/components/providers/forms/EndpointSpeedTest.tsx:24-50`、`:599-623` | `providerState.ts:ProviderHealthEntry`（status/checkedAt/message/latencyMs）+ `Models.tsx:handleTest`（成功与失败都落库，失败展示后端原文） |
| 17 | 候选端点收集自当前 base_url + 预设 | `src/components/providers/forms/hooks/useSpeedTestEndpoints.ts:44-105` | 本卡不实现（单供应商单端点，无候选测速需求），仅借鉴“以预设 base_url 为准”语义 → `Models.tsx` 选中预设即回填 base_url |
| 18 | 预设数据结构（name/providerType/defaultApps/websiteUrl/icon/description） | `src/config/universalProviderPresets.ts:18-37`、`:61-91`、`:96-116` | `modelPresets.ts:ModelPreset`（id/labelKey/baseUrl/category/docsUrl/remarkKey） |
| 19 | 供应商卡片：base_url 与备注并列展示 | `src/components/universal/UniversalProviderCard.tsx:88-123` | `ProviderCard.tsx:76-93`（base_url + 模型名·凭据行） |

**读过但未采用（诚实列出）**：`ProviderList.tsx:418-425`（ProviderEmptyState 专用空态组件）——本卡沿用 AntD Table 默认空态，未新增空态组件；`ProviderList.tsx:277-307`（Ctrl/Cmd+F 搜索快捷键）——本卡未加全局快捷键，避免与既有 ⌘K 命令栏冲突；`ProviderAdvancedConfig.tsx`、`forms/shared/*`——对应字段（headers/代理/高级参数）不在本卡范围。

---

## 3. 改动清单

新增：
- `frontend/src/components/models/providerState.ts` — 健康状态 + 本地启停偏好（localStorage）+ `filterProviders`/`visibleProviders` 纯函数
- `frontend/src/components/models/providerLabels.ts` — `modelCredentialLabel`（从 Models.tsx 抽出以避免循环依赖）+ `providerTypeLabel`
- `frontend/src/components/models/ProviderHealthBadge.tsx` — 三态徽章 + 最后检查时间
- `frontend/src/components/models/ProviderCard.tsx` — 供应商卡片
- `frontend/src/components/models/ProviderPresetSelector.tsx` — 分组预设选择器
- `frontend/tests/ProviderCard.test.tsx`、`ProviderPresetSelector.test.tsx`、`providerState.test.ts`、`ModelsCards.test.tsx`

修改：
- `frontend/src/features/modelPresets.ts` — 8 → 15 条，新增 `category`/`docsUrl`，新增 `presetById`/`groupPresetsByCategory`/`filterPresets`
- `frontend/src/pages/Models.tsx` — 卡片列表（默认）+ 表格视图切换 + 搜索 + 显示已停用 + 健康徽章接线 + 预设选择器替换旧 Select；仍 `export { modelCredentialLabel }`（既有测试面不变）
- `frontend/src/i18n/zh.ts`、`en.ts` — +36 key
- `frontend/tests/modelPresets.test.ts`、`ModelsForm.test.tsx` — 同步新选择器与移除 doubao 断言

**零后端改动**（`git status` 无 backend 文件），零依赖改动（`frontend/package.json`、`bun.lock` 未变），零删除。

### 交互说明（新增/编辑/删除/启停/选择器）
- **列表**：默认卡片视图（每行一张卡）；`Segmented` 可切表格视图（保留原列语义：名称/供应商/地址/模型/凭据/连接状态/操作）。
- **新增**：`新增模型` → 弹窗内**分组预设选择器**（国内/国际两组 + 搜索 + 「其他 OpenAI 兼容接口」）；点预设自动填 base_url，点「其他」**不覆盖**手动输入（`presetBaseUrl('custom') === undefined`）。
- **编辑**：卡片「编辑」复用同一弹窗与字段语义（api_key 直存/URL 不二次拼接/拉模型列表，036/037 契约未动）。
- **删除**：卡片「删除」→ Popconfirm 确认 → `DELETE /api/models/{id}`，同时清理本地健康记录与停用标记。
- **启停**：卡片开关为**本地偏好**（无后端 `enabled` 列）：停用后该供应商默认从列表折叠隐藏，工具栏出现「显示已停用」开关可回看（卡片灰显 + 「已停用」标签），**不删除配置**；UI 文案与 Tooltip 如实说明，不暗示后端路由变化。
- **搜索**：工具栏搜索框按名称/供应商 id/base_url 过滤卡片。

---

## 4. 健康状态徽章实现说明

- 数据来源：复用既有 `POST /api/models/{id}/test`（未新增端点，无契约变更）。返回 `{ok, latency_ms, message, reply}`，失败路径后端已脱敏且**不返回 5xx**。
- 三态：`untested`（未测试，灰）/ `ok`（正常，--fq-opportunity）/ `error`（异常，--fq-system-error）；由 `healthStatusOf()` 唯一判定，**未测试绝不显示为正常**。
- 最后检查时间：`recordProviderHealth()` 落 `localStorage['finquant_provider_health']`（按模型 id），徽章显示 `最后检查：MM-DD HH:mm`；损坏/缺失 payload 降级为 `{}`，不抛错。
- 失败诚实：徽章 Tooltip 与页面测试结果面板展示后端原文（如「连接被拒绝」），不编造原因、不吞错；`try/catch` 分支同样落 `error` 状态。
- 表格视图新增「连接状态」列（复用同一状态函数），卡片/表格两视图状态一致。

---

## 5. 诚实声明与决策（需维护者知悉）

1. **dashscope 为“同页两处原文组合”而非单行直证**：阿里云官方页当前主推业务空间专属域名（含 `{WorkspaceId}` 占位符，不可作为预设值），旧域名 `https://dashscope.aliyuncs.com` 在同页明确“仍可正常使用”，且同页规定地址“以 `/compatible-mode/v1` 结尾”。故保留 041 的端点值并如实标注证据形态；若维护者要求“单行直证”，可将其移入未加入清单（届时预设数为 14，低于卡的 ≥15 门槛）。
2. **doubao 已从预设库移除**（原因见 §1 未加入清单）。既有 doubao 配置不受影响：Models 页对其显示原始 provider id，`models.provider.doubao` 标签键保留。
3. **启停语义为本地偏好**：本卡禁止改 schema（`database.py` 不在允许清单），ModelConfig 无 `enabled` 列，因此未做成后端持久化开关；UI 文案如实限定为“列表折叠隐藏”。
4. **默认视图为卡片、但列表渲染仍用 AntD Table 单列**：`frontend/e2e/system-pages.spec.ts:35` 断言 `/models` 默认渲染 `tbody tr` 含供应商名（该 E2E 属卡禁止修改范围），故卡片列表以单列 Table 承载，E2E 与既有表格断言在两种视图下均不回归。
5. **`ModelsForm.test.tsx` 已按新选择器改写**（原断言用 `combobox 供应商` 选择预设，现改为点击预设按钮），断言语义不变（预设自动填 / custom 不覆盖手动值）。
6. **后端 pytest 有 5 项预存失败**（详见 §6），本卡零后端改动，与 043 无关。

---

## 6. 门禁逐项结果

| 门禁 | 结果 | 说明 |
|------|------|------|
| `backend pytest -q` | **871 passed / 5 failed**（覆盖率 92.43%） | 5 项失败全部为**预存**、位于本卡未触碰文件：`test_api.py::test_mcp_http_server_configuration_lifecycle`、`test_api.py::test_enabled_mcp_servers_restore_and_record_failures`、`test_database_migrations.py` 3 项（`assert 25 == 24` 等）。系 BACKLOG-042（schema v24→v25 + mcp.py transport 改造，commit ed02b20）遗留，本卡 `git status` 无任何 backend 文件改动 |
| `backend ruff check .` | **All checks passed!**（exit 0） | 零后端改动 |
| `frontend bun run build` | **通过**（prebuild 契约检查 fresh 59 schemas + `tsc -b` 零错误 + vite built in 21.79s） | |
| 聚焦 Vitest | **7 files / 39 tests passed** | modelPresets 11、providerState 7、ProviderCard 7、ProviderPresetSelector 4、ModelsCards 6、ModelsForm 2、Models 2 |
| 全量 Vitest | **132 files / 443 tests：130 files / 441 tests passed，2 项失败均为环境性超时且隔离复跑全绿** | 详见 §7 |
| 4173 E2E | **50 / 50 passed（2.0m）** | 含 `system-pages.spec.ts:31` models 用例（卡片视图仍渲染 `tbody tr` + 「新增模型」弹窗） |
| 8000 E2E | **21 / 21 passed（1.7m，`--retries=0`）** | 真实入口 `SERVE_FRONTEND=1 LOCAL_ONLY_MODE=1` |
| i18n zh/en parity | **2371 / 2371，差集 0，重复 0**（本卡 +36 key） | 用 `bun -e` 直接比对 `translations.zh/en` 键集合 |
| `git diff --check` | **通过（exit 0）** | 仅 LF→CRLF 提示（仓库既有 autocrlf 行为，非 diff-check 错误） |
| 删除 | **0** | 未删任何文件，未使用 rm/del |
| commit | **未 commit** | 交维护者复核 |

### 测试用例清单
- `tests/modelPresets.test.ts`（11）：≥15 条 / 国际三条端点不变 / 国内 7 条端点与 category / 两类各 ≥5 且 category 合法 / 每条 docsUrl 为 https / 结构完整且 base_url 合法 / id 唯一 / labelKey zh+en 齐备 / 未知 id 返回 undefined（custom 安全）/ 分组不丢项 / 搜索按标签·id·base_url。
- `tests/providerState.test.ts`（7）：三态判定 / 记录与清除 / 停用列表去重排序 / 损坏 payload 降级 / 停用折叠与显示 / 列表搜索 / 时间格式化容错。
- `tests/ProviderCard.test.tsx`（7）：信息层级 / 未测试态 / 正常态含最后检查时间 / 异常态 / 启停开关与停用标记 / 默认项隐藏“设为默认” / 编辑·测试·删除接线。
- `tests/ProviderPresetSelector.test.tsx`（4）：分组 + custom 存在 / 点击回传 id（含 custom）/ 搜索过滤与空态 / 手动填写提示。
- `tests/ModelsCards.test.tsx`（6）：卡片渲染 / 测试成功→正常 / 测试失败→异常且展示原因 / 停用折叠与回看 / 搜索过滤 / 弹窗内分组选择器 + custom 不覆盖手动值。
- `tests/ModelsForm.test.tsx`（2，改写）：discover 未保存密钥 + 失败保留手动输入 / 预设自动填 base_url + custom 不覆盖。
- `tests/Models.test.tsx`（2，未改）：`modelCredentialLabel` 导出面保持。

---

## 7. 最终结果（全量 Vitest 与 flaky 说明）

- **全量 Vitest（第 2 次，日志 `%TEMP%\vitest-043-run2.log`）**：`132 files / 443 tests` → **130 files / 441 tests passed**；2 项失败：
  - `tests/FundamentalMetricsPanel.test.tsx > separates real derived values from unavailable metrics`（6.4s 超时）
  - `tests/ProfessionalPreferences.test.tsx > requires an explicit save and restores the current defaults`（7.7s 超时）
  - 两文件**与本卡零关系**（不含 models/provider 代码），**隔离复跑 11/11 全绿**（18.43s），与 HANDOFF 记录的环境性超时模式一致（机器当时有 22 个 Chrome 进程 + 1 个 node 进程长期占用 CPU）。
- **第 1 次全量运行**（同一份代码，负载更高）：5 files / 13 tests 失败，全部为 5s 超时类；第 2 次同样代码降到 2 项 → 进一步佐证是负载而非回归。
- **本卡 7 个测试文件在全量运行中全部通过**（日志可见 `✓ tests/ModelsForm.test.tsx`、`✓ tests/ModelsCards.test.tsx`、`✓ tests/ProviderCard.test.tsx`、`✓ tests/ProviderPresetSelector.test.tsx`、`✓ tests/providerState.test.ts`）。
- `git diff --check`：**exit 0**；`git status` 仅本卡允许清单内文件（6 修改 + 6 新增，其中 `docs/ai/tasks/BACKLOG-043.md` 为本证据文件）。
- **删除 0**（未调用 rm/del/回收站），**未 commit**。
- 契约同步：本卡**未新增/修改任何后端端点**（健康检测复用既有 `POST /api/models/{id}/test`），故 `docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md` 无需改动（已核对：无新增路由、无参数变更）。
