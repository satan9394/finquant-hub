# FinQuant Hub 公网部署

> 红线：未配置有效 HTTPS、强 `MASTER_KEY` 和可用 SMTP 时，不得把服务暴露到公网。

## 1. 主机与域名

1. 准备只对外开放 TCP 80/443 的 Linux 主机；不要开放后端 8000 端口。
2. 将域名 A/AAAA 记录指向主机，并先取得覆盖该域名的 TLS 证书。
3. 证书链和私钥必须放在宿主机受限目录。私钥不得复制进镜像、Git 或日志。

Compose 中 Nginx 是唯一公网入口：80 永久跳转 HTTPS，443 终止 TLS，再通过内部 Docker 网络访问后端。Uvicorn 仅在这个不可公网访问的内部网络上信任代理头，以获得真实客户端 IP。

## 2. 生产配置

在仓库根目录执行：

```bash
cp .env.example .env
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

把输出写入 `.env` 的 `MASTER_KEY`，并填写：

- `SMTP_HOST`、`SMTP_PORT`、`SMTP_FROM`；按邮件服务要求填写用户名、密码和 SSL 开关。
- `TLS_CERT_PATH`、`TLS_KEY_PATH`：宿主机上的绝对路径。
- 可选模型系统密钥。用户自己的 Tushare/搜索/MCP 密钥应在登录后的设置页录入。

`MASTER_KEY` 必须离线备份。丢失后已有用户凭据不可恢复；直接更换也会使旧密文无法解密，轮换前必须制定重新录入或密文迁移方案。生产启动会拒绝空主密钥、非 Secure Cookie 或缺失 SMTP 主机/发件人。

## 3. 启动与验证

```bash
docker compose config
docker compose build --pull
docker compose up -d
docker compose ps
curl -I https://quant.example.com/
curl https://quant.example.com/api/health
```

验收条件：

- HTTP 自动跳转 HTTPS；证书链有效且域名匹配。
- 响应包含 HSTS、CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy` 和 `X-Frame-Options: DENY`。
- `/api/health` 正常；后端 8000 从公网不可访问。
- 用真实收件邮箱完成发码、登录、刷新会话和退出；生产日志中不能出现验证码、会话 token 或用户凭据明文。

## 4. 备份与恢复

数据位于 Docker volume `finquant-data`。升级前使用 SQLite 在线备份 API 生成一致快照：

```bash
docker compose exec -T backend python -c "import sqlite3; s=sqlite3.connect('/app/backend/data/finquant.db'); d=sqlite3.connect('/app/backend/data/finquant.backup.db'); s.backup(d); d.close(); s.close()"
docker compose cp backend:/app/backend/data/finquant.backup.db ./backups/finquant-$(date +%F-%H%M).db
```

同时离线备份当前 `.env`/`MASTER_KEY` 和 TLS 配置，访问权限应比数据库备份更严格。定期做恢复演练。恢复时先停止后端，保留故障数据库副本，再把已验证的备份复制回 `finquant.db`，启动后检查 schema migration、健康端点和两用户隔离回归。

## 5. 升级与证书续期

1. 先完成数据库与主密钥备份。
2. 拉取已审核版本，执行 `docker compose build --pull`。
3. `docker compose up -d`，观察 `docker compose logs backend frontend`，再执行健康、登录与隔离冒烟测试。
4. 失败时停止新版本，恢复数据库快照并切回上一镜像/提交。

证书自动续期后执行 `docker compose exec frontend nginx -s reload`。不要用跳过证书校验的客户端作为公网验收依据。

## 6. 审计与告警

认证日志采用结构化事件：`auth.request_code.*`、`auth.verify_code.*`、`auth.logout.*`，包含结果、来源 IP、邮箱和用户 ID，但不记录验证码、Cookie、session token 或凭据值。至少监控连续 429、验证码失败峰值、SMTP 投递失败、500 响应和容器反复重启；日志保留周期应符合实际隐私与合规要求。
