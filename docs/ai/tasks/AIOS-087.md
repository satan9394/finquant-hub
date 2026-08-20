# AIOS-087 - Local OSS 公开树测试合同可移植性

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

同一套 backend 测试既能在包含私有 WQ 扩展目录的开发树运行，也能在只含项目自有 PARTIAL starter、且不发布公网 Compose 的 Local OSS clean clone 中运行；测试不把私有资料或未支持的公网部署面误当成开源安装前置。

## 前置

AIOS-086 已完成；AIOS-085 clean-clone 全量 pytest 实测 529 passed/7 failed、coverage 84.16%，失败均来自公开边界与旧测试假设不一致。

## 允许修改

- `backend/tests/test_alpha_service.py`
- `backend/tests/test_alpha_search.py`
- `backend/tests/test_security.py`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/tasks/AIOS-085.md`
- `docs/ai/tasks/AIOS-087.md`

## 禁止修改

- 业务代码、数据库/schema、Docker/Compose、依赖、CI、`reference/`、WQ JSON、LICENSE
- 删除测试以制造绿灯，或把 starter 描述成完整 WorldQuant catalogue
- commit、push、发布、部署或外部写操作

## 完成标准

- Alpha 测试依据版本化 catalogue metadata 验证 `BUNDLED_EXTERNAL/OK/UNKNOWN` 或 `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`，空搜索上限不得假设可用字段一定大于上限。
- 私有开发树存在公网 Compose 时继续验证 TLS/backend-private 合同；公开 Local OSS 树缺少该未支持文件时明确 skip，不能伪装为执行通过。
- 私有树 focused 与无 WQ/无公网 Compose 的独立公开树 focused 均通过；Ruff、diff check 通过。
- 完成后 AIOS-087 为 DONE，AIOS-085 恢复为唯一 READY。

## 验证声明

公开树的 skip 只表示公网部署 Compose 不属于 Local OSS v1 发布物；不构成公网部署或 TLS 验证。starter 测试不是 WorldQuant/BRAIN 真实上游验证。

## 完成证据

- 私有开发树 focused：23 passed；Ruff 通过。
- 独立公开树 focused：22 passed、1 skipped；skip 原因为公网部署 Compose 刻意不属于 Local OSS v1，local Compose 安全合同仍执行通过。
- 公开 fixture 保留于 `C:\Users\Satanchen\AppData\Local\Temp\finquant-hub-aios087-public-20260813142220-a866d3`；未修改业务代码、Compose、依赖、数据库或 `reference/`。
