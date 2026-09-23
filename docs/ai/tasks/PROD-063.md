# PROD-063: 真实 A/HK/US 数据和来源失败回归

> 状态：`[DONE]`  
> 阶段：Productization Phase 6

## 用户问题

确定性测试能保护页面合同，但不能证明 A 股、港股和美股的当前真实上游仍可用，也不能证明提供方失败时没有被旧缓存、默认零值或跨源替代掩盖。发布前需要以只读方式验证三市场的数据事实与失败边界。

## 目标行为

为 A/HK/US 各选一个公开标的，抽查搜索、快照、日线、基本面及当前确有合同的附加能力；记录实际 provider、as-of、期间、复权、币种、质量标记与失败原因，并把可稳定复现的来源/失败合同固化为回归。

## 范围内文件

- `backend/app/services/market_data.py`、`fundamentals.py` 及直接相关 provider/标准化服务
- `/api/instruments/*`、市场数据和基本面接口的直接路由与 schema
- 相关后端/前端测试、只读探针和证据文档
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`、`docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不以固定样本、手工数值或模型生成内容替代实时上游。
- 不新增许可数据源，不把 Morningstar 等评级替换成自算分数。
- 不因单次网络失败大改 provider 架构；只修复可复现的规范化、回退或呈现缺陷。
- 不修改架构或 `reference/`，不提交、发布、发送或下单。

## 数据与金融口径

- 单季度不得推成 TTM；保留原始报告期、period type、source/provider 与 quality flags。
- A/HK/US ticker、市场、币种、时区和交易日字段不得互相套用。
- 复权未知保持 `UNKNOWN`/`none` 的真实合同，不默认声称前复权或后复权。
- 上游不可达返回明确失败；只有现有明确回退策略可以切源，且最终来源必须可见。

## 交互状态

- 成功：页面展示实际数值，同时显示 provider 与截止时间。
- 部分成功：行情、日线、基本面和附加能力分别显示可用或失败，不用一项成功遮盖另一项失败。
- 失败：保留原始可操作原因与重试，不显示零值或看似完整的旧结论。
- UNKNOWN：确无字段或来源时明确标记，不从其他指标猜测。

## 可访问性要求

- 来源、失败和 UNKNOWN 均有文本表达，不只使用颜色或图标。
- 错误区域与重试动作保持稳定语义名称和键盘可达。

## 测试与浏览器验收

- 以本地后端只读调用记录 A/HK/US 三个公开标的的当前返回或实际上游失败。
- 为发现的可复现合同补聚焦测试；运行相关后端/前端测试与完整发布门槛。
- 真实浏览器抽查三市场页面，不保存研究、不运行远端任务、不触发交易或配置写入。

## 文档同步项

- 更新能力矩阵中的跨市场真实源证据和当前限制。
- 更新 `docs/ai/EXEC_PLAN.md` 和本任务完成记录。

## 完成定义

- A/HK/US 三市场均有当前只读证据，成功与失败都记录真实 provider/原因。
- 期间、复权、币种、截止时间、来源和质量状态没有被补造或混用。
- 可复现缺陷已用最小修复和测试封闭；不可控上游失败保持明确。
- 相关测试、完整工程门槛与浏览器验收通过。

## 回滚方式

恢复本任务的 provider/规范化最小修复与对应测试；保留探针事实，不用旧快照覆盖当前上游状态。

## 完成记录

- 2026-08-10 只读实探：`600519` 搜索由 Eastmoney 返回 CN/CNY；快照由 Tencent 返回 CNY 与 Asia/Shanghai 截止时间；60 条日线由 Sina 返回至 2026-08-07，明确 `adjustment=none` 与 `unadjusted_prices`。
- A 股基本面真实返回 502：AkShare `RuntimeError`、Yahoo `MarketError`；没有以行情字段、旧快照或默认零值补齐。港股 `0700.HK` 和美股 `AAPL` 的快照、日线、基本面当前均因 Yahoo 传输失败返回 502；直连 query1/query2 均复现 `RemoteProtocolError: Server disconnected without sending a response`。
- 修复失败归因缺口：行情和 K 线现在列出实际尝试的 provider 与安全异常类型；断路器打开时显示 `yahoo:circuit_open`，Yahoo 基本面显示 `yahoo:RemoteProtocolError`/`upstream_error`，不泄漏 URL、凭据或响应正文。
- 将四条本应验证工具/SSE 合同的测试从实时 Yahoo 解耦，mock 仅停留在市场服务/标的解析边界；当前真实上游状态由独立 JSON 与浏览器证据保留，未把 mock 描述成实时成功。
- 聚焦市场/标的/基本面/断路器 53 passed，新增失败合同 4 passed；完整后端 392 passed、83.51% coverage；完整 Ruff 与前端 TypeScript/build 通过。相同工作树的完整前端 47 files / 120 tests、Playwright 11 passed 已在前序发布门槛通过。
- 真实浏览器通过真实更新后端验证 HK/US 页面均分别显示行情、K 线、基本面的 Yahoo 失败或断路器状态，无页面错误、无保存或远端任务。
- 证据：`artifacts/productization/phase6/prod063-live-source-probe.json`、`prod063-hk-provider-failure.png`、`prod063-us-provider-failure.png`。
