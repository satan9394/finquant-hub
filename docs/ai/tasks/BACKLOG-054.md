# BACKLOG-054: 专业级多周期 K 线与动态技术分析工作台 (Pro Market Terminal)

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 业务领域：金融行情与高交互量化图表
> 核心定位：多周期切换 + 主副图指标联动 + 十字光标同步 + AI 信号锚点上墙

---

## 1. 目标 (Task)
将现有的单周期基础 K 线图升级为专业级金融量化交互终端：支持日 K / 周 K / 月 K / 分钟线多周期切换；构建主图指标（MA / EMA / BOLL）与副图独立指标窗口（MACD / KDJ / RSI / VOL）的双向时间轴联动；在 K 线上直观打点标记 AI Agent 投研结论事件锚点。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `frontend/src/components/charts/ProCandlestickChart.tsx` (NEW: 主副图联动工作台)
  - `frontend/src/components/charts/chartIndicators.ts` (NEW: 指标算法库)
  - `frontend/src/hooks/useProChart.ts` (NEW: Lightweight Charts 实例与联动控制 hook)
  - `frontend/src/pages/ResearchWorkspace.tsx` (MODIFY: 接入新图表终端)
  - `backend/app/services/market_data.py` (MODIFY: 扩充多周期/分钟线获取与缓存)
  - `backend/app/routers/market.py` (MODIFY: 暴露周期与 K 线指标端点)
  - `frontend/tests/ProCandlestickChart.test.tsx` (NEW)
  - `backend/tests/test_market_periods.py` (NEW)
- **严禁触碰**：
  - 严禁引入新的外部图表库（纯基于既有的 `lightweight-charts 4.2`）。
  - 严禁硬编码颜色值，所有线条与背景必须消费 `--fq-*` CSS 变量。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **开源标杆与设计参考**：
  - 架构与渲染参考：`tradingview/lightweight-charts` (17.3k★) 官方交互设计。
  - 指标算法参考：`deepentropy/lightweight-charts-indicators` (纯 TypeScript 纯函数指标计算：MACD, RSI, KDJ, BOLL)。
  - 终端布局参考：`OpenBB-finance/OpenBB` (45k★) 的专业行情工作台切分。
- **计算纯函数化**：
  - 所有指标计算（`calculateMACD`, `calculateBOLL`, `calculateKDJ`, `calculateRSI`）必须实现为入参不可变的纯函数，输入标准的 `{time, open, high, low, close, volume}` 数组，输出对应的指标线数据数组。
- **主副图交互协同**：
  - 主图与副图使用独立的图表容器，通过 Lightweight Charts 的 `timeScale().subscribeVisibleLogicalRangeChange` 实现视口平移与缩放的双向实时对齐。
  - 十字光标（Crosshair）移动时，通过 `subscribeCrosshairMove` 同步高亮所有子图表同一时间点的值。
- **Agent 事件时间锚点**：
  - 接入 `research_reports` 数据，利用图表的 `createMarker` 接口在 K 线特定时间戳上标记评级买入（买/看多）、审慎（中性）、规避（看空）图钉，点击图钉联动展开侧边报告抽屉。

---

## 4. 契约规范 (Output Contract)
- **指标纯函数返回规范**：
  - MACD: `{ dif: LineData[], dea: LineData[], macd: HistogramData[] }`。
  - BOLL: `{ upper: LineData[], middle: LineData[], lower: LineData[] }`。
  - KDJ: `{ k: LineData[], d: LineData[], j: LineData[] }`。
- **后端周期 API 规范**：
  - `GET /api/market/kline?symbol=XXX&period=day|week|month|60m|15m`：返回标准 OHLCV 数组。

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 后端多周期数据获取单测
cd backend && .venv\Scripts\python.exe -m pytest tests/test_market_periods.py -q

# 2. 前端构建与指标算法测试
cd frontend && bun run build
cd frontend && bun run test tests/ProCandlestickChart.test.tsx
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-054 为已完成。
2. 追加 `task/CHANGELOG.md` 记录。
