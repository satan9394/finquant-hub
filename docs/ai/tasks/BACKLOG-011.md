# BACKLOG-011 — a-stock-data 数据能力接入：筹码/资金流/涨停/龙虎榜/估值历史

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-08-31 ｜ 执行者：Codex
> 背景：FinQuant Hub 现有 A 股数据源（腾讯/新浪/东财/Yahoo）覆盖 search/quote/kline/fundamentals/news，但缺筹码分布、资金流向、涨停池、龙虎榜、估值历史等深度能力。经维护者调研 GitHub 收藏（300 个 starred 筛出 27 个金融相关），选定 **a-stock-data**（simonlin1212，9395★，MIT，零鉴权零 key，19 数据源 54 端点，自包含 SKILL.md 内嵌可运行 Python）作为扩展源——其 5 个能力正好补 FinQuant 缺口且大部分可纯 httpx 直连东财（零新依赖）。
>
> **关键约束**：项目铁律"不新增依赖"。a-stock-data 中**筹码分布（本地计算 OHLC+换手率）、资金流（东财 push2/push2his）、涨停池（东财 push2ex）、龙虎榜（东财 datacenter-web）均可纯 httpx 实现（参考其 SKILL.md §4.6/§3.4/§3.5/§3.9/§8.1-8.5 与 `em_get()` 节流模式）**；**估值历史（§6.5）依赖 baostock TCP 客户端**——本任务**不引入 baostock**，估值历史用东财/腾讯可用替代（若东财有日频 PE/PB 历史则接入，否则该能力降级为"当前估值快照 + 明确 UNKNOWN 历史"，在证据中说明）。
>
> 本任务 = **5 个数据能力作为 MarketDataService 扩展 + 可选 Agent 工具（纯 httpx 确定性实现）**。

---

## 允许修改

- `backend/app/services/`（新增 `a_stock_extra.py` 或扩展 `market_data.py`——**建议新建独立 service** 保持 market_data 单一职责）
- `backend/app/agent/tools_definitions.py`（注册可选 Agent 工具，见目标 2）
- `backend/app/routers/`（如新增端点：建议 `GET /api/market/extra/{capability}?ticker=...` 统一入口）
- `backend/tests/`（确定性测试，httpx.MockTransport mock 东财响应）
- `backend/requirements.txt`（**仅当确需新增依赖时**，需在证据中说明理由——理想情况零新增）
- `docs/ai/tasks/BACKLOG-011.md`、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`（新增端点时）、`task/CHANGELOG.md`

## 禁止修改

- 数据库 schema、认证、`reference/`、`frontend/`
- 现有 `market_data.py` 的对外接口签名（search/quote/kline/fundamentals 等**不破坏**，新能力只新增）
- 不引入 baostock/mootdx/pandas 等重量级依赖（除非维护者另行批准）

---

## 完成标准

### 目标 1：5 个数据能力（核心）

在 `backend/app/services/a_stock_extra.py` 实现以下能力，**全部纯 httpx 直连、确定性、遵循项目降级哲学**（上游失败 → 明确错误/UNKNOWN，不补造数据）：

| 能力 | 实现要点（参考 a-stock-data SKILL.md） | 输出 |
|------|----------------------------------------|------|
| **筹码分布** | §4.6 `chip_distribution()`：输入 OHLC+换手率（可用现有 kline 数据）**本地推演**获利比例/平均成本/90-70 成本区间与集中度/筹码峰；⚠️ 初始筹码播种为首日全部流通盘 | `{profit_ratio, avg_cost, cost_90_min/max, cost_70_min/max, concentration, peak, source:"local-computed"}` |
| **资金流向** | §3.4 `eastmoney_fund_flow_minute()` + §4.5 `stock_fund_flow_120d()`：东财 push2/push2his，主力/大单/中单/小单四档；走节流 | `{main_net, large_net, medium_net, small_net, period:"minute|120d", source}` |
| **涨停池** | §8.1-8.3 东财 push2ex：涨停池（连板数/封板资金/炸板次数）、跌停池；走节流 | `{items:[{code,name,limit_up_count,seal_amount,industry}], date}` |
| **龙虎榜** | §3.5 `dragon_tiger_board()` + §3.9 `daily_dragon_tiger()`：东财 datacenter-web，上榜记录+买卖席位 TOP5；⚠️ 空窗口返回空结构不崩溃（V3.6.1 修复语义） | `{items:[{code,name,reason,top5_buy,top5_sell,net}], date}` |
| **估值历史** | §6.5：**不引入 baostock**；若东财可直连日频 PE/PB 历史则实现，否则降级为当前估值快照 + `history: "UNKNOWN"`（证据中说明） | 尽力实现 |

**节流纪律**：所有东财调用走统一节流（≥1s 间隔 + 随机抖动 + 会话复用），参照 a-stock-data `em_get()`；FinQuant 本地单用户场景频率低，但代码结构保留节流。

### 目标 2：可选 Agent 工具（≥3 个）

在 `tools_definitions.py` 注册（复用 BaseTool 框架 + `ToolRegistry.dispatch` 校验）：
- `get_chip_distribution`（ticker → 筹码分布）
- `get_money_flow`（ticker → 资金流向）
- `get_dragon_tiger`（ticker/date → 龙虎榜）
- （可选）`get_limit_up_pool`（date → 涨停池）

工具内部调 `a_stock_extra` 服务；**确定性可测**（mock httpx）。

### 目标 3：API 端点（统一入口，可选）

若新增，建议单一端点避免端点膨胀：`GET /api/market/extra/{capability}?ticker=...&date=...`（capability ∈ chip/money_flow/dragon_tiger/limit_up/valuation_history），返回 `{data, source, as_of, quality}`（对齐项目 provenance 风格）。**同步 docs/API_CONTRACT.md**。

### 目标 4：测试与验证

- 后端确定性测试（新增 `test_a_stock_extra.py`，httpx.MockTransport mock 东财响应）：每能力 ≥2 用例（成功路径 + 上游失败→明确错误/UNKNOWN）
- Agent 工具测试：dispatch 校验 + 工具行为
- 全量：`backend\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider` 全绿（734 + 新增）
- 覆盖率：`--cov=app --cov-report=term-missing` 不降（92.06% 基线）
- 确定性：开/关代理双环境新增测试一致
- `ruff check backend/tests` 通过；`git diff --check` 通过
- **零新依赖**（除非证据中说明必要且维护者批准）

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：能力清单、测试数、覆盖率、双环境确定性、估值历史降级说明）
- `task/CHANGELOG.md` 追加一条
- `docs/API_CONTRACT.md`（若新增端点）

---

## 参考

- a-stock-data SKILL.md：`https://raw.githubusercontent.com/simonlin1212/a-stock-data/main/SKILL.md`（§3.4/§3.5/§3.9/§4.5/§4.6/§8.x 具体实现代码，**直接移植其 Python 逻辑**，不引入其依赖）
- 现有模式：`backend/app/services/market_data.py`（httpx 客户端/降级链）、`backend/tests/test_market_data_degradation.py`（httpx.MockTransport 确定性测试）
- Agent 工具：`backend/app/agent/tools_definitions.py` + `backend/app/agent/tools.py`（BaseTool/ToolRegistry/dispatch）
- 节流：SKILL.md `em_get()` 模式（≥1s + 抖动 + 会话复用）

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests\test_a_stock_extra.py -q --no-cov
.\.venv\Scripts\python.exe -m ruff check ..\backend\tests
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（services/tools/routers/tests）：
- 能力实现清单（5 个，含估值历史降级说明）：
- 新增端点/工具清单：
- 测试数；全量套件结果；覆盖率前后：
- 开/关代理确定性验证：
- 依赖变化（应为零，若有说明）：
- 备注（发现的真实问题）：
