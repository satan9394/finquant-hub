# BACKLOG-028 — 标的代码输入契约收口（canonical ticker）+ 8000 真实入口验收

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-04 ｜ 完成：— ｜ 执行者：Codex
> 背景：CLAUDE.md known debt #1"canonical ticker normalization 与 provider-specific external_symbol() 边界需收口"。维护者 2026-09-04 用只读探针跑样例矩阵**实锤三处真实破损**（非理论猜测）：
> 1. **同一美股两种输入 → 两个内部码**：`BRK.B`→`usBRK.B`、`BRK-B`→`usBRK-B`，伯克希尔同标的分裂成两个 canonical。现有 `backend/tests/test_market.py` L48 竟把 `("usBRK.B","usBRK.B")` 当正确固化。存库（quant_backtests.symbol、alerts.ticker 等）、搜索回显、研究/组合/预警跨页关联会因输入形态不同而对不上同一标的。
> 2. **A 股 6 位非 6/68/0/3 开头被静默默认 sh**：`detect_market` L112 `return "sh"` 把北交所/老三板/新代码段（`830799`/`920002`/`430047`）静默当上交所股票，可能查错股。数据源矩阵（腾讯/东财/Sina A股 sh/sz、HK/US Yahoo、akshare/tushare/yahoo 基本面）**无 bj 数据源**，故正确方向是**诚实拒绝**（报"暂不支持该代码段"），而非扩源或伪造。
> 3. **前端 4 处重复 ticker 逻辑漂移**：`researchContinuity.tickerKey`（含 `bj` 前缀但纯 6 位一律 CN，与后端 sh/sz 划分不同步）、`globalTaskEntry.isLikelyTicker`（无点符号美股、无 4 位港股）、`Alerts.displayTicker`（无 bj）、`backtest/request.TICKER_PATTERN`（抽取器）。四处**用途不同**（key/探测/显示/抽取），不可乱合并，但 canonical 规则应同源。

## 目标

建立**唯一 canonical ticker 契约**（前后端同规则）：①修 canonical 分裂（BRK.B/BRK-B 等点连字符同标统一）；②6 位非 6/68/0/3 开头诚实拒绝不再静默默认 sh；③后端 normalize/external/_yahoo 契约矩阵单测固化；④前端 key/探测/显示收敛到同一 canonical 纯函数（抽取器保持独立但复用 canonical 后校验）；⑤研究/组合/预警/回测输入各格式标的的 8000 真实入口 E2E 验收（含 BRK.B↔BRK-B 同一标的、不支持代码段诚实提示）+ 全量门禁。

## 允许修改

### 后端
- `backend/app/services/market_data.py`：`normalize_code`/`detect_market`（canonical 规则 + 诚实拒绝；`_yahoo_symbol` 若受 canonical 影响则同步，否则不动）
- `backend/app/services/instruments.py`：`external_symbol`（若 canonical 形态变化需同步其映射）
- 同步 `backend/tests/test_market.py`（**必须改** L48 `("usBRK.B","usBRK.B")` 旧断言为统一后形态）、`backend/tests/test_market_fallback.py`、`backend/tests/test_instruments.py` 中受影响的既有断言（只改受影响项，不放松语义）
- **新增**契约矩阵测试（可在上述文件或新建 `test_ticker_contract.py`）：全边界样例 → 期望 normalize/external/yahoo 三元组

### 前端
- **新建** `frontend/src/features/tickerContract.ts`（共享 canonical 纯函数：市场前缀归一 + 点连字符统一 + 不支持代码段标记；与后端 normalize_code 规则一致）
- 收敛调用方到共享函数（**保持各函数用途语义不变**）：
  - `frontend/src/features/researchContinuity.ts`（tickerKey/sameTicker 复用 canonical）
  - `frontend/src/features/globalTaskEntry.ts`（isLikelyTicker 探测逻辑对齐但不放宽误报）
  - `frontend/src/pages/Alerts.tsx`（displayTicker 显示转换复用 canonical 前缀解析）
  - `frontend/src/features/backtest/request.ts`（抽取器**不改正则语义**，仅抽取结果过 canonical 校验/归一）
- 对应前端测试文件同步/新增（`researchContinuity.test.ts`、`globalTaskEntry.test.ts`、新增 `tickerContract.test.ts` 等）

### E2E（8000 真实入口）
- `frontend/e2e-8000/product-acceptance.spec.ts` 或**新建** `frontend/e2e-8000/ticker-input.spec.ts`：≥4 用例覆盖 ticker 输入旅程（研究/组合/预警/回测入口输入 BRK.B 与 BRK-B 指向同一标的、600519 A 股正常、不支持代码段诚实提示、港股 .HK 输入）；沿用 026 的确定性夹具模式（拦截 /api，外网零依赖）

### 文档
- `docs/ai/tasks/BACKLOG-028.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/HANDOVER.md`（known debt #1 收口记录）、CLAUDE.md known debt #1 若收口则同步移除/标注

## 禁止修改

- 后端除 `market_data.py`、`instruments.py` 外一切业务文件（不得为北交所/新代码段**新增数据源适配**——本轮是 canonical 收口 + 诚实拒绝，不是扩源）
- 前端除上述 5 个收敛文件外一切（不得大改页面 UI/文案/i18n 语义——诚实提示文案可用现有 UNKNOWN/错误 key 或最小新增）
- `frontend/e2e/*`（4173 基线）、`frontend/playwright.config.ts`、`frontend/playwright.8000.config.ts`、既有 package 依赖/锁文件、`reference/`
- **不得**为"兼容"而把 `normalize_code` 放宽容错到接受任意输入（诚实拒绝优先）；不得删除文件；不得用 `channel: 'chrome'`；不得新增依赖
- 前端 4 处**不得无差别合并成一个函数**（key/探测/显示/抽取用途不同）——只收敛 canonical 规则层

## 完成标准

### 目标 1：后端 canonical 契约
- `BRK.B` 与 `BRK-B` 归一为**同一** canonical（选 Yahoo 形态 `-`：`usBRK-B`；external_symbol 展示可转回 `.` 或保持一致，由契约决定并写清）；`BF.B`/`BF-B` 同理
- 6 位非 6/68/0/3 开头（830799/920002/430047 等）：`normalize_code` **明确报错或返回明确不支持标记**，不再静默 `sh`；`detect_market` 同步
- 契约矩阵单测：全边界样例（A股 sh/sz/6位、港股 4-5位/.HK/前导零、美股 字母/点/连字符/数字、后缀 .SS/.SZ、大小写、空格、非法）→ 期望 normalize/external/yahoo 三元组，全绿
- 既有受影响断言同步（L48 等），语义不放宽

### 目标 2：前端收敛
- `tickerContract.ts` canonical 规则与后端一致（点连字符统一、市场前缀、不支持标记）；`researchContinuity.tickerKey` 与后端对同一输入给同一 key（含 BRK.B=BRK-B）；`isLikelyTicker`/`displayTicker` 复用且行为不劣化
- 前端单测新增/同步全绿（含 BRK.B↔BRK-B 同 key 用例）

### 目标 3：8000 真实入口 E2E
- ≥4 新用例：BRK.B 与 BRK-B 输入导向同一标的（mock 下断言同一 canonical 请求）；600519 正常研究旅程；不支持代码段（如 830799）诚实提示非查错股；港股 `00700.HK`/`0700` 输入归一
- 8000 套件（原 15 + 新用例）`--retries=0` 连跑 3 次全绿 + 代理关/开各 ≥1 次

### 目标 4：全量门禁零回归
- 4173 E2E 50/50、`bun run build`、Vitest 全量、backend pytest 798/798 + 覆盖率不降 + ruff、`git diff --check` 全绿；删除 0；依赖/锁文件零变化
- i18n zh/en parity 0（若加文案）

## 参考

- known debt：`CLAUDE.md`（#1 canonical ticker normalization）、`docs/HANDOVER.md`
- 现状与破损样例：`backend/app/services/market_data.py` L101-158（detect_market/normalize_code）、L164-174（_yahoo_symbol）；`backend/app/services/instruments.py` L19-26（external_symbol）；探针实测输出（维护者 2026-09-04：830799/920002/430047→sh 误判、BRK.B→usBRK.B vs BRK-B→usBRK-B）
- 前端四处：`frontend/src/features/researchContinuity.ts`（tickerKey L3-17）、`frontend/src/features/globalTaskEntry.ts`（isLikelyTicker L13-15）、`frontend/src/pages/Alerts.tsx`（displayTicker L84-89）、`frontend/src/features/backtest/request.ts`（TICKER_PATTERN L3）
- 既有测试：`backend/tests/test_market.py`（L43-51 TestNormalize，L48 旧断言待改）、`backend/tests/test_market_fallback.py`、`backend/tests/test_instruments.py`、`backend/tests/test_backlog007_targets.py`（settings/backtests normalize 相关 monkeypatch）
- 8000 E2E 模式：`frontend/e2e-8000/helpers.ts`、`product-acceptance.spec.ts`（mock fixtures + monitorBrowser + expectHealthyPage）
- 数据源矩阵：`docs/DATA_SOURCES.md`、`docs/HANDOVER.md` Market Data（无 bj 源 → 诚实拒绝依据）

## 完成证据模板（Codex 填写后交维护者复核）

```
- canonical 契约决策（点连字符统一形态、不支持段处理方式、external/yahoo 映射）——先写清再改
- market_data.py/instruments.py 精确 diff；前端 tickerContract.ts 与 4 调用方 diff
- 契约矩阵测试清单与全绿结果；前端单测新增/同步结果
- 8000 E2E 新用例清单与三连 + 代理开关结果
- 4173 50/50、build、Vitest、backend pytest+ruff（覆盖率）、i18n parity
- CLAUDE.md known debt #1 / HANDOVER 同步
- git diff --check、删除 0、依赖锁零变化
- 未 commit/push
```
