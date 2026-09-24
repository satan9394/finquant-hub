# BACKLOG-052: 前端 Telemetry 遥测指示器与上下文预算感知

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 依赖前置：BACKLOG-051 已合入
> 核心定位：会话内极客感遥测状态条 + 上下文预算指示器 + CC Switch 预设扩充

---

## 1. 目标 (Task)
在前端消费后端派发的 `llm_metrics` SSE 事件，打造类似 DeepSeek Harness / Claude Code 的硬核沉浸式遥测交互；增加输入框上下文预算条，防止长上下文溢出；扩充供应商预设库以支持 Claude 官方及中转模板。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `frontend/src/features/modelPresets.ts` (MODIFY: 补充 Anthropic 预设)
  - `frontend/src/pages/Models.tsx` (MODIFY: 协议类型切换与说明)
  - `frontend/src/components/ModelTelemetryBadge.tsx` (NEW)
  - `frontend/src/components/ContextBudgetBar.tsx` (NEW)
  - `frontend/src/pages/Chat.tsx` (MODIFY: 挂载遥测组件)
  - `frontend/src/pages/Research.tsx` (MODIFY: 挂载遥测组件)
  - `frontend/src/pages/Discussion.tsx` (MODIFY: 挂载遥测组件)
  - `frontend/src/i18n/zh.ts` & `en.ts` (MODIFY: 双语补充)
  - `frontend/tests/ModelTelemetryBadge.test.tsx` (NEW)
  - `frontend/tests/modelPresets.test.ts` (MODIFY: 补充测试断言)
- **严禁触碰**：
  - 严禁引入任何新的 npm 依赖（图表与气泡纯 AntD 5 与 `--fq-*` CSS 实现）。
  - 严禁硬编码颜色值，必须消费 Design System 的 `--fq-*` 变量。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **预设库设计参考**：
  - 提取本地 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src\src\config\piProviderPresets.ts` 资产。
  - 新增 `anthropic` 预设：`baseUrl: "https://api.anthropic.com"`，默认模型 `claude-3-7-sonnet`，官方文档链接与 `sk-ant-...` 校验提示。
- **状态条交互规范**：
  - 常态紧凑展示：`[模型名] ⚡ {speed_tps} tok/s · ⏱️ {ttft_ms}ms · 🎯 {cache_hit_rate}%`。若含思考 Token 则显示 `🧠 {reasoning_tokens}`。
  - 悬浮展开 Popover：展示完整 Prompt/Cached/Completion Token 构成，以及折算的费用节省估算比例。
- **上下文预算指示条**：
  - 根据输入长度与模型 contextLimit 计算百分比，按 `<50%` (安全蓝), `70%-85%` (提示橙), `>85%` (告警红) 自适应颜色。

---

## 4. 契约规范 (Output Contract)
- `frontend/src/i18n/zh.ts` 与 `en.ts` 保持 zero parity diff，所有新增键必须双语对应。
- `ModelTelemetryBadge` 接受统一接口：`metrics?: LLMExecutionMetrics`，当 metrics 为空或未就绪时优雅降级，不阻断渲染。

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 前端类型检查与构建（含 prebuild openapi 校验）
cd frontend && bun run build

# 2. 前端组件单测
cd frontend && bun run test tests/ModelTelemetryBadge.test.tsx tests/modelPresets.test.ts

# 3. 国际化对齐检查
cd frontend && node -e "const zh=Object.keys(require('./src/i18n/zh').default); const en=Object.keys(require('./src/i18n/en').default); if(zh.length!==en.length) process.exit(1);"
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-052 为完成状态。
2. 追加 `task/CHANGELOG.md` 记录。
