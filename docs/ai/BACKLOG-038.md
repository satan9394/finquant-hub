# BACKLOG-038 — 机会发现（Discover）空态/自然语言/行业 + 涨停池术语外行可懂

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-07 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：用户实测反馈（`docs/ai/UX_ISSUES_20260907.md` 问题二，非技术中文投资者视角）：
> ① Discover 空态无任何推荐（股票结果/因子全空）② 不支持自然语言（用户记不住代码）③ 细分行业缺行业/概念分类 ④ **涨停池/跌停池专业术语外行看不懂**（"封单额是什么？涨停统计是什么？我看不懂"）。

## 目标

### 1. Discover 空态默认推荐
- 无输入时页面不空：展示默认推荐区（"今日热门/示例公司/按板块推荐"——数据可用后端已有 stats/market_overview 或前端静态示例兜底，不造假数据：无数据时诚实提示但给示例入口）。
- 空结果时给"换种说法/试试代码或公司名"引导而非空白。

### 2. 自然语言搜索
- Discover 搜索明确支持公司名/中文描述（复用既有 `/api/market/search` 名称/拼音能力）；placeholder 改为"输公司名、代码或描述（如：白酒龙头）"。
- 若现有入口强制代码/因子，放宽为优先名称搜索。

### 3. 行业/概念分类
- 细分行业区增加行业/概念股归类浏览（标签/分组）。若后端无该数据源，先做前端分组静态骨架 + 诚实"数据待接入"标注，不臆造数据。**先核 backend 是否有行业/板块数据**（market_overview/板块接口），有则接、无则留注。

### 4. 涨停池/跌停池术语外行可懂（重点，用户原话）
- `frontend/src/pages/LimitPool.tsx`（涨停池页）每个专业列（封单额/涨停统计/连板/炸板/开板/跌停/换手 等）加**中文释义 tooltip/问号**；或列名改外行可懂（封单额→"排队买入的资金量"）。
- 复用 `frontend/src/features/indicatorKnowledge.ts` 的"用途/读法/误区"解释卡范式（已有知识库模式）。
- 页面顶部加一句"什么是涨停/跌停池"说明（i18n）。
- 保持后端数据列不变（只前端展示层解释）。

## 允许修改
- `frontend/src/pages/Discover.tsx`、`frontend/src/pages/LimitPool.tsx`、相关 Discover/LimitPool 组件
- `frontend/src/i18n/zh.ts`+`en.ts`（新文案 parity 0）
- `frontend/src/features/indicatorKnowledge.ts` 或新建术语解释数据（参考其模式）
- `frontend/tests/Discover*.test.tsx`、`LimitPool*.test.tsx`（同步）
- 证据文档：`docs/ai/BACKLOG-038.md`、`docs/ai/tasks/BACKLOG-038.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端（行业/板块数据若缺只在文档记录缺口，不新增数据源）；E2E/playwright config；依赖/锁文件；`reference/`
- 不删除文件；不加依赖；不改 BACKLOG-028 ticker 相关；不造假数据（空态推荐须诚实）

## 完成标准
1. Discover 无输入有默认推荐/引导（不空荡）；支持公司名/描述搜索；行业/概念分类（有据则接、无据留注）
2. LimitPool 专业列全部有中文释义（tooltip 或改名），顶部有"涨停/跌停"一句话说明；外行可懂（以用户"我看不懂"为判据）
3. i18n parity 0；build + Vitest 全量 + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考
- 用户反馈：`docs/ai/UX_ISSUES_20260907.md` 问题二
- 现状：`frontend/src/pages/Discover.tsx`、`pages/LimitPool.tsx`、`features/indicatorKnowledge.ts`（解释卡范式）、`services/marketApi.ts`（search 能力）
- 注意：038 与 039 都改 i18n，**串行执行**（038 先，039 后）

## 完成证据模板
```
- Discover 空态/自然语言/分类 diff + 测试
- LimitPool 术语释义 diff（每列 tooltip/改名清单）+ 测试
- 行业/概念数据核查结论（接 or 留注）
- 全量门禁：build、Vitest、4173、8000
- git diff --check、删除 0、未 commit
```
