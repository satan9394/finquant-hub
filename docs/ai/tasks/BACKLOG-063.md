# BACKLOG-063: 模型管理拉取模型交互闭环与候选模型直观选用

- Status: completed
- Mission: 打通"拉取模型 → 候选可视化 → 一键回填/批量添加"的模型配置交互闭环
- Source: human-requested
- Risk: low

## 目标与背景
用户在「设置 → 模型管理 (`/models`)」配置模型时反馈：点击「拉取模型」按钮后，界面只弹出一个“已拉取模型列表”的通知提示，但没有展示拉取出来的模型列表，也没有提供添加或选用模型的交互入口，导致用户困惑“拉取了却用不了”。
本任务旨在打通「拉取模型 → 候选展示 → 一键选用/快捷添加」的完整交互闭环。

## 核心重构与需求
1. **拉取结果可视化候选面板**:
   - 当点击「拉取模型」并成功从供应商 API（例如 CommandCode 成功拉取 81 个模型）获取模型列表后：
     - 在表单下方直观展开「已拉取候选模型（N 个）」展示区域（Tag 标签流或列表卡片）；
     - 提供候选模型搜索过滤框，支持输入关键词（如 `flash`、`deepseek`、`claude`、`qwen`）即时筛选候选模型；
     - 给出清晰明确的指引文案：“已成功获取 N 个模型，点击任意模型可直接填入配置”。

2. **一键点击填入与快捷多选添加**:
   - 交互 1（单模型选用）：点击候选列表中的任意模型标签（Tag），立即将模型名称自动回填至表单的「模型名称（`model_name`）」以及「配置名称（`name`）」，并自动聚焦至保存按钮；
   - 交互 2（快捷勾选批量添加）：支持勾选多个常用模型，提供「批量添加已选模型」快捷操作，系统自动使用当前供应商的 base_url 与密钥为勾选的模型批量生成对应的配置记录。

3. **异常与空状态诚实提示**:
   - 当供应商接口不支持 `/models` 端点时，除错误提示外，明确指引“该供应商未开放模型列表接口，请直接在输入框中手动键入模型名称”；
   - 输入框的 AutoComplete 保证在用户聚焦时能够自动弹出下拉建议。

## 交付文件
- `frontend/src/pages/Models.tsx`: 升级添加/编辑模型弹窗中的拉取结果交互区域。
- `frontend/src/components/models/DiscoveredModelSelector.tsx`: 新增拉取结果候选模型选择与搜索组件。
- `frontend/tests/ModelsForm.test.tsx` / `frontend/e2e/model-telemetry.spec.ts`: 更新与补充拉取模型点击选用的测试用例。

## 验证门禁
- 在模型弹窗中点击拉取模型，候选模型面板立即展开并呈现模型列表。
- 点击任意候选模型标签，表单 `model_name` 字段被立即填入，点击保存能成功入库。
- 前端测试与 `bun run build` 100% 通过。

## 完成证据（2026-09-24）
- `bun run test tests/ModelsForm.test.tsx`：4/4 passed；覆盖不支持模型列表接口时的手动输入指引、候选搜索与 Tag 回填名称、聚焦候选时展开 AutoComplete，以及复用当前地址/密钥批量创建配置。
- `bun run build`：OpenAPI 60 schemas fresh，TypeScript 0 errors，Vite 4,280 modules built。
- 新增 `DiscoveredModelSelector.tsx`，候选模型可搜索、逐个回填或勾选批量添加；批量请求复用现有 `/models` API，并报告部分失败。未填写 API Key 或环境变量名时会阻止批量创建。
- 新增交互提示的中英文文案；没有候选模型时保留手动输入，并提示供应商可能未开放 `/models`。
- `git diff --check` 通过；未改后端/API/schema/依赖，未删除文件。
