# PRODUCT_UX_REPORT（第四轮）

> 审计员：SUBAGENT A4（PRODUCT_UX_AUDITOR，第四轮）。只读审计，不改代码。
> 基线：`docs/ai/evo/PROJECT_BRIEF.md`（2026-09-11 第四轮审计基线）。
> 已读文件（7 个）：`docs/ai/evo/PROJECT_BRIEF.md`、`docs/QUICKSTART.md`、`frontend/src/App.tsx`、`frontend/src/pages/Dashboard.tsx`、`frontend/src/pages/ResearchWorkspace.tsx`（节选）、`frontend/src/pages/Discussion.tsx`（节选）、`frontend/src/pages/Chat.tsx`（节选）；另用 grep 抽查 `i18n/zh.ts`、`components/TodayNeedAttention.tsx`、`pages/Login.tsx`、`backend/app/routers/dashboard.py` 等。未读文件一律不臆断。

## 结论：当前最大 UX 缺口（1-3 条，说明为什么）

1. **"失败"与"没有数据"在首页不可区分——这是当前最伤信任的缺口。** 首页两个"最近记录"卡片的数据源 `/dashboard/stats` 失败时是**完全静默**的（`Dashboard.tsx:62` 的 `catch { /* non-critical context */ }`），于是界面退化成空态文案"暂无会话 / 暂无讨论"（`Dashboard.tsx:107`、`Dashboard.tsx:123`；文案见 `i18n/zh.ts:1118-1119`）。对刚装好程序的用户来说，"我确实还没用过"和"我的记录不见了/接口挂了"是**同一屏同一句话**。同一页面上另外两个区块（决策收件箱、市场/新闻）却各自带 `Alert` 错误态（`Dashboard.tsx:25`、`Dashboard.tsx:90` 传入 `error`）——同一页面的失败可见性不一致，说明静默不是设计约定，而是遗漏。产品已过"起不来/登录死胡同"阶段（R3 主缺口），第一印象的临界点因此转移到"我能不能信这屏上的信息"。

2. **深链（首页"最近会话/最近讨论"）在目标记录不可用时的回落是静默的。** VS-16 把 id 带进了链接（`Dashboard.tsx:101`、`Dashboard.tsx:117`），消费端也确实实现了一次性守卫（`Chat.tsx:105-110`、`Discussion.tsx:65-70`），R3 那类"被旧 room 拽回"的缺陷未复现。但守卫的"该 id 不在我的列表里"分支**不选中、不提示、不报错**（`Discussion.tsx:63-64` 注释即明说"页面留在该功能区默认视图"），房间列表请求本身也是静默失败（`Discussion.tsx:59` 的 `.catch(() => {})`）。于是用户点击"最近讨论"中的一条（例如刚被删除、或列表尚未返回就点击）时，看到的是一个空白的新建界面——**与 R3 修复前"点击落到空白新建界面"的用户体感完全相同**。这类"点了没反应"是放弃率最高的形态之一，且极难被用户自我诊断。

3. **首页指标行里混入永不更新的英文占位。** `Dashboard.tsx:86` 把字面量 `"UNKNOWN"` 传给 `TodayNeedAttention` 的 `events`，该组件直接把值渲染进指标行（`components/TodayNeedAttention.tsx:6`，标签 `today.metric.events` = "今日事件"，`i18n/zh.ts:1519`）。结果是中文界面上出现"今日事件 UNKNOWN"，而且它与同一行里**真实的数字**（需关注/运行中/重大变更）并列——用户会以为"事件功能坏了"，实则是一个永远不会变成数字的硬编码占位。相对前两条它是小问题，但它是"全中大问题都已修完"后最容易上线的残留噪音。

## 发现的问题

### P1-1（P2）首页"最近会话/最近讨论"把加载失败显示成空态
- **问题**：`/dashboard/stats` 请求失败被完全吞掉，两块卡片退化为"暂无会话/暂无讨论"，与真实空数据不可区分。
- **证据**：`frontend/src/pages/Dashboard.tsx:62`（`catch { /* non-critical context */ }`）；`frontend/src/pages/Dashboard.tsx:107` 与 `:123`（`emptyText`）；`frontend/src/i18n/zh.ts:1118-1119`（"暂无会话"/"暂无讨论"）；对照 `frontend/src/pages/Dashboard.tsx:25`、`:90`（同页其它区块有 `Alert` 错误态）。
- **用户影响**：老用户以为记录丢失（信任受损）；新用户无法判断自己是否成功保存过任何东西。
- **建议**：给 `loadStats` 增加 `statsError` 状态，失败时在两张卡片位置渲染与决策收件箱一致的 `Alert`（"最近记录读取失败 + 重试"），仅在成功且为空时显示"暂无会话/暂无讨论"。可顺手把 `Dashboard.tsx:199-202`（`App.tsx` 里 `/models` 的 `.catch(() => {})`）一并纳入同一错误可见性约定。
- **优先级**：P2

### P2-1（P2）深链目标失效时静默回落，用户看到"点了没反应"
- **问题**：`?session=`/`?room=` 指向的记录不在当前用户列表（已删除 / 列表未返回就点击）时，页面不选中、不提示、不报错。
- **证据**：`frontend/src/pages/Chat.tsx:85-95`（会话列表 `.catch(() => { /* …深链回落… */ })`，静默）与 `:105-110`（不在列表则不 `setCurrentSessionId`）；`frontend/src/pages/Discussion.tsx:59`（房间列表 `.catch(() => {})`）与 `:63-70`（注释与实现一致：不选中、不发请求）。
- **用户影响**：从首页点一条记录 → 落到空白默认视图且无任何解释；用户会重复点击或认为功能损坏。
- **建议**：保持"不抢焦点"的现有语义，只补**一次性提示**：仅当 `requestedRoomId !== null` 且列表已返回且不含该 id 时，给一条 `message.warning("该讨论已不存在，已显示当前列表")`（Chat 同理）。**注意**：必须与 `appliedRoomRef` 一样只触发一次，否则会重演 R3 的"反复打扰"。
- **优先级**：P2

### P3-1（P3）首页"今日事件"恒为硬编码英文 `UNKNOWN`
- **问题**：`events` 是字面量而非数据，中文界面出现英文 token，且与真实数字同排。
- **证据**：`frontend/src/pages/Dashboard.tsx:86`（`events="UNKNOWN"`）；`frontend/src/components/TodayNeedAttention.tsx:6`（直接渲染该值）；`frontend/src/i18n/zh.ts:1519`（"今日事件"）。
- **用户影响**：误导——用户会认为事件统计功能故障，而非"尚未接入"。
- **建议**：短期改为走 i18n 的显式文案（如 `today.metric.eventsUnknown` = "今日事件 暂未接入"），或直接不渲染该格；中期由后端提供真实计数。
- **优先级**：P3

### P4-1（P3）运行中偶发 401 仍会把用户弹到登录页
- **问题**：任意一次 401/403 都会 `clear()` 本地登录态并 `replace` 到 `/login`；本地单人模式下唯一出口是登录页上的"重试连接"。
- **证据**：`frontend/src/App.tsx:374-383`（`finquant:unauthorized` → `clear()` + `navigate('/login', { replace: true })`）；出口存在于 `frontend/src/pages/Login.tsx:88-97`（`auth.localFallback.retry`，`i18n/zh.ts:2361` "重试连接"）。
- **用户影响**：不是死胡同（R3 的启动期死胡同已修：`App.tsx:390-398` 的 `unavailable` 分支持续有效），但用户在本地模式下**没有可完成的登录动作**，看到登录页本身就是困惑源；好在有明确说明与重试按钮。
- **建议**：本地模式（`LOCAL_ONLY`/`user.local_mode`）下，401 不跳转登录页，改为原地提示"本机服务连接已中断，请重试"并复用 `auth.unavailable` 的重试入口；非本地模式维持现状。
- **优先级**：P3

### P4-2（P4）能力提示按钮的落点靠后端字符串，前端类型却写成字面量
- **问题**：`LocalCapabilityBanner` 的按钮跳转目标来自后端字段，而前端类型把它断言为固定字面量，后端若改路径前端不会报错（当前值一致，属健壮性隐患而非现存缺陷）。
- **证据**：`frontend/src/pages/Dashboard.tsx:37`（`onNavigate(capabilities.model_ai.action_path)`）；`frontend/src/types/index.ts:360`（`action_path: '/models'` 字面量类型）；`backend/app/routers/dashboard.py:177`（实际返回值 `"/models"`）。
- **用户影响**：当前无；一旦后端调整，"配置模型"按钮会静默跳到 404 → 被 `App.tsx:342` 的 `*` 兜底重定向回首页，用户会看到"点了跳回首页"。
- **建议**：类型放宽为 `string`，并在跳转前对已知路径做白名单校验（不在白名单则回落 `/models`）。
- **优先级**：P4

## 近期改动是否引入新问题（对基线 8 类逐条判断）

1. **研究失败语义收口（agent_failed 非致命）**：消费方已核验**两处**均有分支——`frontend/src/pages/Research.tsx:328-335`（`case 'agent_failed'`）与 `frontend/src/features/swarm/state.ts:101`；后端发出点见 `backend/app/services/research_orch.py:345/384/420`、`backend/app/services/swarm_orch.py:261`。**未见遗漏的实时消费方**。存疑项：全仓 `*.py` 中 `agent_failed` 只出现在两个 orch 与测试文件里，**未见过"事件持久化/历史回放"侧的处理**——"实时界面显示某 Agent 失败，但关掉重开该报告是否还能看到这一失败"未验证（见"未验证项"）。
2. **LLM 重试 / Retry-After / 抖动**：本轮未读 `llm_client.py`，**未验证**。
3. **前端失败可见性（Research.tsx 新增 case + applyAgentEvent）**：分支存在且被设计为纯函数（`Research.tsx:71-91`），与基线描述一致；**未见新问题**。
4. **本地模式登录死胡同修复**：`App.tsx:390-398` 的 `unavailable` + 重试仍在，登录页侧也有独立出口（`Login.tsx:88-97`），**死胡同未见复发**。残留的"运行中 401 弹登录页"见 P4-1（有出口，非死胡同）。
5. **启动链（备份 / 产物过期不再硬退出 / 复用打印构建时间）**：`start.bat` 本轮**正在被另一 agent 修改中**，按任务书不做评判，**结论待定**。文档侧 `docs/QUICKSTART.md:125` 与基线第 5、6 条的措辞一致（仅"产物确实缺失"才要求 Bun；复用时会打印构建时间）——文档未超前于实现。
6. **用户可见文本与实现对齐**：抽查一致——`QUICKSTART.md:46-48`（研究→研究工作区 / 发现→涨跌停池 / 组合→组合与风险）与 `i18n/zh.ts:41/49-51/53` 标签逐字对应；`QUICKSTART.md:66`"设置→模型管理"对应 `zh.ts:57`，且按钮落点 `dashboard.py:177` = `/models` 与之相符；`QUICKSTART.md:169` 备份"不会自动删除、只提示"与基线第 6 条相符。**除 start.bat 相关段落外，未见残留不一致**（新发现的英文占位 `UNKNOWN` 属新问题 P3-1，不是文档不一致）。
7. **首页入口带记录 id（VS-16）**：新可达路径**已带守卫**——`Chat.tsx:80/105-110`（`appliedSessionRef` + `sessionsResolved`）与 `Discussion.tsx:55/65-70`（`appliedRoomRef`），R3 记载的"深链反复抢焦点"**未复现**。**但**该改动第一次让"深链目标失效"这一分支变得可达，而它没有任何用户反馈（见 P2-1）——属本类改动引出的新 UX 问题。
8. **仓库行尾（`*.bat text eol=crlf`）**：本轮未做 clone 级验证（超预算），**未验证**；且与正在改动的 `start.bat` 同域，结论待定。

### 专门回答"这次新增让哪些既有路径第一次变得可达"（第四问）

- **类 7（首页产出 `?session=`/`?room=`）** → 第一次可达的是 `Chat`/`Discussion` 的 URL 消费逻辑：**含"深链失效静默回落"分支**（P2-1，唯一由本轮改动新暴露的用户体感缺口）。
- **类 1（agent_failed 非致命）** → 第一次可达的是"整轮成功但含失败 Agent 的报告"这一状态：实时路径有分支（`Research.tsx:333`），**历史/回放路径未验证**。同时风险是反向的：原来会整轮失败的运行现在记为完成，**若降级信息不随报告持久化，"这次研究有问题"将在事后不可见**（未验证，列为首要后续验证项）。
- **类 4（`unavailable` 状态）** → 第一次可达的是"服务未就绪但前端已加载"（已闭环），同时让"运行中 401 → 跳登录"这条路径在本地模式下变得可见（P4-1）。
- **类 5（不再硬退出）** → 第一次可达的是"用疑似过期产物启动"：`QUICKSTART.md:125` 已同步说明"只提示、照常启动"，文案与承诺一致；实现侧因 `start.bat` 在改动中，结论待定。
- **类 2/3/6/8** → 未发现因它们而"第一次变得可达"的既有路径（类 3 是新增分支本身，类 8 是构建期属性）。

## 值得保留的好体验

- **首次成功路径的主干已经通畅**：双击 → 8000 → 单人模式免登录；服务未就绪时 `App.tsx:390-398` 明确显示"正在连接本机服务…"并可重试，登录页也有等价的兜底说明与"重试连接"（`Login.tsx:88-97`），**R3 的登录死胡同未见复发**。
- **文档的可执行性很高**：`QUICKSTART.md:44-48` 给的三步首次试用手（研究工作区输入 600519、涨跌停池、组合与风险）与侧栏标签逐字对应（`i18n/zh.ts:49/51/53`），新用户照着点不会迷路。
- **深链守卫的实现质量高**：`appliedSessionRef` / `appliedRoomRef` 只应用一次，且要求 id 命中"当前用户自己的列表"（`Chat.tsx:101-110`、`Discussion.tsx:63-70`），既修了抢焦点又避免了为非法 id 发请求，还顺带处理了"列表未返回"的竞态。
- **诚实的未知表达**：`QUICKSTART.md:113-117` 明确解释 `UNKNOWN/PARTIAL/UPSTREAM_ERROR` 是如实保留的缺失状态，UI 侧也不把它们渲染成 0（与项目"宁可说未知"的纪律一致）。
- **能力引导按需出现**：`Dashboard.tsx:84-85` 在 `stats` 就绪后才渲染能力 banner，避免加载态闪烁；文案"本地核心已可用，AI 模型尚未配置"（`zh.ts:1131`）准确传达了"没有 key 也能用"。

## 未验证项

1. **`start.bat` 相关的一切**（自动开浏览器、备份、产物复用、Python 版本提示、行尾）——该文件正被另一 agent 修改中，本轮不做评判；`QUICKSTART.md:40/125/169` 的相应承诺未与实现逐条核对。
2. **agent_failed 的历史回放/持久化**：全仓 `*.py` grep 未在 orch 与测试之外找到 `agent_failed` 的持久化或回放处理；"重开报告后降级 Agent 的失败是否仍可见"未验证（本轮最高优先的待验证项，因为它决定"整轮成功"是否掩盖了局部失败）。
3. **`/research?mode=deep` 等 AI 入口在"未配置模型"时的行为**：未读 `Research.tsx` 相关分支，无法判断是否有就地引导（只能确认首页有 banner）。
4. **`/research?mode=review&room=` 深链与 `ResearchModeSurface`（`ResearchWorkspace.tsx:65-88`）的交互**：`Discussion` 由该组件渲染且未接收 room prop，房间 id 依赖 `Discussion` 自己读 URL——逻辑上成立，但"模式切换器 → 再进深链"的组合行为未实测。
5. **决策收件箱/研究运行区块的失败态**：`ResearchRuns`（`Dashboard.tsx:91`）等组件未读，其空态/失败态是否同样静默未验证。
6. **移动端/窄窗口**（`siderWidth={240}`、`breakpoint="lg"`，`App.tsx:304-305`）侧栏自动折叠后的首次发现体验未验证。
7. **Docker/`scripts/local.sh` 路径**与 `LOCAL_ONLY` 后端行为未审查。
8. 本轮**未运行任何测试**（遵守沙箱约束与预算纪律）；上述结论均来自静态阅读。
