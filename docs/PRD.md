# FinQuant Hub 需求文档 (Revised)

## 1. 项目背景与目标

### 1.1 背景

用户长期从事金融量化研究与投资分析，本地积累了多个分散的项目资产：

- **Tech_Stock_Monitor** — React 实时行情看板（腾讯/新浪/东方财富三源）
- **Python_Quantitative_trading** — 量化策略学习库（8 个策略教学 + 技术指标代码）
- **Quantification** — WorldQuant BRAIN alpha 研究入门
- **ai-berkshire** — 四大师价值投资多 Agent 框架

同时参考了 5 个外部开源仓库的设计模式（daily_stock_analysis、stock-analyzer、Vibe-Trading、ai-berkshire、wq-alpha-research），提取架构思路而非直接复制。

当前痛点：上述资产分散在多个目录、多种技术栈、无统一入口。需要一个**独立的、可运行的 Web 系统**，将行情数据、技术分析、AI 对话、多 Agent 讨论、模型管理与数据存储整合为一个整体。

### 1.2 目标

构建 **FinQuant Hub**，一个面向个人投资者的金融量化研究 Web 应用。核心能力：

1. **行情数据** — 实时行情查询 + K 线展示（复用现有腾讯/新浪/东方财富适配器） ✅
2. **技术指标** — 7 个预置指标计算（MA/MACD/RSI/KDJ/Bollinger/ATR/VolMA） ✅
3. **单 Agent 对话** — 与 AI 角色进行多轮金融讨论，SSE 流式输出，历史持久化 ✅
4. **多 Agent 讨论** — 多角色并行分析同一主题，轮序发言，历史持久化 ✅
5. **模型管理** — 模型配置 CRUD，OpenAI 兼容协议抽象（当前默认 DeepSeek） ✅
6. **数据存储** — SQLite 持久化全部对话、配置、角色定义 ✅
7. **策略知识库** — 8 个经典策略教学内容的整合与展示 ✅

### 1.3 硬性约束

- 开发周期：1 天 MVP（从立项到前后端联调通过）
- 运行环境：Windows 11
- 依赖补充：`numpy`（指标计算）、`sse-starlette`（SSE 支持）必须在 `requirements.txt` 中列出
- 前端依赖补充：`@ant-design/icons`、`@ant-design/pro-components`、`dayjs`、`@types/lightweight-charts` 必须在 `package.json` 中列出
- 技术栈：FastAPI + SQLite / React 18 + Vite 6 + AntD 5 + lightweight-charts
- 模型 API：DeepSeek API（deepseek-v4-flash，endpoint https://api.deepseek.com），OpenAI 兼容协议
- 密钥管理：.env 文件管理 API Key，严禁进入 git
- 版本控制：独立本地 git 仓库，与现有 Claude_Code 归档仓库隔离
- 范围原则：满足全部 7 条用户硬性要求，但 MVP 阶段砍掉 80% 参考代码复制、不做并行多 Agent、不做通知推送/回测引擎/PDF 导出

---

## 2. 合并资产清单

### 2.1 直接代码复用的本地资产

| 来源 | 资产路径 | 复用什么 | 形态 |
|------|----------|----------|------|
| Tech_Stock_Monitor | `src/services/stockApi.ts` | 腾讯/新浪/东方财富三数据源统一调用 | 复制到 `frontend/src/services/` |
| Tech_Stock_Monitor | `src/types/stock.ts` | 行情/股票类型定义 | 复制到 `frontend/src/types/` |
| Tech_Stock_Monitor | `vite.config.ts` | Vite dev proxy 配置（转发行情 API） | 参考配置 |
| Tech_Stock_Monitor | `src/components/StockChart` | lightweight-charts K 线组件 | 复制到 `frontend/src/components/` |
| Tech_Stock_Monitor | `src/store/watchlistStore.ts` | Zustand store 模式参考 | 参考模式 |
| ai-berkshire | `tools/financial_rigor.py` | 零依赖金融精确计算工具链（Decimal/市值验算/Benford 检测），供聊天和讨论 Agent 在数值计算中使用 | 复制到 `backend/app/tools/` |
| ai-berkshire | `codex-skills/investment-team/SKILL.md` | 巴菲特/芒格/段永平/李录 System Prompt | 提取提示词文本 |
| Python_Quantitative_trading | `strategies/` 下 8 个 HTML | 策略教学知识库（前端内嵌） | 复制到 `frontend/public/knowledge/` |
| Quantification | `WorldQuant BRAIN day1.ipynb` | Alpha 研究思路参考 | 提取方法论到 README |

### 2.2 思路借鉴的外部仓库（不复制代码）

| 仓库 | 借鉴内容 | 用途 |
|------|----------|------|
| daily_stock_analysis | SkillAgent 路由 + 数据源适配器模式 | 后端 Agent 架构参考 |
| stock-analyzer (luda66) | 13 章报告模板 + 指标打分体系 | 分析报告结构参考 |
| Vibe-Trading | LoaderRegistry 注册模式 + Research Goal 生命周期 | 数据管理层设计参考 |
| wq-alpha-research | Alpha 因子研究 playbook + 增量快照机制 | 后续因子研究模块参考 |

### 2.3 明确不引入的内容

- 通知推送（12 渠道适配器）— 用户未要求
- 回测引擎（8 引擎架构）— 独立子项目，Day 1 不做
- PDF/HTML 导出管线 — 后续迭代
- 实时 WebSocket 推送 — Tech_Stock_Monitor 已覆盖
- LiteLLM / LangChain / LlamaIndex — 只用 httpx 直调
- SQLAlchemy / Alembic — MVP 用 aiosqlite 直写

---

## 3. 系统架构

### 3.1 目录结构

```
E:\Code_file\Projects\finquant-hub/       ← 独立 git 仓库，与 Claude_Code 隔离
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI 入口
│   │   ├── config.py                # 环境变量配置
│   │   ├── database.py              # SQLite 连接 + 表创建（WAL 模式）
│   │   ├── models.py                # 数据模型定义（dataclass/raw sql）
│   │   ├── routers/
│   │   │   ├── chat.py              # 单 Agent 对话 SSE
│   │   │   ├── discussion.py        # 多 Agent 讨论（轮序发言）
│   │   │   ├── models_crud.py       # 模型配置 CRUD
│   │   │   ├── agents.py            # 角色预设 CRUD
│   │   │   ├── market.py            # 行情数据代理
│   │   │   └── dashboard.py         # 仪表盘统计
│   │   ├── services/
│   │   │   ├── llm_client.py        # OpenAI 兼容 HTTP 客户端
│   │   │   ├── model_router.py      # 模型路由 + fallback
│   │   │   └── discussion_orch.py   # 讨论编排器（轮序模式）
│   │   ├── tools/
│   │   │   └── financial_rigor.py   # 零依赖金融计算（供给聊天/讨论 Agent）
│   │   └── prompts/
│   │       └── roles.py             # 6 个预置角色 System Prompt
│   ├── .env                         # API Key 等敏感配置（不入 git）
│   ├── .env.example                 # 模板文件
│   ├── requirements.txt             # fastapi, uvicorn, httpx, aiosqlite, pydantic, numpy, sse-starlette
│   └── data/
│       └── finquant.db              # SQLite 数据库文件
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                  # 路由 + AntD Layout
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # 系统总览
│   │   │   ├── Chat.tsx             # 单 Agent 对话页
│   │   │   ├── Discussion.tsx       # 多 Agent 讨论页
│   │   │   ├── Models.tsx           # 模型管理页
│   │   │   ├── Knowledge.tsx        # 策略知识库页
│   │   │   └── Settings.tsx         # 设置页（角色管理入口）
│   │   ├── components/
│   │   │   ├── ChatMessageBubble.tsx # 消息气泡（单聊/讨论复用）
│   │   │   ├── StreamingText.tsx    # 打字机效果
│   │   │   ├── RoleAvatar.tsx       # 角色头像
│   │   │   ├── ModelSelector.tsx    # 模型选择下拉
│   │   │   ├── StockChart.tsx       # lightweight-charts K 线
│   │   │   └── DiscussionTimeline.tsx # 讨论时间线
│   │   ├── services/
│   │   │   └── stockApi.ts          # 行情 API（从 Tech_Stock_Monitor 移植）
│   │   ├── store/
│   │   │   ├── chatStore.ts         # 会话状态
│   │   │   ├── modelStore.ts        # 模型配置状态
│   │   │   └── discussionStore.ts   # 讨论状态
│   │   ├── types/
│   │   │   └── index.ts             # 类型定义
│   │   └── api/
│   │       └── client.ts            # axios 实例 + proxy 配置
│   ├── vite.config.ts               # dev proxy 转发 /api/ 到后端；必须配置 compress: false + timeout: 0 确保 SSE 流不被缓冲
│   ├── tsconfig.json
│   └── package.json                 # react 18, antd 5, lightweight-charts, zustand, axios, @ant-design/icons, @ant-design/pro-components, dayjs, @types/lightweight-charts
│
├── .gitignore
└── README.md
```

### 3.2 技术栈

| 层 | 技术选型 | 理由 |
|----|----------|------|
| 后端框架 | FastAPI + sse-starlette | 原生 SSE 支持（经 sse-starlette）、异步、自动 OpenAPI 文档、Windows 兼容 |
| 数据库 | SQLite (aiosqlite) | 零部署、单文件、个人使用足够 |
| 数值计算 | numpy | 滚动窗口、标准差、EMA 等指标计算，减少手写错误 |
| LLM 客户端 | httpx + 自定义 OpenAI 兼容封装 | 无第三方依赖、轻薄可控 |
| 前端框架 | React 18 + Vite 6 + TypeScript | 与 Tech_Stock_Monitor 技术栈一致，组件可复用 |
| UI 库 | Ant Design 5 + ProComponents | 企业级组件、ProLayout 导航、ProTable 行内编辑 |
| K 线图表 | lightweight-charts | 与 Tech_Stock_Monitor 一致，轻量高性能 |
| 状态管理 | Zustand | 无 boilerplate、按模块拆分 store |
| HTTP 客户端 | axios + camelcase-keys | 与现有 stockApi.ts 一致 |

### 3.3 数据流

```
用户浏览器                    FastAPI 后端                    DeepSeek API
    │                            │                              │
    │── POST /api/chat ────────→ │                              │
    │  {model, role, message}   │                              │
    │                            │── POST /v1/chat/completions →│
    │                            │  (stream=true)               │
    │                            │←── SSE token chunks ────────│
    │←── SSE event: token ──────│                              │
    │  (逐字推送)                │                              │
    │                            │── INSERT messages ──────→   │
    │                            │  (SQLite)                    │
    │←── SSE event: done ───────│                              │
    │                            │                              │
    │── POST /api/discussion/rooms ──→ │  (创建讨论房间)       │
    │── POST /api/discussion/rooms/{id}/start ──→ │  (启动讨论)│
    │                            │  每轮按固定顺序：            │
    │                            │    Agent A → LLM call       │
    │←── SSE: agent_start(A) ───│                              │
    │←── SSE: token(chunk) ─────│                              │
    │←── SSE: agent_end(A) ─────│                              │
    │                            │    Agent B → LLM call       │
    │                            │    ...                       │
    │←── SSE: done ─────────────│                              │
```

---

## 4. 功能需求

### 4.1 行情数据模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| DATA-01 | 用户输入股票代码/名称，返回匹配的股票列表 | 搜索 600519 → 显示"贵州茅台"；搜索 "AAPL" → 显示 "Apple Inc." | ✅ |
| DATA-02 | 获取指定股票的实时报价（最新价/涨跌幅/成交量） | 返回含 price, change_pct, volume, timestamp 字段 | ✅ |
| DATA-03 | 获取指定股票的日 K 线数据（支持周期切换） | 请求 600519, 1d, 100 → 返回 100 根 K 线 | ✅ |
| DATA-04 | 数据源自动降级：主源超时/失败自动切换次源 | 模拟主源超时场景 → 自动降级到备源并返回有效数据（通过 mock 数据源 + 单元测试验证，不依赖手动中断网络） | ✅ |
| DATA-05 | 行情 API 通过前端 Vite proxy 转发，避免跨域 | `fetch('/api/market/quote?ticker=600519')` 正常返回 | ✅ |

### 4.2 技术指标模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| IND-01 | 基于 OHLCV 计算 7 个预置技术指标：MA(5/10/20/30/60/120/250)、MACD(12/26/9)、RSI(14/6/12/24)、KDJ(9/3/3)、Bollinger(20/2)、ATR(14)、VolMA(5/20) | 输入标准 OHLCV → 输出各指标值；NaN 边界输入返回 NaN | ✅ |
| IND-02 | K 线图叠加均线和布林带 | 图表显示 MA5/10/20/30 四条均线 + 布林带上下轨 | ✅ |
| IND-03 | 指标值在图表底部以独立面板展示（MACD/RSI/KDJ/成交量） | 每个指标有独立 Y 轴面板，与主 K 线时间轴同步 | ✅ |

### 4.3 单 Agent 对话模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| CHAT-01 | 用户选择已配置的模型，发起多轮对话 | 发送消息 → 收到 SSE 流式回复 → 继续追问上下文集 | ✅ |
| CHAT-02 | 对话历史持久化到 SQLite，刷新页面后可恢复 | 关闭标签页 → 重新打开 → 左侧会话列表可见历史 → 点击恢复上下文 | ✅ |
| CHAT-03 | SSE 流式输出实时显示 | 回复逐字显示，附带打字机光标动画 | ✅ |
| CHAT-04 | 用户可在对话中切换角色（System Prompt 切换） | 当前为"技术分析师" → 调用 `PUT /api/chat/sessions/{id}` 更新 role_preset → 切换到"价值投资官" → 后续回复风格改变 | ✅ |
| CHAT-05 | 新建/删除/清空会话 | 右键删除会话 → 确认后消失；清空不影响其他会话 | ✅ |
| CHAT-06 | 每条消息记录角色、时间戳、token 用量 | 消息气泡下方显示 `2026-07-24 14:30 · 128 tokens` | ✅ |

### 4.4 多 Agent 讨论模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| MULTI-01 | 用户创建讨论房间，选择参与角色（至少 3 个）和讨论轮次 | 创建对话框可选择角色列表（可选 3-6 个），配置轮次（1-5 轮） | ✅ |
| MULTI-02 | 讨论按轮次执行，每轮各 Agent 按固定顺序陈述独立观点，所有发言追加到同一对话流 | 各 Agent 发言不交叉引用、不反驳；完整时序记录保存在 discussion_rooms 中 | ✅ |
| MULTI-03 | 预置至少 3 个角色提示词：价值投资官、技术分析师、风控委员 | 三个角色各有一套不同的 System Prompt，风格和关注点明显不同 | ✅ |
| MULTI-04 | 讨论过程实时可视化：角色头像/思考中状态/当前发言高亮 | 讨论时间线显示每个 Agent 发言，当前发言 Agent 头像脉冲动画 | ✅ |
| MULTI-05 | 讨论记录持久化，支持查看历史讨论 | 讨论房间列表保留所有历史讨论，点击可回放完整记录 | ✅ |

> **V2 计划**：交叉质询阶段、收敛表决、用户插入追问等功能将在后续版本迭代。MVP 仅支持轮序独立陈述。

### 4.5 模型管理模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| MODEL-01 | 模型配置 CRUD：名称/供应商/Endpoint/API Key/模型名/Temperature | 表格展示所有配置；新增/编辑/删除操作正常 | ✅ |
| MODEL-02 | 默认预置 deepseek-v4-flash（endpoint=https://api.deepseek.com）和 deepseek-v4-pro | 首次启动时系统自动创建两条默认记录 | ✅ |
| MODEL-03 | 测试连通性按钮：验证 API Key 和 Endpoint 是否可用 | 点击测试 → 发送简单请求 → 显示"连通成功"或错误信息 | ✅ |
| MODEL-04 | 快速切换当前使用模型的全局下拉 | 顶部 Header 模型下拉 → 切换后所有新对话使用该模型 | ✅ |

### 4.6 数据存储模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| DB-01 | SQLite 单文件数据库，自动创建 | 后端启动时自动创建 `data/finquant.db` 及其表结构 | ✅ |
| DB-02 | 数据库含 5 张核心表：model_configs、conversations、messages、agent_presets、discussion_rooms | 启动后通过数据库查看工具可见全部表结构 | ✅ 实际已有 54 张表 |
| DB-03 | 数据库使用 WAL 模式，避免写入锁 | 启动时执行 `PRAGMA journal_mode=WAL`；并发读取正常，写入不阻塞读取 | ✅ |

### 4.7 策略知识库模块 ✅

| ID | 需求描述 | 验收标准 | 状态 |
|----|----------|----------|------|
| KNOW-01 | 前端页面展示 8 个经典策略的说明文档（从 Python_Quantitative_trading 移植） | 策略列表可见：双均线/均值回归/动量/市场中性/统计套利/事件驱动/机器学习/高频 | ✅ |
| KNOW-02 | (Day 1) 策略文档页可正常展示全部 8 个 HTML；Agent 自动引用知识库列为 V2 规划 | 用户在 Knowledge 页面可浏览完整策略说明 | ✅ |

---

## 5. 数据模型

### 5.1 model_configs

```sql
CREATE TABLE model_configs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,            -- 用户给模型起的名字，如 "DeepSeek Flash"
    provider      TEXT NOT NULL DEFAULT 'openai', -- 供应商标识，当前仅 'openai'
    base_url      TEXT NOT NULL,            -- API endpoint，如 https://api.deepseek.com
    model_name    TEXT NOT NULL,            -- 模型名，如 deepseek-v4-flash
    api_key_env   TEXT,                     -- 环境变量名（如 DEEPSEEK_API_KEY），存变量名不存值
    api_key       TEXT,                     -- 或直接存 key（明文，MVP 接受）
    temperature   REAL DEFAULT 0.7,
    max_tokens    INTEGER DEFAULT 4096,
    is_default    INTEGER DEFAULT 0,        -- 1=当前默认模型
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);
```

### 5.2 conversations

```sql
CREATE TABLE conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT,                     -- 会话标题（自动从首条消息生成）
    mode          TEXT NOT NULL DEFAULT 'single', -- 'single' | 'multi'
    role_preset   TEXT,                     -- 单模式下的角色标识
    model_id      INTEGER,                  -- 使用的模型配置 ID
    status        TEXT DEFAULT 'active',    -- 'active' | 'archived'
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);
```

### 5.3 messages

```sql
CREATE TABLE messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL,           -- 'user' | 'assistant' | 'system' | 'agent'
    agent_name      TEXT,                    -- 多 Agent 模式下区分发言者
    content         TEXT NOT NULL,
    round_number    INTEGER DEFAULT 0,       -- 多 Agent 讨论轮次
    token_count     INTEGER,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_messages_conv ON messages(conversation_id, round_number, created_at);
```

> **变更说明**：MVP 简化了 messages 表结构，去除了 turn_type、directed_to、confidence、data_refs 字段。这些字段将在 V2 多 Agent 阶段协议恢复时一并加入。

### 5.4 agent_presets

```sql
CREATE TABLE agent_presets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,            -- 角色名称，如 "价值投资官"
    role_key      TEXT NOT NULL UNIQUE,     -- 标识符，如 'value_investor'
    avatar        TEXT,                     -- 角色头像标识
    system_prompt TEXT NOT NULL,            -- System Prompt 全文
    model_id      INTEGER,                  -- 可绑定特定模型
    is_preset     INTEGER DEFAULT 1,        -- 1=系统预置，0=用户创建
    created_at    TEXT DEFAULT (datetime('now'))
);
```

### 5.5 discussion_rooms

```sql
CREATE TABLE discussion_rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,       -- 关联 conversations 表
    topic           TEXT NOT NULL,           -- 讨论主题
    participants    TEXT NOT NULL,           -- JSON: [{agent_preset_id, model_id}]
    total_rounds    INTEGER DEFAULT 3,
    current_phase   TEXT DEFAULT 'active',   -- 'active' | 'done'
    summary         TEXT,                    -- 讨论总结
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

> **变更说明**：current_phase 简化为 active/done；移除 consensus 字段（V2 恢复收敛表决时再加）。

### 5.6 数据模型设计原则

- **Append-only**：messages 表只 INSERT 不 UPDATE，保留完整审计轨迹
- **JSON 列**：participants 等使用 JSON 列而非拆分关联表，降低查询复杂度
- **单表复用**：messages 表同时服务于单 Agent 和多 Agent 模式，通过 conversation.mode 区分
- **外键关联**：discussion_rooms.conversation_id 指向 conversations，实现统一会话视图
- **无 ORM**：MVP 使用 raw SQL + aiosqlite，后期可迁移至 SQLAlchemy
- **连接管理**：使用 FastAPI lifespan 创建单例 aiosqlite 连接，所有请求复用同一连接。启动时执行 `PRAGMA journal_mode=WAL` 启用 WAL 模式
- **数据库初始化**：首次启动自动建表，使用 `CREATE TABLE IF NOT EXISTS` 保证幂等

---

## 6. API 设计

### 6.1 模型管理

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/models` | 获取全部模型配置列表 |
| POST | `/api/models` | 创建新模型配置 |
| PUT | `/api/models/{id}` | 更新模型配置 |
| DELETE | `/api/models/{id}` | 删除模型配置 |
| POST | `/api/models/{id}/test` | 测试模型连通性 |
| POST | `/api/models/{id}/set-default` | 设为默认模型 |

### 6.2 Agent/角色管理

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/agents` | 获取全部角色预设（Settings 页面调用此接口） |
| POST | `/api/agents` | 创建新角色 |
| PUT | `/api/agents/{id}` | 编辑角色提示词 |
| DELETE | `/api/agents/{id}` | 删除角色 |

### 6.3 单 Agent 对话

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/chat/sessions` | 创建新会话 |
| GET | `/api/chat/sessions` | 获取历史会话列表 |
| DELETE | `/api/chat/sessions/{id}` | 删除会话 |
| PUT | `/api/chat/sessions/{id}` | 更新会话（切换角色预设 role_preset、修改标题等） |
| GET | `/api/chat/sessions/{id}/messages` | 获取会话消息列表 |
| POST | `/api/chat/sessions/{id}/messages` | 发送消息并触发 SSE 流式回复 |

### 6.4 多 Agent 讨论

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/discussion/rooms` | 创建讨论房间（选角色+主题+轮次） |
| GET | `/api/discussion/rooms` | 获取历史讨论房间列表 |
| GET | `/api/discussion/rooms/{id}` | 获取讨论详情（含参与者配置 + 消息记录） |
| POST | `/api/discussion/rooms/{id}/start` | 启动讨论（返回 SSE 流，轮序输出各 Agent 发言） |

### 6.5 行情数据

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/market/search?q=keyword` | 搜索股票代码/名称 |
| GET | `/api/market/quote?ticker=CODE` | 获取实时报价 |
| GET | `/api/market/kline?ticker=CODE&period=1d&count=100` | 获取 K 线数据 |
| GET | `/api/market/indicators?ticker=CODE&indicators=ma,macd,rsi,kdj,boll,atr,volma` | 获取指定技术指标计算值。`indicators` 参数为逗号分隔的指标标识列表；不传时返回全部 7 个指标 |

### 6.6 仪表盘

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/dashboard/stats` | 获取系统概览统计（模型数/会话数/讨论数/近期活动） |

> 该端点在 M4 阶段实现 `routers/dashboard.py`。

---

## 7. 前端页面与交互

### 7.1 页面总览（6 个页面）

| 路径 | 页面 | 主要内容 |
|------|------|----------|
| `/` | Dashboard | 状态面板：当前模型、近 5 条会话、近 5 条讨论、模型总数、快速入口 |
| `/chat` | 单 Agent 对话 | 左栏会话列表 + 右栏消息流 + 底部输入框 + 顶部角色/模型切换 |
| `/discussion` | 多 Agent 讨论 | 左栏讨论房间列表 + 中间讨论时间线 |
| `/knowledge` | 策略知识库 | 8 个经典策略 HTML 文档展示 |
| `/models` | 模型管理 | AntD Table + 行内编辑 + 新增/删除/测试按钮 |
| `/settings` | 系统设置 | 默认模型、角色配置（调用 `/api/agents` 接口 CRUD）、主题切换 |

### 7.2 布局规范

统一使用 Ant Design ProLayout：

- **左侧窄侧栏导航** — 6 个图标的垂直菜单（Dashboard / Chat / Discussion / Knowledge / Models / Settings）
- **顶部 Header** — 当前模型状态显示 + 模型快速切换下拉
- **内容区** — 页面主体内容

### 7.3 组件复用策略

| 组件 | 所属页面 | 复用说明 |
|------|----------|----------|
| ChatMessageBubble | Chat / Discussion | 统一消息渲染，多 Agent 模式额外显示角色头像 |
| StreamingText | Chat / Discussion | 打字机效果组件，接收 SSE token 流 |
| RoleAvatar | Discussion / Chat | 角色头像组件，颜色和图标按角色区分 |
| ModelSelector | 所有页面 Header | 全局模型切换下拉 |
| StockChart | Dashboard / 后续 | lightweight-charts K 线组件 |
| DiscussionTimeline | Discussion | 时间线式讨论流组件，显示轮次进度和发言角色 |

### 7.4 关键交互细节

- **SSE 流式渲染**：前端使用 EventSource 或 fetch event stream，每收到一个 token 追加到当前消息气泡中，光标保持闪烁状态直到收到 `event: done`
- **讨论状态指示**：讨论过程中顶部显示当前轮次进度（Round 1/3 → Round 2/3 → Round 3/3），当前发言角色头像脉冲动画
- **Vite proxy SSE 配置**：`vite.config.ts` 中代理 `/api/` 时必须设置 `compress: false` 和 `timeout: 0`，防止 Vite dev server 缓冲 SSE 流导致 token 延迟到达。详见 README 中的启动说明
- **消息区滚动**：消息列表使用普通 overflow scroll，超过 50 条消息时自动加载早期消息。不使用虚拟滚动（SSE 流式渲染与虚拟滚动行高管理存在冲突，V2 再考虑优化）
- **角色切换即时生效**：单 Agent 模式在对话过程中切换角色（通过 `PUT /api/chat/sessions/{id}`），下一条回复即使用新 System Prompt
- **页脚标注**：所有含 AI 回复的页面底部标注"此内容由 AI 生成，不构成投资建议"

---

## 8. 多 Agent 讨论协议

### 8.1 预置角色（6 个）

| 角色 | key | 方法论 | 发言特点 |
|------|-----|--------|----------|
| 价值投资官 | value_investor | 巴菲特/芒格综合：护城河、DCF、安全边际 | 长视角、保守、关注基本面 |
| 技术分析师 | tech_analyst | 多时间框架趋势、形态、量价 | 中短期、关注信号和阻力位 |
| 量化研究员 | quant_researcher | 因子暴露、统计显著性、回测 | 数据驱动、关注 alpha 和相关性 |
| 风控委员 | risk_manager | 下行保护、尾部风险、集中度 | 审慎、关注最差情景 |
| 宏观策略师 | macro_strategist | 宏观体制、板块轮动、货币政策 | 自上而下、关注大环境 |
| 市场情绪分析师 | sentiment_analyst | 新闻情绪、资金流向、Put/Call | 捕捉市场情绪转折 |

### 8.2 讨论流程（MVP 轮序模式）

```
[创建房间] 用户选择主题 + 3-6 个角色 + 轮次（1-5 轮）
     ↓
[启动] 用户点击"开始讨论"，POST /api/discussion/rooms/{id}/start
     ↓
[逐轮发言]  每轮按角色预定义顺序依次调用 LLM
   Round 1:
     Agent A 发言（独立陈述观点，含 direction + 核心论据）
     Agent B 发言（不得引用或反驳 A）
     Agent C 发言
     ...
   Round 2: （同上，固定顺序）
     ...
     ↓
[完成] 所有轮次完成后，输出讨论摘要，状态置为 done
```

**关键规则**：
- Agents 之间不交叉质询、不反驳、不辩论
- 每个 Agent 的上下文包含：主题 + 前序 Agent 的摘要（不含全文，节约 token）
- 每轮发言顺序按 role_key 字母序固定，前端可展示

### 8.3 技术实现

- 后端串行调用 LLM（一个 Agent 完成全部 SSE 推送后，再调用下一个）
- 每个 Agent 调用时，上下文包含 SessionContext（主题 + 当前行情摘要）+ 前序 Agent 结论摘要
- 讨论过程中使用 SSE 事件区分类型：
  - `event: round_start` → 前端显示轮次切换
  - `event: agent_start` → 前端高亮该 Agent 头像
  - `event: token` → 前端流式追加内容
  - `event: agent_end` → 前端结束该 Agent 发言
  - `event: done` → 前端显示讨论摘要

### 8.4 V2 规划

后续版本将按照以下方向增强讨论协议：

| 功能 | 说明 |
|------|------|
| Phase 2 交叉质询 | Agent 可 @ 定向质疑，被质疑方回应 |
| Phase 3 收敛表决 | 角色加权表决，输出共识/分歧报告 |
| 用户插入追问 | 讨论流中"主持人追问"，优先级高于 Agent |
| 置信度锚定 | 每个 Agent 附带置信度自评+理由 |
| 结构化输出解析 | 后端解析 direction/confidence/data_refs 等字段 |

---

## 9. 非功能需求

### 9.1 Windows 兼容

- 后端使用 asyncio + uvicorn 原生支持 Windows（避免 aiohttp 的事件循环问题）
- 路径使用 `pathlib.Path`，避免 `os.path` 的跨平台问题
- Vite dev server 使用 forward slash 路径
- 所有脚本为 `.py` 和 `.ts`，无 `.sh` 依赖（Windows 无 Bash）

### 9.2 密钥管理

- API Key 存储在 `backend/.env` 文件，格式：`DEEPSEEK_API_KEY=sk-xxx`
- `.env` 已加入 `.gitignore`
- 提供 `.env.example` 模板
- SQLite 中存储的 API Key 为明文（MVP 接受风险，本地个人环境）
- 架构预留加密字段接口（后续可加 Fernet 对称加密）
- **首次提交前确认**：执行 `git status` 确认 `.env` 未被跟踪；如已误提交，立即清除并添加至 `.gitignore` 后再提交

### 9.3 版本控制

- 独立 git 仓库：`E:\Code_file\Projects\finquant-hub`
- `.gitignore` 包含：`node_modules/`, `.env`, `*.db`, `__pycache__/`, `dist/`, `.vite/`
- 初始提交结构化的 `.gitignore` 后再开发
- 分阶段提交：M1 骨架 → M2 数据层 → M3 Agent → M4 前端 → M5 测试

### 9.4 性能

| 指标 | 目标 |
|------|------|
| 单 Agent 首 token 延迟 | < 3s（DeepSeek API 响应 + 网络） |
| SSE 回复速度 | API 推多少前端显示多少，无额外延迟 |
| 页面首屏加载 | < 2s（开发模式），< 1s（生产 build） |
| 消息历史加载 | 50 条 < 500ms |
| SQLite 查询 | 单表 < 100ms |

### 9.5 安全

- 所有 API 前缀 `/api/`，前端 dev proxy 转发
- MVP 依靠 dev proxy 同源访问，不需要 CORS 配置（生产部署或非 proxy 场景需添加 `CORSMiddleware`，进入 V2 议程）
- 前端标注"此内容由 AI 生成，不构成投资建议"
- Agent 输出中不得包含可执行代码或指令

---

## 10. 实施里程碑

### M0 项目初始化（第 0-1 小时）

- [ ] 在 `E:\Code_file\Projects\` 下创建 `finquant-hub` 目录
- [ ] `git init` + 创建 `.gitignore`（含 `node_modules/ .env *.db __pycache__/ dist/ .vite/`）
- [ ] 后端：uv init + `requirements.txt`（fastapi, uvicorn, httpx, aiosqlite, pydantic, python-dotenv, numpy, sse-starlette）
- [ ] 前端：`bun create vite` React + TypeScript + 安装 antd / @ant-design/icons / @ant-design/pro-components / lightweight-charts / @types/lightweight-charts / zustand / axios / dayjs
- [ ] 验证：`uv run uvicorn app.main:app --reload` 启动成功 + `bun run dev` 无报错

### M1 数据层（第 1-2 小时）

- [ ] 实现 `database.py`：SQLite 初始化 + 5 张核心表建表 + WAL 模式 PRAGMA
- [ ] 实现 `models.py`：数据模型 dataclass
- [ ] 实现 `config.py`：.env 读取 + 配置校验
- [ ] 验证：后端启动自动建表无异常；PRAGMA journal_mode 返回 wal

### M2 模型管理 + 聊天 API（第 2-4 小时）

- [ ] 实现 `routers/models_crud.py`：模型配置 CRUD + 默认预置
- [ ] 实现 `services/llm_client.py`：OpenAI 兼容 httpx 封装
- [ ] 实现 `services/model_router.py`：模型路由 + fallback
- [ ] 实现 `routers/chat.py`：会话管理（含 `PUT /api/chat/sessions/{id}` 角色切换）+ SSE 流式聊天
- [ ] 验证：Postman/curl 测试 POST 聊天接口，收到 SSE 流式回复

### M3 多 Agent 讨论（第 4-6 小时）

- [ ] 实现 `prompts/roles.py`：6 个预置角色 System Prompt（价值投资官/技术分析师/量化研究员/风控委员/宏观策略师/市场情绪分析师）
- [ ] 实现 `routers/agents.py`：角色预设 CRUD
- [ ] 实现 `services/discussion_orch.py`：轮序讨论编排器（创建→逐轮发言→摘要）
- [ ] 实现 `routers/discussion.py`：讨论房间管理 + SSE 讨论流（不含阶段协议）
- [ ] 验证：创建 3-6 角色讨论 → 启动 → 各 Agent 依次发言 → 结束输出摘要

### M4 前端页面（第 6-9 小时）

- [ ] 实现布局：AntD ProLayout 侧栏导航 + Header 模型下拉
- [ ] 实现 `routers/dashboard.py`：仪表盘统计端
- [ ] 实现 Dashboard：统计卡片 + 快速入口
- [ ] 实现 `routers/market.py`：行情代理路由
- [ ] 实现 Chat：会话列表 + 消息流 + SSE 流式渲染 + 角色切换
- [ ] 实现 Discussion：讨论房间列表 + 时间线 + 创建对话框
- [ ] 实现 Models：模型表格 CRUD + 测试按钮
- [ ] 实现 Knowledge：策略知识库页面（嵌入 8 个 HTML 文档）
- [ ] 移植行情组件：StockChart + stockApi.ts
- [ ] Vite proxy SSE 配置：确认 `compress: false` + `timeout: 0` 已配置
- [ ] 验证：全流程 L0（启动无报错）+ L1（模型+聊天可跑）+ L2（多 Agent 可跑）

### M5 集成测试与收尾（第 9-12 小时）

- [ ] 前后端联调 L3 完整流：新建模型 → 测试通过 → 发起对话 → 多 Agent 讨论 → 切换回看历史
- [ ] 移植策略知识库 HTML 到前端 public/ 目录
- [ ] 移植 financial_rigor.py 到后端 tools/
- [ ] git 分阶段提交（M1→M5 各一次提交）
- [ ] 记录 NOTES.md：项目状态、未完成项、已知问题

### MVP 范围边界（明确不做）

| 功能 | 理由 | 后续版本 |
|------|------|----------|
| 并行多 Agent 调用 | 串行已满足功能需求，避免并发调试复杂度 | V2 可加线程池 |
| 实时行情 WebSocket | Tech_Stock_Monitor 已覆盖 | 按需集成 |
| 回测引擎 | 独立子项目，1 天做不完 | V3 |
| 通知推送 | 用户未要求 | V4 |
| PDF/HTML 导出 | 非核心交互 | V2 |
| 用户登录/鉴权 | 个人使用，非必要 | V5 |
| 向量化/RAG | 增加复杂度无显著收益 | V3 |
| SQLAlchemy/Alembic | aiosqlite 直写足够 | V2 按需上 ORM |
| 缓存层（Redis） | 个人使用无性能瓶颈 | V4 |
| 交叉质询/收敛表决 | 3 阶段协议需要 2-3 天完整实现，MVP 轮序发言已满足功能验收 | V2 |
| 用户讨论中插入追问 | 需要 SSE 长连接+独立队列重设计，MVP 讨论是单向流 | V2 |
| 虚拟滚动 | SSE 流式渲染与虚拟滚动行高管理冲突，普通滚动+按需加载更稳定 | V2 |

---

## 附录 A：验收检查清单

```
□ L0 启动验收
  □ cd backend && uv run uvicorn app.main:app --reload 无报错
  □ cd frontend && bun run dev 无报错
  □ 浏览器打开 http://localhost:5173 可见 Dashboard

□ L1 功能验收
  □ 模型管理页显示默认 DeepSeek 配置
  □ 新增模型配置成功
  □ 测试连通性成功
  □ 发起单 Agent 对话看到流式回复
  □ 刷新页面后对话历史可见

□ L2 多 Agent 验收
  □ 创建讨论房间（3 角色 + 3 轮）
  □ 讨论轮次正常执行，各 Agent 依次发言
  □ 每个 Agent 发言不同
  □ 结束后可见讨论记录
  □ 讨论记录持久化（关闭重开验证）

□ L3 完整流验收
  □ 新建模型 → 测试通过 → 发起对话
  □ 单 Agent 对话 → 多 Agent 讨论
  □ 切换回看历史对话和讨论
  □ 策略知识库页面展示 8 个策略文档
  □ 所有数据持久化（关闭重开验证）

□ 非功能验收
  □ .env 不被 git 跟踪
  □ 数据库文件自动创建，WAL 模式生效
  □ 无可执行 `.sh` 文件（Windows 兼容）
  □ Vite proxy 支持 SSE（不缓冲、不截断）
  □ 所有 AI 回复页脚标注免责声明
```

---

## 附录 B：关键架构决策记录

| 决策 | 选型 | 备选 | 理由 |
|------|------|------|------|
| 项目位置 | `E:\Code_file\Projects\finquant-hub` | Claude_Code 日期目录内 | 隔离 git 仓库，不让脚本归档混入量化系统代码 |
| 数据库 | SQLite + aiosqlite | SQLAlchemy + Alembic | MVP 零部署成本，2 表足够简单，不上 ORM |
| LLM 客户端 | 自定义 httpx 封装 | LiteLLM / LangChain | 零额外依赖，30 行代码解决，故障定位快 |
| 多 Agent 模式（MVP） | 轮序串行独立陈述 | Phase2/Phase3 阶段协议 | 3 阶段协议需 2-3 天完整实现；MVP 轮序已满足功能验收且串行调试简单 |
| 多 Agent 模式（V2） | 3 阶段协议（交叉质询+收敛表决） | — | 结构化辩论是核心价值，V2 必须恢复 |
| 前端行情 | Vite dev proxy 转发 | 后端代理行情 | 复用现有 stockApi.ts 无需改动，零跨域问题 |
| 角色提示词 | 硬编码 + 可编辑 | 外部文件加载 | 硬编码预置保证开箱即用，DB 存储支持用户自定义 |
| 消息渲染 | 普通 overflow scroll | 虚拟滚动（react-virtual） | SSE 流式渲染与虚拟滚动行高管理冲突，V2 再优化 |
| 指标计算 | numpy + 自定义函数 | talib / pandas-ta | numpy 已列依赖，轻量够用；talib C 扩展在 Windows 安装易出问题 |
| System Prompt 遵从 | 合理努力，不保证严格一致 | — | 实测 DeepSeek 对长 Prompt 遵从度不稳定（如角色风格差异不够明显），验收标准按合理努力判定 |
| SSE 依赖 | sse-starlette | 手工 StreamingResponse | sse-starlette 提供标准 SSE 事件类型封装，减少手写 bug |

---

## 评审说明

本文档根据评审意见进行了修订。以下说明针对未采纳或不完全采纳的意见：

1. **financial_rigor.py 孤立资产**（Review 1 Issue 3）— 该文件定位为工具库，由 Chat/Discussion 服务的 Agent 在数值计算场景中调用。它不是独立功能需求，不需要额外的功能 ID 映射。已在 2.1 中添加了用途说明。

2. **6 角色中 quant/macro/sentiment 三条 System Prompt 编码时间未分配**（Review 1 Issue 6）— 所有 6 个角色提示词统一在 `prompts/roles.py` 中实现，编码工作量与 3 角色差异不大（共享模板结构，差异主要在方法论描述）。M3 里程碑已改为"6 个预置角色"。

3. **指标面板渲染复杂度被低估**（Review 2 Issue 8）— 承认 lightweight-charts 多面板渲染有一定复杂度。MVP 阶段指标面板采用精简实现（仅展示主指标线型，不实现交叉线联动等高级交互），控制在可接受范围内。

4. **reference 仓库被完整 clone 的诱惑风险**（Review 2 Issue 12）— 这属于团队纪律问题而非需求文档缺口。PRD 已明确声明"不复制代码只提取思路"，开发需自觉遵守。

5. **后端无 CORS 生产 fallback**（Review 2 Issue 16）— MVP 通过 Vite dev proxy 同源访问，不需要 CORS。生产部署场景尚未进入范围，与 CORSMiddleware 相关的改动归入 V2 议程。

6. **role/preset 跨 API 一致性**（Review 2 Issue 11）— DeepSeek 对长 System Prompt 遵从度不稳定的风险已被承认。验收标准中的"回复风格明显不同"解释为合理努力，不对严格一致性做硬性承诺。已在附录 B 记录此风险。