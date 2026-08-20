# PROD-026: 基本面/估值 P1 指标按真实数据可用性补齐

> 状态：`[DONE]`  
> 阶段：Productization Phase 2

## 用户问题

研究工作区只平铺当前提供方返回的原始字段，P1 估值、经营质量和偿债指标既缺少统一可用性视图，也无法区分真实返回、确定性派生和当前不可得。

## 目标行为

在不补造数据的前提下，展示完整 P1 基本面/估值矩阵。只接入提供方明确返回的 ROIC、ROA、速动比率、利息保障倍数，以及由兼容真实分子分母确定性计算的 CFO/净利润、FCF Margin、FCF Yield；其余指标保留 UNKNOWN 和所需数据说明。上游断连返回既有可解释错误，不泄漏 500。

## 范围内文件

- `backend/app/services/fundamentals.py`
- `backend/app/services/market_data.py`
- `backend/app/services/instruments.py`
- `backend/tests/test_fundamentals.py`
- `backend/tests/test_instruments.py`
- `frontend/src/features/fundamentalMetrics.ts`
- `frontend/src/components/research/FundamentalMetricsPanel.tsx`
- `frontend/src/pages/ResearchWorkspace.tsx`
- `frontend/src/types/research.ts`
- `frontend/tests/FundamentalMetricsPanel.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不从 PE、增长率或不完整报表猜测 EV/EBITDA、EV/Sales、PEG、杜邦、净负债/EBITDA 等指标。
- 不把单季度冒充 TTM，不跨不兼容报告期或币种计算比率。
- 不引入新数据供应商、密钥、依赖或数据库迁移。
- 不修改 `reference/`，不提交或发布。

## 验收

- P1 三组指标均显示真实值或 UNKNOWN，且未知状态说明缺少的必要字段。
- 可用指标区分提供方原值与确定性派生值，显示公式、来源、报告期和质量标记。
- CFO/净利润、FCF Margin、FCF Yield 只在真实组件兼容时计算；无效分母不返回数值。
- 上游 HTTP 断连转换为领域错误，工作区保留非基本面研究能力。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除 P1 面板和新增规范化字段/派生规则，恢复原基本面平铺；现有来源优先级、TTM 保护和 API 路由不受影响。

## 验证结果

- 测试先失败于 3 个后端合同和前端面板不存在；实施后基本面/统一标的 focused：23 passed，P1 面板与连续性 focused：2 files / 4 tests passed。
- 提供方明确字段可规范化为 ROIC、ROA、速动比率和利息保障倍数；CFO/净利润、FCF Margin、FCF Yield 仅由同来源、兼容期间/币种的真实组件确定性计算，并保留 components、methodology、source、period_type 和 as_of。
- 不兼容报告期的经营现金流与净利润不会产生比率；EV 倍数、PEG、股息率、杜邦和净负债/EBITDA 等缺少必要字段时保持 UNKNOWN。
- 实时 600519、00700.HK、AAPL 的所有当前基本面提供方均不可用，三个 API 均返回 502；不再因 Yahoo 传输断连泄漏 500。
- 实时 600519 页面显示估值、经营质量、偿债风险共 13 项 UNKNOWN 和逐项所需字段，未显示 `0.00%`；非基本面工作区、历史报告和跟踪能力仍可使用。
- 前端全量测试：28 files / 63 tests passed；`bun run build` 和 Ruff 通过。
- 后端全量：381 passed / 4 failed，coverage 83.21%；四项均由实时 AAPL/HK 行情上游不可用导致，其中两项研究测试在进入 mocked research 前解析 AAPL 行情失败，与本任务改动无关。
- 390×844 下三组指标单列，`scrollWidth=375 <= innerWidth=390`；证据：`artifacts/productization/phase2/18-p1-fundamentals-desktop.png`、`19-p1-fundamentals-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用既有三源优先级、TTM 保护和 unified instrument API，无新依赖或迁移。
