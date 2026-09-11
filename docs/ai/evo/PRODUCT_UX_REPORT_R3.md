# PRODUCT_UX_REPORT（第三轮）

> SUBAGENT A3 · PRODUCT_UX_AUDITOR · 只读审计（未改任何代码、未 commit）
> 审计问题：「完全不了解这个项目的人，能否自己完成第一次成功使用？」以及「经过近期演进后，当前最大的 UX 缺口是什么」
> 阅读范围（8 个文件，证据均来自实际读取）：`docs/ai/evo/PROJECT_BRIEF.md`、`docs/QUICKSTART.md`、`start.bat`、`frontend/src/App.tsx`、`frontend/src/store/authStore.ts`、`frontend/src/pages/Dashboard.tsx`、`frontend/src/pages/Login.tsx`、`backend/app/routers/auth.py`（前 60 行）。未做运行时验证（沙箱内不启动服务、不跑 E2E）。

## 结论：当前最大 UX 缺口（1-3 条）

**1（最大）本地模式存在"不可完成的登录页"死胡同 —— 首用路径上唯一的单点失败。**
`start.bat:117` 强制 `LOCAL_ONLY_MODE=1`，前端 `AuthGate` 却把"未认证"直接导向邮箱登录页（`frontend/src/App.tsx:386-388`）。而本地模式下邮箱登录接口本身就是关闭的：`backend/app/routers/auth.py:52-53` 对 `/api/auth/request-code` 直接返回 404「本地模式不提供邮箱登录」。也就是说，只要 `/auth/me` 这一次请求因为任何原因失败（后端尚未就绪、瞬时 5xx、网络/代理异常、Cookie 干扰），`authStore` 会把状态置为 `anonymous`（`frontend/src/store/authStore.ts:32-35`，`.catch` 不区分错误类型），用户就会看到一个**在本机模式下永远无法通过**的邮箱验证码界面（`frontend/src/pages/Login.tsx:76-105`）。对一个非技术用户，"填邮箱 → 点发送 → 报错 → 不知道怎么办"是典型的流失点，且这一条恰好与 QUICKSTART 主推的"不需要邮箱登录"（`docs/QUICKSTART.md:50`）直接冲突。QUICKSTART 的 FAQ 里**没有**任何"看到登录页怎么办"的条目（`docs/QUICKSTART.md:92-127` 全部 FAQ 分类均无此项）。

**2（次大）"发行包不需要 Bun"这一承诺，靠文件时间戳启发式判定，最坏情况把最守规矩的用户挡在门外。**
文档承诺"已附带 `frontend/dist` 且未过期时，启动**不需要 Bun**"（`docs/QUICKSTART.md:11`、`docs/QUICKSTART.md:125`），但脚本的"未过期"判定只有一条：`package.json` 的修改时间是否晚于 `dist/index.html`（`start.bat:56-63`）。一旦判定为"需重建"而机器上没有 Bun，脚本走到 `:bun_missing` 并**直接退出**（`start.bat:69`、`start.bat:162-166`）。ZIP 解压、文件系统时间戳、以及"dist 是否晚于 package.json 打包"这三者都不在用户的控制范围内，用户却会因此失去"双击即用"，被要求先去装一个他从未听说过的工具（Bun）——这正是 QUICKSTART 想避免的路径。**该判定在真实发行包上的实际结果本轮未验证**（见"未验证项"），但失败分支的存在与文档承诺之间的落差是确定的事实。

**3（第三）首页的"最近会话 / 最近讨论"入口丢失对象上下文，点击后并不打开那条记录。**
Dashboard 的两张卡片渲染的是具体记录（`frontend/src/pages/Dashboard.tsx:97-107`、`112-123`），但列表项链接与"查看全部"按钮都是硬编码的 `/chat`、`/discussion`（`Dashboard.tsx:94`、`100`、`109`、`115`、`125`），而这两个路径在 App 里只是 `LegacyResearchRedirect`，分别跳转到 `/research?mode=fast` 与 `/research?mode=review`（`frontend/src/App.tsx:323-324`），**不带任何会话/讨论 id**。用户点了"上周那篇 600519 的讨论"，落到的却是一个空白的通用工作区。这是"看得见、点进去找不到"的信任损耗，而且首页是这个应用的第一印象。

## 发现的问题

### P1-1 本地模式下 `/auth/me` 单次失败 → 导向无法完成的邮箱登录页
- **问题**：`AuthGate` 把任何"未认证"结果一律视作"需要登录"，不区分「本地单用户模式」与「需要邮箱登录」。
- **证据**：
  - `start.bat:117`（`set "LOCAL_ONLY_MODE=1"`）、`start.bat:116`（`SERVE_FRONTEND=1`，单进程同源）
  - `frontend/src/App.tsx:383-388`：`status === 'idle' || 'loading'` 显示 Spin，否则 `!isAuthenticated` → `<Navigate to="/login" />`
  - `frontend/src/store/authStore.ts:32-35`：`getCurrentUser().then(...).catch(() => set({ ..., isAuthenticated: false, status: 'anonymous' }))`——错误原因被吞掉，无重试
  - `backend/app/routers/auth.py:31-32`：本地模式 `get_current_user` 直接返回本地用户（正常路径没问题）
  - `backend/app/routers/auth.py:52-53`：本地模式 `/api/auth/request-code` → 404「本地模式不提供邮箱登录」（失败路径是硬死胡同）
  - `frontend/src/pages/Login.tsx:47-60`、`76-105`：登录页只有"邮箱 + 发送验证码"一条路，没有"返回/重试/本地模式"出口
  - `docs/QUICKSTART.md:50`（"此入口使用本机单人模式，不需要邮箱登录"）与 `docs/QUICKSTART.md:92-127`（FAQ 无"登录页"条目）
- **用户影响**：非技术用户被要求输入邮箱、点"发送验证码"，收到一条后端 404 文案；多数人会认为"是不是要先注册"，随后放弃。这是首用闭环上唯一会**完全卡死**的点（刷新通常能恢复，但用户不知道要刷新，且 UI 未提示）。
- **建议**（不改架构，只改前端分支）：
  1. `AuthGate` 增加"本地模式"分支：当后端声明本地单用户（例如 `/api/health` 或 `/auth/me` 返回的 `local_mode`，`App.tsx:264` 已在用 `user?.local_mode`）时，认证失败**不跳登录页**，而是显示"正在连接本机服务 + 重试按钮"。
  2. `authStore.initialize` 对 `/auth/me` 失败做有限次自动重试（如 3 次、间隔 1s），并把最后一次错误保留在 store 供 UI 展示；仅当确认是"需要登录"（非本地模式）时才转 `anonymous`。
  3. `Login.tsx` 增加本地模式下的兜底说明与"重试连接"按钮；`docs/QUICKSTART.md` FAQ 增加一条"看到邮箱登录页"。
- **优先级**：**P1**

### P1-2 "不需要 Bun" 的判定过于脆弱，且失败即退出
- **问题**：发行包"免 Bun"体验取决于时间戳启发式，非用户可控；判定失败时脚本直接结束并要求用户安装 Bun。
- **证据**：
  - `start.bat:57`：`if not exist "frontend\dist\index.html" goto build_frontend`
  - `start.bat:58`：仅比较 `frontend/package.json` 与 `frontend/dist/index.html` 的 `LastWriteTimeUtc`
  - `start.bat:56` 的注释自认："只按 package.json 与 index.html 的时间判断过期；源码更新后需手动重建"
  - `start.bat:69`：`if defined FQ_BUN_MISSING goto bun_missing` → `start.bat:162-166` 打印错误后进入 `:fail`（`pause` + `exit /b 1`）
  - `docs/QUICKSTART.md:11`、`docs/QUICKSTART.md:125`：承诺"产物存在且不比 package.json 旧时，全程不需要 Bun"
  - `docs/QUICKSTART.md:157`：承认"`start.bat` 只在 `frontend/dist/index.html` 缺失，或 `frontend/package.json` 更新时自动构建，不会逐个检测源码变化"
- **用户影响**：最理想的一类用户（下载 ZIP → 双击 → 期望浏览器打开）可能被要求去装 Bun，或在"我明明什么都没改"的情况下看到构建/失败信息；反之，改了源码的用户会以为已重建（"复用已有 frontend\dist"，`start.bat:64`），看到旧界面而不知原因（`docs/QUICKSTART.md:129-133` 也承认"仅刷新浏览器无法替代重建"）。
- **建议**：
  1. 发行包内放一个构建指纹（如 `frontend/dist/build-info.json`，含构建时 `package.json` 版本与 commit/时间），脚本比对指纹而非文件时间；缺失时才回退到时间戳比较。
  2. 判定为"需构建但无 Bun"时，**不要直接退出**：若 `frontend/dist/index.html` 存在（哪怕判定过期），给出"以现有页面启动"的默认选择（例如 10 秒倒计时后继续启动），把"必须先装 Bun"降级为可选路径。
  3. 启动成功窗口显式打印一行"本次使用页面产物的构建时间"，让用户能自查是否看到旧界面。
- **优先级**：**P1**

### P2-1 首页"最近会话/讨论"点击后不打开所指记录
- **问题**：卡片内容与跳转目标不匹配，具体记录没有可点进去的详情入口。
- **证据**：
  - `frontend/src/pages/Dashboard.tsx:100`：`<Link to="/chat" ...>`（列表项内部也用固定路径，未携带 `item.id`）
  - `frontend/src/pages/Dashboard.tsx:94`、`109`：两处"查看全部"分别 `navigate('/chat')`、`navigate('/discussion')`
  - `frontend/src/pages/Dashboard.tsx:115`：讨论项同样固定 `to="/discussion"`
  - `frontend/src/App.tsx:323-324`：`/chat`、`/discussion` 均为 `<LegacyResearchRedirect mode="fast"|"review" />`
  - `frontend/src/App.tsx:150-155`：重定向只把 `mode` 塞进 query，不传 id
- **用户影响**：用户带着"我要看我上次那条"的意图点击，得到的是一个通用研究工作区；若他确实有历史记录，会怀疑"我的记录是不是丢了"（而这恰恰触碰了本地工具最敏感的数据信任问题）。
- **建议**：短期把"查看全部"指向真正的历史列表路由（研究报告/讨论列表，若已存在请复用；未验证是否存在独立列表页），或在 `/research?mode=...` 上补一个 `?conversation=`/`?room=` 参数并由 ResearchWorkspace 恢复上下文；若短期做不到，把卡片文案从"最近会话"改成不带"可打开"暗示的表述。
- **优先级**：**P2**

### P2-2 硬编码的"维护者电脑备用路径"出现在对外发行脚本里
- **问题**：发行脚本包含一个只对项目作者机器有效的绝对路径，且被文档专门解释。
- **证据**：
  - `start.bat:18`：`if not defined FQ_BUN if exist "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" set "FQ_BUN=..."`
  - `docs/QUICKSTART.md:123`：不得不写"脚本先找 PATH，再尝试维护者电脑的备用路径；其他电脑不需要创建这个备用目录"
- **用户影响**：不致命，但这是一处"内部开发痕迹泄漏到用户面"的信号，会让用户对发行包质量产生疑虑（"这是给我用的还是给他自己用的？"），也让文档多出一段本不该存在的解释。
- **建议**：改为可配置的 `BUN_PATH`（读取环境变量/同名 `.env`），或在发行版中移除并只保留 PATH 探测；QUICKSTART 相应删掉那句解释。
- **优先级**：**P3**

### P3-1 安装 Bun 的官方地址在两处不一致
- **问题**：同一步操作给出两个不同域名。
- **证据**：`docs/QUICKSTART.md:16`（`https://bun.com/docs/installation`）vs `start.bat:164`（`https://bun.sh`）
- **用户影响**：轻微，但用户照 start.bat 的提示访问会落到不同站点（`bun.sh` 的安装脚本与文档站不同），增加"我是不是装错了"的疑虑。
- **建议**：统一为一个权威地址，最好与 `bun install` 的官方推荐一致。
- **优先级**：**P4**

### P3-2 端口占用/后端启动失败的处理指引以"重启电脑"为主，缺少更轻的下一步
- **问题**：`start.bat` 的首要建议是先重启电脑，对非技术用户成本高且无必要。
- **证据**：`start.bat:28-31`（"1) 先看任务栏……2) 还不行就重启电脑"）、`start.bat:24`（"无法检查端口状态。请重启电脑后重试"）、`start.bat:126-127`（服务启动失败 → 关闭窗口重来/截图对照 FAQ）
- **用户影响**：用户可能因此放弃，或重启后仍失败却已无退路；`docs/QUICKSTART.md:96-105` 其实给了更好的 `netstat` 步骤，但脚本把用户推向了重启。
- **建议**：把"再双击一次"和"按 QUICKSTART 用 netstat 查看占用者"提为首要两步，把"重启电脑"降为最后兜底。
- **优先级**：**P3**

## 近期改动是否引入新问题（逐条判断）

对照 `docs/ai/evo/PROJECT_BRIEF.md:39-46` 的六项已交付改动：

1. **报告降级语义补全（源头并入 `quality`）** —— 本期未读取报告链路代码，**未验证**；未见前端受影响证据。
2. **启动备份改为 `Connection.backup()` 一致快照** —— 方向正确，`start.bat:95-106` 的注释把"为什么不能只复制 finquant.db"写清楚了，比旧行为（丢 WAL）明显更好，**未见新问题**。可见的一处小瑕疵：备份失败时的提示不区分原因，只写"可检查磁盘空间后重试"（`start.bat:108-110`），而实际失败路径还包括"`.venv` 缺失"（`start.bat:101` 显式 `goto backup_failed`）——此时提示"检查磁盘空间"是误导。**建议**：区分"Python 环境缺失"与"备份写盘失败"两条文案。**优先级 P3**（证据：`start.bat:100-110`）
3. **免工具链兜底可达（Bun 探测非致命）** —— 探测确实改成了非致命（`start.bat:13-19` 只记标记），这是进步；但"确实需要构建"的入口判定仍脆弱，见 **P1-2**。可判定为"**改进了，但把风险集中到了单一判定点上**"，属于新引入的集中式失败点。
4. **首启等端口就绪再开浏览器（≤90s 截止时间）** —— 设计合理（`start.bat:118-121` 按截止时间而非循环次数，注释说明了原因）。**新的边界问题**：90 秒超时后仍会 `Start-Process` 打开浏览器（`start.bat:121` 末句），此时用户会看到"无法连接"页，而窗口里只有一行"可手动访问"（`start.bat:114`），并未解释"刚才是因为超时"。**建议**：超时分支打印一行明确的"[提示] 服务启动较慢，先打开的是占位页，请稍后刷新"。**优先级 P3**（证据：`start.bat:114`、`start.bat:121`）
5. **AI 首用引导一致（主推站内「设置 → 模型管理」）** —— 文档侧确实一致（`docs/QUICKSTART.md:63-68`、`start.bat:91`），**未见矛盾**。可用性细节：QUICKSTART 说"设置 → 模型管理"，而侧栏中「设置」与「模型管理」是同级的两个菜单项（`frontend/src/App.tsx:114-118`），用户按字面找"设置里的模型管理"可能先进入 `/settings` 再找不到。**建议**：把文案改成"左侧「模型管理」"或确认 `/settings` 内有指向模型管理的入口。**未验证 `/settings` 页内容**，因此仅记为待确认。
6. **LLM 重试（429/5xx 退避、`Retry-After`、抖动）** —— 属后端可靠性，本期未读取 `llm_client` 代码，**未验证**；对 UX 的潜在影响是"重试期间界面是否有可见等待反馈"，本轮无证据，标为未验证。

**未被上述条目覆盖、但本轮新发现的问题**：P1-1（本地模式登录页死胡同）、P2-1（最近会话/讨论入口丢失上下文）、P2-2（硬编码维护者路径）、P3-1（Bun 地址不一致）。

## 值得保留的好体验

- **错误信息三段式（原因 / 怎么做 / 文档锚点）**：`start.bat:24`、`29-32`、`126-127`、`136-139`、`144-147`、`155-159`、`163-166` 几乎每个失败分支都给出"原因 + 分步做法 + QUICKSTART 锚点"，且**脚本不擅自杀进程、不换端口**（`start.bat:21`、`105`）。对非技术用户，这是很扎实的设计。
- **诚实的数据状态语义**：`UNKNOWN` / `PARTIAL` / `UPSTREAM_ERROR` 在 UI 与文档中都明确"不等于 0、不等于整体故障"（`docs/QUICKSTART.md:113-117`，`frontend/src/pages/Dashboard.tsx:32-35` 注释同样强调"诚实提示"）。金融类工具里这一点尤其珍贵。
- **能力引导不闪屏**：`Dashboard.tsx:84-85` 明确"stats 非 null 后才渲染能力引导，避免 null/加载态闪 banner"，这类细节体现了对首屏观感的克制。
- **本地化与主题一致性**：`App.tsx:438-458` 把 AntD 语义 token 与 `--fq-*` 设计变量对齐（含注释说明"此前两套主色并存"），侧栏宽度也回到 design token 权威（`App.tsx:302-304`）。
- **备份与恢复文档**：`docs/QUICKSTART.md:161-173` 把"完整快照、含 WAL、只需覆盖 finquant.db 一个文件、保留 7 份、失败不阻塞启动"讲清楚了，并诚实声明"备份不含密钥"。这是本地数据类产品最该有的一段。
- **发送验证码按钮的冷却与 6 位纯数字输入约束**（`Login.tsx:32-38`、`120`）——若未来启用邮箱登录，这部分交互已就绪。

## 未验证项

1. **P1-2 的时间戳判定在真实发行包上的实际结果**：本轮未解压任何发行 ZIP、未运行 `start.bat`（沙箱内不启动服务），因此"ZIP 解压后 `package.json` 是否比 `dist/index.html` 新"**未验证**。这是判断 P1-2 严重程度的关键事实，建议由能执行脚本的角色实测一次（记录是否出现"复用已有 frontend\dist"或进入 `:bun_missing`）。
2. **LOCAL_ONLY 下 `/auth/me` 前端实际调用路径**：`frontend/src/services/authApi.ts` 未在预算内读取，因此"`getCurrentUser()` 是否命中 `/api/auth/me`、失败是否可能来自其它端点"**未验证**。P1-1 的结论建立在"任何失败 → anonymous → /login"这一已读代码路径上，该路径本身是确定的。
3. **`/notes` `/settings` 页面内容**：`Settings.tsx`、`ResearchWorkspace.tsx` 未读，故"设置 → 模型管理"文案是否与页面结构一致、以及"研究报告历史列表页是否存在"（影响 P2-1 的修法）**未验证**。
4. **LLM 重试与报告降级在前端的可见反馈**：未读 `llm_client.py`、报告相关前端组件，**未验证**。
5. **i18n 英文界面下的首用体验**：`App.tsx:439` 存在 `enUS` 分支，但本项目目标用户为中文用户，英文路径**未验证**。
6. **Docker / macOS 路径的 LOCAL_ONLY 配置**：`docs/QUICKSTART.md:76-90` 描述的 Docker 路径是否同样设置 `LOCAL_ONLY_MODE`，未读取 `scripts/local.sh` 与 compose 文件，**未验证**（若未设置，邮箱登录页死胡同的暴露面更大）。
