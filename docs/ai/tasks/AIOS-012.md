# AIOS-012 - 计算结果 provenance 与可复算 fixture

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

让回测、组合风险和 Alpha 的确定性结果都携带 input evidence IDs、公式说明和方法版本，并用现有计算引擎从固定输入复算验证。

## 允许修改

- `backend/app/services/provenance.py`
- `backend/tests/fixtures/aios_computed_v1.json`（新建）
- `backend/tests/test_computed_provenance.py`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 现有 backtest/risk/Alpha 计算实现、routers、数据库 schema、依赖、前端
- `reference/`
- 复制或重写金融公式实现

## 完成标准

- computed adapter 强制非空 inputs、formula、method_version，输出 canonical envelope。
- fixture 通过现有 `calculate_performance`、`portfolio_risk_xray`、`simulate_factor` 复算。
- 结果与预期一致，输入 evidence IDs 唯一且完整；输入与 fixture 不被修改。
- focused tests、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_computed_provenance.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/provenance.py tests/test_computed_provenance.py
.venv\Scripts\python.exe -m mypy app/services/provenance.py
cd ..
git diff --check
```

## 回退

删除 fixture/测试并恢复 `computed_envelope` 与计划 Markdown；不涉及生产数据或 schema 回退。

## 完成证据

- `computed_envelope` 强制唯一非空 input evidence IDs、formula 与 method_version。
- 回测复用 `calculate_performance`、风险复用 `portfolio_risk_xray`、Alpha 复用 `simulate_factor`；未复制计算实现。
- 三个 fixture 的 total return 0.16、HHI 0.58、terminal equity 1.0404 均由现有引擎复算并进入有效 canonical envelope。
- focused 5 passed，Ruff、mypy、diff check 通过；仅 deterministic fixture，不是真实上游验证。
