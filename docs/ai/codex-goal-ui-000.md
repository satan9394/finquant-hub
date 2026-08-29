# Codex Goal 提示词 — FinQuant Hub UI 优化

> 用途：直接复制粘贴给 Codex（或 ChatGPT Goal 模式），作为首个目标执行 UI-000。

---

## 目标（Goal）

请完成 FinQuant Hub 的 UI-000 任务：**Global Shell 与 i18n 双语基础**。

任务卡：`E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-000.md`
总规划（背景）：`E:\Code_file\Projects\finquant-hub\docs\UI_OPTIMIZATION_PLAN.md`
执行计划（任务链）：`E:\Code_file\Projects\finquant-hub\docs\ai\EXEC_PLAN.md`

## 开工前必读（按顺序）

1. `E:\Code_file\Projects\finquant-hub\HANDOFF.md` — 当前项目状态与边界
2. `E:\Code_file\Projects\finquant-hub\AGENTS.md` — 架构不变量与门禁命令
3. `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-000.md` — 本次任务范围
4. `E:\Code_file\Projects\finquant-hub\docs\UI_OPTIMIZATION_PLAN.md` — 全局规划背景
5. `E:\Code_file\Projects\finquant-hub\frontend\src\App.tsx` — 当前导航与 Shell
6. `E:\Code_file\Projects\finquant-hub\frontend\src\app.css` — 当前 `--fq-*` tokens

## 任务范围（UI-000 摘要）

1. **三栏 Shell**：左侧 8 组一级导航 + 中央 Main Canvas + 右侧 Agent Rail（360-400px）+ 顶部 Global Command Bar（48-56px）+ 底部 Command Composer。
2. **导航重构**：17 页 → 8 工作空间：
   - Today(今日) / Research(研究) / Discover(发现) / Strategy(策略) / Portfolio(组合) / Monitor(监控) / Library(资料库) / Settings(设置)
   - 删除的独立页面（快速问答/深度研究/多视角审查/投资论文）→ 并入 Research，旧路由保留重定向不 404。
   - MCP 工具市场/模型管理 → 降级进 Settings。
3. **i18n 双语**：纯前端自建（不新增依赖），`frontend/src/i18n/`（index + LanguageContext + zh + en），`t(key)` 贯穿导航与文案，`localStorage.finquant_lang` 持久化，中/EN 切换按钮，AntD locale 同步。
4. **Global Command Bar**：识别 5 种输入并路由（600519→证券 / 比较句→Compare / 监控句→Monitor / 筛选句→Discover / 回测句→Strategy）。
5. **系统状态降级**：正常/降级仅右上角 `● System OK` / `◐ Data delayed`，详细收敛到 System Status 入口。
6. **Model Selector**：显示语义层 `Fast / Analyst / Deep Research`，高级可 Override。

## 硬性约束（不可违反）

- 不新增任何 npm/Python 依赖
- 不改后端代码、schema、认证、用户隔离
- 不改 `reference/`、`docs/ai/ARCHITECTURE.md` 架构不变量
- 删除文件必须走回收站（PowerShell `SendToRecycleBin`），禁止 rm/del
- 保留旧路由重定向，不得 404
- 不 commit / push / publish / deploy

## 验证门禁（完成后必跑）

```powershell
cd E:\Code_file\Projects\finquant-hub\frontend
bun run build
bun run test
```

## 浏览器验收（你有内置浏览器/视觉能力）

逐页截图存 `docs/ui-current/`：
- 8 个一级导航各一张
- 桌面 1440 + 窄屏 390
- light + dark
- zh + en 各一份
- 检查无横向溢出、Command Bar 5 种输入路由正确、中/EN 切换即时生效

## 完成汇报格式

请用以下格式汇报：
- **结论**：UI-000 完成 / 部分完成 / 阻塞
- **改动文件**：清单
- **验证结果**：build/test/截图路径
- **下一步**：是否就绪进入 UI-001（`docs/ai/tasks/UI-001.md`）