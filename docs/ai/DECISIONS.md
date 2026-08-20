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

## 2026-08-08: 增加显式本地单用户 Docker 模式

- **提出者**: @Satanchen
- **触发**: 当前 MVP 只需在个人电脑运行并发布源码到 GitHub，不再需要公网多用户登录。
- **方案**: 保留生产邮箱认证与全表 `user_id` 约束；新增仅限 development 的 `LOCAL_ONLY_MODE`，自动使用一个内部本地所有者，不提供验证码、session 或登录/退出 UI。前后端由独立本地 Compose 启动，唯一宿主入口绑定 `127.0.0.1`，SQLite 使用专用 Docker Volume。
- **理由**: 直接删除认证和归属列会扩大回归面并破坏已有数据；显式本地 profile 以最小差异提供零登录体验，同时阻止该旁路误入公网生产。
- **状态**: accepted（部署形态=个人本机；若恢复公网必须关闭 local-only 并使用原认证路径）

## 2026-08-09: PROD-000 统一架构文档真相

- **提出者**: Codex（按 `PRODUCTIZATION_PLAN.md` 执行，@Satanchen）
- **触发**: `docs/ai/ARCHITECTURE.md` 仍写“无认证、14 路由”，`docs/ARCHITECTURE.md` 仍写 20 路由和 28 张表，与已接受的认证/本地模式决策及当前代码冲突。
- **方案**: 不改变业务代码或架构；以 `docs/ARCHITECTURE.md` 为完整权威来源，将 `docs/ai/ARCHITECTURE.md` 收敛为硬边界入口。当前事实固定为 23 个 APIRouter、105 个 API 路径/134 个 OpenAPI 操作、schema v11/35 张逻辑表；保留邮箱免密认证、用户归属、Fernet 凭据和仅 development 可用的 local-only 内部所有者。
- **理由**: 运行时 OpenAPI、`main.py` 注册链和 `database.py` 迁移常量可以确定性复核；本次只是同步 2026-08-03 与 2026-08-08 已接受决策，不引入新的架构选择。
- **状态**: accepted（documentation alignment only；后续端点/迁移变化必须同步契约文档）

## 2026-08-12: 暂缓 Graphiti read model 生产接入

- **提出者**: Codex（AIOS-034，@Satanchen）
- **触发**: Thesis temporal graph 的 SQLite export/clear/rebuild contract 已通过 deterministic fixture，但 `graphiti_core` 仍未安装，AIOS-004 没有候选 benchmark，也未获准运行 Neo4j/FalkorDB 等图存储。
- **方案**: 保留 `thesis-graph-export/v1` 作为项目自有、owner-scoped adapter contract；当前只使用可丢弃内存 shadow sink 验证重建和计数。Graphiti 继续 `NOT_RUN`，不新增生产依赖、不写生产数据、不进入回答或 Thesis 主路径。
- **理由**: 可重建合同已经降低未来适配成本，但不能替代真实 Graphiti 正确性、时序、隔离、延迟和运维验证。SQLite 必须继续作为唯一权威状态。
- **状态**: pending（解除需 AIOS-004 真实 fixture benchmark、固定依赖/基础设施许可及 @Satanchen 明确接受 ADR）

## 2026-08-13: Local OSS 源码许可证与第三方再分发边界

- **提出者**: Codex（AIOS-084，@Satanchen）
- **触发**: Local OSS v1 准备审计确认根目录没有 LICENSE；`reference/` 有 5,329 个 tracked entries、六个嵌套 Git 仓库和最高 31.5 MB 的 tracked asset；`backend/app/data/wq_fields.json` 的 WorldQuant BRAIN-oriented 来源尚无再分发许可证据。
- **方案**: 发布前由 @Satanchen 明确选择源码许可证并确认版权主体。候选 A 是 MIT（最短、宽松、要求保留版权/许可声明）；候选 B 是 Apache-2.0（宽松，另含明确专利授权和变更声明条件）；候选 C 是暂不授权再分发，但这不属于开源发布。若目标是宽松复用且希望专利条款更明确，工程建议优先评估 Apache-2.0；若优先最短许可文本且确认无需明确专利条款，再评估 MIT。无论选择哪项，都不能自动覆盖第三方依赖、`reference/`、API 数据或 WQ catalogue 的许可证。
- **理由**: [GitHub 官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository)，公开仓库要真正成为开源项目需要许可证授予他人使用、修改和分发权；[Choose a License](https://choosealicense.com/licenses/) 对 MIT 与 Apache-2.0 的权限/条件差异如上。项目实现代理不能替版权持有人作法律选择，也不能从“代码可访问”推断第三方再分发许可。
- **状态**: accepted（2026-08-13 @Satanchen 授权采用 Apache-2.0，版权声明为 `Copyright 2026 Satanchen`；AIOS-086 公开树继续排除 `reference/` 与 WQ catalogue；本记录不是法律意见）

## 2026-08-13: 公开源码采用 allowlisted export，私有参考材料不随发行

- **提出者**: Codex（AIOS-086，@Satanchen）
- **触发**: `reference/` 与完整 WQ catalogue 对运行时核心不是必需项，但其再分发许可尚无证据；直接删除会破坏私有研究工作树且违反不修改 `reference/` 的边界。
- **方案**: 保留私有开发树不变，公开源码只由 non-overwrite allowlisted exporter 生成并带逐文件 SHA256 manifest；排除 `reference/`、WQ JSON/summary、用户 env/DB、依赖和构建证据。缺少扩展目录时，Alpha 使用项目编写的 8 个通用字段合同维持 5 个既有模板，coverage 为 null，并报告 `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`。检测到私有扩展文件时只报告可解析 `OK` 与再分发 `UNKNOWN`，不冒充许可或真实 BRAIN 验证。
- **理由**: 发布物不需要携带许可未知内容即可工作；显式降级状态比把私有文件复制到公开仓库或补造 coverage 更可审计。该边界不替代 root LICENSE、候选 commit 或第三方许可审查。
- **状态**: accepted（工程发布边界；root LICENSE 与 clean-commit 仍 RELEASE BLOCKED）
