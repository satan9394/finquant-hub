# BACKLOG-001 - 发布前收尾与长期路线图

## 状态

`[DONE]` — 任务 1-5 已完成；任务 6-8 按范围决定保持 `[PARKED]`

## 批次划分

| 批次 | 类型 | 任务 | 阻塞发布 |
|------|------|------|----------|
| **Batch 1** | 发布前必须 | 1-3 | 是 |
| **Batch 2** | 长期技术债 | 4-5 | 否 |
| **Batch 3** | PARKED 公开运营 | 6-8 | 否 |

---

## Batch 1: 发布前收尾（阻塞发布）

### 任务 1: 创建 LICENSE 文件

**优先级**: P0

**前置**: 无

**范围**: 在项目根目录创建标准 Apache-2.0 LICENSE 文件

**允许修改**:
- `LICENSE`（新建）

**禁止修改**:
- 其他任何文件
- Git 配置或提交

**完成标准**:
- 根目录存在 `LICENSE` 文件
- 内容为完整 Apache License 2.0 全文
- Copyright 行为 `Copyright 2026 Satanchen`
- 文件编码 UTF-8，无 BOM

**验证**:
```bash
cat LICENSE | head -5  # 应显示 Apache License 头
grep "Copyright 2026 Satanchen" LICENSE  # 应匹配
```

---

### 任务 2: docs/PRD.md 3.2 节加技术栈引用

**优先级**: P0

**前置**: 任务 1 完成（不影响，但保持顺序）

**范围**: 在 PRD.md 3.2 节添加一行引用注释指向 TECH_STACK.md

**允许修改**:
- `docs/PRD.md`

**禁止修改**:
- `docs/TECH_STACK.md`（唯一权威来源，不可改）
- 其他文档
- 代码文件

**完成标准**:
- `docs/PRD.md` 3.2 节存在指向 `docs/TECH_STACK.md` 的引用注释
- 引用格式为 Markdown 注释或脚注，如：
  ```markdown
  > 技术栈详情见 [TECH_STACK.md](./TECH_STACK.md)
  ```
- 不改变 PRD 3.2 节现有内容的语义

**验证**:
```bash
grep -n "TECH_STACK" docs/PRD.md  # 应有匹配
```

---

### 任务 3: docs/PRODUCT_MAP.md 技术栈加引用

**优先级**: P0

**前置**: 任务 1 完成

**范围**: 在 PRODUCT_MAP.md 技术栈部分添加引用指向 TECH_STACK.md

**允许修改**:
- `docs/PRODUCT_MAP.md`

**禁止修改**:
- `docs/TECH_STACK.md`
- 其他文档或代码

**完成标准**:
- `docs/PRODUCT_MAP.md` 中技术栈相关段落存在指向 `docs/TECH_STACK.md` 的引用
- 引用格式为 Markdown 注释或脚注
- 不改变 PRODUCT_MAP 现有技术栈描述的语义

**验证**:
```bash
grep -n "TECH_STACK" docs/PRODUCT_MAP.md  # 应有匹配
```

---

## Batch 2: 长期技术债（不阻塞发布）

### 任务 4: Design System 新老双轨迁移

**优先级**: P1

**前置**: Batch 1 全部完成

**范围**: 将旧硬编码色值逐步迁移到 `--fq-*` CSS 变量

**当前状态**:
- `--fq-*` tokens 已定义在 `frontend/src/styles/design-tokens.css`
- 新组件使用 `--fq-*`
- 旧组件仍用硬编码值如 `#dce5ef`、`#1890ff`

**允许修改**:
- `frontend/src/**/*.css`
- `frontend/src/**/*.tsx`（仅样式相关）
- `frontend/tests/**/*.test.tsx`（如有视觉回归测试）

**禁止修改**:
- 后端代码
- `docs/TECH_STACK.md`
- 新组件已有的 `--fq-*` 用法（不回退）
- 新增任何 npm 依赖

**完成标准**:
- 所有旧硬编码色值 `#dce5ef`、`#1890ff` 等替换为对应的 `--fq-*` 变量
- `grep -r "#dce5ef\|#1890ff" frontend/src/` 返回空
- `bun run build` 通过
- 视觉效果与迁移前一致（无明显色差）

**验证**:
```bash
cd frontend && bun run build
grep -r "#dce5ef\|#1890ff" frontend/src/  # 应无匹配
```

**注意**: 这是渐进式迁移，可按组件逐个进行，不要一次性改完导致冲突

---

### 任务 5: Graphiti/Mem0 选型 ADR

**优先级**: P1

**前置**: AIOS-003 已完成；需要维护者 @Satanchen 决策

**范围**: 完成 memory provider 选型的 Architecture Decision Record

**关闭后的状态**:
- AIOS-005: memory provider 选型 ADR — `[DONE]`，Native FTS5 已获批准
- AIOS-004: Graphiti/Mem0 fixture-only shadow PoC — 保持 `[BLOCKED]`，未来可选
- AIOS-034: 可选 Graphiti read model — 保持 `[BLOCKED]`，未来可选

**允许修改**:
- `docs/ai/decisions/`（新建 ADR）
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`（更新状态）
- `docs/ai/EXEC_PLAN.md`（更新状态）
- `docs/ai/tasks/AIOS-004.md`、`AIOS-005.md`、`AIOS-034.md`（更新状态）

**禁止修改**:
- 后端业务代码（除非 ADR 决定接入）
- `reference/`
- 用户数据

**完成标准**:
- ADR 文档存在，记录三种候选方案对比：
  - Native FTS5（当前 baseline）
  - Graphiti（temporal graph）
  - Mem0（记忆层）
- 明确给出推荐方案及理由
- 维护者 @Satanchen 已 review 并 approve
- BLOCKED 任务状态更新为 DONE 或保持 BLOCKED 附原因

**验证**:
```bash
ls docs/ai/decisions/  # 应有 ADR 文件
```

**注意**: 此任务需要人工决策，Agent 只负责准备决策包和文档

---

## Batch 3: PARKED 公开运营（需法律/隐私决定）

### 任务 6: 公开只读 Thesis/Strategy 卡片

**优先级**: P2 — PARKED

**前置**: AIOS-070 已完成；需要法律/隐私/许可决定

**范围**: 为 Thesis/Strategy 产物生成公开可访问的只读卡片

**当前阻塞**:
- 需要明确的数据再分发许可
- 需要免责声明和法律边界
- AIOS-070 的 `publication_gate` 固定 `BLOCKED`

**允许修改**:
- `backend/app/routers/thesis.py`
- `backend/app/routers/backtests.py`
- `backend/app/services/share_preview.py`
- `frontend/src/components/SharePreviewModal.tsx`
- `docs/ai/decisions/`（相关 ADR）
- `docs/ai/tasks/AIOS-071.md`

**禁止修改**:
- 用户私人数据（只读公开摘要）
- 原始 evidence value、交易明细
- 凭据、会话、邮箱

**完成标准**:
- 公开卡片只展示 allowlisted 摘要信息
- 不泄露用户身份、私人假设或原始数据
- 免责声明明确：不构成投资建议
- 许可条款清晰：数据来源、再分发限制

**验证**: 需要法律 review

---

### 任务 7: Remix 并保留 lineage

**优先级**: P2 — PARKED

**前置**: 任务 6 完成

**范围**: 允许用户基于公开卡片创建派生版本，保留来源追溯

**允许修改**:
- `backend/app/routers/`（remix API）
- `frontend/src/components/`（remix UI）
- `docs/ai/tasks/AIOS-072.md`

**禁止修改**:
- 原始 Thesis/Strategy 的不可变性
- 未经许可的再分发

**完成标准**:
- Remix 操作保留完整 lineage
- 派生版本明确标记来源
- 原始作者署名保留

---

### 任务 8: 模板市场/作者身份

**优先级**: P2 — PARKED

**前置**: 任务 7 完成

**范围**: 建立模板分享市场和作者身份系统

**允许修改**:
- 新建模板市场相关路由和组件
- `docs/ai/tasks/AIOS-073.md`

**禁止修改**:
- 现有用户数据
- 未经验证的金融建议

**完成标准**:
- 作者身份可验证
- 模板有明确许可条款
- 无 feed、排行或推荐算法（保持最小化）

---

## 执行指南

### Codex/Agent 执行顺序

1. **Batch 1** 可立即执行，无需人工介入
2. **Batch 2 任务 4** 可立即执行（渐进式）
3. **Batch 2 任务 5** 需要准备决策包，等待 @Satanchen
4. **Batch 3 全部** 需要法律/隐私决定，当前不执行

### 验证门禁

每个任务完成后必须通过：
```bash
# 后端
cd backend && .venv\Scripts\python.exe -m pytest -q && .venv\Scripts\python.exe -m ruff check .

# 前端
cd frontend && bun run build

# 文档
grep -n "TECH_STACK" docs/PRD.md docs/PRODUCT_MAP.md
```

### 回退策略

- Batch 1: 删除新建文件即可
- Batch 2 任务 4: git checkout 恢复旧色值
- Batch 3: 不执行，无需回退

---

## 完成证据模板

每个任务完成后，在本文件末尾追加证据：

```markdown
### BACKLOG-001 证据 - 任务 X

- 完成时间: YYYY-MM-DD HH:MM
- 修改文件: [文件列表]
- 验证结果: [命令输出]
- 备注: [如有]
```

### BACKLOG-001 证据 - 任务 1

- 完成时间: 2026-08-24
- 修改文件: 无；根目录 `LICENSE` 已存在且内容正确，避免无意义重写
- 验证结果: Apache License 2.0 完整文本；`Copyright 2026 Satanchen` 匹配；UTF-8 无 BOM
- 备注: HANDOFF 中“LICENSE 未创建”的记录已过期，以当前工作树为准

### BACKLOG-001 证据 - 任务 2

- 完成时间: 2026-08-23 23:49 -07:00
- 修改文件: `docs/PRD.md`
- 验证结果: `docs/PRD.md:151` 指向 `./TECH_STACK.md`；未改变 3.2 节现有表格语义
- 备注: 无

### BACKLOG-001 证据 - 任务 3

- 完成时间: 2026-08-23 23:49 -07:00
- 修改文件: `docs/PRODUCT_MAP.md`
- 验证结果: `docs/PRODUCT_MAP.md:23` 指向 `./TECH_STACK.md`；原技术栈描述保留
- 备注: 无

### BACKLOG-001 证据 - 任务 4

- 完成时间: 2026-08-23 23:49 -07:00
- 修改文件: `frontend/src/app.css`、`frontend/src/components/ChatMessageBubble.tsx`、`frontend/src/components/RoleAvatar.tsx`、`frontend/src/pages/Portfolio.tsx`
- 验证结果: `#dce5ef|#1890ff` 在 `frontend/src` 中 0 匹配；`bun run build` 通过（4190 modules）；浏览器在 `http://localhost:5173` 验证 Dashboard/Portfolio/Chat 无 Vite overlay，Chat 用户头像变量解析为 `rgb(49, 94, 251)`
- 备注: 任务卡所述 `frontend/src/styles/design-tokens.css` 不存在；实际 token 权威定义位于 `frontend/src/app.css`

### BACKLOG-001 证据 - 任务 5

- 完成时间: 2026-08-23 23:49 -07:00
- 修改文件: `docs/ai/decisions/ADR-005-memory-provider.md`、`docs/ai/tasks/AIOS-005.md`、`docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`、`docs/ai/EXEC_PLAN.md`
- 验证结果: ADR 已比较 Native FTS5、Graphiti、Mem0，推荐 Local OSS v1 保持 Native FTS5 authoritative + adapter-ready；2026-08-23 直接 pip index 经 `127.0.0.1:7897` 可读取 Graphiti 0.29.3 / Mem0 2.0.18，但两者仍未安装、fixture executed=0、指标 `null`。AIOS-004 runner 复验 native Recall@5 1.0000 / Precision@5 0.9167，focused 2 passed、Ruff 通过
- 备注: 2026-08-24，维护者 `@Satanchen` 明确回复“批准保持 Native FTS5”；AIOS-005 标记 `[DONE]`，AIOS-004/034 继续保持可选 PoC 阻塞状态

### BACKLOG-001 总体验证

- Backend: `LOCAL_ONLY_MODE=false` 下 541 passed，coverage 84.25%，Ruff 全通过
- Frontend: TypeScript 与 Vite production build 通过；可选完整 Vitest 因长时间停留在既有 jsdom pseudo-element warnings 后被中止，不计为通过
- Static: TECH_STACK 两处引用匹配；legacy color gate 0 匹配；`git diff --check` 通过
- Scope: 未修改 backend/schema/dependencies/`reference/`；未 commit、push、publish 或部署；Batch 3 未执行
