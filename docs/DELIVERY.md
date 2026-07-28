# FinQuant Hub 本轮交付记录

交付日期：2026-07-27
范围：标的研究闭环 + 双均线回测闭环。

## 已完成

- 统一 `symbol / name / market / exchange / currency / asset_type` 标的模型。
- A/HK/US 真实搜索与研究：`600519`、`00700.HK`、`AAPL` 已实测；`长鑫存储` 会解析到 `长鑫科技 / 688825`。
- 每个行情响应显式提供 provider、as_of、timezone、currency、adjustment、frequency、quality_flags。
- `/research` 统一搜索和按标的合并的已保存研究；`/research/:symbol` 包含快照、K线/成交量、MA/MACD/RSI、基本面、笔记、证据与质量标记。
- 旧多智能体研究和 HTML/MD/PDF/Word 导出保留在 `/research/reports`，AI 报告显式标为 `MODEL_OUTPUT`。
- 双均线知识文章保留并新增进入策略实验室的按钮。
- `/strategy-lab/ma-crossover` 支持参数验证、状态轮询、佣金/滑点、权益与基准、回撤、成交点、指标、交易表、来源、警告、保存和重新运行。
- 已保存研究以 symbol 唯一 upsert；已保存回测可在实验室重新打开。
- 修复 Logo/favicon、研究报告内部纵向滚动和知识库多重滚动；新闭环页面只有浏览器主滚动。
- 清理 `CLAUDE.md` 中的明文密钥，改为环境变量占位。

## 数据库变更

启动期以 `CREATE TABLE IF NOT EXISTS` 非破坏方式增加：

- `research_workspaces`：每个 symbol 一条研究工作区，保存 instrument、notes、evidence、snapshot 和时间戳。
- `quant_backtests`：保存参数、状态、结果、错误、数据来源/截止/时区/币种/复权/频率、质量标记和 saved 状态。

旧 `research_reports`、`research_events` 和 `backtest_runs` 均保留，未删除历史数据。

## API

详细合同见 `docs/API_CONTRACT.md`。新增：

- `GET /api/instruments/search?q=`
- `GET /api/instruments/{symbol}/snapshot`
- `GET /api/instruments/{symbol}/bars`
- `GET /api/instruments/{symbol}/fundamentals`
- `GET|PUT /api/instruments/{symbol}/workspace`
- `GET /api/instruments/workspaces`
- `POST|GET /api/backtests`
- `GET /api/backtests/{id}`
- `GET /api/backtests/{id}/trades`
- `POST /api/backtests/{id}/save`
- `POST /api/backtests/{id}/cancel`

## 验证命令与结果

```powershell
cd backend
uv run --with-requirements requirements.txt pytest -q
# 65 passed

cd ../frontend
bun run test
# 2 passed

bun run build
# TypeScript + Vite production build passed
```

真实接口检查：

- AAPL MA20/MA50，2024-07-27 至 2026-07-27，10 万初始资金、3 bps 佣金、2 bps 滑点：完成，500 个曲线点、8 笔闭合交易。
- 浏览器完整流程：AAPL 搜索 → 研究页 → 实验室 → MA20/MA50 → 完成 → 收益/回撤 → 交易明细 → 保存，已通过。
- 1440×900、1920×1080、390×844：无页面横向溢出、无破图；研究页和知识页未发现第二个纵向滚动容器；移动端导航抽屉可打开。

## 截图

- `output/playwright/final/01-research-home-1440.png`
- `output/playwright/final/02-aapl-research-1440.png`
- `output/playwright/final/03-ma2050-backtest-1440.png`
- `output/playwright/final/04-ma2050-metrics-1440.png`
- `output/playwright/final/05-longxin-research-1440.png`
- `output/playwright/final/06-longxin-research-1920.png`
- `output/playwright/final/07-longxin-research-mobile.png`
- `output/playwright/final/08-strategy-lab-1920.png`

## 已知限制与后续依赖

- 当前任务执行器是 FastAPI 进程内 `BackgroundTasks`。状态和结果持久化，但服务进程崩溃后不会自动恢复运行中的任务；多实例/生产环境需要 Redis + worker 或等价持久队列。
- 行情单次最多 800 根 K 线，超长回测区间需要分页历史数据适配器。
- 免费上游没有 SLA；腾讯、新浪、东方财富、Yahoo 任一协议或限流变化都可能影响可用性。错误会显示并返回 502，不会静默伪装。
- 688825 上市历史极短，当前只有 1 根完整日线，因此可研究但不能执行 MA20/MA50 回测；系统会明确报“数据不足”。
- `CLAUDE.md` 中暴露过的历史密钥应在 DeepSeek 后台轮换；本轮只清理当前文件，不改写 Git 历史。
- 前端主包仍有一个约 910 kB 的 Ant Design/ProLayout chunk 警告；功能按路由懒加载且构建通过，后续可做 vendor manualChunks，但不为本轮闭环引入额外复杂度。
