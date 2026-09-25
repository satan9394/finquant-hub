# BACKLOG-064: 供应商管理界面精简净化与双协议直观驱动

- Status: completed
- Mission: 供应商管理改为 OpenAI/Anthropic 双协议卡片驱动，18 厂商预设折叠收起
- Source: human-requested
- Risk: medium

## 目标与背景
用户在配置模型时强烈反馈：自己只配置并使用了一个专属供应商（如 CommandCode），但界面上强制平铺了 18 个包含国内外公有云厂商（智谱、千问、豆包、MiniMax、Cerebras 等）的庞大预设网格，产生了严重的信息噪音与无关内容污染。
用户的真实心智模型非常清晰简洁：
1. 我的供应商/服务名称；
2. 基础协议是什么（选择 **OpenAI 兼容协议** 还是 **Anthropic 原生协议**）；
3. API Base URL 与 API 密钥；
4. 要调用的模型。
本任务旨在净化供应商选择器，彻底摆脱“公有云厂商大乱炖”的展示方式，改为以「核心协议直观驱动 + 干净自定义 + 公共预设折叠收拢」的现代化极简形态。

## 核心重构与需求
1. **协议优先（Protocol-First）直观架构**:
   - 在添加/编辑模型界面顶部，将原本杂乱的厂商网格替换为两大核心协议卡片（单选 Segmented / Radio Card）：
     - **OpenAI 兼容协议**（默认）：使用 `/chat/completions` 与 Bearer Token，适配 CommandCode、DeepSeek、OpenRouter 及各类私有中继；
     - **Anthropic 原生协议**：使用 `/v1/messages` 与 `x-api-key`，适配 Claude 官方接口。
   - 切换协议卡片时，界面仅展示对应协议的必要帮助与默认地址，不再铺陈任何无关厂商按钮。

2. **公有云预设降级折叠，杜绝喧宾夺主**:
   - 原有的 18 个公有云厂商预设不再默认占据大半屏，改为弱化、可选的辅助功能：
     - 提供一个紧凑的辅助入口，例如「从常见厂商快速填入（可选）」的下拉菜单或折叠抽屉；
     - 未打开折叠时，界面完全保持纯净，只有用户的自定义配置表单（名称、Base URL、API Key、模型名与协议）。

3. **「我的供应商 / 现有服务」专属分组**:
   - 在供应商管理页面与筛选区域，只高亮展示用户当前真实已配置的供应商（如 CommandCode）；
   - 不再无端展示用户从未配置过的外部厂商空白卡片或未停用列表，还用户一个清爽纯净的专属工作台。

## 交付文件
- `frontend/src/components/models/ProviderPresetSelector.tsx`: 重构为协议驱动（OpenAI vs Anthropic）与预设折叠组件。
- `frontend/src/pages/Models.tsx`: 优化弹窗表单布局，协议前置，净化冗余展示。
- `frontend/tests/ProviderPresetSelector.test.tsx` / `frontend/tests/ModelsCards.test.tsx`: 同步测试断言。

## 验证门禁
- 打开「添加模型」弹窗，界面清爽干净，顶部仅有 OpenAI 兼容 / Anthropic 原生两大协议选项。
- 18 个外部厂商按钮不再常驻平铺；用户输入 CommandCode 名称与 Base URL 体验丝滑无干扰。
- 前端测试与 `bun run build` 100% 成功。

## 完成证据（2026-09-24）
- `bun run test tests/ProviderPresetSelector.test.tsx tests/ModelsCards.test.tsx tests/ModelsForm.test.tsx`：3 个测试文件、17/17 passed；覆盖双协议切换、Anthropic URL/模型默认值、已配置供应商高亮、预设默认收起及按协议过滤。
- `bun run build`：OpenAPI 60 schemas fresh，TypeScript 0 errors，Vite 4,280 modules built。
- 添加/编辑模型弹窗顶部使用 OpenAI 兼容与 Anthropic 原生两张单选协议卡；切换时驱动 provider、Base URL 与 Anthropic 默认模型。18 个公有云预设只在展开辅助入口后挂载，并按协议过滤。
- 当前已配置供应商在预设入口上方集中高亮；只显示供应商标签，不暴露 API Key。模型表单的名称、Base URL、密钥和模型字段保持可直接填写。
- 2026-09-24 Chromium fixture 浏览器复核并重新生成 1440×1080 / 390×844 默认、预设展开与 Anthropic 状态截图；桌面弹窗宽 640px，窄屏弹窗宽 374px、文档宽 390px；`pageerror=0`。运行期间观察到一条由 `rc-util/es/isEqual.js` warning helper 输出的 `There may be circular references` 控制台消息，按 warning 记录。截图：`frontend/test-results/backlog-064-default-1440.png`、`frontend/test-results/backlog-064-default-390.png`、`frontend/test-results/backlog-064-presets-1440.png`、`frontend/test-results/backlog-064-presets-390.png`、`frontend/test-results/backlog-064-anthropic-390.png`。
- `git diff --check` 通过；未改后端/API/schema/依赖，未删除文件。
