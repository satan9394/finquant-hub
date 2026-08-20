# AIOS-041 - Thesis / Portfolio / Strategy 原生 monitor targets

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可从已保存 Thesis、Portfolio 或 Strategy 明确选择监控对象和已有可验证条件，先查看草稿，再显式确认创建；系统不自行猜阈值、不执行外部写操作。

## 允许修改

- `backend/app/database.py`
- `backend/app/routers/alerts.py`
- `backend/app/services/alerts.py`
- `backend/app/services/monitor_targets.py`（新建）
- `backend/tests/test_alerts.py`
- `backend/tests/test_monitor_targets.py`（新建）
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_api.py`
- `frontend/src/pages/Alerts.tsx`
- `frontend/tests/Alerts.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/MONITOR_TARGET_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 依赖、其他前端页面、`reference/`、外部队列/缓存/图数据库
- 未经用户确认创建或启用规则，自动执行高成本研究，或任何外部通知写操作
- 编造价格、财务阈值、持仓变化、策略结果或来源

## 完成标准

- owner-scoped monitor target 明确绑定 Thesis/Portfolio/Strategy 对象与已有规则/条件；跨用户为零。
- 草稿和确认分离；创建/启用必须由显式用户操作，重复确认幂等。
- 无可验证条件时保持 UNKNOWN 并要求用户输入，不自动填金融阈值。
- UI 显示对象、条件、来源/质量、运行边界和确认状态；加载/错误/空态、390px、键盘可用。
- migration/backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证

按实现确定 focused migration、alerts、monitor target、frontend Alerts 测试，并运行 Ruff、mypy、TypeScript、build、OpenAPI 与 `git diff --check`。

## 回退

禁用新 monitor target 入口并恢复迁移前备份；不得删除已有 alert/scheduled research 数据。

## 验证声明

fixture/mock 与 schema 测试不构成真实金融上游或外部通知验证。

## 完成证据

- schema v18 / pre-v18 backup；backend focused 63 passed；Ruff/mypy 通过。
- Alerts focused 5 passed；TypeScript、production build 通过。
- OpenAPI 116 paths / 147 operations；草稿零写入、确认幂等、跨用户隔离。
