# BACKLOG-003 — 真实网络 Agent 工具测试稳定化（去网络依赖）

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：`backend/tests/test_agent_tools_execution.py` 中 `test_get_stock_data_returns_quote_fields` 与 `test_calculate_indicators_returns_requested_indicators` 直接调用工具 `run()`，工具内部硬编码 `MarketDataService()` 真实请求腾讯行情（A 股）。这些测试：
> 1. 依赖真实网络连通性（上游挂了/没网就 fail）
> 2. 依赖代理环境（有 `ALL_PROXY=socks5://...` 时走 socks5，缺 socksio 包就 ImportError——已装好，但开/关代理行为不同）
> 3. 每次跑都打上游，违反"测试确定性"纪律
>
> 同类文件 `test_trading_agent_tools.py::test_backtest_tool_returns_compact_result` 已有正确模式：`monkeypatch.setattr(tools_definitions.MarketDataService, "kline", kline)` mock 类方法，工具内部 `MarketDataService()` 建出的实例会继承类方法补丁，完全不需要网络。本任务把两个遗留真实网络测试收敛到同一模式。

---

## 允许修改

- `backend/tests/test_agent_tools_execution.py`（两个测试改为 mock fixture）
- `backend/tests/test_agent_market_tools.py`（如需对齐同模式，先检查是否已确定性）
- `docs/ai/tasks/BACKLOG-003.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/` 任何业务代码（工具/服务/路由）
- 数据库、schema、认证、依赖、锁文件
- `frontend/`、`reference/`

---

## 完成标准（全部满足才算完成）

1. **`test_get_stock_data_returns_quote_fields` 改为确定性测试**：
   - 用 `monkeypatch.setattr(tools_definitions.MarketDataService, "quote", fake_quote)` mock 类方法（参考 `test_trading_agent_tools.py` L51-70 模式）
   - `fake_quote` 返回含 `price`、`market_cap`、`pe` 的 fixture dict，`ticker="000001"`（`resolve_ticker` 需要合法 A 股代码，或用已规范化的 `sh600519` 验证是否更稳）
   - 断言保持 `result.success is True` 且 `{"price", "market_cap", "pe"} <= result.data.keys()`
   - **不允许**真实网络调用（测试全程无出网请求）

2. **`test_calculate_indicators_returns_requested_indicators` 改为确定性测试**：
   - `monkeypatch.setattr(tools_definitions.MarketDataService, "kline", fake_kline)` mock 类方法
   - `fake_kline` 返回 120 根以上 fixture K 线（`day/open/high/low/close/volume`，参考 test_trading_agent_tools 的 bars 构造）
   - 断言保持 `result.success is True` 且 `{"ma", "rsi"} <= result.data["latest"].keys()`（确认 `indicators.compute` 对 fixture 数据能产出 ma/rsi；如某指标因数据不足返回空，用足够长/趋势明确的 fixture 保证）
   - **不允许**真实网络调用

3. **核查 `test_agent_market_tools.py`**：确认其余工具测试均已 mock（`test_agent_stock_tool_supports_us_symbol` 已 mock `quote`、`test_agent_indicator_tool_supports_hk_symbol` 已 mock `kline`）。若发现仍有真实网络调用，用同一模式收敛；否则只记录"已确定性"。

4. **验证（关键）**：
   - **开代理状态**（当前 `ALL_PROXY=socks5://127.0.0.1:7897` 已设置、7897 监听中）：`backend\.venv\Scripts\python.exe -m pytest tests/test_agent_tools_execution.py tests/test_agent_market_tools.py tests/test_trading_agent_tools.py -q --no-cov` **全绿**
   - **关代理状态**（临时清空 `ALL_PROXY/HTTP_PROXY/HTTPS_PROXY` 后同一命令）：**同样全绿**——这是"确定性"的核心证明，两个环境结果必须一致
   - 完整后端套件：`backend\.venv\Scripts\python.exe -m pytest backend/tests -q --no-cov -p no:cacheprovider` 全绿（当前 551 passed 基线，本任务不得减少）
   - `backend\.venv\Scripts\python.exe -m ruff check backend/tests/test_agent_tools_execution.py backend/tests/test_agent_market_tools.py` 通过

5. **文档同步**：
   - `docs/ai/EXEC_PLAN.md` 本任务标记 `[DONE]`（证据段记录开/关代理双环境验证结果）
   - `task/CHANGELOG.md` 追加一条（What/Why/Docs/Verification/Risk）

---

## 参考

- `backend/tests/test_trading_agent_tools.py` L50-70：`monkeypatch.setattr(tools_definitions.MarketDataService, "kline", kline)` 确定性模式
- `backend/app/agent/tools_definitions.py` L40-61（GetStockData.run 调 `service.quote`）、L129-159（CalculateIndicators.run 调 `service.kline` 后 `indicators.compute`）
- `backend/app/services/indicators.py`：compute 对 fixture 的输入要求（至少多少根、字段名）

## 验证命令

```powershell
# 开代理状态（当前环境即如此）
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_agent_tools_execution.py tests/test_agent_market_tools.py tests/test_trading_agent_tools.py -q --no-cov
# 关代理状态（临时清空三个变量后重跑，证明确定性）
.\.venv\Scripts\python.exe -m pytest tests/test_agent_tools_execution.py tests/test_agent_market_tools.py tests/test_trading_agent_tools.py -q --no-cov
# 完整套件 + lint
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check tests/test_agent_tools_execution.py tests/test_agent_market_tools.py
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单：`backend/tests/test_agent_tools_execution.py`、`docs/ai/tasks/BACKLOG-003.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`
- 开代理验证输出：`ALL_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY` 均为 `http://127.0.0.1:7897`，端口 7897 正在监听；三个指定测试文件 `13 passed in 1.68s`
- 关代理验证输出（确定性证明）：子进程内临时清空 `ALL_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY` 并确认均为 unset；相同三个测试文件 `13 passed in 0.70s`
- 完整套件结果：`551 passed in 62.28s`（`--no-cov -p no:cacheprovider`，基线未减少）；指定两文件 Ruff `All checks passed!`
- 备注（发现的真实问题或未完成项）：两个遗留测试已分别以类方法 monkeypatch 固定 `quote` 和 120 根 `kline` 数据，不再请求真实腾讯行情；`test_agent_market_tools.py` 的美股 quote 与港股 kline 测试原本已确定性 mock，无需修改；未改业务代码、依赖、schema、前端或 `reference/`，未 commit
