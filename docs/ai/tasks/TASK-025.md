# TASK-025: 公网安全加固

## 目标
公网部署安全基线：HTTPS 配置、安全响应头、CSRF 防护、审计日志、全量安全测试。

## 依据
`docs/ai/AUTH_DESIGN.md` 第 6-7 节。

## 允许修改
- `backend/app/main.py` — 安全中间件（安全头、请求体大小限制、CSRF 校验）
- `backend/app/middleware/security.py`（新建）— CSP/X-Content-Type-Options/Referrer-Policy、限流、审计
- `backend/app/services/auth.py` — 登录审计日志（成功/失败/IP）
- `Dockerfile` / `docker-compose.yml` / `nginx.conf` — HTTPS 反向代理配置（TLS 证书挂载）
- `.env.example` — 新增 MASTER_KEY / SMTP / 公网相关配置说明
- `docs/DEPLOY.md`（新建）— 公网部署步骤（HTTPS、域名、备份、密钥管理）
- 对应测试

## 实现要点
1. 安全响应头中间件：CSP、X-Content-Type-Options: nosniff、Referrer-Policy、X-Frame-Options
2. CSRF：SameSite=Strict Cookie + 校验自定义头（或双提交 token）；同源部署下主要靠 SameSite
3. 请求体大小限制（防滥用）
4. 登录审计：request-code / verify-code 成功/失败/来源 IP 记 structured log
5. HTTPS：nginx 反代 TLS 配置 + 证书挂载说明；本地开发仍 HTTP
6. 限流补充：全局限流中间件（登录接口已有，扩展到敏感端点）
7. 部署文档：备份策略、MASTER_KEY 生成、SMTP 配置、升级流程

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd backend && .venv\Scripts\python.exe -m mypy app
cd frontend && bun run build
```
安全头存在性测试、CSRF 拦截测试、限流测试。

## 回滚
```bash
git checkout -- backend/app/main.py backend/app/middleware/ Dockerfile docker-compose.yml
```

## 关键判断
- 公网部署前必须生成强 MASTER_KEY 并配 SMTP
- 不引入复杂 WAF；nginx 层 + 应用层中间件够用
- 文档要写清楚「不配 HTTPS 不上公网」
