# IMPLEMENTATION_BRIEF — Vertical Slice 11：消除本地模式的"不可完成登录页"死胡同

> Orchestrator 第五阶段产物，2026-09-13。来源：**R3 审计 A3 的 P1-1**（`PRODUCT_UX_REPORT_R3.md`），**编排者已核实三环证据链**。

## 目标
让"**判定不了认证状态**"与"**确实需要登录**"区分开：后端未就绪/瞬时故障时，用户看到的是**可重试的连接提示**，而不是一个在本机模式下**永远无法通过**的邮箱验证码页。

## 用户场景
非技术用户双击 `start.bat`，浏览器打开页面。此时后端可能**尚未完全就绪**（或遭遇瞬时 5xx / 网络抖动），`/auth/me` 这一次请求失败。**现状**：用户被直接送到邮箱验证码页；他填邮箱、点发送，收到 404「本地模式不提供邮箱登录」——**这是他无法自行解决的问题**，多数人会放弃。刷新通常能恢复，但界面没有任何提示，用户不知道要刷新。

## 当前问题（三环证据链，已核实）
1. `frontend/src/services/api.ts:16-20`：401 时派发 `finquant:unauthorized`，随后 `return Promise.reject(new Error(message))`——**HTTP 状态被丢弃**，调用方无法区分"401 需要登录"与"网络错误/5xx"。
2. `frontend/src/store/authStore.ts:33-34`：`getCurrentUser().then(...).catch(() => set({ user: null, isAuthenticated: false, status: 'anonymous' }))`——**catch 不区分错误类型、无重试**，任何失败都等同"未认证"。
3. `frontend/src/App.tsx:386-388`：`AuthGate` 只判断 `!isAuthenticated` → `<Navigate to="/login" />`，**不区分上述两种情形**。
4. 而本地模式下 `backend/app/routers/auth.py:52-53` 的 `/api/auth/request-code` **直接返回 404「本地模式不提供邮箱登录」** ⇒ 登录页是**死胡同**（`frontend/src/pages/Login.tsx` 只有"邮箱+发送验证码"一条路，无返回/重试出口）。
5. `docs/QUICKSTART.md:50` 承诺"不需要邮箱登录"，但 `:92-127` 的 FAQ **没有**"看到登录页怎么办"条目。

**关键事实（决定修法）**：本地模式下 `/auth/me` **不会返回 401**（`backend/app/routers/auth.py:90,125-126` 直接返回本地所有者）。因此失败只可能是**网络错误或 5xx** ⇒ 只要前端能区分「401 = 需要登录」与「其它 = 服务未就绪」，问题即解决，**无需后端改动**。

## 理想行为
1. `api.ts` 的响应拦截器**在拒绝的 Error 上保留 HTTP 状态**（附加 `status` 字段，**保持 `message` 不变**，不破坏既有读取 `.message` 的调用方；401 仍照常派发 `finquant:unauthorized`）。
2. `authStore` 新增 `'unavailable'` 状态：`/auth/me` 失败时——
   - **401/403** → `anonymous`（确实需要登录，保持现有行为 → 跳 `/login`）；
   - **网络错误 / 5xx / 超时（无 status 或 status ≥ 500）** → `'unavailable'`，并做**有限次自动重试**（建议 3 次、间隔 1s），重试成功则进入 `authenticated`；仍失败则**停留 `unavailable`**。
3. `AuthGate`：`status === 'unavailable'` 时**不跳登录页**，渲染"**正在连接本机服务…**"提示 + **重试按钮**（点按重新初始化）。
4. `Login.tsx` 防御性兜底：页面上给出"若你是本机双击启动，通常无需登录——请返回并重试连接"的说明与重试入口。
5. `docs/QUICKSTART.md` FAQ 新增一条"**看到邮箱登录页**"。

## 涉及模块
- `frontend/src/services/api.ts`（保留 status）
- `frontend/src/store/authStore.ts`（新状态 + 重试 + 错误分类）
- `frontend/src/App.tsx`（AuthGate 分支）
- `frontend/src/pages/Login.tsx`（兜底说明）
- `docs/QUICKSTART.md`（FAQ）
- 对应前端测试

## 不能破坏
- **401 的真实登录流程**：非本地部署下 401 仍必须跳 `/login`；`finquant:unauthorized` 事件监听与清理逻辑（`App.tsx:372-381`）保持不变。
- `api.ts` 的 `error.message` 形态不变（既有调用方依赖它）。
- 本地模式**正常路径**零回归：`/auth/me` 成功 → `authenticated`（既有 `authStore` 与页面行为不变）。
- 不加依赖；不改后端；不改 i18n 既有键（新增键需 zh/en 同步，parity 保持）。
- 不删文件；不 commit。

## 验收标准（可判定）
1. **模拟 `/auth/me` 返回 500 或网络错误** → `authStore.status === 'unavailable'`，且**不出现跳转 `/login`**；界面出现"正在连接本机服务"与重试按钮。
2. **模拟 `/auth/me` 返回 401** → `status === 'anonymous'`，仍跳 `/login`（既有行为不回退）。
3. **先失败后成功**（第 2 次尝试返回用户）→ 自动重试后进入 `authenticated`，用户无需手动操作（验证重试真的存在）。
4. **重试耗尽**（连续失败 3 次）→ `unavailable` 且**不跳 `/login`**；点重试按钮会再次发起初始化。
5. `api.ts` 拒绝的 Error **带 `status` 字段**；`message` 与改动前一致。
6. 前端测试覆盖上述 1-5；`bun run build`（含 `tsc -b`）通过；相关既有测试零回归。

## 错误场景
- 无 `error.response`（网络断开/超时）→ 视为 `unavailable`（**不得**当作未认证）。
- `/auth/me` 返回 200 但响应体异常 → 按既有行为处理（本次不改该语义），但**不得**因此跳登录页（宜归入 `unavailable`）。
- 并发初始化（多次调用 initialize）→ 既有 `initialization` 去重逻辑保持，不得因重试产生并发风暴。

## 测试要求
- `authStore`：mock `getCurrentUser` 分别抛 `{status: 401}` / `{status: 500}` / 网络错误，断言状态与重试次数；用**假定时器**或注入 sleep 避免真实等待。
- `AuthGate`：断言 `unavailable` 时渲染重试提示且**未**渲染跳转（可用内存路由断言未发生 navigate）。
- i18n：新增键 zh/en 同步，parity 校验通过。
- 由独立 Evaluator 复核"401 与 5xx 是否被正确区分"及"本地模式正常路径未回归"。
