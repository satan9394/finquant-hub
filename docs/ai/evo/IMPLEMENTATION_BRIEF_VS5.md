# IMPLEMENTATION_BRIEF — Vertical Slice 5：AI 首用配置引导一致性（G-04 前置）

> Orchestrator 第五阶段产物，2026-09-13。来源：**第二轮审计 A2 的已核实 P0 候选**（`AUDIT_R2_PARTIAL.md`）。

## 目标
让**非技术用户**首次启用 AI 走**站内路径**（网页模型管理），而不是被文档引向"记事本手编隐藏 `.env` 文件"；同时修正文档中与代码事实不符的表述。

## 用户场景
非技术中文投资者装好 FinQuant Hub，想用 AI 研究报告（产品核心卖点）。他照 QUICKSTART 做，被要求：Ctrl+C 停服务 → 去 `backend` 文件夹 → 右键 `.env` → 记事本打开 → 找 `DEEPSEEK_API_KEY` → 替换 → 保存（且别存成 `.env.txt`）→ 再双击 start.bat。**而应用里其实有完整的「模型管理」页**（供应商预设、粘贴 Key、拉取模型、测试连通、设为默认），且凭据**自动持久化**。

## 当前问题（已核实证据）
1. `docs/QUICKSTART.md:63-68` 主推手编 `.env`（含 `.env.txt` 陷阱）；`docs/README.md:69` 同。
2. `docs/QUICKSTART.md:70` 原有表述称"网页保存加密凭据，未配置持久 `MASTER_KEY` 时，重启后可能需要重新填写"——**对本地场景属误导**：`backend/app/services/credential_store.py:29-47` 在非 production 下自动创建并**长期复用** `backend/data/.credential-key`（代码注释 "across restarts"），`app/config.py:51` `APP_ENV` 默认 `development`。
3. `docs/PRD.md:542,545` 仍写"API Key 存储在 `backend/.env`"与"**SQLite 中存储的 API Key 为明文**"——后者自 BACKLOG-036 起即为 **Fernet 加密**，属事实错误。

## 涉及模块（纯文档）
- `docs/QUICKSTART.md`（主改：AI 配置段改为站内优先 + .env 进阶 + 修正持久化表述）
- `README.md`（同步首入口引导）
- `docs/PRD.md` §9.2 密钥管理（修正过期/错误表述）

## 不能破坏
- 不删 `.env` 路径（仍是有效进阶方式，且 Docker/脚本依赖 `.env.example`）。
- 不改任何代码/配置/脚本；不动历史任务卡与审计记录（`docs/ai/tasks/*`、`EXEC_PLAN` 历史、`RAW_*`）——历史应保留原貌。
- 步骤描述必须与**真实 UI 文案**一致（已核对 zh.ts：`模型管理` / `新增模型` / `API 地址（Base URL）` / `拉取模型列表` / `测试` / `设为默认`）。

## 验收标准
1. QUICKSTART「首次配置 AI」：**站内 4 步路径为推荐**（打开页面 → 设置→模型管理 → 新增模型填 Key/拉取模型 → 测试+设为默认），并说明"加密保存、立即生效、重启无需重填"。
2. `.env` 作为**进阶替代**保留，且保留 `.env.txt` 提醒。
3. 删除/改正"重启后可能需要重新填写"的误导表述；PRD 修正"明文存储"错误。
4. README 首入口与 QUICKSTART 一致。
5. 文档步骤与真实 UI 文案一致（可核对 zh.ts 键值）。
6. 无代码改动、无删除；`git diff --check` 通过。

## 错误场景
- 用户仍选择 `.env` 路径 → 文档仍完整可用（不丢失该路径）。
- 用户不知道去哪配置 → 文档给出可点击 URL 与首页提示入口（LocalCapabilityBanner，BACKLOG-035b 已有）。

## 测试要求
纯文档：以**代码事实核对**替代自动化测试（credential_store 持久化、config APP_ENV、UI 文案键）；由独立 Evaluator 逐条核对文档与代码一致性。
