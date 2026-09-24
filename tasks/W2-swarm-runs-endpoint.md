# W2 后端只读端点：某 ticker 下的 swarm 运行列表

- 状态：待执行
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 3（swarm 历史回放）
- 来源：**planned**，源自 `docs/ai/evo/SWARM_REPLAY_EVALUATION.md` §4(b)
- 基线：`904829a0dc29029f901423e2babdaf44177a8e52`

## 目标

新增一个**只读**端点，列出当前用户在某个 ticker 下的 **swarm 团队运行**（四大师 / 财报精读），供前端做历史回放入口。

## 关键约束：不得做 schema 迁移

`research_reports` 表**没有**任何团队/类型字段（已核实：`id / ticker / company_name / report_data / agent_results / model_id / status / created_at / updated_at`）。
**归属必须靠事件判定**：swarm 运行的**首个事件**是 `team_started`（`backend/app/services/swarm_orch.py:212-218`），其 `payload.team` 含 `{key, name, description, agents:[…]}`，且已由 `routers/swarm.py:77` 的 `_append_event` 落进 `research_events`。

⇒ **允许**加索引；**不允许**加表、加列、改既有列语义。（若你判断必须迁移才能做，**停下来说明理由**，不要自行迁移。）

## 第一步（先做）
**先核实现状**并给证据：
- `research_events` 的**真实**建表/迁移后列集合（注意 `routers/research.py:474-478` 的查询用到 `user_id`，而 `database.py` 里的 `CREATE TABLE` 片段未列出该列 ⇒ **查清 `user_id` 是怎么来的**，这直接决定你的查询怎么写）。
- 现有 router 的写法惯例（`database.query_all`、`authenticated_context`/`CurrentUser`、用户隔离）——照抄形状，不要另造。

## 端点设计（可微调，但须说明理由）

`GET /api/swarm/runs?ticker=<code>`（挂在既有的 `/api/swarm` router 上，`routers/swarm.py:27`）

返回该用户在该 ticker 下的 swarm 运行列表（按时间倒序），每项至少含：
`report_id` / `ticker` / `company_name` / `status` / `created_at` / `team_key`（从 `team_started` 的 payload 取）。

## 验收标准（客观门禁）

- [ ] ① 现状核实：`research_events` 真实列集合、`user_id` 的来源、`_append_event` 的插入语句
- [ ] ② 端点实现，且**用户隔离**（不得泄露他人报告；给出他的 user 拿不到的证据）
- [ ] ③ **只返回 swarm 运行**：构造"同一 ticker 下既有深度研究报告、又有 swarm 运行"的数据，断言深度研究报告**不出现在结果里**（这是本卡最容易做错的地方）
- [ ] ④ **不改表**：`git diff` 不包含 `backend/app/database.py` 的建表语句变更；若加了索引，说明理由并证明它是**非破坏性**的
- [ ] ⑤ pytest：**只跑你自己的测试文件**（`cd backend && .venv\Scripts\python.exe -m pytest -q tests/<你的文件>`），贴原始输出与退出码
- [ ] ⑥ `cd backend && .venv\Scripts\python.exe -m ruff check .` → `All checks passed!`
- [ ] ⑦ 文档同步：把新端点写进 `docs/API_CONTRACT.md`（这是项目 Doc sync rule 的硬要求）
- [ ] ⑧ **鉴别力证明**：至少证明③那条断言有牙齿——例如把"按 `team_started` 判定"退回成"不过滤"，断言必须变红（可在 `%TEMP%` 副本或用临时数据构造；**不得在真实工作树留下变异**）
- [ ] ⑨ 反向检验：说明「有没有另一种**错误**的实现也能让用例全绿」

## 限制条件 / 禁止事项

- **只允许改**：`backend/app/routers/swarm.py`（或新增 `backend/app/routers/` 下的文件）、`backend/tests/` 下的**新增**测试文件、`docs/API_CONTRACT.md`。**不得改 `database.py` 的既有建表语句**、不得改既有测试。
- **不跑全量 pytest**（本机沙箱会挂起，且杀 pwsh 不杀子 python）——只跑你自己的测试文件。
- 不 commit；**不得派生子 Agent**。
- 不加依赖；不改配置。
- **端点必须是只读 GET**，不得有副作用；不得触发 LLM 调用。
- 命令文本不得含永久删除类 API 字面名。

## 并发边界
同窗口并行卡 **W1**（前端回放数据层，**只碰 `frontend/`**，且**会跑 `bun run build`**）。你们文件集不相交；**你不要跑前端命令**。

## 预期证据（执行器回填，≤400 行）
现状核实、端点实现（文件:行）、pytest 原始输出、ruff 输出、用户隔离与"只返回 swarm"两条断言的实测、鉴别力证明、`git diff --name-only`、偏差/残余风险。

### ① 现状核实：`research_events` 真实列集合与 `user_id` 来源

**建表原文**（`backend/app/database.py:102-112`，`CREATE TABLE` 片段里确实没有 `user_id`）：

```sql
CREATE TABLE IF NOT EXISTS research_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    research_id     INTEGER NOT NULL,
    event_type      TEXT NOT NULL,
    agent_role_key  TEXT,
    payload         TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (research_id) REFERENCES research_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_events_report
    ON research_events(research_id, id);
```

**`user_id` 来源：后续 ALTER 迁移，不是建表语句**——v10 owner 隔离迁移 `_install_user_data_isolation()` 遍历 `_OWNER_TABLES`（`database.py:278-294`，其中含 `"research_events"`），逐个补列并建索引（`database.py:2022-2034`）：

```python
async def _install_user_data_isolation() -> None:
    """Add explicit ownership columns and indexes to every user-data table."""
    for table in _OWNER_TABLES:
        ...
        await _ensure_column(table, "user_id", "user_id INTEGER REFERENCES users(id)")
        await _db.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)")
```

`_ensure_column`（`database.py:2252-2255`）走 `PRAGMA table_info` + `ALTER TABLE ... ADD COLUMN`。随后 `claim_unowned_data()`（`database.py:2212-2233`）把历史行归属首个 owner，并装 `require_research_events_owner_insert/update` 两个触发器禁止此后写入 ownerless 行。

**实机 PRAGMA（`backend/data/finquant.db`，只读 URI 连接）**：

```
(0, 'id', 'INTEGER', 0, None, 1)
(1, 'research_id', 'INTEGER', 1, None, 0)
(2, 'event_type', 'TEXT', 1, None, 0)
(3, 'agent_role_key', 'TEXT', 0, None, 0)
(4, 'payload', 'TEXT', 1, None, 0)
(5, 'created_at', 'TEXT', 0, "datetime('now')", 0)
(6, 'user_id', 'INTEGER', 0, None, 0)        <-- 迁移补的列，位于表末尾
INDEXES: idx_research_events_report(research_id, id) / idx_research_events_user_id(user_id)
TRIGGERS: require_research_events_owner_insert / require_research_events_owner_update
```

⇒ 该列在表末尾、且伴随 `idx_research_events_user_id` 与 owner 触发器，佐证是 ALTER 而非建表。

**`_append_event` 的插入语句**（`backend/app/routers/research.py:388-392`，swarm 与 research 共用）：

```python
async def _append_event(report_id: int, event: str, data: dict[str, Any], user_id: int) -> None:
    await database.execute(
        "INSERT INTO research_events (research_id, event_type, agent_role_key, payload, user_id) VALUES (?, ?, ?, ?, ?)",
        (report_id, event, data.get("role_key") or data.get("agent"), json.dumps(data, ensure_ascii=False), user_id),
    )
```

**归属判据两端来源**：swarm 侧首个 yield 是 `team_started`，载荷含 `team`（`services/swarm_orch.py:212-218` + `public_team_definition` 的 `key/name/description/agents`，`swarm_orch.py:56-73`），由 `routers/swarm.py:77` 落库；`research_orch.py` 的 yield 集合实测只有 `error / agent_failed / agent_started / tool_call / agent_completed / report_progress / done`（`grep 'yield "'` 全量 12 处），**从不发 `team_started`**。

**实机数据形态**（8 份报告，只读查询）：4 份 swarm 运行的首事件均为 `team_started`；4 份深度研究报告**没有任何事件行**（首事件 `NULL`）。

### ② 端点实现（`backend/app/routers/swarm.py`，+91/-1，未改任何既有行为）

- `swarm.py:8` `from fastapi import APIRouter, Depends, Query, Request`（新增 `Query`）
- `swarm.py:13` `from ..services.market_data import normalize_code`（纯字符串函数，不触网；`routers/settings.py:15` 已有同样的模块级导入先例）
- `swarm.py:61-73` `_RUNS_SQL`
- `swarm.py:76-94` `_ticker_candidates`（规范化形式 + 原始输入双候选；`normalize_code` 抛 `ValueError` 时只保留原始输入）
- `swarm.py:97-108` `_team_metadata`（payload 非法 JSON / team 非 dict / key·name 非 str ⇒ 降级 `None`，不抛错）
- `swarm.py:111-135` `@router.get("/runs")` → `list_swarm_runs`

```sql
WITH first_events AS (
  SELECT research_id, MIN(id) AS first_event_id FROM research_events
  WHERE user_id = ? GROUP BY research_id
)
SELECT r.id AS report_id, r.ticker, r.company_name, r.status, r.created_at, e.payload AS first_payload
FROM research_reports r
JOIN first_events f ON f.research_id = r.id
JOIN research_events e ON e.id = f.first_event_id
WHERE r.user_id = ? AND e.user_id = ? AND e.event_type = 'team_started'
  AND r.ticker IN ({placeholders})
ORDER BY r.created_at DESC, r.id DESC
```

参数 `(user_id, user_id, user_id, *candidates)`；用户隔离在 CTE 与主查询两处都钉死。响应 `{"items": [{report_id, ticker, company_name, status, created_at, team_key, team_name}], "total": n}`；无命中返回 `{"items": [], "total": 0}`；`ticker` 为空由 `Query(min_length=1)` 直接 422。

### ③ 断言实测：只返回 swarm 运行 + 用户隔离

夹具（`backend/tests/test_swarm_runs.py:63-149`）在**同一 ticker `usAAPL`** 下同时放入：深度研究报告（首事件 `agent_started`，载荷填满 `chapters`+`agent_results`）、零事件历史报告（failed）、两个 swarm 运行（`four-masters` / `earnings-review`）、载荷非法 JSON 的 `team_started`、以及"首事件是 `agent_started`、`team_started` 在其后"的边界行；另加另一 ticker 的运行和**另一个用户的同 ticker 运行**。事件一律经生产写入路径 `app.routers.research._append_event` 落库。

```
test_runs_endpoint_returns_only_swarm_runs_for_the_ticker   PASSED
  assert returned == [broken_payload(5), earnings(4), four_masters(3)]
  assert ids["deep"] not in returned                 # 同 ticker 深度研究报告被排除
  assert ids["legacy"] not in returned               # 零事件历史报告被排除
  assert ids["late_team_started"] not in returned    # 首事件语义
  assert ids["other_ticker"] not in returned
test_runs_endpoint_scopes_to_the_current_user               PASSED
  assert ids["other_user"] not in owner_ids
  assert other_ids == [ids["other_user"]]            # 他人拿到的正是自己那一份
  assert set(owner_ids).isdisjoint(other_ids)
  assert stored == {"user_id": other, "event_type": "team_started"}   # 该行确实在库中（排除"本来就没数据"的假阳性）
  assert anonymous.status_code == 401
```

### ④ 不改表 / 不加索引

**没有加索引**，理由：本卡允许改动的文件白名单只有 `routers/swarm.py`（或新增 router）、`tests/` 新增文件、`docs/API_CONTRACT.md`；加 `CREATE INDEX` 必须动 `database.py`，越出白名单。实测该端点也不需要新索引——`research_reports` 已有 `idx_research_reports_owner_id(user_id, id)`（`database.py:1553-1556`）与 `idx_research_reports_ticker_created(ticker, created_at DESC)`（`database.py:99-100`），`research_events` 已有 `idx_research_events_user_id`；本机数据量为个位数报告。⇒ **`git diff` 完全不含 `database.py`**。

### ⑤ pytest 原始输出（前置 `no_proxy`，只跑本卡测试文件）

```
$ cd backend && .venv\Scripts\python.exe -m pytest -q tests/test_swarm_runs.py
.....                                                                  [100%]
5 passed in 22.95s
ERROR: Coverage failure: total of 22.8 is less than fail-under=80.0
app\routers\swarm.py   118  52  26  0  52.8%   40, 46, 145-215, 226, 236
FAIL Required test coverage of 80.0% not reached. Total coverage: 22.77%
CARD_CMD_EXIT=1
```

退出码 1 **只**来自 `pyproject.toml` 的全局 `--cov --cov-branch` 与 `fail_under=80`（单文件跑必然达不到全仓 80%）。同一条命令加 `--no-cov`：

```
$ .venv\Scripts\python.exe -m pytest -q --no-cov tests/test_swarm_runs.py
.....                                                                  [100%]
5 passed in 6.96s
NOCOV_EXIT=0
```

新代码覆盖率：`app\routers\swarm.py` 的 miss 行只有 `40, 46, 145-215, 226, 236`——全部是改动前就存在的行（两个团队元数据端点 + SSE 分析管线），**新增的 61-135 行 0 miss、BrPart=0**。

### ⑥ ruff

```
$ cd backend && .venv\Scripts\python.exe -m ruff check .
All checks passed!
RUFF_EXIT=0
```

### ⑦ 工作树范围

```
$ git diff --name-only
backend/app/routers/swarm.py          # 唯一被修改的既有文件（+91/-1）
$ git status --porcelain
 M backend/app/routers/swarm.py
?? backend/tests/test_swarm_runs.py   # 新增测试
?? frontend/src/features/swarm/replay.ts     # 并行卡 W1 的在制文件，非本卡
?? frontend/tests/SwarmReplay.test.ts        # 同上
```

（`git status` 拍摄于 `docs/API_CONTRACT.md` 编辑之前；`docs/API_CONTRACT.md` 的改动见 ⑩ 之后的文档同步说明。）`database.py` 不在 diff 中；未 commit。

### ⑧ 鉴别力证明（在 `%TEMP%` 副本里做，真实工作树零变异）

副本：`robocopy backend <temp>\w2-mut\backend /E /XD .venv data __pycache__ .pytest_cache htmlcov /XF .coverage`，用**真实 venv 的 python**、`workdir` = 副本（`app` 从副本导入，报错栈里可见 `<temp>\w2-mut\backend\app\routers\swarm.py`）。

| 变异 | 期望 | 实测 |
|---|---|---|
| 基线（副本 + 最终测试文件，未变异） | 全绿 | `5 passed`，EXIT=0 |
| A：删掉 `AND e.event_type = 'team_started'`（= 不过滤） | ③ 变红 | `2 failed, 3 passed`，`assert [6, 5, 4, 3, 1] == [5, 4, 3]`（深度报告 id=1、迟到的 team_started id=6 混入） |
| B：CTE 的 `WHERE user_id = ?` 与主查询的 `r.user_id = ? AND e.user_id = ?` 改成恒真 | 用户隔离变红 | `3 failed, 2 passed`，`assert 8 not in [8, 5, 4, 3]`（他人报告 id=8 泄漏） |
| C：`JOIN first_events … first_event_id` 改成 `JOIN research_events e ON e.research_id = r.id`（首个事件 → 存在即可） | ③ 的"首事件"断言变红 | `2 failed, 3 passed`，`assert [6, 5, 4, 3] == [5, 4, 3]`（id=6 混入） |

每次变异都是先 `Copy-Item` 还原 `swarm.py` 再改，全部在副本目录内。**真实工作树残留扫描**：`Select-String app\routers\swarm.py -Pattern 'r\.user_id = r\.user_id|e\.research_id = r\.id AND|IS NOT NULL'` → **0 命中**；变异实验后真实工作树重跑仍 `5 passed`。

### ⑨ 反向检验：有没有另一种**错误**的实现也能让用例全绿

- **已排除**：(a) 不做归属过滤（变异 A 红）；(b) 归属判定正确但不做用户隔离（变异 B 红）；(c) 用 `EXISTS(任意 team_started)` 代替"首个事件"（变异 C 红）；(d) 靠 `report_data`/`agent_results` 为空的退化夹具蒙混——夹具已把两类报告的载荷都填成"非空 chapters + agent_results"的同构形态，唯一差别只剩事件流。
- **仍然全绿但可能错误的实现（真实盲区）**：把"首个事件"写成 `e.id = (SELECT MIN(id) …)` 但 **`MIN` 不限定 user**——在当前"一个 report 只属于一个 user"的约束下与正确实现逐行等价，本卡用例**无法**把它与正确实现分开。该约束由 `research_reports.user_id` + owner 触发器在数据库层保证，风险等级低，但这是真实盲区，已在 ⑩ 记录。
- **一条已被实测否证的担心**：实机 4 份深度研究报告因**没有任何事件行**，用 `EXISTS` 代替 `JOIN first_events` 也会"恰好"不返回它们——这条不成立：变异 C 的红灯证明"存在即返回"会把"首事件是 `agent_started`、其后有 `team_started`"的行放进来（该行是合成的防御性数据，当前生产者不会产出，用途正是把 FIRST 与 EXISTS 分开）。

### ⑩ 偏差与残余风险

1. **未加索引**（见 ④）：白名单不允许改 `database.py`；当前数据量与既有索引下无必要。若未来单用户报告量上千，可补 `research_reports(user_id, ticker, created_at DESC)`。
2. **`ticker` 只解析代码，不解析公司名**：`resolve_research_target` 的名字→代码需要 `svc.search`（网络）与 `svc.quote`，与"只读、不触发外部调用"约束冲突，故本端点只做纯字符串规范化（`normalize_code`）。名字解析留在前端/既有 research 流程。
3. **"首个事件"依赖生产者不变量**：若将来某个 swarm 运行在 `team_started` 之前落任何事件（例如把 `report_started` 也持久化，`routers/swarm.py:68-71` 目前只 yield 不落库），该运行会**不被列出**（漏报，不会误报）。这是有意的保守选择，已写在 `swarm.py:49-59` 的注释里。
4. **行尾**：编辑后的 `swarm.py` 为 LF；本机 `core.autocrlf=true` 使其对 `git diff` 不可见，仓库存储形式本就是 LF（`.gitattributes` 只对 `*.bat` 指定 `eol=crlf`），无功能影响。
5. **并发窗口**：同窗口 W1 只改 `frontend/`，本卡未跑任何前端命令；`ruff check .` 是全仓扫描，本次 `All checks passed!`——按纪律声明：**不能证明**它与窗口内他卡无关（ruff 只扫 `.py`，实际不受影响）。
6. **未做**：未跑全量 pytest（按要求）；未 commit；未改配置；未派生子 Agent。

### ⑪ 文档同步（Doc sync rule 硬要求）

`docs/API_CONTRACT.md` 三处：
1. §15 Swarm 表格新增 `/api/swarm/runs | GET | …（历史回放入口，只读）` 行 + 一段语义说明（事件归属、排序、字段、ticker 归一、空结果）。
2. 路由汇总表第 17 行 `新增端点 4 → 5`，合计 `132 → 133`。
3. 结尾实测数字：含内联健康检查 142 路径 / 178 操作，不含则 141 / 177（新增前含健康检查实测 141 / 177，即本端点 +1 路径 +1 操作）。

## 验收结论（Evaluator / 指挥会话回填）
- **PASS → 已接受**（2026-09-13，指挥侧独立复核；**非 fresh-context 独立评审**，见边界）
- 执行器：子代理 `a5cc341e-7651-499f-8244-cc19cb657535`
- 指挥侧自己跑的命令与结果：
  - **改动面**：`git status` = `M backend/app/routers/swarm.py`、`M docs/API_CONTRACT.md`、`?? backend/tests/test_swarm_runs.py`（另两个 `??` 属 W1）⇒ **不含 `database.py`**，「不加表/不加列」成立
  - **`user_id` 来源核实**：`database.py:278` `_OWNER_TABLES` 确含 `research_events`（`:280`）；`_ensure_column`（`:2252`）经 `ALTER TABLE … ADD COLUMN`（`:2255`）补列。⇒ 建表语句无 `user_id` 而查询能用它，**原因已查清**（v10 owner 隔离迁移）
  - **SQL 实读逐字核对**：CTE `MIN(id)` 取首事件 + `WHERE user_id = ?`，主查询 `r.user_id = ? AND e.user_id = ? AND e.event_type = 'team_started'` —— 与自述一致；`:53-57` 有生产者不变量注释（"首个持久化事件是 `team_started`"）
  - **门禁（指挥侧复跑）**：`pytest -q --no-cov tests/test_swarm_runs.py` → `5 passed` exit 0；`ruff check .` → `All checks passed!` exit 0
- 接受但**未由指挥侧复跑**的执行器自述：三条变异在副本内全部变红（删 `team_started` 过滤 ⇒ 2 failed；去掉用户隔离 ⇒ 3 failed；FIRST→EXISTS ⇒ 2 failed），真实工作树残留扫描 0 命中
- 指挥侧裁定：
  - **未加索引：接受**。既有 `idx_research_events_user_id` 与 `idx_research_reports_owner_id` 够用；加索引需动 `database.py`，本卡白名单不允许，且非必要。
  - **裸命令退出码 1 → 不判失败**：`--cov fail_under=80` 是全仓覆盖率门，单文件必达不到；去覆盖率口径 `5 passed` exit 0（与 Mission 1 记录的双口径一致）。新代码行 0 miss 由执行器自述，指挥侧未复算。
- NIT / 残余盲区（执行器自述，指挥侧认同）：`MIN(id)` 若不限定 user，在当前"一个 report 只属于一个 user"的 DB 触发器约束下与正确实现逐行等价，**用例无法区分**（风险低）；"首个事件"语义依赖生产者不变量，若将来把 `report_started` 也持久化会**漏报而非误报**（已写入 `swarm.py:49-59` 注释）。
- **过程事故（执行器主动报告，指挥侧已核实与处置）**：收尾时用 `Get-ChildItem $env:TEMP -Filter 'w2-*.txt'` 批量回收，误收 4 个不属于本卡的文件（`w2-tsc-before/after.txt`、`w2-audit-before/after.txt`）。**指挥侧核实：4 个文件已按原内容还原、字节数与自述完全一致（10101 / 9796 / 3486 / 3486）**；按时间戳（06:09–06:14）判断归属 **Mission 2 的 W2 卡**（已完成并入库于 `0d564286`，其证据在 `workflow/mission-02/tasks/` 内）⇒ **无实质损失**。教训已记入 `RUN_STATE.md` Notes。
- **边界**：本判定由指挥侧做出，**不是 fresh-context 独立评审**。
