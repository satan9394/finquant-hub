# AIOS-070 - 私有 share preview，默认不发布

## 状态

`[DONE]`

## 优先级

P2

## 用户结果

用户可在自己的 Thesis 或已保存策略实验中生成一份可审阅的私有分享预览，清楚看到将展示的用户假设/计算结果、来源、时效、许可、质量和免责声明；预览不创建公开 URL、分享 token、发布记录或任何外部写入，也没有发布按钮。

## 允许修改

- `backend/app/services/share_preview.py`（新建）
- `backend/app/routers/thesis.py`
- `backend/app/routers/backtests.py`
- `backend/tests/test_share_preview.py`（新建）
- `backend/tests/test_router_contracts.py`
- `frontend/src/components/SharePreviewModal.tsx`（新建）
- `frontend/src/services/sharePreviewApi.ts`（新建）
- `frontend/src/types/research.ts`
- `frontend/src/pages/Thesis.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/SharePreviewModal.test.tsx`（新建）
- `frontend/tests/Thesis.test.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/PRIVATE_SHARE_PREVIEW_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- schema/database migrations、认证、公开匿名路由、SSR、外部存储、短链、token、队列、WebSocket、发布服务、`reference/`
- POST/PUT/DELETE share API、持久化 preview、生成可访问 URL、复制到系统剪贴板、发送或发布
- 真实账户/订单/投顾文案，或把 user hypothesis / computed result 升级为事实、推荐或因果证明
- 输出 report body、memory content、交易明细、持仓明细、原始 evidence value、凭据、会话、邮箱或其他不在 allowlist 的字段
- 将 `display-and-research`、`private-user-research` 或未知 license 解释为公开再分发许可

## 完成标准

- 两个 authenticated owner-scoped GET endpoint：Thesis preview 与仅 `completed + is_saved=1` 的 strategy preview；无公开/匿名/写入 endpoint，跨用户统一 404。
- 响应固定 `share-preview/v1`、`visibility=private`、`published=false`、`publish_action_available=false`，不含 URL/token/key；生成前后数据库行数和对象时间戳不变。
- 内容只使用 allowlist：Thesis 的用户假设/假设/失效条件/当前论点；strategy 的参数、成本口径与有限计算指标。每块明确标记 `USER_HYPOTHESIS` 或 `COMPUTED_RESULT`，不得称为事实、建议或因果证明。
- canonical evidence 仅输出 ID、kind/status/source/vendor、as-of/retrieved-at、quality flags 和 license scope；不输出 value/document excerpt/report body。strategy 复用 persisted provenance，缺 license 时明确 UNKNOWN。
- 时效/许可/provenance/quality audit 可复核；`display-and-research` 与 `private-user-research` 仅允许当前私有预览，不解除公开门禁。所有 preview 的 publication gate 固定 BLOCKED，AIOS-071 决策前无发布路径。
- 对 allowlisted 用户文本做 deterministic credential/email/JWT/secret redaction；输出后二次扫描必须 PASS，报告 redacted field path/count 而不回显敏感值。
- UI 在 Thesis 与已保存 strategy 上提供“私有分享预览”，含 loading/error/empty/partial、来源/许可/时效/质量、脱敏结果和免责声明；Modal 明示未发布且没有发布/复制/发送动作，390px 无横向溢出，键盘 Escape 可关闭。
- backend focused pytest、Ruff、mypy、OpenAPI；frontend focused Vitest、TypeScript、build 与目标 E2E/浏览器验证通过。Phase 7 未结束，不要求全量阶段门禁。

## 回退

移除两个只读路由、share preview service、共享 modal/API/type、入口按钮、测试和合同文档即可；没有 schema、preview 数据或外部发布内容需要回滚。

## 验证声明

预览只证明本地 owner-scoped allowlist、脱敏与审计合同；它不是法律意见、公开分发许可判断、真实发布、第三方平台验证或真实金融结论验证。

## 完成证据

- 新增两个 authenticated owner-scoped GET：Thesis 当前不可变版本与仅 `completed + is_saved=1` 的策略实验；跨用户、未保存或未完成对象统一 404，OpenAPI 仅暴露 GET。
- `share-preview/v1` 固定为 private/unpublished/no-publish-action；Thesis 仅输出 `USER_HYPOTHESIS` 和 metadata-only canonical evidence，策略仅输出 `COMPUTED_RESULT`、参数、成本口径、有限指标与 persisted provenance；原始 evidence value、交易明细和净值曲线均不输出。
- deterministic email/credential/Bearer/JWT/secret redaction 与输出后二次扫描通过；`display-and-research` 保持 `PRIVATE_DISPLAY_ONLY`，策略缺失许可保持 `UNKNOWN`，所有 publication gate 固定 `BLOCKED`。
- backend focused 7 passed，相关 Ruff 与 mypy 通过；runtime OpenAPI 为 133 paths / 168 operations，两个 preview path 均只有 GET。
- frontend focused 3 files / 21 tests passed；一个既有 Thesis 用例首次在 5 秒边界超时，单独复跑和标准 focused rerun均通过，未放宽超时；TypeScript 与 production build（4,191 modules）通过。
- 隔离临时 SQLite + 本地服务的桌面浏览器验证覆盖 Thesis/strategy 两类预览、脱敏、PARTIAL/UNKNOWN、许可/来源/时效、无发布/复制/发送动作；临时 Playwright 390px 探针通过无横向溢出与 Escape 关闭。fixture/mock 不是真实上游、公开发布或法律许可验证。
