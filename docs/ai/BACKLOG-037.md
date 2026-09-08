# BACKLOG-037 — 模型管理前端表单重排（UX_ISSUES_20260907 问题一·前端）

> 状态：`[DONE]`（维护者复核 Codex 产物并合入，见 docs/ai/UX_FIX_EVIDENCE_20260907.md） ｜ 优先级：P1 ｜ 创建：2026-09-07 ｜ 完成：— ｜ 执行：DSH Worker
> 依赖：BACKLOG-036（后端 api_key 字段 + fetch-models 端点）先行合入。
> 背景：用户实测反馈（docs/ai/UX_ISSUES_20260907.md 问题一）：表单要求填"环境变量名"而非 key 值、Endpoint 字段语义混乱。本卡把 Models.tsx 表单重排为非技术中文用户可直接完成"填 key 用起来"。

## 目标

1. **表单字段重排**（frontend/src/pages/Models.tsx 及表单组件）：
   - 名称/供应商（可选预设下拉，如 OpenAI/DeepSeek/自定义）
   - API 地址（明确 placeholder/帮助："如 https://api.openai.com/v1"；tooltip 解释 base 与完整 Endpoint 区别——参考 CC Switch Full URL Endpoint 双模式）
   - **API Key：直接填值**（password 输入框 + 说明"存本地加密，不回显"；显示 has_api_key 状态而非明文）
   - 模型名 + "拉取模型列表"按钮（调 036 的 fetch-models，成功下拉可选、失败显示诚实 note 提示手动填）
   - 温度/最大 token（保持）
2. **测试报错展示**：测试结果区展示 036 的响应体片段+中文建议（不再只显示"失败"）。
3. **i18n**：新字段文案 zh/en 同步 parity 0；中文为默认（目标用户非技术）。
4. 测试：Models 相关组件测试同步（字段标签/直接填 key/拉模型按钮触发/报错展示），语义不放松。

## 允许修改
- `frontend/src/pages/Models.tsx` + 相关模型表单组件、`frontend/src/services/*Api.ts`（模型 API 层：api_key 字段 + fetch-models 调用）、`frontend/src/i18n/zh.ts`+`en.ts`、`frontend/tests/Models*.test.tsx`
- 证据文档：`docs/ai/BACKLOG-037.md`、`docs/ai/tasks/BACKLOG-037.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端（036 已定义契约，只消费）；E2E/playwright config（dashboard.spec 若 mock models 相关先核）；依赖/锁文件；`reference/`
- 不删除文件；不加依赖；不改 036 未定稿的 API 形状（若发现契约缺口回 036 调整）

## 完成标准
1. 表单可"填地址+填 key 值+拉模型/手填模型名"直接完成，字段文案中文易懂
2. api_key 输入为 password、保存后显示 has_api_key 不显示明文
3. 拉模型按钮调 fetch-models：成功可选列表、失败诚实提示
4. 测试结果区展示可行动错误
5. i18n parity 0；build + Vitest 全量 + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考
- 用户反馈+参考：`docs/ai/UX_ISSUES_20260907.md` 问题一（CC Switch 供应商表单）
- 036 后端契约（合入后）：model_configs.api_key 字段、fetch-models 端点、test 报错结构
- 现状：`frontend/src/pages/Models.tsx`、`services/modelApi.ts`（若有）

## 完成证据模板
```
- Models 表单 diff（字段/预设/拉模型/报错展示）
- i18n 新 key + parity 0
- 组件测试同步
- 全量门禁：build、Vitest、4173、8000
- git diff --check、删除 0、未 commit
```
