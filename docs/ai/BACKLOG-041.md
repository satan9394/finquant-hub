# BACKLOG-041 — 模型供应商预设模板库（CC Switch 式，独立模块 + 扩常用供应商）

> 状态：`[DONE]`（代码完成待维护者复核合入）｜ 优先级：P2 ｜ 创建：2026-09-08 ｜ 完成：2026-09-11 ｜ 执行：DSH Worker
> 背景：用户指令"模型模块做好"+ 参考 CC Switch（50+ 供应商预设一键导入）。现状核实（2026-09-08）：Models.tsx 已有**内联 3 预设**（L225 `presets = { openai, deepseek, openrouter }` + provider Select onChange 自动填 base_url + custom）。差距：预设数量少（缺国内常用厂商）、预设数据内联在组件里不可扩展维护。本卡把预设抽为**独立数据模块**并扩到常用中文供应商（对齐 CC Switch 预设精神，按需取 10-15 个高频即可，不追求 50+）。

## 目标

1. **新建 `frontend/src/features/modelPresets.ts`**：导出 `MODEL_PRESETS`（数组/映射：id、labelKey、base_url、可选 remarkKey 备注），覆盖高频供应商：
   - 国际：openai（https://api.openai.com/v1）、deepseek、openrouter（现有 3 个保留）
   - 国内常用：通义千问 dashscope（https://dashscope.aliyuncs.com/compatible-mode/v1）、智谱 GLM（https://open.bigmodel.cn/api/paas/v4）、月之暗面 Kimi（https://api.moonshot.cn/v1）、豆包/火山方舟（https://ark.cn-beijing.volces.com/api/v3）、硅基流动 SiliconFlow（https://api.siliconflow.cn/v1）等（选 6-10 个，**base_url 必须核实正确**——不确定的宁可不加并在证据说明）
2. **Models.tsx 改用该模块**：provider Select 选项与 presets 数据来自 modelPresets.ts（替换 L225 内联），保留 custom；onChange 自动填 base_url 逻辑不变。
3. **i18n**：每个预设 labelKey（如 models.provider.qwen/glm/kimi/doubao/siliconflow）zh/en 同步 parity 0（中文默认）；备注 key 可省。
4. **测试**：预设模块纯数据测试（结构完整/labelKey 有对应 i18n key/base_url 合法）+ Models 表单 provider 切换自动填 base_url 用例（若 ModelsForm.test 已有则扩展）。

## 允许修改
- `frontend/src/features/modelPresets.ts`（新建）、`frontend/src/pages/Models.tsx`（改用模块）
- `frontend/src/i18n/zh.ts`+`en.ts`（新 label key）
- `frontend/tests/modelPresets.test.ts`（新建）、`frontend/tests/ModelsForm.test.tsx`（扩展 provider 切换用例）
- 证据文档：`docs/ai/BACKLOG-041.md`、`docs/ai/tasks/BACKLOG-041.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端（预设纯前端数据）；E2E/playwright config（models 相关 e2e 断言先核禁改）；依赖/锁文件；`reference/`
- 不删除文件（回收站铁律）；不加依赖；不改既有 custom 逻辑与 api_key/URL 契约（036/037 已定）
- 不臆造 base_url：每个预设的 base_url 以官方文档为准，拿不准的去掉并在证据说明（诚实纪律）

## 完成标准
1. modelPresets.ts 预设库（现有 3 + 新增国内厂商 ≥5，base_url 全部核实）；Models.tsx 改用模块、custom 保留
2. provider 切换自动填 base_url 不回归；i18n parity 0（所有 labelKey 有 zh/en）
3. 测试：modelPresets 结构测试 + Models 切换用例全过；build + Vitest 全量 + 4173 50 + 8000 21 全绿
4. git diff --check；删除 0；工作树干净；不 commit

## 参考
- CC Switch 预设：github.com/farion1231/cc-switch（50+ provider presets）
- 现状：`frontend/src/pages/Models.tsx`（L225 presets 内联 + L223-232 provider Select）
- 各厂商 base_url 官方口径（Worker 需联网核实或凭已知正确值；不确定宁可不加）

## 完成证据模板
```
- modelPresets.ts diff（预设清单 + 每个 base_url 核实来源/说明）
- Models.tsx 改用模块 diff（custom 保留）
- i18n labelKey + parity 0
- 测试（预设结构 + 切换用例）+ 全量门禁
- git diff --check、删除 0、未 commit
```
