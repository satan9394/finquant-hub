# TASK-023: 用户凭据加密存储

## 目标
实现 `user_credentials` 表 + CRUD API，用户可配置各服务 API 密钥（Tushare/新闻/MCP 等），Fernet 加密存储，API 永不回传明文。

## 依据
`docs/ai/AUTH_DESIGN.md` 第 5 节。

## 允许修改
- `backend/app/database.py` — user_credentials 表（含在 TASK-021 或此处）
- `backend/app/services/credential_store.py`（新建）— Fernet 加解密
- `backend/app/routers/credentials.py`（新建）
- 接入点：`market_data.py`（Tushare token）、新闻搜索、MCP 配置等从 user_credentials 读取
- `backend/app/config.py` — MASTER_KEY 必填校验（公网）
- 对应测试

## 实现要点
1. `user_credentials` 表：user_id + service + encrypted_value(BLOB) + provider + UNIQUE(user_id, service)
2. Fernet 加密：MASTER_KEY 从环境变量读（缺失时生成随机 key 并警告——仅本地）；加密在存前、解密在调用瞬间
3. API：
   - `PUT /api/me/credentials/{service}` {value} → 加密存储
   - `DELETE /api/me/credentials/{service}` → 删除
   - `GET /api/me/credentials` → 返回 `[{service, has_key, updated_at}]`，**不含明文**
   - `GET /api/me/credentials/{service}/status` → `{has_key, provider}`
4. 接入真实调用：Tushare token、新闻搜索 API key 从当前用户凭据读取，替代全局 .env
5. **解密结果绝不出现在响应/日志**

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```
测试：加密往返、明文永不泄露（mock 响应断言不含 key）、跨用户隔离。

## 回滚
```bash
git checkout -- backend/app/database.py backend/app/services/credential_store.py backend/app/routers/credentials.py
```

## 关键判断
- MASTER_KEY 泄露=所有用户凭据泄露，公网部署必须强密钥 + 文档说明
- 只存必要服务，不存 DeepSeek 全局 key（仍走 .env 或也按用户？——DeepSeek 是系统级，保持 .env；用户自定义服务走 user_credentials）
