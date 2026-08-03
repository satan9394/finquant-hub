# 认证系统设计 — FinQuant Hub

> 状态: proposed → accepted (2026-08-01, @Satanchen 决策)
> 变更: 推翻「无认证」核心不变量 → 引入邮箱免密登录 + 完全数据隔离 + 公网部署

---

## 1. 决策记录

| 项 | 决策 |
|----|------|
| 登录方式 | 邮箱验证码（免密，无密码存储） |
| 数据隔离 | 完全隔离（每个用户独立的组合/自选/报告/论文/凭据） |
| 部署形态 | 公网部署（HTTPS + 限流 + 安全加固） |

## 2. 认证流程

```
┌─ 请求登录 ─┐    ┌─ 接收验证码 ─┐
│ 输入邮箱    │ →  │ 邮箱收到6位码 │
└─────┬──────┘    └──────┬───────┘
      │ POST /auth/request-code  │ POST /auth/verify-code
      ▼                      ▼
  生成6位码(存hash+过期)   校验码→建会话→HttpOnly Cookie
```

### 2.1 `POST /api/auth/request-code`
- 入参：`{email}`（校验格式）
- 行为：生成 6 位随机码，**存 SHA-256 hash** 到 `login_codes` 表，通过 SMTP 发送
- 限流：**每邮箱 60s 一次 + 每 IP 每小时 5 次**（公网必须）
- 响应：`{message: "验证码已发送", cooldown_seconds}`

### 2.2 `POST /api/auth/verify-code`
- 入参：`{email, code}`
- 行为：校验 hash + 过期（10 分钟）+ 一次性；成功后建用户（若不存在）并签发会话
- 会话：服务端 session token（32 字节随机），存 `sessions` 表，HttpOnly + SameSite=Strict + Secure Cookie
- 响应：`{user: {email, is_admin}}` + Set-Cookie

### 2.3 `POST /api/auth/logout` / `GET /api/auth/me`
- 登出删除 session；me 返回当前用户

### 2.4 `GET /api/auth/methods`（可选）
- 返回登录方式说明，供前端渲染

## 3. 表结构（schema_version 8 → 9）

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    is_admin INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,          -- SHA-256
    expires_at TEXT NOT NULL,
    used_at TEXT,
    attempts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of session token
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,          -- 默认 30 天
    revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    service TEXT NOT NULL,             -- tushare / news / smtp / mcp ...
    encrypted_value BLOB NOT NULL,     -- Fernet 加密
    provider TEXT DEFAULT '',
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, service)
);
```

## 4. 数据隔离（完全隔离）

所有用户数据表加 `user_id` 列：
- portfolios / positions / portfolio_trades
- research_reports / research_workspaces / research_events
- thesis / thesis_claims
- alert_rules / alert_triggers
- notifications
- conversations / messages / discussion_rooms
- market_reviews
- scheduled_research_jobs

**实现策略**：数据库 helper 加 `require_owner(user_id)`，所有读写 SQL 强制带 `user_id=?` 过滤；或按 router 注入当前用户。**不新增 DAL 层**（保持不变量「无独立 DAL」）。

**迁移**：第一个注册的用户自动成为 admin；存量数据（若有）归 admin。

## 5. 凭据加密

- 用 `cryptography` 的 Fernet，主密钥来自 `MASTER_KEY` 环境变量（公网部署必须设置）
- 每个用户的 API 密钥（Tushare token、新闻搜索 key、MCP 凭据等）加密存 `user_credentials`
- **API 永不回传明文密钥**——只返回 `has_key: bool`
- 解密仅发生在服务调用瞬间，不落日志

## 6. 公网安全加固

| 项 | 方案 |
|----|------|
| HTTPS | Nginx/反向代理 TLS（Docker compose 已有入口） |
| 限流 | `/auth/request-code` 每邮箱 60s + 每 IP 5次/h；登录接口全局限流 |
| CSRF | SameSite=Strict Cookie + 同源校验（无 CORS 跨域写） |
| Session | 30 天过期 + 可撤销 + token 只存 hash |
| 验证码 | 6 位 + SHA-256 存储 + 10 分钟过期 + 单次使用 + 尝试次数上限 |
| 安全头 | CSP / X-Content-Type-Options / Referrer-Policy |
| 审计 | 登录/失败/登出记 structured log |

## 7. 架构不变量变更

**删除**：~~无认证（No auth/authz）~~

**新增**：
- 邮箱免密登录：验证码 + HttpOnly Cookie 会话，无密码存储
- 用户数据完全隔离：所有用户数据表强制 user_id 归属
- 凭据加密存储：Fernet 加密，API 永不回传明文密钥
- 公网安全基线：HTTPS + 限流 + CSRF + 会话过期

**保留不变**：无 ORM / 无 WebSocket / 无 SSR / 无 DI 容器 / 单 axios 实例

## 8. 前端

- 登录页：邮箱输入 → 验证码输入 → 进入主界面
- auth store（zustand）：`user` / `isAuthenticated` / `login()` / `logout()`
- 路由守卫：未登录跳转 `/login`
- 设置页加「API 密钥管理」：每个服务一个输入框（存到 user_credentials）
- axios 拦截器：401 → 跳登录

## 9. 实施顺序

```
TASK-021  认证后端（users/login_codes/sessions 表 + 3 个 auth 端点 + 限流 + Fernet）
TASK-022  数据隔离迁移（全表加 user_id + 存量归 admin + 查询强制归属）
TASK-023  凭据管理（user_credentials 表 + CRUD API + 服务调用接入）
TASK-024  前端登录 + 路由守卫 + auth store + 凭据设置 UI
TASK-025  公网安全加固（HTTPS 配置 + 安全头 + 审计 + 全量测试）
```
