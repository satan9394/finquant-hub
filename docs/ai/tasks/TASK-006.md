# TASK-006: BigDataView 大屏仪表盘融入

## 目标
从 BigDataView 的 100+ 大屏模板提取 KPI 卡片和金融配色方案，在 FinQuant Hub 仪表盘页增加一屏「大屏概览」视图。

## 非目标
- 不改 `reference/` 目录
- 不引入新依赖
- 不改后端 API

## 允许修改
- `frontend/src/pages/Dashboard.tsx` — 追加大屏风格概览视图
- `frontend/src/App.css` — 追加大屏样式
- 可在 `frontend/src/components/` 下新增组件

## 禁止修改
- 所有 `.py` 文件
- `docs/ai/` 下的文件

## 实现思路
BigDataView 的 `view.html` 是单个 700+ 行 HTML 文件，内含 100+ 大屏方案。提取其中的：
1. 数字翻牌器/KPI 卡片 CSS
2. 深色金融主题配色
3. 网格布局思路

应用到 Dashboard.tsx 已有数据上（`/api/dashboard/stats` 返回总资产、持仓数等）。

## 验收
```bash
cd frontend && bun run build
```
零错误。`npm run dev` 后浏览器打开 `/` 能看到新的大屏风格区域。

## 回滚
```bash
git checkout -- frontend/src/pages/Dashboard.tsx frontend/src/App.css
```
