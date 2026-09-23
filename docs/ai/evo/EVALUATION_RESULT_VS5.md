# EVALUATION RESULT — VS-5（文档引导纠正）

- 被验对象：commit `eecc603`（纯文档：QUICKSTART / README 首入口 / PRD §9.2 改推站内「设置 → 模型管理」）
- 评估者：EVALUATOR（独立核验，只读代码 + 少量 git/grep）
- 结论：**REJECT（窄口径）** — 主体方向与三项核心事实成立，但 PRD 中仍存在与代码事实直接冲突的陈述（含本条新增句子），且正是本卡要求核验的第 2、4 项。

---

## 一、通过项（代码事实核对，均有行号证据）

| # | 文档主张 | 代码事实 | 判定 |
|---|---|---|---|
| 1 | 凭据自动持久化、重启无需重填 | `credential_store.py:29-47` `_master_key()`：非 production 时在 `config.DB_PATH.parent`（= `backend/data/`，`config.py:28`）以 `O_EXCL` 自动创建 `.credential-key`，已存在则 `read_text()` 复用（:39-40，代码注释 "across restarts"）；`config.py:51` `APP_ENV` 默认 `development`；`config.py:53` `MASTER_KEY` 默认空 | ✅ 属实 |
| 3 | 站内 UI 路径真实存在 | `i18n/zh.ts`：`models.title`=模型管理(:2275)、`models.action.new`=新增模型(:2271)、`models.form.fetchModels`=拉取模型列表(:29)、`models.action.test`=测试(:2268)、`models.action.setDefault`=设为默认(:2269)；`App.tsx:116` 定义 `/models`（`nav.settings.models`），`:326` 挂载路由 | ✅ 属实 |
| 3b | 「配置后立即生效、无需重启」 | `models_crud.py:86,101` 保存即写库；`model_router.py:35-39` 每次取数实时解析 `user_credentials` → 生效无需重启 | ✅ 属实 |
| 5 | `.env` 进阶路径完整保留 | QUICKSTART.md:72 保留「记事本编辑 `backend\.env`」「重启才生效」「不要变成 `.env.txt`」；README.md:69 保留 `.env` 进阶句 | ✅ 属实 |
| 6 | 零代码改动 | `git show --stat eecc603`：9 个文件全部为 `.md`，无 `.py/.ts/.tsx/.js/.json` | ✅ 属实 |

## 二、冲突项（REJECT 依据）

### C1. `docs/PRD.md:543` — 新增句子断言了不存在的迁移机制（与第 2 项核验冲突）
文档：「也可写入 `backend/.env`…**启动时读取并在启动流程中迁入加密凭据表**」。
代码事实：`migrate_legacy_model_api_keys`（`credential_store.py:156-176`）的数据源是 **`model_configs.api_key` 这一数据库列的旧明文**（:160-164 `SELECT id, user_id, provider, api_key FROM model_configs WHERE … api_key<>''`），迁完置 `api_key=NULL`（:172-175）；`main.py:79` 启动调用它。`.env` 的 `DEEPSEEK_API_KEY`（`config.py:22`）**从不写入 `user_credentials`**：它是请求时由 `model_router.py:38-39` `os.getenv(cfg["api_key_env"])` 现读（种子行 `database.py:2242-2247` 只写 `api_key_env='DEEPSEEK_API_KEY'`，`api_key` 为空，故迁移函数不会命中）。全仓 `put_credential` 调用点仅 3 处：`credentials.py:35`、`models_crud.py:86/101`（UI 粘贴）、`credential_store.py:166`（旧明文迁移），**无任何 env → 加密凭据的路径**。
结论：`.env` 路径**有效**（属实），但「启动迁入加密凭据表」**不属实**。用户可能误以为 `.env` 里的 key 已被加密托管而继续把明文留在 `.env`。

### C2. `docs/PRD.md:545` — 同一节内残留与被改句子自相矛盾的旧表述
文档：「架构预留加密字段接口（**后续可加 Fernet 对称加密**）」。
代码事实：Fernet 加密**已实现并在用**（`credential_store.py:55-58` `encrypt_value`、`auth.py`/`AUTH_DESIGN.md:128`、`models_crud.py:86`）。该行紧邻已改正的 :542/:544，形成同节自相矛盾。

### C3. `docs/PRD.md:276` — 与本次修正直接对立的旧「明文」表述仍存在（第 4 项核验冲突）
文档：`api_key TEXT, -- 或直接存 key（**明文，MVP 接受**）`。
代码事实：该列自 BACKLOG-036 起为 Fernet 密文（`credential_store.py:55-58`+`models_crud.py:86`）。
本卡第 4 项要求「确认 QUICKSTART / README / PRD 无『明文』之类旧表述」——PRD:276 命中，未清除；同文件 §9.2 已改而 §7 schema 注释未改，读者会得到相反结论。

### 非阻塞观察（不构成 REJECT）
- `README.md:42`（Docker 路径段，非本次「首入口」范围）仍写 AI「需要在 `.env.local` 配置 `DEEPSEEK_API_KEY`」，与站内模型管理同样可用的现状不一致，建议后续统一。
- 「重启后可能需要重新填写」字样确已从 QUICKSTART/README/PRD 清除（grep 仅命中 QUICKSTART:70 的新正向句「重启后不需要重新填写」），此项通过。

## 三、要求的修复（各一行）
1. `docs/PRD.md:543`：删除「并在启动流程中迁入加密凭据表」，改为「由运行时按 `api_key_env` 从环境变量读取，**不写入加密凭据表**」。
2. `docs/PRD.md:545`：删除或改写为「凭据加密已落地（Fernet，`credential_store`）」。
3. `docs/PRD.md:276`：把注释改为「Fernet 加密存储（见 §9.2）」。

修复后仅需复检：三项 grep（`明文，MVP 接受`、`后续可加 Fernet`、`迁入加密凭据表`）应均为 0 命中，即可转 ACCEPT。

## 四、方法与边界
只读核验：`git show eecc603`（含全量 diff）、`credential_store.py`、`config.py`、`main.py:66-100`、`model_router.py:28-45`、`database.py:2236-2250`、`models_crud.py`、`i18n/zh.ts`、`App.tsx`；未修改任何文件（新增本报告除外）；未执行运行时/测试（环境 429 限流，且本卡为纯文档判定，代码事实可由静态证据唯一确定）。

---

# 复评结论（第二轮，2026-08-31）

- 被验对象：`docs/PRD.md` 三处修复（对应上轮 C1/C2/C3）
- 复核方式（极简）：`docs/PRD.md:265-284`、`:530-559` 定点阅读 + 1 条 `Select-String` + 2 条定点 grep 验证迁移机制
- 结论：**ACCEPT**

## 逐项核对

| # | 上轮要求 | 现状 | 判定 |
|---|---|---|---|
| 1 | `:543` 改为 env **现读**、**不写入加密凭据表** | 「该 key 由运行时按 `api_key_env` 从环境变量**现读**，**不写入加密凭据表**」，已无「启动迁入」字样 | ✅ |
| 2 | `:545` 改为加密**已落地**（Fernet） | 「凭据加密**已落地**（Fernet 对称加密，见 `backend/app/services/credential_store.py`），不再处于"预留接口"阶段」 | ✅ |
| 3 | `:276` 去掉「明文，MVP 接受」 | 现为「历史列：Fernet 加密存储，启动时迁入凭据表（见 §9.2）」 | ✅ |
| 4 | 三条旧表述 grep 0 命中 | `Select-String -Path docs/PRD.md,docs/QUICKSTART.md,README.md -Pattern '明文，MVP 接受\|后续可加 Fernet\|迁入加密凭据表'` → **MATCHES=0** | ✅ |
| 5 | 未引入新事实错误（迁移机制描述） | `credential_store.py:156-176` `migrate_legacy_model_api_keys`：`SELECT id, user_id, provider, api_key FROM model_configs WHERE user_id IS NOT NULL AND api_key<>''` → `put_credential(...)` → `UPDATE model_configs SET api_key=NULL`；`main.py:20` 导入、启动调用——与「启动时迁入凭据表」一致；`model_router.py:38-39` `os.getenv(cfg["api_key_env"])` 现读亦与 `:543` 一致 | ✅ |

## 非阻塞备注（不影响 ACCEPT，且不要求本轮再改）

`PRD.md:276` 的「Fernet 加密存储」措辞沿自上轮我的处方原文（见本文件 §三.3），并非实现者新引入；严格地说，该历史列在迁移前**自身是明文**（`credential_store.py:157` docstring: "Move legacy plaintext model keys into encrypted storage, then clear the source"），加密发生在迁入 `user_credentials` 之时。若后续顺手统一，可写为「历史列：旧明文 key，启动时迁入加密凭据表后置空（见 §9.2）」。此为措辞精度问题，不构成与代码的事实冲突。

## 边界

本轮只读：`docs/PRD.md`（定点）、`backend/app/services/credential_store.py`（:150-176）、1 条 grep；除本报告追加段外未改动任何文件。
