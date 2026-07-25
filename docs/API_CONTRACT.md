# FinQuant Hub — 前后端 API 契约 v1.0

本文档是前后端集成的唯一事实来源。PRD 定义端点清单，本文档定义精确的请求/响应 JSON 结构与 SSE 事件格式。

通用约定：
- 所有响应 `Content-Type: application/json; charset=utf-8`（SSE 除外）
- 错误响应：`{"detail": "错误描述"}` + 合适 HTTP 状态码
- 时间格式：ISO 字符串（SQLite datetime('now')，UTC）
- 列表响应统一包 `{items: [...]}`

## 0. 健康检查

`GET /api/health` → `{"status": "ok", "version": "1.0.0", "db": "ok"}`

## 1. 模型管理 `/api/models`

ModelConfig 对象：
```json
{
  "id": 1, "name": "DeepSeek Flash", "provider": "openai",
  "base_url": "https://api.deepseek.com", "model_name": "deepseek-v4-flash",
  "api_key_env": "DEEPSEEK_API_KEY", "api_key": "sk-***",
  "temperature": 0.7, "max_tokens": 4096, "is_default": 1,
  "created_at": "...", "updated_at": "..."
}
```
- `GET /api/models` → `{items: [ModelConfig]}`
- `POST /api/models` ← `{name, provider?, base_url, model_name, api_key?, api_key_env?, temperature?, max_tokens?}` → ModelConfig
- `PUT /api/models/{id}` ← 任意字段子集 → ModelConfig
- `DELETE /api/models/{id}` → `{"ok": true}`
- `POST /api/models/{id}/test` → `{"ok": true, "latency_ms": 850, "message": "连通成功", "reply": "模型的一句话回复"}` 或 `{"ok": false, "latency_ms": null, "message": "错误原因"}`
- `POST /api/models/{id}/set-default` → `{"ok": true}`（互斥：其他记录 is_default 置 0）

## 2. 角色管理 `/api/agents`

AgentPreset 对象：
```json
{"id": 1, "name": "价值投资官", "role_key": "value_investor", "avatar": "🏛️",
 "system_prompt": "...", "model_id": null, "is_preset": 1, "created_at": "..."}
```
- `GET /api/agents` → `{items: [AgentPreset]}`（首次启动自动播种 6 个预置角色）
- `POST /api/agents` ← `{name, role_key, avatar?, system_prompt, model_id?}` → AgentPreset
- `PUT /api/agents/{id}` ← 子集 → AgentPreset
- `DELETE /api/agents/{id}` → `{"ok": true}`（is_preset=1 的也允许删除）

## 3. 单 Agent 对话 `/api/chat`

Session 对象：
```json
{"id": 1, "title": "关于茅台的讨论", "mode": "single", "role_preset": "value_investor",
 "model_id": 1, "status": "active", "created_at": "...", "updated_at": "...",
 "message_count": 6, "last_message": "最后一条消息摘要(前50字)"}
```
- `POST /api/chat/sessions` ← `{title?, role_preset?, model_id?}` → Session（无 message_count）
- `GET /api/chat/sessions` → `{items: [Session]}` 按 updated_at 倒序
- `PUT /api/chat/sessions/{id}` ← `{title?, role_preset?, model_id?}` → Session
- `DELETE /api/chat/sessions/{id}` → `{"ok": true}`（级联删 messages）
- `GET /api/chat/sessions/{id}/messages` → `{items: [Message]}` 按时间升序

Message 对象：
```json
{"id": 1, "conversation_id": 1, "role": "user|assistant|agent", "agent_name": null,
 "content": "...", "round_number": 0, "token_count": 128, "created_at": "..."}
```

- `POST /api/chat/sessions/{id}/messages` ← `{"content": "用户消息"}` → **SSE 流**：
```
event: token
data: {"delta": "部分文本"}

event: done
data: {"message_id": 12, "token_count": 245, "user_message_id": 11}

event: error
data: {"message": "错误描述"}
```

## 4. 多 Agent 讨论 `/api/discussion`

Room 对象（participants 已解析为数组）：
```json
{"id": 1, "conversation_id": 2, "topic": "贵州茅台当前是否值得买入",
 "participants": [{"role_key": "value_investor", "name": "价值投资官", "avatar": "🏛️"}],
 "total_rounds": 3, "current_phase": "active|done", "summary": null, "created_at": "..."}
```
- `POST /api/discussion/rooms` ← `{topic, role_keys: ["value_investor","tech_analyst","risk_manager"], total_rounds: 3, model_id?}` → Room
- `GET /api/discussion/rooms` → `{items: [Room]}` 倒序
- `GET /api/discussion/rooms/{id}` → `{room: Room, messages: [Message]}`（messages 中 role='agent'，agent_name=role_key）
- `POST /api/discussion/rooms/{id}/start` → **SSE 流**：
```
event: round_start
data: {"round": 1, "total_rounds": 3}

event: agent_start
data: {"agent": "value_investor", "name": "价值投资官", "avatar": "🏛️", "round": 1}

event: token
data: {"delta": "部分文本", "agent": "value_investor"}

event: agent_end
data: {"agent": "value_investor", "message_id": 31, "token_count": 320}

event: summary
data: {"content": "讨论总结全文"}

event: done
data: {"room_id": 1}

event: error
data: {"message": "错误描述"}
```
已 done 的房间再次 start → `{"detail": "讨论已完成"}` 409。

## 5. 行情数据 `/api/market`（后端代理腾讯/新浪/东方财富）

- `GET /api/market/search?q=茅台` → `{items: [{"code": "600519", "name": "贵州茅台", "market": "sh", "type": "股票"}]}`
- `GET /api/market/quote?ticker=600519`（自动补全市场前缀）→
```json
{"code": "sh600519", "name": "贵州茅台", "price": 1680.0, "last_close": 1670.0,
 "open": 1675.0, "high": 1690.0, "low": 1665.0, "volume": 12345, "amount": 20739600.0,
 "change": 10.0, "change_percent": 0.6, "turnover_rate": 0.1, "pe": 25.3, "pb": 8.1,
 "market_cap": 21100.0, "amplitude": 1.5, "timestamp": 1753334400}
```
- `GET /api/market/kline?ticker=600519&period=1d&count=100` → `{items: [{"day": "2026-07-24", "open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05, "volume": 100}]}`（period: 1d=240, 60m, 30m, 15m, 5m 映射新浪 scale）
- `GET /api/market/indicators?ticker=600519&indicators=ma,macd,rsi,kdj,boll,atr,volma`（不传 indicators 返回全部）→
```json
{"ticker": "sh600519", "days": ["2026-07-20", "..."],
 "indicators": {
   "ma":    {"ma5": [..], "ma10": [..], "ma20": [..], "ma30": [..], "ma60": [..]},
   "macd":  {"dif": [..], "dea": [..], "hist": [..]},
   "rsi":   {"rsi6": [..], "rsi12": [..], "rsi24": [..]},
   "kdj":   {"k": [..], "d": [..], "j": [..]},
   "boll":  {"upper": [..], "mid": [..], "lower": [..]},
   "atr":   {"atr14": [..]},
   "volma": {"volma5": [..], "volma20": [..]}
 }}
```
数组与 days 等长对齐， warmup 期为 null。

## 6. 仪表盘 `/api/dashboard`

`GET /api/dashboard/stats` →
```json
{"model_count": 2, "conversation_count": 5, "discussion_count": 2, "message_count": 48,
 "default_model": {"id": 1, "name": "DeepSeek Flash", "model_name": "deepseek-v4-flash"},
 "recent_conversations": [Session], "recent_rooms": [Room]}
```

## 7. 前端代理约定

Vite dev proxy：`/api` → `http://127.0.0.1:8000`，必须配置 `compress: false`、`timeout: 0`（SSE 防缓冲）。
后端端口 8000，前端 5173。SSE 消费方式：fetch + ReadableStream 解析 `event:`/`data:` 行（EventSource 不支持 POST）。
