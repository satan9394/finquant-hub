# PRODUCT_UX_REPORT（第五轮）

> 审计者：SUBAGENT A5（PRODUCT_UX_AUDITOR）。只读审计，未改任何代码。
> 基线：`docs/ai/evo/PROJECT_BRIEF.md` 「第五轮审计基线」（VS-16..VS-23 六个改动面）。
> 已读文件（8 个，达预算上限）：`PROJECT_BRIEF.md`、`docs/QUICKSTART.md`、`start.bat`、`frontend/src/App.tsx`、
> `pages/Dashboard.tsx`、`pages/Discussion.tsx`、`pages/ResearchWorkspace.tsx`、`components/LoadFailureAlert.tsx`
> （另有对上述文件的定向 grep；未运行任何测试或构建）。

## 结论：当前最大 UX 缺口

1. **"追问条提交了，但没有人接"——有标的时提问被静默丢弃（P1-1）。**
   `/research/:symbol` 页面底部的追问条是"对当前这只股票提问"的**唯一**入口，它把问题写进
   `?prompt=` 就撒手；而接住 `prompt` 的代码只在**没有标的**时才生效。用户按下提交后界面没有任何变化
   （输入框不显示、不搜索、无提示），只有地址栏变了。这与该功能的自我承诺（`App.tsx:238`、`CommandComposer` 的
   "问题不丢"）直接冲突。对非技术用户，这是标准的"按了没反应＝坏了"。

2. **"读取失败"与"加载中"在只读详情区仍会互相伪装（P1-2、P2-4）。**
   VS-19/VS-22 把"失败伪装成空态"收口在了**列表/空态**这一种形态上（首页两卡、左栏列表、研究运行区块），
   但同一族的另外两种形态没有覆盖：`Discussion` 右栏详情失败后**永久转圈**（甚至串台显示上一条讨论的内容）；
   首页"最近会话/研究运行"在**请求在途**时仍渲染"暂无…"/`UNKNOWN`。根因是 `LoadFailureAlert` 的契约
   只有 `error + onRetry`，没有 loading/empty 维度——任何新接入点在"在途"期间必然露出空态。

3. **高频 AI 入口不在左侧导航里（P2-5）。**
   `/chat`、`/discussion`、`/thesis`、`/compare` 都不在 `navigationGroupDefinitions` 中，只是重定向到
   `/research?mode=…`；"研究"分组只有一个子项。用户一旦离开首页，就找不到"AI 聊天/多角色讨论"，
   而这两件事正是非技术用户最想要的东西。

## 发现的问题

### P1-1　有标的时，追问条提交的提问无人接住（界面零反馈）

- **证据**
  - `frontend/src/App.tsx:345-350`：`followupSymbol` 存在（即 `/research/:symbol` 或 `/analysis/:ticker`）时渲染
    `CommandComposer`，`onSubmit` 执行 `navigate('/research/'+followupSymbol+'?prompt=…')`；`followupSymbol`
    取自**当前**路径（`App.tsx:240-241`）。
  - `frontend/src/App.tsx:334`：`/research/:symbol` 只对应**一个** Route，同路径仅改查询串不会重挂载组件。
  - `frontend/src/pages/ResearchWorkspace.tsx:199-202`：`urlPrompt = searchParams.get('prompt')`，
    但只用 `useState(urlPrompt)` 做**挂载时**初值；`searchedUrlPrompt` 是一次性守卫。
  - `frontend/src/pages/ResearchWorkspace.tsx:256-262`：自动搜索的条件是 `!currentSymbol && urlPrompt && !searchedUrlPrompt`
    ——**有标的时永不触发**。
  - 全文 grep：`urlPrompt` 只出现于 199/200/257 三处，**没有**任何 effect 在 `searchParams` 变化时同步 `query`。
- **用户影响**：在标的研究页用底部追问条问"这家公司现金流怎么样？"，页面毫无反应；问题只躺在地址栏里。
  从 `/analysis/:ticker` 提交时（Route 变化 → 重挂载）却能正常预填，于是**同一个按钮在两种路径下行为不同**，
  用户无法预期。
- **建议**：在 `ResearchWorkspaceCore` 增加以 `searchParams`/`urlPrompt` 为依赖的 effect：`urlPrompt` 变化即
  `setQuery(urlPrompt)` 并重置 `searchedUrlPrompt`（或让 `App.tsx` 提交时携带 router state / 给 Route 加 `key`）。
  两条路径必须同源。
- **优先级**：P1

### P1-2　`Discussion` 右栏把"读取失败"渲染成永久"加载中"，切换失败还会串台显示上一条讨论

- **证据**
  - `frontend/src/pages/Discussion.tsx:126-137`：详情请求 `catch(() => message.error(t('discussion.loadFailed')))`
    + `finally setLoadingDetail(false)`；`roomDetail` 只在 `!currentRoomId` 时被清空（`:127`），失败时**保留旧值**。
  - `frontend/src/pages/Discussion.tsx:302-306`：`loadingDetail || !roomDetail` → `<Spin/>` + `t('discussion.loading')`。
  - 对照：同一文件**左栏**已经用 `LoadFailureAlert`（`:258-262`），口径是"失败必须说出来"。
- **用户影响**：①从首页"最近讨论"深链进入、详情接口失败 → 右侧**永远转圈**，唯一提示是几秒后消失的 toast；
  ②从讨论 A 切到讨论 B 且 B 的详情请求失败 → 左栏高亮 B，右栏显示的是 **A 的内容**（内容与选中项不一致）。
  这是 VS-22 在同一文件左栏修掉的缺陷的孪生形态：**左栏修了，右栏没修**。
- **建议**：为详情请求增加 `detailFailed/detailError` 状态，失败时复用 `LoadFailureAlert` + 重试；切换房间时先
  `setRoomDetail(null)`，避免旧对象串台。
- **优先级**：P1

### P2-3　首次使用 AI 讨论可能卡死在"请至少选择 3 个角色"，而可选角色是空的且无任何报错

- **证据**
  - `frontend/src/pages/Discussion.tsx:94`：`apiClient.get('/agents').then(...).catch(() => {})` —— 失败被**静默吞掉**。
  - `frontend/src/pages/Discussion.tsx:380`：角色下拉 `options={agents.map(...)}`（选项完全来自这条请求）。
  - `frontend/src/pages/Discussion.tsx:142`：`if (selectedRoles.length < 3) { message.warning(t('discussion.rolesRequired')); return; }`
- **用户影响**：`/agents` 失败时下拉为空 → 用户无论怎么点都被"请至少选择 3 个角色"挡住，系统却不说明
  "角色列表没读出来"。对非技术用户＝功能不可用且无从下手（与 R3 的"登录死胡同"同类：无出路、无归因）。
- **建议**：保留失败态（`agentsFailed/agentsError`）+ 重试入口，并在新建讨论弹窗中显式提示角色列表读取失败；
  禁止用 `catch(() => {})` 吞掉这个决定"能否继续"的请求。
- **优先级**：P2（需接口失败才触发，非必现）

### P2-4　"加载中 vs 空"仍未收口：首页至少 2 面在途期间渲染空态文案

（这是本轮第 ④ 条质疑方向的正面回答：**这一族还剩至少 2 面**。）

- **证据**
  - `frontend/src/pages/Dashboard.tsx:70-80`：`loadStats` **没有** `statsLoading` 状态（只有 `statsFailed`）。
  - `frontend/src/pages/Dashboard.tsx:95`：`researchRuns = (stats?.recent_rooms ?? [])` → 在途时为空数组。
  - `frontend/src/pages/Dashboard.tsx:120-135` 与 `:138-153`：`statsFailed ? alert : <List dataSource={stats?.recent_conversations ?? []} locale={{emptyText: t('today.noConversations')}}/>`
    —— 在途时走的是 `List` 空态分支。
  - `frontend/src/pages/Dashboard.tsx:116`：`<ResearchRuns runs error onRetry/>`，**没有** `loading` 入参。
  - `frontend/src/components/ResearchRuns.tsx:8,19`：props 只有 `runs/error/onRetry`，空态渲染 `<p>UNKNOWN</p>`。
- **用户影响**：首屏 1–3 秒内用户看到"暂无会话/暂无讨论"，随后数据出现——短暂但真实地让人以为记录丢了；
  "研究运行"区在途与合法空态是**同一个字符串 `UNKNOWN`**，无法区分，且该英文标记与
  `docs/QUICKSTART.md:115` 向用户解释的 UNKNOWN（＝数据质量"未知"）语义冲突。
- **建议**：`stats` 增加 `statsLoading`，在途渲染骨架或 `Card loading`；`ResearchRuns` 增加 `loading` 入参；
  合法空态改中文"暂无研究运行"，把 `UNKNOWN` 留给数据质量语义。若要根治，给 `LoadFailureAlert`
  同族的"三态"契约（loading / empty / failed）而不是逐个页面打补丁。
- **优先级**：P2

### P2-5　导航与功能发现：聊天 / 讨论 / 命题不在左侧菜单，且"研究"组只有一个子项

- **证据**
  - `frontend/src/App.tsx:60-120`：`navigationGroupDefinitions` 中无 `/chat`、`/discussion`、`/thesis`、`/compare`、`/analysis`；
    "研究"组只有 `{ path: '/research' }` 一项。
  - `frontend/src/App.tsx:289`：`menuDataRender={() => translatedNavigation}` —— 左侧菜单确由该定义生成。
  - `frontend/src/App.tsx:139`：`getMenuKey` 把 `/chat|/discussion|/thesis|/compare|/analysis` 全部归并到 `/research`（高亮为"研究"）。
  - `frontend/src/App.tsx:323,324,329`：`/chat`、`/discussion`、`/thesis` 只是 `LegacyResearchRedirect` 到 `/research?mode=…`。
  - `frontend/src/pages/Dashboard.tsx:119,137,156`：聊天/讨论入口只出现在首页卡片与首页底部按钮。
- **用户影响**：用户从首页点进"AI 聊天"后再去别的页面，**没有菜单路径回到聊天/讨论**；菜单高亮停在"研究"，
  与"我正在聊天"不一致（导航反馈与实际位置不符）。`docs/QUICKSTART.md:46-48` 只引导了 研究/发现/组合 三项，
  没有覆盖这两个高频功能。
- **建议**：在"研究"组下显式列出 **研究工作区 / AI 聊天 / 多角色讨论**（指向 `/research?mode=fast|review`），
  点击后落到用户预期位置；同时让菜单高亮跟随 `mode`。
- **优先级**：P3

### P3-6　`start.bat` 在 `.venv` 已存在时完全跳过依赖安装 → 更新代码后启动失败，用户被要求手打 CLI

- **证据**
  - `start.bat:37`：`if exist "backend\.venv\Scripts\python.exe" goto frontend` —— 直接跳过 `:install_backend`。
  - `start.bat:52`：`pip install -r requirements.txt` 只在**新建** venv 的分支里执行。
  - `start.bat:141-148`：uvicorn 启动失败后给出"可在 backend 目录运行 `.venv\Scripts\python.exe -m pip install -r requirements.txt`"的 CLI 指引。
  - `docs/QUICKSTART.md:127`、`:152-163`：同样把补依赖的活交给用户手打命令（更新流程第 3 步）。
- **用户影响**：对"更新到最新代码"的用户（QUICKSTART 明确支持的 git pull / 换目录流程）最容易踩到：
  双击后启动失败，一句英文命令决定他还能不能继续用。这是"本地部署、非技术用户"场景下最典型的放弃点。
- **建议**：在复用 venv 的路径上加一次廉价校验（如 `python -c "import fastapi, uvicorn"`），失败则**自动**
  执行 `pip install -r backend\requirements.txt`（保留现有失败提示作为兜底）。
- **优先级**：P3

### P3-7　"研究运行"区块的合法空态用英文 `UNKNOWN`

- **证据**：`frontend/src/components/ResearchRuns.tsx:19`（空态 `<p>UNKNOWN</p>`）；`docs/QUICKSTART.md:115`
  （文档告诉用户 UNKNOWN 表示"数据未知/未提供"，"不应把空白当成 0"）。
- **用户影响**：从没跑过研究的用户看到 `UNKNOWN`，会按文档理解为"这项数据取不到"，而不是"你还没有运行过"。
  中文界面上出现未本地化的英文标记，与本项目"UI 全中文"的目标不符。
- **说明**：**与 R4 相同、无新增**（R4 的 A4-P3-1 已指出此处空态）；本轮新增的角度只是：它同时也是
  P2-4 里"加载中"的呈现形态。
- **优先级**：P3

### P4-8　Bun 安装指路在两处不一致

- **证据**：`start.bat:187` 指向 `https://bun.sh`；`docs/QUICKSTART.md:16` 指向 `https://bun.com/docs/installation`。
- **用户影响**：低（`bun.sh` 目前会跳转），但同一件事在两个用户可见位置给了不同地址，属文档口径不一致。
- **优先级**：P4

## R4 之后的六个改动面是否引入新问题（逐条）

1. **首页深链（VS-16）**：**有新观察（未验证）**。`selectMode` 的剥离列表只有 `session`/`room`
   （`ResearchWorkspace.tsx:72-73`），而应用内**确实存在** `prompt` 的产出者
   （`ComparisonWorkspace.tsx:156` → `/research?mode=fast&prompt=…`；`App.tsx:348`）。
   于是"fast(prompt) → review"切换后 `prompt` 会留在 URL 并进入新模式；是否造成可见错误取决于 `Chat` 侧
   是否只应用一次（**未读 `Chat.tsx`，未验证**）。另：Dashboard 两条深链（`Dashboard.tsx:127,145`）路径正确，
   经 `LegacyResearchRedirect` 保留查询串后由 `Chat.tsx:65`/`Discussion.tsx:35` 接住，**未见**新问题。
   真正的新问题出在同族参数的另一端——见 **P1-1**（`prompt` 在有标的时无消费者）。
2. **备份（VS-17/18）**：**未见**。`start.bat:109-127` 与 `docs/QUICKSTART.md:169-181` 口径一致：`.partial` 命名
   `finquant-backup-*.db.<PID>.partial`、失败只回收自己的 `.partial`、遗留提示 `-Filter 'finquant-backup-*.partial*'`
   （尾星覆盖伴生件）、7 份计数仍用 `finquant-backup-*.db`、超限只提示不删。硬中断/同秒并发**未实测**（未验证）。
3. **"失败"与"没有数据"可区分（VS-19/22）**：**有**。收口只覆盖"列表/空态"形态，右栏详情
   （`Discussion.tsx:302`）与"在途"维度（`Dashboard.tsx:70-80,116`）未覆盖 → **P1-2、P2-4**。
4. **降级/失败结构化、实时与回放同源（VS-20）**：**未验证**（未读 `Research.tsx` / `deriveAgentOutcomes` / 后端）。
5. **LLM 等待有上界（VS-21/23）**：**未验证**（未读后端；本轮未跑测试）。
6. **契约与规则（文档）**：**有轻微不一致**。`App.tsx:238` 与 `CommandComposer` 承诺"提交把原问题导航到
   `/research/:symbol?prompt=…`，问题不丢"，`ResearchWorkspace.tsx:196-198` 也自称已"接住" prompt——
   实现只在**无标的**时成立，有标的时问题仍然"只留在 URL 不呈现"（P1-1）。

## 值得保留的好体验

- **`LoadFailureAlert` 单一实现**：组件注释明确"同一失败只有一种待遇"，并已被首页两卡
  （`Dashboard.tsx:102,120,138`）、`ResearchRuns.tsx:19`、`Discussion.tsx:260` 共用——这是防止此类缺陷复发的好结构，
  本轮发现的两个漏网点正是**没接入它**的地方。
- **深链落空一次性提示 + 两种失败分开归因**：`Discussion.tsx:102-116`（`deepLinkMissing` vs `deepLinkUnavailable`，
  `notifiedRoomRef` 一次性守卫、`roomsRequestRef` 丢弃过期响应）。守卫与"只应用一次"两个细节都写对了。
- **`ResearchWorkspace` 工作区加载用 Skeleton（`:600`）、失败用 `Empty("快照不可用")` + `Alert` 重试（`:587,883`）**
  ：这是"加载/空/失败"三态齐全的**正例**，可直接作为其它页面的模板。
- **决策收件箱用 `Card loading`（`Dashboard.tsx:26`）**：在途与空态天然可区分。
- **备份恢复指引口径中性**：`docs/QUICKSTART.md:171-178` 不诱导用户赌 `.partial` 文件的完整性，并明确
  "按结尾判断而不是按时间"。

## 未验证项

- `Chat.tsx` 的 `?session=` 一次性守卫、`?prompt=` 是否只应用一次、左栏三态是否完整（本轮未读该文件；
  第 1 条改动面的遗留疑问依赖它）。
- `App.tsx:363+` 的 `AuthGate` 与 `docs/QUICKSTART.md:129-133` 所述"正在连接本机服务…/重试连接"文案是否一致（未读）。
- 后端 VS-20/VS-21/VS-23：`agent_results.status` 实时与回放同源、`done_payload` 透传、单次预算 180s 与整轮
  deadline 600s 的"三通道一致性"（返回值/事件/SSE 正文与 `done`）与 SSE 截断时的落库内容——本轮未读后端代码。
- 备份的**硬中断**与**同秒并发**实测（`.partial` 清理、伴生件累积）——未实测（本轮不跑测试）。
- i18n 文案实际取值（如 `nav.research.home` 是否等于 QUICKSTART 所说的"研究工作区"、`discussion.loading` 的中文）。
- `selectMode` 未剥离 `prompt` 是否会在模式间重复应用（依赖 `Chat.tsx`）。
- 本轮**未运行任何测试或构建**（遵守预算与环境纪律）。
