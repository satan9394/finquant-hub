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
