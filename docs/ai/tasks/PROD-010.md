# PROD-010: 五组一级导航与路由映射

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

当前 14 个功能入口同级竞争，用户需要先理解系统模块，才能判断应从研究、策略或组合中的哪一页开始。

## 目标行为

把现有入口重组为“今日、研究、策略、组合、知识与系统”五组产品导航；保持所有既有页面和深链可访问，并让动态个股分析路由归入研究导航上下文。

## 范围内文件

- `frontend/src/App.tsx`
- `frontend/tests/AppNavigation.test.tsx`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不改页面内容、路由地址、认证、接口或数据库。
- 不实现 Dashboard 启动台、全局搜索、收藏或固定常用页面。
- 不引入新依赖，不修改 `reference/`，不提交或发布。

## 验收

- 一级导航恰好为五组，14 个原有菜单路由均映射到其中一组。
- `/research/reports` 作为深度研究入口直接可达；`/analysis/:ticker` 选中研究上下文。
- 原有 18 个应用路由不删除、不改名。
- 结构测试、前端构建、桌面与窄屏浏览器检查通过。

## 回滚方式

回退 `App.tsx` 的菜单数据与映射函数，并删除对应结构测试和任务状态变更；路由和持久数据不受影响。

## 验证结果

- `bun run test -- tests/AppNavigation.test.tsx`：2 passed。
- `bun run build`：通过，4,150 个模块完成转换。
- 桌面浏览器：五组一级导航可见；研究组展开后 5 个研究方式入口均可见；深度研究跳转到 `/research/reports`。
- 动态路由：`/analysis/600519` 加载成功并保持研究组展开。
- 390×844：Header 菜单可打开 220px 抽屉，五组入口可见。
- 证据：`artifacts/productization/phase1/06-navigation-desktop.png`、`07-navigation-narrow-390x844.png`。
