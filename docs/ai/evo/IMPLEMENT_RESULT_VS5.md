# IMPLEMENT_RESULT — VS-5：AI 首用配置引导一致性

> Implementer（Orchestrator 接管）｜ 2026-09-13 ｜ **待独立 Evaluator 质疑**

## 结论
把非技术用户首次启用 AI 的引导从"记事本手编隐藏 `.env`"改为**站内模型管理**为主路径；`.env` 降为进阶；并修正三处与代码事实不符的文档表述。**纯文档，零代码改动。**

## 改动（3 文件）
1. **docs/QUICKSTART.md**「首次配置 AI（可选）」重写：
   - 推荐路径 4 步：打开页面 → **设置 → 模型管理** → **新增模型**（选供应商、粘 Key、**拉取模型列表**选模型）→ **测试** + **设为默认**；
   - 说明凭据加密保存、**立即生效无需重启**、本地安装自动生成并复用密钥文件、**重启无需重填**、保管 `backend/data`；
   - `.env` 作为**进阶（可选）**保留（含 `.env.txt` 提醒与"重启生效"）；
   - **删除**原"未配置持久 MASTER_KEY 时重启后可能需要重新填写"的误导表述。
2. **README.md**：首入口引导同步为"网页模型管理为主 + `.env` 为进阶"。
3. **docs/PRD.md** §9.2 密钥管理：修正"API Key 存储在 backend/.env"（改为推荐站内加密存储 + .env 进阶）与**事实错误**"SQLite 中存储的 API Key 为明文"（自 BACKLOG-036 起为 Fernet 加密）。

## 事实核对依据（本次改动的证据）
- `backend/app/services/credential_store.py:29-47`：非 production 下自动创建 `.credential-key` 并**跨重启复用**（注释 "across restarts"）；`.env` 中的 key 由 `migrate_legacy_model_api_keys` 启动时迁入加密凭据。
- `backend/app/config.py:51`：`APP_ENV` 默认 `development` → 本地安装走持久化分支。
- UI 文案核对 `frontend/src/i18n/zh.ts`：`models.title=模型管理`、`models.action.new=新增模型`、`models.form.fetchModels=拉取模型列表`、`models.action.test=测试`、`models.action.setDefault=设为默认`。
- 未改动历史记录（`docs/ai/tasks/*`、`EXEC_PLAN` 历史、`RAW_*`）——保留当时原貌。

## 未解决问题 / 风险
1. 纯文档改动，无自动化测试覆盖；以独立 Evaluator 逐条比对文档/代码事实验收。
2. 若未来 Docker 路径与本地路径的密钥管理语义分化，本文档需再同步（当前两条路径均支持站内配置）。
3. QUICKSTART 提到的"拉取模型列表"依赖上游 `/models` 端点；部分供应商不支持时用户需手填模型名（文档已写"或手动填写"）。
