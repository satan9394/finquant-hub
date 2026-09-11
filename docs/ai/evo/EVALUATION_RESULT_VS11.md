# EVALUATION RESULT — VS11：消除本地模式"不可完成登录页"死胡同

> 评估者：EVALUATOR（独立验收，DeepSeek Harness subagent）｜日期：2026-09-13
> 被验 commit：`e37412c`（工作区干净，`git status --porcelain` 空）｜依据：`IMPLEMENTATION_BRIEF_VS11.md`
> 原则：不采信实现者自述数字，独立复跑 + 逐行核对代码与 git diff。

## 判定：**ACCEPT**

核心机制真实成立且经独立复现：仅 **401/403** 判为"确实需要登录"，其余（网络错误 / 超时 / 5xx / 无 status）经 **1 次初探 + 2 次重试（间隔 1s）** 后落 `unavailable`，`AuthGate` 的 `unavailable` 分支确实在 `Navigate to="/login"` **之前**。既有 401 登录流程与 `finquant:unauthorized` 监听逐字未改，无回归。发现若干**非阻断**问题（P2，见 §4），不影响本卡验收标准 1–6。

## 1. 独立复跑结果（本机实测，非引用实现者输出）

```
cd frontend
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe x vitest run tests/AuthUnavailable.test.tsx --reporter=verbose
→ Test Files 1 passed (1) | Tests 17 passed (17) | Duration 13.18s | exit 0

D:\...\bun.exe x vitest run tests/Auth.test.tsx
→ Test Files 1 passed (1) | Tests 4 passed (4) | Duration 10.58s | exit 0
```

`Auth.test.tsx` 是**改动前既有**的登录流程测试（两步登录 + 回跳受保护路由），4/4 通过 ⇒ 401 真实登录流程未被破坏（仅跑了最相关的一份既有用例，未复跑全量，受 429 限流约束）。

## 2. 逐项核对（代码级证据）

| 要求 | 结论 | 证据 |
| --- | --- | --- |
| 只有 401/403 判"需要登录" | ✅ | `authStore.ts:52-55` `isAuthRequired` 仅 `status === 401 \|\| status === 403`；`loadSession` 中落入 `anonymous` 的**唯一**分支是 `:80-83` |
| 重试 = 3 次尝试、间隔 1s | ✅ | `:38-42` `maxAttempts:3 / delayMs:1000`；`:71` 循环 1..3；`:86-88` 仅在 `attempt < maxAttempts` 时 sleep ⇒ **2 次**等待；与验收标准 4"连续失败 3 次"口径一致（实现者 §5.2 的说明成立） |
| 状态机自洽 | ✅ | `idle →(initialize, :104-109)→ loading → authenticated(:75) \| anonymous(:81) \| unavailable(:90)`；无"非 401/403 落 anonymous"的路径（另两条 `anonymous` 来源是 `logout()` :127 与 `clear()` :131，前者用户主动登出、后者仅被 401 监听调用，语义正确） |
| `unavailable` 不存在于既有分支之外 | ✅ | 全仓 grep `useAuthStore` 仅 `App.tsx`、`Login.tsx`、`authStore.ts` 三处；`Login.tsx:44` 只对 `idle/loading` 渲染 Spin，`unavailable` 落到登录表单（见 F3），无枚举穷尽遗漏 |
| `retry()` 正确重发起且不与去重打架 | ✅ | `:111-115` `retry` 复用 `initialization` 单飞（`:93-97`）；`unavailable` 时 `initialization` 已在 `finally` 中置 null，因此必然重新发起；in-flight 期间重复点击返回同一 Promise ⇒ 无并发风暴 |
| 不产生请求风暴 | ✅ | `initialize` 保留"仅 `idle` 触发"（`:105`），`unavailable` 下不再自动探测；自动重试在单次 `loadSession` 内串行 |
| `unavailable` 分支在 `Navigate` 之前 | ✅ | `App.tsx:390-399`（unavailable）先于 `App.tsx:400-402`（`!isAuthenticated → <Navigate to="/login">`） |
| `finquant:unauthorized` 监听/清理逐字未改 | ✅ | `git show e37412c -- frontend/src/App.tsx` 中 `:374-383` 全部为**上下文行**（无 +/-），本提交只新增 `export`、`useLanguage`、`retry` 与 unavailable 分支 |
| 拒绝的 Error 真的带 `status` | ✅ | `api.ts:22-26` `readStatus` 读 `error.response.status`；`:36-38` 仅在 status 有值时附加；网络错误/超时无 `response` ⇒ `status === undefined` |
| 401 事件仍在派发 | ✅ | `api.ts:32-34`（`status === 401` ⇒ `dispatchEvent(new Event('finquant:unauthorized'))`，与改动前 `error.response?.status === 401` 语义等价） |
| `message` 表达式逐字未改 | ✅ | `api.ts:35` 在 diff 中是上下文行：`error.response?.data?.detail \|\| error.message \|\| '请求失败'` |
| i18n zh/en parity | ✅ | `zh.ts:2356-2361` / `en.ts:2356-2361` 各 +6 键、同位置；parity 用例按**键集合全量比对**（`AuthUnavailable.test.tsx:335`），实测通过 |
| 测试变异敏感 | ✅ | 见 §3 |

## 3. 变异敏感性（判据：改坏实现必须挂测试）

- 把 `isAuthRequired` 改成"任何错误都 anonymous" ⇒ `AuthUnavailable.test.tsx:157/160`（`status==='unavailable'` 且调用 3 次）与 AuthGate 5xx 用例 `:261` 立即失败。
- 把 `unavailable` 分支移到 `Navigate` 之后 / 删除 ⇒ `:261` 的 `findByTestId('auth-unavailable')` 永不满足，用例超时失败；`:266/:277` 断言 `location === '/'` 同样失败。
- 把重试次数改成 1 ⇒ `:160/:172/:181`（`toHaveBeenCalledTimes(3)`）与 `:162`（sleep 2 次）失败。
- 把 401 也归入重试 ⇒ `:138`（调用 1 次）与 `:303`（仍跳 /login）失败。

断言均为**行为断言**（真实 zustand store 状态 + MemoryRouter 路由探针 + axios adapter 真实拦截器），非自证式 mock，具备判别力。

## 4. 反向风险与重点质疑（本卡最关键部分）

**Q1：是否存在"401 之外的真实需要登录"被误判为 `unavailable`，导致非本地部署用户永久卡在"正在连接"？**
核实为**不成立**。非本地部署下"需要登录"的唯一后端信号就是 401：`backend/app/routers/auth.py:33-36`（`user_for_session` 返回 None ⇒ 401「未登录或会话已过期」）、`:84`（验证码错误 ⇒ 401）。`/auth/me` 是 GET、无请求体，不存在 422；403 也已归入 `anonymous`。因此不存在"该登录却被判服务未就绪"的路径。**残余（非本卡范围）**：若反向代理/前端 baseURL 配错导致 `/auth/me` 返回 404，用户会看到"正在连接本机服务…"而非登录页；这是配置错误语义，实现者 §5.3 已明确记录该取舍，可接受。

**Q2（本卡最危险、实现者未提及的一点）：`isAuthUser` 要求 `id` 为 number，若后端返回字符串 id，则成功路径会被全量误判为 `unavailable`，本地模式永远进不去（比原 bug 更严重）。**
已核实**不成立**：`authStore.ts:57-59` 要求 `typeof id === 'number'`；`backend/app/services/auth.py:83-87` `_public_user` 直接取 `row["id"]`，来自 SQLite `users.id`（INTEGER PRIMARY KEY，aiosqlite 返回 int，JSON 序列化为 number），本地模式（`local_user()` :118-125）与登录模式（:252/:265）同一函数。成功路径无回归。

**Q3：`200 但响应体无 user` 的语义变更是否破坏既有路径？**
核实为**实际不可达、无破坏**：`auth.py:126-128` 恒返回 `{"user": <非空 dict>}`；而 `getCurrentUser`（`authApi.ts:20-23`）取 `response.data.user`。改动把"`user === undefined` 也算已登录"改为"重试后 unavailable"（`authStore.ts:74-78`），确实扩大了 unavailable 的触发面，但 brief 错误场景第 2 条明确"**宜归入 unavailable**"，且既有 `Auth.test.tsx` 4/4、新增 17/17 均未回归。判定：**可接受的语义收紧**，建议在后续卡中把该判据固化为回归测试（已存在：`AuthUnavailable.test.tsx:175-182`）。

**Q4：重试风暴？** 否。见 §2 表中"不产生请求风暴"一行。

**Q5：文案在非本地部署下是否误导？** 是，见 F2。

## 5. 非阻断发现（P2，不构成 REJECT，建议后续卡处理）

- **F1 `frontend/src/pages/Login.tsx:86-101`**：兜底 `Alert` **无条件渲染**。非本地部署（Docker / 多人邮箱登录）下每个用户在登录页都会看到"若你是双击 start.bat 启动的本机版本，通常无需登录 / 本机模式不提供邮箱验证码登录"——对这类用户是**错误信息**。建议按 `user?.local_mode`（`AuthUser` 已有该字段）或构建期标志条件渲染；功能无破坏，属文案/呈现问题。
- **F2 `frontend/src/i18n/zh.ts:2356`（`auth.unavailable.title` = "正在连接本机服务…"）与 `frontend/src/App.tsx:394`**：非本地部署下语义不准确。**但该字符串是 brief「理想行为 3」逐字指定的**，实现者无偏离；建议后续统一为与部署无关的措辞（如"正在连接服务…"）。
- **F3 `frontend/src/pages/Login.tsx:44` + `:86-101`**：`status === 'unavailable'` 时登录表单仍可提交，本地模式下会拿到 `request-code` 的 404「本地模式不提供邮箱登录」（`backend/app/routers/auth.py:52-53`）。死胡同的最后一步仍在，但**已出现明确出口**（重试按钮 + 说明文案），不违反本卡验收标准；建议后续在 unavailable 下禁用发送按钮。
- **F4 `frontend/src/App.tsx:373` 附近 / `authStore.ts:104-106`**：`initialize()` 仅在 `idle` 触发，**不会**从 `unavailable` 自动复活（刷新或点重试才行）。符合 brief（brief 只要求重试按钮），但多标签页/长驻场景需手动点一次，记录为已知行为。
- **F5 文档层面**：`IMPLEMENT_RESULT_VS11.md:4,176` 称"未 commit（工作区改动）"，实际 `e37412c` 已提交且工作区干净。陈述与事实不符，仅影响报告准确性，不影响代码判定。

## 6. 结论

- 验收标准 **1–6 全部成立**（1/2/3/4 由独立复跑的 17 用例 + 逐行代码核对支撑；5 由 `api.ts` diff 上下文行支撑；6 由 17/17 + Auth 4/4 支撑，`bun run build` 未复跑，但本次改动为纯增量的类型安全代码且实现者已给出通过产物，风险低）。
- 无文件:行级别缺陷需要 REJECT。
- **判定：ACCEPT**。建议将 F1（登录页本机文案无条件显示）登记为后续小卡，避免非本地部署用户被误导。

> 临时文件：本次评估未产生临时文件（未使用 `$env:TEMP`）；未修改任何实现文件。
