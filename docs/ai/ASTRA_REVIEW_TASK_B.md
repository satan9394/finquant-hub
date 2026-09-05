# 审查任务书 B — GPT-6 Astra 前端 UI / 设计审查（FinQuant Hub）

> 执行模型：OpenAI GPT-6 Astra（Codex 应用内选 **GPT-6 Pro / Astra**，推理档位 **High**；若要完整重设计示范可临时升 xhigh/max，注意 Plus 配额消耗极快）
> 本文件**只供会话 B（UI 审查）使用**；会话 A（架构审查）用 `ASTRA_REVIEW_TASK_A.md`。
> 只读审查：**不 commit / 不改任何文件 / 不新增依赖 / 不删除**。完成后只贴结论文本。

---

## 0. 项目背景（速览）

- **FinQuant Hub**：本地部署的中文金融量化研究系统，**目标用户 = 中文非技术个人投资者**（评审以中文用户体验为准绳）。
- 前端：React 18 + AntD 5 + lightweight-charts + echarts（按需），纯 CSR，Vite dev / FastAPI 静态托管 prod。Design System v1.0（`--fq-*` CSS 变量 + 8 个 AI-native 共享组件）。i18n zh/en。8 个页面组：今日工作台 / 研究工作区 / 机会发现(+涨停池) / 策略实验室 / 组合与风险 / 持续监控 / 资料库 / 设置(系统工具)。
- 设计权威：`docs/DESIGN_SYSTEM_V1.md`、`docs/UI_PRODUCT_SPEC.md`、`docs/ai/FinQuant_Frontend_Component_Inventory.md`。

---

## 1. 档位语义

- `reasoning.effort` 官方五档：low / medium / high / xhigh / max（API 默认 low；深度思考须显式选高档）。本任务选 **high**——在 Plus 配额约束下平衡设计质量与消耗（xhigh/max 实测几分钟即耗尽日额度）；Astra 前端最强态在 max，若你对某页想看"完整重做示范"且配额允许可临时升档。
- 只读审查，不涉及任何敏感操作。

---

## 2. 读（按序）

1. `docs/DESIGN_SYSTEM_V1.md`（`--fq-*` tokens、8 个 AI-native 组件、明/暗主题、1440×900 基准）、`docs/UI_PRODUCT_SPEC.md`、`docs/ai/FinQuant_Frontend_Component_Inventory.md`
2. `frontend/src/App.tsx`（导航分组/路由/明暗切换/布局）、`frontend/src/i18n/zh.ts` 与 `en.ts`（文案）
3. 样式与 token 定义：`frontend/src/**/*.css` 中 `--fq-*` 变量（找出处，通常全局/主题 css）
4. 抽查页面（选 4-6 个）：`frontend/src/pages/Dashboard.tsx`（今日工作台）、`ResearchWorkspace.tsx`、`StrategyLab.tsx`、`Portfolio.tsx`、`Discover.tsx`、`Knowledge.tsx`、`Settings.tsx`
5. 代表性组件：`frontend/src/components/`（TaskPageHeader、EvidenceRail、MoneyFlowChart、ChipHistoryChart、MonitorCard、DecisionCard 等）

---

## 3. 任务

1. **设计系统一致性**：抽查 token 使用是否统一、明/暗主题是否完整、**新旧色值是否仍有残留**（历史 known debt：老硬编码色 `#dce5ef` / `#1890ff` 未迁完，给出现状证据）。
2. **审美与视觉层次**：诚实评价——信息密度、层级、留白、图表配色、中文排版；指出最影响观感/信任感的 1-3 处。
3. **可用性与非技术友好**：术语是否过专业、空/错误/加载态是否友好、核心路径（输入股票代码 → 看到研究报告/回测结果）是否顺畅；对"双击 start.bat 就能用"的非技术用户有无障碍点。
4. **若由你重做**：对最想改进的 1-2 处给**具体到组件/token 层**的改法（不是泛泛"更现代"），可含简化的结构示意。

---

## 4. 输出格式（完成后贴回）

```
## 会话 B 结论
### B1 设计系统一致性（token/主题/残留色，含证据文件:行）
### B2 审美与视觉层次（诚实评价 + 最影响观感的 1-3 处）
### B3 可用性与非技术友好（问题-证据-建议）
### B4 若我重做（1-2 处具体改法，组件/token 级）
### B5 诚实声明（只读、未改文件、未 commit；无把握处标注"待核"）
```

## 5. 纪律

- 只读：不改文件、不 commit、不新增依赖、不删除；无需起服务（以源码文本对照为主；图/HTML 可开浏览器目检但非必需）。
- 诚实：找不到的问题不编造；证据一律 `文件:行`；不确定标注"待核"。
- 发现**真实 bug**（如残色、主题断裂、文案不通）：记录（含证据）但不修，由维护者决定是否开 BACKLOG。
