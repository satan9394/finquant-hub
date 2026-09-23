# PROD-065: 文档、截图、API 合同和发布清单同步

> 状态：`[DONE]`  
> 阶段：Productization Phase 6

## 用户问题

代码与回归通过后，发布仍可能因文档数字、路由清单、数据源说明、截图和任务状态漂移而不可复现。Phase 6 最后一项工作是把权威文档与当前实现和已保存证据对齐，而不是再增加产品功能。

## 目标行为

核对架构/API/路由/数据源、产品化计划、能力矩阵、任务卡和截图索引；所有完成声明能指向当前代码或可重复命令，所有实时失败和已知限制保持当前事实。

## 范围内文件

- `docs/ARCHITECTURE.md`、`API_CONTRACT.md`、`ROUTER_MAP.md`、`DATA_SOURCES.md`
- `docs/ai/PRODUCTIZATION_PLAN.md`、能力/指标/可用性文档、`EXEC_PLAN.md`、任务卡
- `artifacts/productization/` 的证据索引或发布清单
- 仅为文档核对所需的只读 OpenAPI、路由、schema、测试和构建探针

## 明确非目标

- 不新增或重构产品功能，不改变 API、schema、算法或数据源。
- 不把 mock/E2E 样本描述为实时市场数据。
- 不把当前 Yahoo/AkShare 失败改写为“已验证成功”，不删除 UNKNOWN/限制。
- 不修改 `reference/`，不提交、发布或发送。

## 同步清单

- 架构数字、APIRouter、OpenAPI 路径/操作、schema version/表数与运行时一致。
- 路由和 API 合同包含当前产品入口与主要能力，不引用已删除路径。
- 数据源优先级、代理规则、回退、复权、期间和失败状态与服务实现一致。
- Phase 0–6 任务状态、测试数字、截图路径和剩余限制可核验。
- 最终发布清单明确已通过门槛、当前上游失败、未提交/未发布状态和回滚边界。

## 测试与验收

- 运行只读 OpenAPI/schema/路由统计和针对性 `rg` 漂移检查。
- 检查所有引用的截图/JSON/Markdown 证据存在且关键 JSON 可解析。
- 运行最终后端 pytest coverage、Ruff、完整前端测试、Playwright、生产构建和 `git diff --check`。
- 浏览器抽查最终三条核心旅程与关键限制，不触发写入。

## 完成定义

- 权威文档和产品化文档没有已知数字、路由、来源或状态漂移。
- Phase 0–6 的关键证据可定位，实时与 mock 证据边界明确。
- 最终工程门槛全部通过；外部上游失败作为发布限制记录而非伪成功。
- 未执行提交或发布，工作树中的用户既有改动保持不动。

## 回滚方式

恢复本任务的文档/索引同步；不回滚已验证的产品代码或删除历史证据。

## 完成记录（2026-08-09）

- 运行时事实已复核：105 个 `/api/*` OpenAPI 路径 / 134 个 HTTP 操作，23 个 APIRouter，schema v11 / 35 个逻辑表（40 个物理表含 5 个 FTS shadow table），18 个懒加载页面 / 19 个明确产品路径和 1 个回退路由。
- `ARCHITECTURE`、`API_CONTRACT`、`ROUTER_MAP`、`DATA_SOURCES`、产品化总纲、能力矩阵、执行计划和任务卡已对齐当前代码。Tencent/Sina/Yahoo 的角色、基本面期间/质量合同和 provider failure / `circuit_open` 边界均保留当前事实。
- 任务卡引用的 39 个证据路径全部存在；3 个 JSON 可解析，93 张产品化图片非空。四组未保留的历史截图引用已改成可重复验证说明，没有创建伪造的历史文件。
- 最终只读浏览器抽查覆盖 600519 研究、已保存策略入口和真实组合：0 写请求、0 page error、0 文档级横向溢出；研究继续显示 Tencent/Sina、`UNKNOWN` 与 AkShare/Yahoo 失败，未运行回测或组合模拟。
- 完整门槛：后端 392 passed / 83.51% coverage；Ruff 通过；mypy 107 个 source files 通过；前端 47 files / 121 tests；Playwright 11 passed；TypeScript/生产构建 4,187 modules 通过；`git diff --check` 通过。
- 发布清单与最终截图：`artifacts/productization/phase6/PRODUCTIZATION_RELEASE_CHECKLIST.md`、`artifacts/productization/phase6/prod065-final-research-readonly.png`、`artifacts/productization/phase6/prod065-final-strategy-readonly.png`、`artifacts/productization/phase6/prod065-final-portfolio-readonly.png`。
- 当前 A 股基本面与 HK/US Yahoo 能力的真实上游失败继续作为发布限制；未提交、推送、部署、发布或发送，既有脏工作树保持不动。
