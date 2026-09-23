# MISSION-PHASE-2: 运行健壮性与生命周期交互增强

> 适用角色：Codex / 学生 Agent 长期自主目标模式
> 依赖前置：MISSION-PHASE-1 已完成并合入
> 目标性质：增强本地运行一键启动可靠性、补全 Swarm 取消事件闭环、推进高频页面三态收敛

---

## 一、任务背景与范围

第一阶段的技术债清理使代码与类型契约收敛一致。第二阶段着重解决“生命周期闭环”与“启动可靠性”问题：
1. 解决 Swarm 取消态在回放中失真的问题（前端取消未落库导致回放永远是 running）。
2. 解决 Windows 启动脚本 `start.bat` 在已有虚拟环境时跳过依赖安装导致的隐性版本断层。
3. 针对约 40 处族外“发起请求时清空失败态”的历史遗留问题，建立只读扫描清单，并对持仓（Portfolio）核心模块完成三态契约标准化。

---

## 二、子任务详细实现规格

### 子任务 1：NIT-8 Swarm 取消事件落库与同源回放闭环

- **现状根因**：当前用户在前端调用 `cancelSwarmRun` 时，仅变更了前端本地的 Zustand 状态，没有向后端发送取消请求，也没有在 `research_events` 表中追加任何事件。导致关闭页面后重新进入历史回放时，回放纯函数只能根据数据库现存事件还原，呈现为永久的 `running` 假象。
- **改动要求**：
  1. **后端**：在 `backend/app/routers/swarm.py` 中，提供或补全取消/终止当前 swarm 运行的逻辑。当取消触发时，调用 `_append_event` 向 `research_events` 写入一条 `event_type="team_canceled"`（或 `canceled`）事件，并更新 `research_reports` 对应记录的 `status = "canceled"`。
  2. **前端回放**：在 `frontend/src/features/swarm/replay.ts` 的纯函数状态归约器中，增加对取消事件的捕获，将 `SwarmRunState.status` 正确归约为 `canceled`，不再停留为 `running`。
  3. **同源不变量**：实时流式界面与历史回放界面展示的取消态文案和徽章必须保持完全同源一致。
  4. **测试**：在后端补充取消事件写入单测，前端补充回放纯函数归约单测。

### 子任务 2：P2-4 `start.bat` 增量依赖自动同步优化

- **现状根因**：`start.bat:37` 存在 `if exist "backend\.venv\Scripts\python.exe" goto frontend`，只要检测到 Python 可执行文件存在，便跳过 `pip install`。当项目拉取更新包含新的 Python 依赖时，普通用户双击 `start.bat` 无法自动补齐依赖，导致后端启动报 ModuleNotFoundError。
- **承重铁律（极度重要）**：
  - `start.bat` 受到 `.gitattributes` 的严格约束，必须保持 **CRLF 行尾**。任何工具保存为 LF 都会直接导致 cmd.exe 解析错位。
  - 续行缩进、管道符号与变量保护：其中的 powershell 载荷外层双引号与续行空格具有关键承重作用，严禁使用自动格式化工具破坏其结构。
- **改造方案**：
  - 采用基于依赖哈希的透明增量检查：在 `.venv` 内部维护一份轻量记录文件（例如 `.venv\.requirements.sha256`）。
  - 每次启动时计算当前 `backend\requirements.txt` 的哈希值；若记录文件不存在或哈希值不匹配，则自动执行静默更新：`backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt --quiet`，安装成功后刷新哈希文件。
  - 严格保持原有的端口检测、UTF-8 字符集设置与错误拦截分支不回归。

### 子任务 3：P2-2 族外三态检查排查与 Portfolio 核心收敛

- **现状根因**：全仓仍有若干交互页面沿用旧的“发起请求时立即清除旧失败态”写法，造成切换视图时的瞬间空白或错误闪烁。
- **改动要求**：
  1. 编写一份只读扫描脚本（或审计检查），精准列出全仓所有涉及“发起时清失败态”的调用点，生成排查清单。
  2. 率先将 `frontend/src/pages/Portfolio.tsx` 页面中的核心资产拉取逻辑升级为成熟的 `LoadFailureAlert` / `LoadStateView` 三态契约（`ReadState` 判别联合，优先级为 `error > ready > empty > loading`）。
  3. 补充对应的前端测试，验证加载态、空资产态、异常态互斥，且重试按钮具备真实重发语义。

---

## 三、验证门禁要求（必须全绿通过）

在宣称完成任务前，必须依次执行以下自动化验证：

```bash
# 1. 后端针对性单测验证（Swarm 取消流与状态转换）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_swarm.py -q

# 2. 前端类型与构建门禁
cd frontend && bun run build

# 3. 前端回放与资产页面单测
cd frontend && bun run test tests/swarmReplay.test.ts tests/Portfolio.test.tsx

# 4. 批处理脚本真实解析验证（cmd.exe 下运行，确认返回 0）
cmd /c "start.bat --check-only"
```

---

## 四、完工后必须自动执行的文档更新闭环

任务完成并验证通过后，自主更新以下项目文档：

1. **更新 `docs/ai/evo/NEXT_BACKLOG.md`**：
   - 将 `NIT-8` 状态更新为 `已完成`，记录取消事件落库方案。
   - 将 `P2-4` 状态更新为 `已完成`，记录 start.bat 增量依赖检查机制。
   - 将 `P2-2` 状态更新为 `进行中（第一批 Portfolio 已收敛）`，并附上排查出的剩余清单统计。
2. **追加 `task/CHANGELOG.md`**：
   - 记录 MISSION-PHASE-2 的改动详情、文件清单与测试证据。
