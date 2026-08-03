# TASK-024: 前端登录 + 路由守卫 + 凭据设置 UI

## 目标
前端登录页、auth store、路由守卫、设置页 API 密钥管理 UI。

## 依据
`docs/ai/AUTH_DESIGN.md` 第 8 节。

## 允许修改
- `frontend/src/pages/Login.tsx`（新建）— 邮箱输入 → 验证码输入 → 登录
- `frontend/src/store/authStore.ts`（新建，zustand）— user / isAuthenticated / login / logout
- `frontend/src/services/authApi.ts`（新建）
- `frontend/src/App.tsx` — 路由守卫（未登录跳 /login）
- `frontend/src/services/api.ts` — 401 拦截 → 跳登录
- `frontend/src/pages/Settings.tsx` — 加「API 密钥管理」面板
- 对应测试

## 实现要点
1. Login 页：两步 UI（输入邮箱 → 收到码 → 输入码），倒计时重发，错误提示
2. authStore：登录后存 user，刷新时 `GET /api/auth/me` 恢复
3. 路由守卫：未认证访问受保护页 → `<Navigate to="/login">`
4. axios 拦截器：401 → 清 store → 跳登录
5. 设置页「API 密钥管理」：列出服务（Tushare/新闻/MCP 等）+ has_key 状态 + 输入新密钥/删除
6. 登录页样式简洁（深色/浅色跟随主题）

## 验证
```bash
cd frontend && bun run build
cd frontend && bun test
cd backend && .venv\Scripts\python.exe -m pytest -q
```
浏览器验证：未登录访问 / → 跳登录 → 输入邮箱验证码 → 进入 → 刷新保持登录 → 登出。

## 回滚
```bash
git checkout -- frontend/src/pages/Login.tsx frontend/src/store/authStore.ts frontend/src/App.tsx frontend/src/services/api.ts
```

## 关键判断
- Cookie 由后端 Set，前端 axios 需 `withCredentials`（同源 Vite proxy 下可省略，跨域时需开）
- 不把 token 存 localStorage（XSS 风险）——用 HttpOnly Cookie
