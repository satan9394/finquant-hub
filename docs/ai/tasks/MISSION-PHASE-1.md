# MISSION-PHASE-1: 细粒度技术债收敛与文档账目一致性

> 适用角色：Codex / 学生 Agent 长期自主目标模式
> 基线锚点：main 分支最新提交（47b1354 或当前 HEAD）
> 目标性质：低风险、高确定性代码卫生与文档收口，零破坏性重构

---

## 一、任务背景与范围

在 Mission 1 至 Mission 3（Swarm 历史回放同源落库、已保存研究三态修复）完成后，系统核心功能已全线贯通。本阶段的目标是清理留在单一待办清单（docs/ai/evo/NEXT_BACKLOG.md）中的轻量类型欠账、本地缓存读取鲁棒性缺陷，以及历史文档的统计漂移，为后续开发打下干净坚实的基石。

本任务包包含以下三个独立且互不冲突的子任务：
1. [代码] NIT-7 类型收敛：将后端已存在的 events 纳入 ResearchReportDetail 声明，收敛前端各处重复局部类型。
2. [代码] P1-1 剩余项：GlobalTaskEntry.tsx 本地 recent 记录读取鲁棒性加固与轻量状态反馈。
3. [文档] D-1 / D-2 / D-3 账目对齐：同步 README 路由计数、纠正 EXEC_PLAN 提交状态陈述、刷新 HANDOFF 当前基线。

---

## 二、子任务详细实现规格

### 子任务 1：NIT-7 `ResearchReportDetail` 类型定义收敛

- **现状根因**：后端 `GET /api/research/{id}`（`backend/app/routers/research.py:469`）在返回报告时注入了完整的 `report["events"]` 列表，但前端核心定义 `frontend/src/types/research.ts` 的 `ResearchReportDetail` 接口未声明该字段。导致 `frontend/src/pages/Research.tsx` 自建局部类型 `StoredAgentEvent`，`frontend/src/features/swarm/replay.ts` 自建局部类型 `StoredSwarmEventRow`，同一契约被分散描述。
- **改动要求**：
  1. 在 `frontend/src/types/research.ts` 中，规范声明 `ResearchReportEvent`（包含 id, research_id, event_type, agent_role_key, payload, created_at），并将其作为数组字段补充到 `ResearchReportDetail.events` 中。
  2. 重构 `frontend/src/pages/Research.tsx` 与 `frontend/src/features/swarm/replay.ts`，移除各自手写的重复事件接口，统一复用 `frontend/src/types/research.ts` 的权威类型。
  3. 严禁改动任何运行时的事件解析逻辑与字段读取。

### 子任务 2：P1-1 尾项 `GlobalTaskEntry.tsx` 的 `recent` 容错加固

- **现状根因**：`frontend/src/components/GlobalTaskEntry.tsx` 中，`recent` 记录从 `localStorage` 中同步读取。当用户浏览器缓存发生异常或脏数据解析失败时，直接被 catch 吞掉并返回空数组，用户无法感知是“暂无记录”还是“读取发生错误”。
- **改动要求**：
  1. 梳理 `readRecentTargets` 的解析逻辑，针对 JSON 损坏提供防御性清理机制，避免脏数据持续导致解析崩溃。
  2. 保持无真重试语义的前提下，对异常情况提供轻量友好的空态提示或静默恢复策略，确保搜索框在任何异常下均能正常输入、弹出与切换。
  3. 在 `frontend/tests/GlobalTaskEntry.test.tsx` 中补充对损坏 localStorage 数据的单测覆盖，证明组件不闪退、输入功能正常。

### 子任务 3：D-1 / D-2 / D-3 历史文档账目一致性对齐

- **改动要求（文档只做客观校准，严禁改写历史事实）**：
  1. **D-1 路由计数修正**：核对 `backend/app/routers/*.py` 实际为 23 个 APIRouter（全部在 `main.py` 挂载），将 `README.md` 中的“22 个 APIRouter”更正为“23 个 APIRouter”。
  2. **D-2 历史提交状态更新**：在 `docs/ai/EXEC_PLAN.md` 中，对已经实际合入 main 分支却依然标注“未 commit”的条目（如 BACKLOG-046、047 等），如实添加一行说明注记，引用其实际合入的 commit SHA，消除文档与 git 历史的冲突。
  3. **D-3 HANDOFF 状态刷新**：在 `HANDOFF.md` 顶部，将“当前目标：Local OSS v1 发布就绪”刷新为当前真实的“Mission 3 完工及技术债演进阶段”，更新文档修订日期。
- **纪律提醒**：文档修改必须整句替换，禁止“只换半句导致前后自相矛盾”；修改后需立即读回核对。

---

## 三、验证门禁要求（必须全绿通过）

在宣称完成任务前，必须在本地依次执行并验证通过以下检查：

```bash
# 1. 前端类型检查与构建（会先自动运行 openapi 契约检查）
cd frontend && bun run build

# 2. 针对改动涉及的前端单测（避免全量超时）
cd frontend && bun run test tests/GlobalTaskEntry.test.tsx tests/swarmReplay.test.ts

# 3. 后端代码规范检查
cd backend && .venv\Scripts\python.exe -m ruff check .

# 4. Harness 静态审计
python scripts/audit.py .
```

*注意：切勿在沙箱环境中运行大范围全量 `pytest tests/`，避免网络代理测试挂起。*

---

## 四、完工后必须自动执行的文档更新闭环

当你完成代码与验证后，必须自动更新以下文件，绝不交给人工处理：

1. **更新 `docs/ai/evo/NEXT_BACKLOG.md`**：
   - 将 `P1-1` 状态改为 `已完成`，注记本次 recent 容错完成提交号。
   - 将 `NIT-7` 状态改为 `已完成`，注记类型收敛已落地。
   - 将 `D-1`、`D-2`、`D-3` 状态改为 `已完成`。
2. **追加 `task/CHANGELOG.md`**：
   - 在日志末尾按标准格式追加本次任务记录：列明任务代号（MISSION-PHASE-1）、改动文件集、验证通过的命令及输出摘要。
