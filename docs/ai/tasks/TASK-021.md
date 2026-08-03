# TASK-021: 认证后端（邮箱免密登录）

## 目标
实现邮箱验证码免密登录后端：users / login_codes / sessions 表 + auth 端点 + 限流 + SMTP 发码。

## 依据
`docs/ai/AUTH_DESIGN.md` 第 2-3、6 节。@Satanchen 已决策（DECISIONS.md 2026-08-03）。

## 允许修改
- `backend/app/database.py` — schema_version 8→9，新增 users/login_codes/sessions 表
- `backend/app/services/auth.py`（新建）— 验证码生成/校验、会话管理、Fernet 工具
- `backend/app/routers/auth.py`（新建）
- `backend/app/main.py` — 挂载 auth 路由 + 全局限流
- `backend/app/config.py` — MASTER_KEY、验证码 TTL、SMTP 相关
- 对应测试

## 实现要点
1. `POST /api/auth/request-code` {email}：
   - 生成 6 位码，存 SHA-256 hash + 10 分钟过期
   - SMTP 发信（复用 `services/senders.py` 的 SMTP 能力；未配置 SMTP 时日志打印码便于本地测试）
   - 限流：每邮箱 60s 一次 + 每 IP 每小时 5 次
2. `POST /api/auth/verify-code` {email, code}：
   - 校验 hash + 过期 + 单次使用 + 尝试上限（5 次）
   - 成功后 upsert user（首用户 is_admin=1）→ 建 session
   - 返回 Set-Cookie（HttpOnly + SameSite=Strict + Secure[prod]）
3. `POST /api/auth/logout`、`GET /api/auth/me`
4. 依赖注入：`get_current_user` 从 Cookie 解析 session → 返回 user 或 401
5. 全局限流中间件（慢 API 或自实现令牌桶），登录接口优先

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd backend && .venv\Scripts\python.exe -m mypy app
```
测试覆盖：验证码流程（发码/收码/过期/错码/重放）、限流、session 生命周期。

## 回滚
```bash
git checkout -- backend/app/database.py backend/app/services/auth.py backend/app/routers/auth.py backend/app/main.py
```

## 关键判断
- 本地无 SMTP 时，验证码打印到日志（非生产），公网必须配 SMTP
- 不引入第三方 auth 框架，自实现（项目不变量：不引入重框架）
