# IMPLEMENT RESULT — VS11：消除本地模式的"不可完成登录页"死胡同

> 实现者：IMPLEMENTER（DeepSeek Harness subagent）｜日期：2026-09-13｜依据：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS11.md`
> 状态：**已完成**，全部门禁通过。未 commit（工作区改动）。

## 1. 结论

`/auth/me` 的失败原因现在**有区分**：401/403 仍是"确实需要登录"→ 跳 `/login`（既有行为零回退）；
网络错误 / 超时 / 5xx（含无 `status`）→ 首次 + 2 次自动重试（间隔 1s）后进入新状态 `unavailable`，
`AuthGate` 渲染"**正在连接本机服务…**" + 重试按钮，**不再跳 `/login`**，本地模式的死胡同被消除。
全程未改后端、未加依赖、未删文件。

## 2. 改动清单（文件:行）

| 文件 | 行 | 改动 |
| --- | --- | --- |
| `frontend/src/services/api.ts` | 18-24 | 新增 `export interface ApiFailure extends Error { status?: number }` + `readStatus()` 类型守卫 |
| `frontend/src/services/api.ts` | 31-37 | 拦截器读取 status；**401 仍照常 `dispatchEvent('finquant:unauthorized')`**；`message` 表达式**原样保留**（`error.response?.data?.detail \|\| error.message \|\| '请求失败'`）；仅在 status 有值时附加到拒绝的 Error |
| `frontend/src/store/authStore.ts` | 9 | `AuthStatus` 增加 `'unavailable'` |
| `frontend/src/store/authStore.ts` | 16-17, 111-115 | 新增 `retry()` action（`unavailable` 的手动重试入口，走同一 `initialization` 去重） |
| `frontend/src/store/authStore.ts` | 20-48 | 新增可注入的 `AuthRetryPolicy`（`maxAttempts: 3`、`delayMs: 1000`、可替换 `sleep`）+ `resetAuthRetryPolicy()` |
| `frontend/src/store/authStore.ts` | 52-54 | `isAuthRequired()`：仅 `401 / 403` 视为"需要登录" |
| `frontend/src/store/authStore.ts` | 60-91 | `loadSession()`：成功 → `authenticated`；401/403 → `anonymous`（立即返回，**不重试**）；其余（无 status / 5xx / 响应体异常）→ 重试，耗尽 → `unavailable` |
| `frontend/src/store/authStore.ts` | 93-116 | `startProbe()` 复用既有 `initialization` 单飞去重；`initialize()` 语义不变（仅 `idle` 触发） |
| `frontend/src/App.tsx` | 363-371 | `AuthGate` 改为 `export`（供测试直接挂载），接入 `useLanguage()` 与 `retry` |
| `frontend/src/App.tsx` | 390-399 | `status === 'unavailable'` → 渲染 `data-testid="auth-unavailable"` + "正在连接本机服务…" + 重试按钮；**位于 `!isAuthenticated → <Navigate to="/login">` 之前**（不跳登录页） |
| `frontend/src/App.tsx` | 372-381 | `finquant:unauthorized` 监听与清理逻辑**未做任何改动** |
| `frontend/src/pages/Login.tsx` | 20 | 接入 `retry` |
| `frontend/src/pages/Login.tsx` | 86-101 | 新增防御性兜底 `Alert`（本机双击启动通常无需登录 + `data-testid="login-retry-connection"` 重试按钮） |
| `frontend/src/i18n/zh.ts` / `en.ts` | 2356-2361（两侧同位置） | 新增 6 键 ×2 语言：`auth.unavailable.title/hint/retry`、`auth.localFallback.title/body/retry` |
| `docs/QUICKSTART.md` | 129-135 | 常见问题新增"**看到邮箱登录页（本机双击启动时不应出现）**" |
| `frontend/tests/AuthUnavailable.test.tsx` | 新建，17 用例 | 见 §4 |

改动统计：`7 files changed, 179 insertions(+), 34 deletions(-)` + 1 个新测试文件（`git diff --stat`）。

## 3. 验收标准逐条对照

| # | 标准 | 实测 |
| --- | --- | --- |
| 1 | 500 / 网络错误 → `unavailable` 且**不跳 `/login`**，出现连接提示 + 重试按钮 | ✅ 2 个 AuthGate 用例：`auth-unavailable` 出现，`location.pathname === '/'`，登录页占位**未**渲染 |
| 2 | 401 → `anonymous` 且**仍跳 `/login`** | ✅ 用例「401 → anonymous，且不重试」+「401 → 仍跳转 /login」 |
| 3 | 先失败后成功 → 自动重试进入 `authenticated` | ✅ 用例「先失败后成功 → 自动重试进入 authenticated」，`getCurrentUser` 调用 2 次、sleep 1 次 |
| 4 | 连续失败 3 次 → `unavailable` 且不跳 `/login`；点重试会再次初始化 | ✅ 用例「500 → 重试 3 次后 unavailable」+「点重试按钮会再次初始化，成功后进入受保护内容」（总调用 4 次） |
| 5 | 拒绝的 Error 带 `status`，`message` 与改动前一致 | ✅ 3 个 api.ts 用例（500/401/网络错误），message 分别取 detail / detail / axios 原文 |
| 6 | 测试覆盖 1-5；`bun run build`（含 `tsc -b`）通过；既有测试零回归 | ✅ 17/17 通过；build 成功；`Auth.test.tsx`、`AppNavigation.test.tsx`、`I18n.test.tsx`、`LangSwitcher.test.tsx`、`CorePrimitiveI18n.test.tsx` 全绿 |

**重试次数定义**：`maxAttempts = 3` 表示**总尝试次数**（1 次初始探测 + 2 次自动重试），对应标准 4 的"连续失败 3 次"；两次等待各 1000ms。该口径与"建议 3 次、间隔 1s"的差异已记录在 §6。

## 4. 实测原始输出

### 4.1 门禁 A — vitest（逐条）

```
cd frontend
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe x vitest run tests/AuthUnavailable.test.tsx --reporter=verbose
```

```
 RUN  v4.1.10 E:/Code_file/Projects/finquant-hub/frontend

 ✓ tests/AuthUnavailable.test.tsx > api.ts 保留 HTTP 状态 > 5xx：失败对象带 status=500，message 取后端 detail 9ms
 ✓ tests/AuthUnavailable.test.tsx > api.ts 保留 HTTP 状态 > 401：带 status=401 且仍派发 finquant:unauthorized 2ms
 ✓ tests/AuthUnavailable.test.tsx > api.ts 保留 HTTP 状态 > 网络错误：没有 status，message 保持 axios 原文 1ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 401 → anonymous，且不重试 2ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 403 → anonymous（同样视为确实需要登录） 0ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 500 → 重试 3 次后 unavailable（注入 sleep，不真实等待） 1ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 网络错误（无 status）→ 同样 unavailable，不被当作未认证 1ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 200 但响应体异常 → 不得当作已登录，归入 unavailable 0ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 先失败后成功 → 自动重试进入 authenticated（无需手动操作） 1ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > 本地模式正常路径零回归：/auth/me 成功 → authenticated 且不重试 0ms
 ✓ tests/AuthUnavailable.test.tsx > authStore 失败分类与有限重试 > unavailable 后点重试会再次发起初始化，成功则进入 authenticated 0ms
 ✓ tests/AuthUnavailable.test.tsx > AuthGate 区分 unavailable 与 anonymous > 5xx → 渲染「正在连接本机服务」+ 重试按钮，不发生跳转 /login 673ms
 ✓ tests/AuthUnavailable.test.tsx > AuthGate 区分 unavailable 与 anonymous > 网络错误 → 同样停留在原路由（不跳 /login） 56ms
 ✓ tests/AuthUnavailable.test.tsx > AuthGate 区分 unavailable 与 anonymous > 点重试按钮会再次初始化，成功后进入受保护内容 96ms
 ✓ tests/AuthUnavailable.test.tsx > AuthGate 区分 unavailable 与 anonymous > 401 → 仍跳转 /login（既有登录流程不回退） 36ms
 ✓ tests/AuthUnavailable.test.tsx > Login 兜底说明 > 给出本机模式说明，点重试连接可重新初始化并进入应用 306ms
 ✓ tests/AuthUnavailable.test.tsx > i18n parity > zh/en 键集合一致，且 VS11 新键双语齐备 5ms

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Duration  14.62s (transform 585ms, setup 338ms, import 11.24s, tests 1.19s, environment 1.57s)
```

### 4.2 三种情形的状态 / 跳转断言（测试内断言原文）

401（确实需要登录 → 保持既有行为）：

```
expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false, status: 'anonymous' });
expect(mocks.currentUser).toHaveBeenCalledTimes(1);   // 不重试
expect(sleepSpy).not.toHaveBeenCalled();
... AuthGate: expect(await screen.findByText('登录页占位')).toBeTruthy();
              expect(screen.queryByTestId('auth-unavailable')).toBeNull();
              await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/login'));
```

500（服务未就绪 → 重试后 unavailable，不跳转）：

```
expect(state.status).toBe('unavailable');
expect(mocks.currentUser).toHaveBeenCalledTimes(3);   // 3 次尝试
expect(sleepSpy).toHaveBeenCalledTimes(2);
expect(sleepSpy).toHaveBeenCalledWith(1000);
... AuthGate: expect(await screen.findByTestId('auth-unavailable')).toBeTruthy();
              expect(screen.getByText('正在连接本机服务…')).toBeTruthy();
              expect(screen.getByRole('button', { name: '重试连接' })).toBeTruthy();
              expect(screen.queryByText('登录页占位')).toBeNull();
              expect(screen.getByTestId('location').textContent).toBe('/');
```

网络错误（无 status → 与 500 同路径）：

```
expect(useAuthStore.getState().status).toBe('unavailable');
expect(mocks.currentUser).toHaveBeenCalledTimes(3);
```

**未使用真实 1s 等待**：`beforeEach` 中 `authRetryPolicy.sleep = sleepSpy`（`vi.fn(async () => undefined)`），
仅断言 sleep 的入参为 1000；整个用例文件耗时 1.19s（含 4 个 jsdom 渲染用例）。

### 4.3 门禁 B — `bun run build`（含 `tsc -b`）

```
cd frontend && bun run build
```

```
dist/assets/Login-DAgudvVz.js                     3.16 kB │ gzip:   1.36 kB
dist/assets/index-DR45_vma.js                   397.36 kB │ gzip: 123.70 kB
dist/assets/vendor-antd-BPmhL3C_.js           1,566.95 kB │ gzip: 491.20 kB

(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 34.03s
```

无 TS 报错（`tsc -b` 在 vite build 之前执行，命令链 `build` = `tsc -b && vite build`）。
注意：build 会重建 `frontend/dist`（未 commit）；本次产物已含修复，`start.bat` 复用产物时行为一致。

### 4.4 回归批（既有测试）

```
bun x vitest run tests/AppNavigation.test.tsx tests/I18n.test.tsx tests/LangSwitcher.test.tsx \
                  tests/CorePrimitiveI18n.test.tsx tests/Auth.test.tsx tests/AuthUnavailable.test.tsx
```

```
 Test Files  6 passed (6)
      Tests  30 passed (30)
   Duration  59.76s
```

（其中 `tests/Auth.test.tsx` 4/4 —— 既有登录流程、本地模式恢复会话、双语登录页全部未回归。）

## 5. 未解决问题 / 已知约束

1. **无真实浏览器端到端验证**：未启动后端 + 浏览器做人工复现（本卡门禁只要求单测 + build）。
   若要端到端确认，可停掉后端后打开 <http://127.0.0.1:8000>，应看到"正在连接本机服务…"而非登录页。
2. **重试口径**：`maxAttempts = 3` 被解释为**总尝试次数**（初探 1 + 重试 2），而非"1 次初探 + 3 次重试"。
   依据是验收标准 4 的"连续失败 3 次"。若评审要求 3 次**重试**，只需把 `authRetryPolicy.maxAttempts` 改为 4，
   测试中对应的次数断言同步 +1（改动面 2 行）。
3. **非 401/403 的 4xx**（如 `/auth/me` 404/400）被归入 `unavailable` 而非 `anonymous`。这是刻意选择：
   4xx 也意味着前后端不匹配/接口缺失，跳登录页同样是死胡同。若评审认为 404 应视为未认证，需在此处加白名单。
4. **`200 但响应体异常`**（`{user: undefined}`）原先会被当成已登录（`user: undefined`），现改为重试后 `unavailable`；
   这是 brief"错误场景"第 2 条要求的方向（不得跳登录页），但**语义有微调**，需要评审确认。
5. **`AuthGate` 新增 `export`**：唯一为可测性做的非任务卡明示改动；`AppNavigation.test.tsx` 已有 `import from '../src/App'`
   的先例，无副作用。

## 6. 风险

- **低**：`api.ts` 仅在拒绝的 Error 上追加 `status`，`message` 与类型（`Error`）均不变，既有 `.message` 调用方零影响。
- **低**：`initialize()` 的既有"仅 `idle` 触发"与 `initialization` 单飞去重被保留，新增 `retry()` 也走同一去重，
  不会出现并发重试风暴（brief 错误场景第 3 条）。
- **低**：`Login.tsx` 只新增提示块与重试按钮，登录两步流程、倒计时、跳转逻辑未动。
- **中**：`unavailable` 是**新增状态值**。已核对全部消费点只有 `App.tsx`（AuthGate）与 `Login.tsx`（仅在
  `idle/loading/authenticated/anonymous` 上分支），二者均已处理 `unavailable`；无其它 `switch`/枚举穷尽处。
- **注意（流程）**：本次**未 commit**，改动全部留在工作区；`frontend/dist` 已被 build 覆盖（属门禁产物）。

## 7. 证据与复现命令

```bat
:: 门禁 A（单独跑，不要与 build 并行）
cd frontend
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe x vitest run tests/AuthUnavailable.test.tsx --reporter=verbose

:: 回归批
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe x vitest run tests/Auth.test.tsx tests/AppNavigation.test.tsx tests/I18n.test.tsx

:: 门禁 B
D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe run build
```

关键代码证据（供 Evaluator 复核）：

- `frontend/src/services/api.ts:31-38` — status 分类入口 + `message` 不变 + 401 事件保留
- `frontend/src/store/authStore.ts:71-91` — 重试循环与 `unavailable` 落点
- `frontend/src/store/authStore.ts:80-83` — 401/403 立即 `anonymous`（不重试）
- `frontend/src/App.tsx:390-399` — `unavailable` 分支位于 `Navigate to="/login"` 之前
- `frontend/src/App.tsx:372-381` — `finquant:unauthorized` 监听/清理**逐字未改**
- `frontend/src/pages/Login.tsx:86-101` — 兜底说明 + 重试入口

原始输出留存：`%TEMP%\vs11-vitest.txt`、`%TEMP%\vs11-vitest-verbose.txt`（本次会话临时文件，收尾已送回收站）。
