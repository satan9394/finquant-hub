# HANDOFF —— 项目交接档案

> 用途：跨会话/跨 agent 接续的权威档案。会话结束时更新；新会话先读本文件再动手。
> 由 harness-engineering v4.11.0 `bootstrap.py --init` 生成，首次真实工作替换于 2026-08-20。

## 当前目标（Objective）

收敛为现象级个人量化投研产品：功能已基本完备（88 个任务全部 DONE），当前阶段聚焦 **UI/UX 优化**——将 Design System v1.0 落地到全部核心页面，提升视觉一致性和用户体验。

## 完成标准（Definition of Done）

- [x] Design System v1.0 tokens（`--fq-*` CSS 变量）已定义并接入新组件
- [x] Dashboard 从"金融仪表盘"重构为"evidence-first workbench"
- [x] Research/Discussion/Portfolio/Backtest 页面接入新组件族
- [ ] 全部 12 个新组件已 git commit（当前 untracked）
- [ ] 工作树 15 个修改文件已 git commit
- [ ] 浏览器实机验证：Dashboard hero、MarketBrief、LatestNews、DecisionCard 可见
- [ ] `bun run build` 通过
- [ ] 后端 `/api/dashboard/news` 端点可用

## 验证命令（Verification）

```bash
# 后端测试
cd backend && .venv\Scripts\python.exe -m pytest -q

# 后端 lint
cd backend && .venv\Scripts\python.exe -m ruff check .

# 前端构建
cd frontend && bun run build

# Harness 审计
python scripts/audit.py .
```

## 边界（Boundaries）

- 不改 `docs/ai/ARCHITECTURE.md` 中的架构不变量（无 ORM、无连接池、无 WebSocket、认证不可删除、用户隔离不可削弱）
- 不改 `reference/` 目录
- 不新增后端 schema 或数据库表
- 不引入新的 npm/Python 依赖（Design System 纯 CSS 实现）
- 删除走 PowerShell 回收站（禁 rm）
- 改端点后同步 `docs/API_CONTRACT.md` 与 `docs/ROUTER_MAP.md`

## 未决问题与下一步（Open Questions / Next Steps）

1. **Design System 新老双轨**：`--fq-*` tokens 只被新组件消费，既有样式仍用硬编码色值（如 `#dce5ef`、`#1890ff`）。长期需要全量迁移，但当前不阻塞发布。
2. **Graphiti/Mem0 选型**：AIOS-004/005/034 仍 BLOCKED，依赖第三方包安装和 ADR 决策。不阻塞 Local OSS v1。
3. **LICENSE 文件**：Apache-2.0 已由 @Satanchen 授权，但根目录 LICENSE 文件尚未创建。发布前必须完成。
4. **Dashboard 视觉验证**：需要用户在浏览器中实机刷新确认 hero 区、MarketBrief、LatestNews 是否可见。
5. **下一步**：提交当前工作树 → 浏览器验证 → 如有视觉问题继续调整 CSS → 最终 commit。

---

## 变更日志（每轮结束追加一条）

- 2026-08-20 首次填充 HANDOFF.md，同步项目真实状态。Harness 治理层从骨架升级为可用。工作树 15 modified + 12 new 待提交。
- 2026-08-20 完成 4 个 commit：harness governance init、Design System v1.0 + UI redesign（10 新组件 + 5 页面重构 + CSS tokens + 后端 news）、harness infrastructure（.harness/ + scripts/ + hooks + skills）、design docs + UI screenshots。84 文件，+11,684/-961 行。TypeScript 零错误、Vite 构建通过、audit.py exit 0。
