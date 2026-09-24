# BACKLOG-057: 全市场热力罗盘、游资席位协同网络与市场情绪天梯

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 业务领域：宏观市场感知、主力资金网络与短线情绪量化
> 核心定位：全市场板块树图 (Treemap) + 龙虎榜席位关系图 (Graph) + 连板情绪天梯

---

## 1. 目标 (Task)
构建全市场宏观与主力资金感知大盘：利用 ECharts 6.1 引擎构建行业板块矩形树图（Treemap，面积表成交量，颜色表涨跌）；基于龙虎榜数据绘制游资席位与机构席位协同买入关系网络图（Graph）；构建连板情绪天梯（晋级率、炸板率与赚钱效应温度计）。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/services/market_graph.py` (NEW: 游资网络与情绪聚合)
  - `backend/app/routers/market.py` (MODIFY: 暴露树图与席位图端点)
  - `frontend/src/components/charts/MarketTreemapChart.tsx` (NEW: 行业板块矩形树图)
  - `frontend/src/components/charts/DragonTigerSeatGraph.tsx` (NEW: 游资协同网络图)
  - `frontend/src/components/charts/SentimentLadderChart.tsx` (NEW: 连板情绪天梯图)
  - `frontend/src/pages/Discover.tsx` (MODIFY: 挂载市场全景图 Tab)
  - `backend/tests/test_market_graph.py` (NEW)
  - `frontend/tests/MarketTreemapChart.test.tsx` (NEW)
- **严禁触碰**：
  - 严禁引入新的图表依赖（复用现有的按需注册 ECharts 6.1 `LazyEChartCore`）。
  - 严禁在席位图中使用复杂物理引擎阻断渲染，节点规模限制在 top 50 活跃席位以内，防卡顿。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **开源标杆与交互参考**：
  - 终端宏观热力参考：`OpenBB-finance/OpenBB` (45k★) 行业板块热力图。
  - 本地多维数据协同大屏参考：`reference/BigDataView`。
  - 龙虎榜数据源：复用仓内已有的东财/A 股扩展服务（`backend/app/services/a_stock_data.py`）。
- **行业板块树图（Treemap）规范**：
  - 顶级为申万一级行业，次级为代表性成分股。
  - 节点大小（value）= 成交金额；颜色（itemStyle）= 涨跌幅（红涨绿跌，支持语义色彩反转配置）。
  - 点击板块支持下钻或过滤个股列表。
- **席位协同网络图（Co-occurrence Graph）规范**：
  - 节点（Nodes）：知名游资席位（如“中信证券西安朱雀大街”、“国泰君安上海江苏路”）与机构专用席位。
  - 边（Edges）：同日同时买入同一标的的协同关系，连线粗细代表共同买入成交额。
- **连板情绪天梯（Sentiment Ladder）**：
  - 高度对应连板高度（首板、2连板、...、最高板）。
  - 标注昨日连板今日晋级率（%）与当日炸板率（%）。

---

## 4. 契约规范 (Output Contract)
- `GET /api/market/sector-treemap`：返回树状层级 JSON。
- `GET /api/market/dragon-tiger-network?days=5`：返回 `{ nodes: [...], edges: [...] }`。
- `GET /api/market/sentiment-ladder`：返回板数分层数据与情绪综合指数。

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 后端数据聚合与关系图构建单测
cd backend && .venv\Scripts\python.exe -m pytest tests/test_market_graph.py -q

# 2. 前端图表组件渲染单测与构建检查
cd frontend && bun run build
cd frontend && bun run test tests/MarketTreemapChart.test.tsx
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-057 为已完成。
2. 同步 `docs/API_CONTRACT.md` 与 `docs/ROUTER_MAP.md`。
3. 追加 `task/CHANGELOG.md` 记录。
