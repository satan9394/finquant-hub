# Long Term Goal — FinQuant Hub

## 使命

把 finquant-hub 从「功能可用的投资研究工具」升级为「本地全栈量化操作系统」。

## 路线图

### Phase 1 — Agent 基础设施升级（P1，2-3 轮）
- 工具自动发现：改 `ToolRegistry` 用 `__subclasses__()` 自动注册，去掉手动 6 行注册
- MCP 工具桥接：`tools/mcp_bridge.py` 对接外部 MCP 服务器
- 并行工具执行：`research_orch.py` 工具调用改用 `ThreadPoolExecutor`
- 上下文压缩：`services/context.py` 简单 token 预算 + 摘要压缩

### Phase 2 — Swarm 多 Agent 团队（P1，3-5 轮）
- 从 `research_orch.py` + `discussion_orch.py` 提取公共 DAG runtime
- 新建 `orchestrator/` 模块，支持 YAML 定义团队
- 第一个团队：四大师投研团队（value_investor + tech_analyst + macro_strategist + risk_manager）
- 前端：Swarm 状态卡片（进度条/agent 状态/token 统计）

### Phase 3 — 记忆与推送（P1，2-3 轮）
- FTS5 全文搜索表 + `services/memory.py` 跨会话检索
- 推送系统：SSE 持久化 + 简单桌面通知
- 预警引擎：基于信号的 alert_rules + alert_triggers 表

### Phase 4 — 质量工程（P2，持续）
- 前端 vitest 起步：先测 BacktestResultCard、ChatMessageBubble
- research_orch 集成测试：mock LLMClient 验证 4 agent 流程
- mypy 类型检查：先核心文件再扩展
- 测试覆盖率报告：pytest-cov

## 纪律

- 不改 `ARCHITECTURE.md` 中的不变量
- 不引入 LangGraph/CrewAI/AutoGen 等第三方 agent 框架
- 不加 WebSocket、ORM、认证
- 不改 `reference/` 目录
- 每次提交前：`pytest -q && ruff check . && bun run build`
