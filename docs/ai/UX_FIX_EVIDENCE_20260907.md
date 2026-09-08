# UX 修复证据 — 2026-09-07

任务来源：`UX_ISSUES_20260907.md` 与用户三块修复指令。初始工作树干净。

## 1. 模型供应商配置

- 改动：`backend/app/models.py`、`routers/models_crud.py`、`services/llm_client.py`、`services/credential_store.py`；`frontend/src/pages/Models.tsx`、`i18n/{zh,en}.ts`、生成的 OpenAPI 类型。
- URL：Base URL 契约，完整 chat endpoint 自动识别；全部聊天调用复用，不二次拼接。
- Key：复用现有加密凭据表，直接填值优先，环境变量退为高级兼容。无新表/迁移/依赖。未配置 MASTER_KEY 的开发模式将本地密钥保存在数据库旁 `.credential-key`，重启仍可解密；旧临时密钥加密的数据需要重新保存。
- 模型列表：`POST /api/models/discover` 使用未保存表单值；上游失败/不支持时可手填；用户隔离、错误片段脱敏。
- 确定性覆盖：`backend/tests/test_model_ux.py`（MockTransport URL/列表/权限/脱敏/持久化）；`test_credentials.py`（CRUD 密钥生命周期）；`frontend/tests/ModelsForm.test.tsx`（真实表单直接 Key/拉取失败手填）。
- 第一轮：backend 865 passed / 92.57%；ruff PASS；build PASS；4173 E2E 50/50、8000 E2E 21/21（两者 `--retries=0`）。聚焦 backend 31 passed，但全库 coverage 默认阈值令聚焦命令退出 1；全量覆盖率已通过。
- 前端全量及补充 CRUD 测试复核：进行中。首轮与其他门禁重叠执行，Thesis/Alerts 出现超时，保留原始输出后串行复核。
- 日志：`output/ux-model-{backend,build,vitest,e2e4173,e2e8000}.log`（本地忽略产物）。

## 2. Discover 与涨跌停术语

- 改动：`frontend/src/pages/Discover.tsx`、`components/DiscoverThemes.tsx`、`pages/LimitPool.tsx`、中英文字典；默认语言在 `i18n/index.ts` 明确为中文，仍尊重已保存的英文选择。
- 无输入展示明确标为示例的三家公司，点击后请求真实筛选数据；未执行查询时不渲染空结果卡。示例不冒充今日热门或投资推荐。
- 无代码的公司名/拼音查询先调用既有 `/market/search`，将返回代码交给 `/screening`。不宣称支持任意全市场语义筛选；搜索失败明确提示且不制造股票。
- 接入现成 `/market/themes`：可输入细分行业/概念，展示供应商归类、成分公司研究链接、来源/时间/partial 状态，按行业/概念筛选。
- 涨停/跌停解释及封单额、连板数、炸板次数、涨停统计释义；沿用指标知识卡“读法/用途/误区”结构，支持鼠标、点击、键盘聚焦；买单与卖单按池类型区分。
- 确定性 UI 回归：`DiscoverUX.test.tsx`、`LimitPool.test.tsx`、`I18n.test.tsx`。相关聚焦回归已通过；最终累计全量门禁进行中。

## 3. 导航收口

- 改动：`components/ModelSelector.tsx` 移除不驱动研究路由的全局模式选择；`AgentModeSelector.tsx` 为研究页内模式增加可访问名称。保留全局高级模型覆盖功能。
- 路由能力继续由 `/research` 内的现有 Fast/Deep/Review/Thesis 工作面承接，旧路由重定向保留。
- `ModelSelector.test.tsx` 验证全局无重复入口；`ResearchModeRouting.test.tsx` 新增从快速切到深度/审查仍保留公司上下文的交互断言。相关聚焦回归已通过；最终累计全量门禁进行中。
- 旧 `modelStore.researchMode` 持久化字段现无 UI 消费者，本次保留兼容数据，不做额外清理。

## 边界与提交

- 未改 E2E 文件或 Playwright 配置；无新依赖、无文件删除、无 schema 迁移。
- 8000 原服务由本项目 `.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000` 启动。用户明确授权临时停止并在全部测试后恢复。
- 未 commit/push；三块各自记录文件与验证结果，准备独立提交。共享 i18n/日志文档按对应块分段提交。

独立提交顺序（均未执行 commit）：
1. `fix(models): simplify provider setup and model discovery`：模型后端五文件、模型页、`models.*` 字典变更、生成类型、后端两测试文件与 ModelsForm 测试，以及 API/Router/Architecture 凭据说明。
2. `fix(discover): add company and sector discovery with plain-language explanations`：Discover/DiscoverThemes/LimitPool、`discover.*`/`limitPool.*` 字典、中文默认与 I18n/DiscoverUX/LimitPool 测试。
3. `fix(navigation): keep research modes inside the research workspace`：ModelSelector/AgentModeSelector 及 ModelSelector/ResearchModeRouting 测试。
共享交接/证据/CHANGELOG 文档按上述三块分段记录；不需把三块业务代码混成单个提交。

## 最终门禁（冻结版本）

- Backend：`backend/.venv/Scripts/python.exe -m pytest -q` → **868/868，coverage 92.59%**，147.88 秒。
- Ruff：`backend/.venv/Scripts/python.exe -m ruff check .` → **PASS**。
- i18n：**zh/en 各 2320，重复 0，parity 0**。
- 当前 OpenAPI 导出实证：**136 API paths / 170 operations**，与 API/Router/Architecture 文档一致。
- Build：**PASS**（4244 modules，42.97 秒）。
- 4173 E2E：**50/50，零重试**（1.1 分钟）。
- 8000 E2E：**21/21，零重试**（57.1 秒）。
- 队列退出码：backend/ruff/build/4173/8000 均为 0，见 `output/ux-final-gate-status.json`。
- 原 8000 API 服务已按原命令恢复；`/api/health` 返回 `status=ok, db=wal`。原命令不启用静态前端，`/models` 返回 404 API JSON 是原服务配置，不代表前端路由缺失；静态前端已由 8000 E2E 的 SERVE_FRONTEND 配置验证。
- 冻结代码全量 Vitest：执行中。日志 `output/ux-frozen-vitest.log`。
- 早期全量前端出现超时及语言测试失败，其间源码有修改，因此不当作冻结快照通过证据。Thesis/Alerts 等 29 项聚焦回归通过；语言默认 2/2 独立通过。最终采用冻结代码、串行门禁结果。
