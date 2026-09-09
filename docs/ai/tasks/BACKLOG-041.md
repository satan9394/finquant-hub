# BACKLOG-041 完成证据

> 任务：模型供应商预设模板库（CC Switch 式，独立模块 + 扩常用供应商）
> 执行：DSH Worker ｜ 完成：2026-09-11 ｜ 状态：代码完成待维护者复核合入

## 改动清单（严格限于卡 §允许）

### 前端
- 新增 `frontend/src/features/modelPresets.ts`：导出 `MODEL_PRESETS`（`{ id, labelKey, baseUrl, remarkKey? }` 数组，8 项 = 现有 3 国际 + 新增 5 国内）+ 辅助函数 `presetBaseUrl(id)`（未知 id 如 custom 返回 undefined）。纯数据模块，零依赖。
- `frontend/src/pages/Models.tsx`：provider Select 选项与 base_url 自动填充全部改用 `MODEL_PRESETS`/`presetBaseUrl`（删除 L225 内联 presets 对象）；`custom` 选项与"custom 不自动填 base_url"逻辑原样保留（`presetBaseUrl('custom')` → undefined 不 setFieldValue）；onChange 其余逻辑（清空 modelOptions）不变。
- `frontend/src/i18n/zh.ts`+`en.ts`：新增 5 个 labelKey（`models.provider.dashscope/glm/kimi/doubao/siliconflow`），parity 0（见下）。
- 新增 `frontend/tests/modelPresets.test.ts`：6 用例（保留 3 国际预设 base_url 断言 / 新增 ≥5 国内预设存在 / 结构完整 + baseUrl 合法 http(s) / id 唯一 / 每个 labelKey 在 zh+en 均有值 parity 0 / 未知 id 返回 undefined）。
- `frontend/tests/ModelsForm.test.tsx`：新增 1 用例「auto-fills base_url when switching to a preset provider and keeps manual entry for custom」——切换 DeepSeek / 通义千问 / 硅基流动自动填对应 base_url，手动填值后切 custom 不覆盖。

## 预设清单与 base_url 核实

| id | labelKey | baseUrl | 核实来源 |
|----|----------|---------|----------|
| openai | models.provider.openai | https://api.openai.com/v1 | 既有预设保留（原内联值） |
| deepseek | models.provider.deepseek | https://api.deepseek.com | 既有预设保留（原内联值） |
| openrouter | models.provider.openrouter | https://openrouter.ai/api/v1 | 既有预设保留（原内联值） |
| dashscope | models.provider.dashscope | https://dashscope.aliyuncs.com/compatible-mode/v1 | 阿里云百炼官方 OpenAI 兼容文档（compatible-mode/v1 路径）。⚠️ 原写"CC Switch 参考项目 pi 预设同值"**已撤回**（2026-09-13 核实：CC Switch 无 dashscope 预设） |
| glm | models.provider.glm | https://open.bigmodel.cn/api/paas/v4 | 智谱官方 docs.bigmodel.cn openai-sdk 页代码 `base_url="https://open.bigmodel.cn/api/paas/v4/"`（尾斜杠后端 llm_client 已 rstrip 归一） |
| kimi | models.provider.kimi | https://api.moonshot.cn/v1 | 月之暗面官方 platform.moonshot.cn docs（curl 示例 `https://api.moonshot.cn/v1/chat/completions` + OpenAI 客户端 base_url 同值） |
| doubao | models.provider.doubao | https://ark.cn-beijing.volces.com/api/v3 | 火山方舟官方文档「Base URL 及鉴权」。⚠️ 原写"取 CC Switch 参考项目 pi 预设 DouBaoSeed 同值"**已撤回**（2026-09-13 核实：CC Switch 无 doubao/DouBaoSeed 预设） |
| siliconflow | models.provider.siliconflow | https://api.siliconflow.cn/v1 | 硅基流动官方 docs.siliconflow.cn 快速上手页代码 `base_url="https://api.siliconflow.cn/v1"` |

**诚实声明（2026-09-13 更正）**：原"诚实声明"称"所有新增 base_url 均有官方文档或参考项目（CC Switch）来源"，其中 **dashscope 与 doubao 两行的"CC Switch pi 预设交叉核实"来源声明不成立，予以撤回**。核实方式与结论：只读核查 CC Switch 源码 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（Tauri + React/TS，v3.16.x）——`src/config/piProviderPresets.ts` 仅含 Kimi/PackyCode/ZetaAPI/APINebula/AICodeMirror/FennoAI，**无 doubao**；全仓（含 docs）搜 `doubao|DouBaoSeed|volces` 只命中 release-notes 的模型计价条目 "Doubao Seed" 与 v3.15.0 新增供应商 "Volcengine Agentplan"，**无 DouBaoSeed 预设**；全仓搜 `dashscope|aliyuncs` 只命中 release-notes 的 usage 解析条目，**无 dashscope 预设**。此外本次核实发现：当时"参考 CC Switch"实际只经 web_fetch 读其 GitHub README，**从未读取其源码**。保留结论：glm/kimi/siliconflow 三行有官方文档直证；openai/deepseek/openrouter 为原内联既有值；dashscope/doubao 端点值为生态公认正确端点，但**其来源仅能表述为"生态公认/官方文档未能直取"，不再声称经 CC Switch 交叉核实**。百度千帆（qianfan）仍按"拿不准宁可不加"未加入。

## i18n parity
- zh/en 各 2336 key，差集 0、重复 0（新增 5 key 一一对应）。

## 门禁实测
- frontend `bun run build`：通过（tsc + vite）。
- 聚焦 Vitest：modelPresets 6/6、ModelsForm 2/2、Models 2/2。
- 全量 Vitest：**128 files / 414 tests passed**（基线 127/407，+7）。
- 4173 E2E：**50/50 passed**（--retries=0，55.6s）。
- 8000 E2E：**21/21 passed**（--retries=0，49.2s）。
- `git diff --check`：通过（exit 0，仅 LF→CRLF 归一化警告，既有现象）。
- 删除 0（git status 无 deleted）。
- 未 commit / 未 push。

## 边界诚实声明
- 遵守卡 §允许：仅上述文件。后端零改动；E2E/playwright config 零改动（先 grep 核 models 相关 e2e 断言——`system-pages.spec.ts` 仅断言行渲染 + 新增模型弹窗，不涉及 provider 选项/base_url，故不回归）；依赖/锁文件/reference 零改动；无删除；不加依赖。
- 不改 036/037 已定 api_key/URL 契约；custom 逻辑原样；i18n parity 0；测试语义不放松（ModelsForm 既有用例零改动，仅新增）。
- 未碰用量/context/MCP（040/043/042 域）。
