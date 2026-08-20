# AIOS-001 - 投资记忆 fixture 与 FTS5 baseline runner

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

用不含真实用户隐私的版本化 fixture 和可重复 runner，量化当前 SQLite FTS5 跨会话记忆的检索、安全、同步、预算与性能基线，并明确报告当前 baseline 不支持的时序、矛盾、workspace 和 provenance 语义，为后续原生实现及第三方 shadow PoC 提供同一比较起点。

## 前置阅读

1. `docs/ai/PROJECT_CONTRACT.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
5. `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`
6. `backend/app/services/memory.py`
7. `backend/tests/test_memory.py`

## 范围

本任务只建立测试 fixture、baseline runner 和聚焦测试，不修改生产检索行为、schema、数据库迁移或依赖。

### 允许修改

- `backend/tests/fixtures/aios_memory_v1.json`（新建）
- `backend/scripts/memory_fts_baseline.py`（新建）
- `backend/tests/test_memory_baseline.py`（新建）
- `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/tasks/AIOS-001.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/DECISIONS.md`（只在发现真实架构冲突时追加并 `@Satanchen`）

### 禁止修改

- `backend/app/`
- `frontend/`
- `reference/`
- 生产数据库与用户数据
- 依赖及锁文件

## 必须产出

1. 版本化 synthetic fixture，覆盖 A/HK/US 标的、中英混合、历史/当前、矛盾、跨 workspace、跨用户、prompt injection、缺失来源、UNKNOWN、更新/删除、预算与上游失败。
2. CLI runner 只使用标准库、pytest 已有环境和当前 `memory.py`，在临时 SQLite 数据库运行，不写生产数据。
3. 报告 fixture 版本、case 数量、Recall@5、Precision@5、P50/P95 latency、注入字符数、用户泄漏和 prompt injection execution。
4. 当前 FTS5 无法表达的能力必须逐项输出 `MISSING`，不能用零分或主观推断伪装为已测能力。
5. deterministic 测试覆盖报告结构、隔离硬门、注入不执行、更新/删除同步和字符预算。

## 完成标准

- 同一 fixture/runner 可重复运行且退出码稳定。
- 用户隔离泄漏为 0，prompt injection execution 为 0。
- 检索指标只统计具有明确 expected relevant IDs 的 case。
- temporal selection、contradiction classification、workspace hard filter、provenance coverage 和 stale-as-current 明确为 `MISSING`，不误报支持。
- 没有生产代码、schema、依赖、数据库或 `reference/` 修改。
- 本任务标记 `[DONE]` 后，`AIOS-002` 成为唯一 `[READY]`。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_fts_baseline.py
.venv\Scripts\python.exe -m pytest tests/test_memory.py tests/test_memory_baseline.py -q --no-cov
.venv\Scripts\python.exe -m ruff check scripts/memory_fts_baseline.py tests/test_memory_baseline.py
cd ..
git diff --check
git status --short
```

本任务不运行完整阶段门禁，不执行真实上游验证。runner 输出是 synthetic fixture baseline，不能描述成真实用户或实时金融数据验证。

## 完成证据

- fixture：`backend/tests/fixtures/aios_memory_v1.json`，版本 `aios-memory-fixture-v1`，13 条 synthetic records、6 个检索 case。
- runner：`backend/scripts/memory_fts_baseline.py`；默认 120 个延迟样本，Recall@5 1.0000、Precision@5 0.9167，本机 P50 0.5870 ms、P95 1.0559 ms。
- 安全与同步：跨用户泄漏 0、prompt injection execution 0、264/2400 字符、FTS 更新/删除计数 1/0/1/0。
- 缺口：7 个当前不支持的领域能力均输出 `MISSING`，未伪装为零分或通过。
- 验证：focused pytest 7 passed；相关 Ruff 通过；`git diff --check`。
- 范围：未修改生产代码、schema、依赖、数据库、前端或 `reference/`；未运行真实上游验证。

## 回退

只删除本任务新增的 fixture、runner 和测试，并恢复本任务对允许 Markdown 文件的行级修改。不得使用 `git reset --hard`，不得覆盖用户其他未提交修改。
