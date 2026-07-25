# FinQuant Hub

个人金融量化研究 Web 系统 — 整合 GitHub 收藏的量化资产（行情数据 / 技术指标 / AI 对话 / 多 Agent 投研讨论 / 模型管理）。

## 功能

| 模块 | 说明 |
|------|------|
| 行情数据 | 腾讯/新浪/东方财富三源代理（主备自动降级），搜索/实时报价/K线 |
| 技术指标 | MA/MACD/RSI/KDJ/BOLL/ATR/VolMA（numpy，A 股口径） |
| 单 Agent 对话 | 多轮 SSE 流式聊天，角色切换，历史持久化 |
| 多 Agent 讨论 | 6 预置投研角色轮序发言（价值投资官/技术分析师/量化研究员/风控委员/宏观策略师/情绪分析师），实时时间线 + 自动总结 |
| 模型管理 | OpenAI 兼容协议抽象，模型配置 CRUD + 连通性测试，默认 DeepSeek |
| 数据存储 | SQLite（WAL），对话/讨论/角色/模型配置全持久化 |
| 策略知识库 | 8 个经典量化策略教学文档 |

## 快速开始（Windows 11）

前置：Python 3.12（或 uv）、bun（或 npm）。

```bash
# 1. 后端（端口 8000）
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
# 配置密钥：复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 2. 前端（端口 5173，另开终端）
cd frontend
bun install
bun run dev
# 浏览器打开 http://localhost:5173
```

## 测试

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest -q   # 38 项单元/集成测试
cd frontend && bun run build                             # 前端类型检查+构建
```

## 架构

```
backend/   FastAPI + aiosqlite(WAL) + httpx，OpenAI 兼容 LLM 封装
frontend/  React 18 + Vite 6 + AntD 5 + lightweight-charts + zustand
docs/      PRD.md（需求文档）、API_CONTRACT.md（前后端契约）
reference/ 5 个 GitHub 收藏仓库快照（思路参考，见 reference/README.md）
knowledge/ 策略知识库源文件
```

设计要点：SSE 流式（sse-starlette + fetch ReadableStream）、Vite proxy 配置 `compress: false` + `timeout: 0` 防 SSE 缓冲、行情直连（trust_env=False 绕过系统代理）、讨论编排为串行轮序（V2 规划交叉质询/收敛表决）。

## 免责

所有 AI 生成内容仅供研究参考，不构成投资建议。
