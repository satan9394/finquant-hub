# BACKLOG-043 — 供应商管理模块（对齐 CC Switch providers，从静态预设升级为可管理供应商）

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker
> 背景：用户质问"你到底有没有基于 CC Switch 把供应商模块做出来"。**核实结论：没有**。现状只有 `frontend/src/features/modelPresets.ts`（36 行、8 条静态预设）+ Models.tsx 简单表单，没有供应商管理 UI。CC Switch 真实实现（只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`，Tauri+React/TS）包含 `src/components/providers/` 12 文件（ProviderList/ProviderCard/ProviderForm/AddProviderDialog/EditProviderDialog/ProviderActions/ProviderHealthBadge/ProviderStatusBadge/ProviderPresetSelector/ProviderAdvancedConfig）+ `src/components/universal/` 3 文件 + `src/config/` 12 个 `*Presets.ts`。本卡补齐"预设库 + 供应商卡片管理 + 健康状态"三件套。

## 目标

1. **预设库扩容与可信来源**：`frontend/src/features/modelPresets.ts` 从 8 条扩到 **≥15 条**国内/国际常用供应商（建议覆盖：openai/deepseek/openrouter/dashscope(通义)/glm(智谱)/kimi(月之暗面)/doubao(火山方舟)/siliconflow(硅基流动)/minimax/stepfun(阶跃)/baichuan(百川)/hunyuan(腾讯混元)/moonshot 等）。**每一条 base_url 必须有官方文档直证**（证据里给 URL + 关键行）；**无法官方直证的宁可不加**，并在证据里列出"未加入清单+原因"。预设项增加 `category`（国际/国内）与 `docsUrl` 字段。
2. **供应商卡片管理 UI**：Settings/Models 页供应商列表改为卡片式（对齐 CC Switch `ProviderCard.tsx` 的信息层级：名称、类型、base_url 摘要、启用开关、操作区），支持新增/编辑/删除/启用停用；保留既有 `Models.tsx` 表单字段语义（api_key 值/URL 不二次拼接/拉模型列表），不回归 036/037 契约。
3. **健康状态徽章**：为每个供应商显示连接状态（未测试/正常/异常 + 最后检查时间），后端补一个"测试连接"端点或复用既有 test 端点，失败诚实展示原因（对齐 `ProviderHealthBadge.tsx`/`ProviderStatusBadge.tsx` 语义）。
4. **预设选择器**：新增供应商时按 category 分组的预设选择器（对齐 `ProviderPresetSelector.tsx`），选中即自动填 base_url，custom 仍不自动填。
5. i18n zh/en parity 0；确定性测试（预设结构/选择器/card 渲染/健康状态分支）。

## 允许修改
- `frontend/src/features/modelPresets.ts`、`frontend/src/pages/Models.tsx`、`frontend/src/pages/Settings.tsx`（如需）、新增 `frontend/src/components/models/*` 或 `frontend/src/components/settings/*`
- `frontend/src/i18n/zh.ts` + `en.ts`、`frontend/src/services/modelApi.ts`（如需）
- 后端：`backend/app/routers/models_crud.py`（仅"测试连接"相关，若需新增端点）、`backend/app/services/llm_client.py`（仅复用，不重构）
- 测试：`frontend/tests/*`（新增/聚焦）、`backend/tests/test_model*.py`
- 证据/契约：`docs/ai/BACKLOG-043.md`、`docs/ai/tasks/BACKLOG-043.md`、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不加新依赖；不改 `frontend/e2e/*`、`frontend/playwright*.config.ts`（先 grep 核 models 相关断言）
- 不删文件（回收站铁律亦不适用——本卡零删除）
- 不臆造 base_url（无官方直证一律不加）；不改 036/037 已定 api_key 加密存/URL 归一契约；不动用量/计价/context/MCP 域（040/042/044/045 域）
- 不存 api_key 明文到日志/响应

## 完成标准
1. `MODEL_PRESETS` ≥15 条，每条 base_url 有官方来源（证据表给 URL+关键行），未加入项有诚实清单
2. 供应商卡片管理 UI（列表/新增/编辑/删除/启停）+ 预设选择器（分组）可用，custom 不自动填不回归
3. 健康状态徽章显示三态 + 最后检查时间，失败诚实不 5xx
4. i18n zh/en parity 0；确定性测试覆盖预设结构/选择器/card/健康分支
5. build + 聚焦 Vitest + 全量 Vitest + 4173 50 + 8000 21 全绿；git diff --check 通过；删除 0；不 commit

## 参考（**强制**：证据里必须给出被参考源码的 file:line 引用）
> 路径已按 2026-09-13 实测核实（`providers/` 顶层 10 文件 + `providers/forms/` 约 60 文件）；引用时请用下表真实路径，勿凭记忆拼路径。
- 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（**只读，禁止修改**）
  - 顶层列表/卡片/操作：`src/components/providers/ProviderList.tsx`(740)、`ProviderCard.tsx`(755)、`ProviderActions.tsx`(480)、`ProviderEmptyState.tsx`(59)、`AddProviderDialog.tsx`(472)、`EditProviderDialog.tsx`(310)
  - 状态/徽章：`src/components/providers/ProviderHealthBadge.tsx`(77)、`ProviderStatusBadge.tsx`(63)、`FailoverPriorityBadge.tsx`(34)、`AuthSettingsPanel.tsx`(25)
  - 表单（**注意在 forms/ 子目录**）：`src/components/providers/forms/ProviderForm.tsx`(2874)、`forms/ProviderPresetSelector.tsx`(505)、`forms/ProviderAdvancedConfig.tsx`(182)、`forms/BasicFormFields.tsx`(194)、`forms/shared/ApiKeySection.tsx`(90)、`forms/shared/EndpointField.tsx`(112)、`forms/shared/ModelDropdown.tsx`(99)、`forms/shared/ModelInputWithFetch.tsx`(106)、`forms/ApiKeyInput.tsx`(69)
  - **测试连接/健康语义重点参考**：`src/components/providers/forms/EndpointSpeedTest.tsx`(658) + `forms/hooks/useSpeedTestEndpoints.ts`(159)
  - 状态/hooks：`src/components/providers/forms/hooks/useProviderCategory.ts`(94)、`useApiKeyState.ts`(105)、`useBaseUrlState.ts`(172)、`useModelState.ts`(250)
  - 通用供应商面板：`src/components/universal/UniversalProviderPanel.tsx`(320)、`UniversalProviderCard.tsx`(126)、`UniversalProviderFormModal.tsx`
  - 预设数据组织：`src/config/universalProviderPresets.ts`(132)、`piProviderPresets.ts`(1510)，以及 `claudeProviderPresets.ts`/`codexProviderPresets.ts`/`geminiProviderPresets.ts` 等共 12 个 `*Presets.ts`
- 现状：`frontend/src/features/modelPresets.ts`、`frontend/src/pages/Models.tsx`、`backend/app/routers/models_crud.py`

## 完成证据模板
```
- 预设清单表（id/category/baseUrl/官方来源URL+关键行）+ 未加入清单与原因
- 卡片管理 UI diff + 交互说明（新增/编辑/删除/启停/选择器）
- 健康状态徽章实现说明（三态 + 最后检查时间 + 失败诚实）
- CC Switch 源码引用表：每个借鉴点 → cc-switch 文件:行 → 我们的实现位置
- i18n parity 数字 + 测试用例清单 + 门禁逐项结果
- git diff --check、删除 0、未 commit
```
