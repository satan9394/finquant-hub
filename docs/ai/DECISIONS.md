# Decisions — FinQuant Hub 架构决策记录

## 格式

```markdown
## YYYY-MM-DD: 标题

- **提出者**: Claude Code / Codex
- **触发**: 什么情况下发现的
- **方案**: 决策内容
- **理由**: 为什么
- **状态**: accepted / rejected / pending
```

## 2026-07-29: 保留两个研究 SSE 入口的独立收尾逻辑

- **提出者**: Codex
- **触发**: Review 指出 `analysis.py` 与 `research.py` 的 SSE 包装存在约 30 行重复。
- **方案**: @Satanchen 暂不抽取共享函数；继续让 `/api/analysis/stock` 负责轻量研究流，让 `/api/research` 独立负责报告事件持久化和状态结算。
- **理由**: 两个入口只有流清理和错误归一化相似，持久化事务与完成语义不同；当前抽象会扩大变更面，且项目约束要求 Codex 不改架构。
- **状态**: pending

## 2026-07-29: 空 Alpha 搜索默认有界

- **提出者**: Codex
- **触发**: Review 指出直接调用 `search_alpha("")` 会一次构造 4,367 条结果，容易被未来调用者误用。
- **方案**: @Satanchen 将搜索默认值与 HTTP 接口统一为 10 条，并把直接调用上限固定为 100 条；需要完整目录时显式调用 `list_fields()`。
- **理由**: 搜索与完整枚举是两个不同意图；保留 `list_fields()` 可以满足完整字段访问，同时避免无界搜索分配。
- **状态**: accepted

## 2026-08-01: Morningstar 数据功能暂缓

- **提出者**: Codex
- **触发**: TASK-020 要求先确认公允价值、经济护城河和星级是否有可合法使用的免费 API key。
- **方案**: @Satanchen 暂不实现 `/api/instruments/{symbol}/morningstar`，也不在筛选器中加入 Morningstar 星级；后续取得正式授权和 API 凭据后再恢复。
- **理由**: 2026-08-03 复核官方 [Direct Web Services](https://www.morningstar.com/business/products/direct-web-services) 与 [Developer 文档](https://developer.morningstar.com/direct-web-services)；权益 API 要求认证并限定在已授权 universe，产品入口是联系销售/申请试用，没有发布可自助领取的免费生产 key。非官方抓取无法保证授权、字段语义和稳定性。系统不得用推算值或其他评级冒充 Morningstar 数据。
- **状态**: accepted

## 2026-08-03: 筹码分布按模型推导数据呈现

- **提出者**: Codex
- **触发**: TASK-020 真实验收与 AkShare 1.18.81 源码复核发现，`stock_cyq_em` 使用东方财富 K 线和换手率运行 120 日衰减模型，并非东方财富直接返回筹码分布字段。
- **方案**: @Satanchen 保留筹码端点，但将来源写为 `eastmoney.kline`、增加 `methodology=akshare_cyq_calculator_120_day_turnover_decay`，在证据层标记为 INFERENCE；不推算 AkShare 未输出的筹码峰位。上游断连或字段异常时返回 502，不展示替代数据。
- **理由**: 这能保留真实输入与可复现算法的用户价值，同时避免把模型结果冒充交易所或数据供应商原始事实。2026-08-03 当前网络对 600519、000858 的上游实测均被东方财富断开，故本轮只能确认降级路径，不能宣称实时值可用。
- **状态**: accepted

## 2026-08-03: 引入邮箱免密认证，推翻「无认证」不变量

- **提出者**: @Satanchen
- **触发**: 需要让多人各自用邮箱登录，每个人配置自己的 API 凭据（Tushare/新闻/MCP 等），信息按邮箱锁定加密。
- **方案**: 邮箱验证码免密登录（无密码存储，HttpOnly Cookie 会话）；所有用户数据表加 user_id 完全隔离；用户凭据 Fernet 加密存储，API 永不回传明文。设计见 `docs/ai/AUTH_DESIGN.md`。
- **理由**: 公网部署需要区分用户 + 保护各人凭据；免密方式对非技术用户最友好且无密码哈希/重置复杂度。
- **状态**: accepted（部署形态=公网，需 HTTPS + 限流 + CSRF）
