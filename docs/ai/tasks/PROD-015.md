# PROD-015: 全局标的与任务入口

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

用户必须先判断功能属于哪个菜单，再到页面内重复输入标的或问题；跨分析、回测、组合、论文和预警的启动成本过高。

## 目标行为

在应用 Header 提供统一入口：搜索股票代码/公司名称或输入自然语言问题，再明确选择分析、研究、回测、加入组合、创建论文、设置预警或快速问答。入口只导航和预填，不自动调用模型、运行回测或写入业务数据。

## 范围内文件

- `frontend/src/components/GlobalTaskEntry.tsx`
- `frontend/src/features/globalTaskEntry.ts`
- `frontend/src/App.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/pages/Thesis.tsx`
- `frontend/src/pages/Alerts.tsx`
- `frontend/src/app.css`
- `frontend/tests/GlobalTaskEntry.test.tsx`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不自动发送问题、创建会话、运行回测、保存持仓/论文/预警。
- 不创建新的后端搜索、最近访问或推荐接口。
- 不引入命令面板依赖，不修改业务计算、认证、路由合同或 `reference/`。
- 不提交或发布。

## 验收

- Header 入口可搜索标的，也可把自然语言问题预填到快速问答。
- 六个标的任务使用现有路由；组合、论文和预警只打开预填状态，保存仍需用户确认。
- 显示本机最近选择的标的与已保存研究，且不存储自然语言问题。
- 桌面和窄屏可访问，键盘/可访问名称明确。
- 组件测试、相关页面测试、构建和浏览器验证通过。

## 回滚方式

移除 Header 入口、路由生成工具和三个页面的预填参数读取；不涉及数据库回滚。

## 验证结果

- 测试先失败于入口模块不存在；实施后完整前端：18 files / 45 tests passed。
- Dashboard/Portfolio E2E：2 passed；`bun run build`：通过，4,154 个模块完成转换。
- 桌面浏览器完成“搜索 600519 → 选择贵州茅台 → 加入组合”路由；进入页面时没有弹窗或写入。
- 用户点击预填后，组合仅有代码/名称，数量与成本为空；论文、预警仅有 ticker；自然语言问题仅进入 Chat 输入框，未自动发送。
- 分析任务携带 `autorun=0`，个股页显示待用户点击“刷新分析”，不会因全局入口导航自动消耗模型额度。
- 390×844 只有一个可见入口，弹窗宽 374px，无横向溢出。
- 最近标的仅保存 code/name/market，不保存自然语言问题；已保存研究来自现有只读接口。
- Ruff、构建、`git diff --check` 通过。全量后端为 378 passed / 4 failed；四项均由实时 AAPL/00700 行情上游不可用导致，直接复现 `/api/research` 为 502，未修改或伪造数据。
- 证据：`artifacts/productization/phase1/17-global-task-entry-desktop.png`、`18-global-task-entry-narrow-390x844.png`。
