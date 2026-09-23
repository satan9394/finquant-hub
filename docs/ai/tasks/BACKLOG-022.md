# BACKLOG-022 — 前端死组件回收 + bundle 瘦身（echarts 移出主包）

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 完成：2026-09-03 ｜ 执行者：Codex
> 背景：维护者调研确认 3 个**真死组件**（全 src 宽匹配零外部引用）：`BacktestResultCard.tsx`（BACKLOG-021 移除 Chat 引用后无人用）、`MarketMoversPanel.tsx` + `MarketThemesPanel.tsx`（互为引用但无任何页面/组件 import）。这 3 个组件是**仅有的急切 `import ... from 'echarts-for-react'` 的文件**（`LazyEChart.tsx` 是 lazy 动态引入）——因此 echarts 6.1.0 全量被打进主 chunk（`dist/assets/index-dM8hBGUF.js` 1119KB 含 echarts 标记）。回收这 3 个死组件后 echarts 只剩 LazyEChart 的懒加载引用，应从主包移出、显著减小首屏加载体积（贴合"他人本地快速部署使用"产品目标）。这与 SCOPE_FREEZE §3.3 P2 清理死资产（AlphaResearch/Screening 等）的既有惯例一致。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **死组件确认**：维护者已对全 `frontend/src` 做宽匹配（任意出现，含注释/导出/测试），三者的外部引用为零——`BacktestResultCard` 仅自身+测试引用；`MarketMoversPanel` 仅自身+测试引用；`MarketThemesPanel` 仅被 `MarketMoversPanel`（死组件）引用。**Codex 执行前必须再次 AST/grep 验证**（含 `frontend/e2e/` 与 `frontend/src` 的 import/require/动态引用），确认零引用才回收。
> 2. **依赖现状（本轮不清理，只记录）**：`package.json` 声明 `@ant-design/pro-components`（^2.8.5），但代码实际 import 的是 `@ant-design/pro-layout`（`App.tsx` L9，疑似传递依赖）。**本轮不动 package.json / bun.lock / 依赖**（涉及锁文件风险，留待用户明确同意依赖变更再单独立卡）。
> 3. **回收铁律**：3 个组件文件 + 3 个同名测试文件（`BacktestResultCard.test.tsx`、`MarketMoversPanel.test.tsx`、`MarketThemesPanel.test.tsx`）进回收站（`[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(... 'SendToRecycleBin')`），**禁止 rm/Remove-Item/del**。
> 4. **预期收益（可量化）**：主包 1119KB（含 echarts 全量）预计降至 ~500-700KB；echarts 成为独立懒加载 chunk（首次用到才加载）。**前后对比用 build 产物大小记录**（`dist/assets/*.js` 字节数）。
> 5. **不回归**：`LazyEChart.tsx`（lazy echarts 入口）**保留**；`PortfolioRiskWorkbench`/`BacktestCharts`/`ResearchCharts`（LazyEChart 的 3 个使用者）**保留不动**；其余页面/组件行为零改动。删除死组件后 Vitest 测试数会减少（3 个测试文件），属预期。
> 6. **E2E 风险**：需确认 `frontend/e2e/` 无用例依赖这 3 个组件（维护者 grep `src` 零引用；Codex 需再 grep `e2e`）。全量 E2E 兜底。

---

## 允许修改

- `frontend/src/components/BacktestResultCard.tsx`（**回收**）
- `frontend/src/components/MarketMoversPanel.tsx`（**回收**）
- `frontend/src/components/MarketThemesPanel.tsx`（**回收**）
- `frontend/tests/BacktestResultCard.test.tsx`、`frontend/tests/MarketMoversPanel.test.tsx`、`frontend/tests/MarketThemesPanel.test.tsx`（**回收**，与组件同名测试）
- `docs/ai/tasks/BACKLOG-022.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`
- `docs/ARCHITECTURE.md`（如组件树/依赖说明需更新，仅当有死组件引用时）

## 禁止修改

- `backend/` 全部
- `frontend/src/components/LazyEChart.tsx`、`ResearchCharts.tsx`、`BacktestCharts.tsx`、`PortfolioRiskWorkbench.tsx`（LazyEChart 使用者）
- `frontend/package.json`、`frontend/bun.lock`（**本轮不清理 pro-components/pro-layout 依赖**）
- `frontend/playwright.config.ts`、`frontend/vite.config.ts`
- 其他页面/组件（Dashboard/Discover/Research/StrategyLab 只读）
- **不新增任何依赖**；**不 rm/Remove-Item/del**（回收走回收站）；**不删除其他文件**

---

## 完成标准

### 目标 1：死组件回收

- 再次验证（AST/grep）：3 个组件在 `frontend/src` + `frontend/e2e` 均零引用后，回收 6 个文件（3 组件 + 3 测试）进回收站，记录回收确认（路径/SHA256 或回收站核验，参照 BACKLOG-021 手法）
- `LazyEChart` 及其 3 个使用者、其余组件零改动

### 目标 2：bundle 瘦身验证（可量化）

- build 前后对比 `dist/assets` 各 JS chunk 字节数（记录 `index-*.js` 主包、vendor-antd、新增 echarts chunk 的前后数值）
- 预期：主包 1119KB 明显下降；echarts 移出主包成独立 chunk（或并入某个懒加载 chunk）
- 若主包未明显下降，**不得扩大改动面**（如按需引入 echarts 属另一张卡，需维护者另行批准），只记录实际结果

### 目标 3：测试与验证

- 全量：`cd frontend && bun run build`（记录 modules 数变化）、`bun run test`（Vitest 基线 124 files/354 tests **减 3 文件/其用例数**，全绿）、`bun run test:e2e`（50 基线，全绿，workers:2/retries:1）
- `git diff --check` 通过
- **零后端改动、零依赖变化（package.json/bun.lock 不动）、无 rm（回收站铁律）**

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：回收清单/回收站确认/bundle 前后/测试数/门禁）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）
- `docs/ARCHITECTURE.md`：仅当其中引用了这 3 个死组件才更新；否则跳过
- 记录决策：`@ant-design/pro-components` 疑似死依赖 + `@ant-design/pro-layout` 疑似传递依赖——**本轮不清理，留待依赖变更授权**（写入证据）

---

## 参考

- 死组件：`frontend/src/components/{BacktestResultCard,MarketMoversPanel,MarketThemesPanel}.tsx` + `frontend/tests/{同名}.test.tsx`
- LazyEChart（保留）：`frontend/src/components/LazyEChart.tsx`（lazy echarts 入口）
- 当前 bundle：`frontend/dist/assets/`（vendor-antd 1528KB、index 1119KB、index 360KB 等）
- 既有惯例：SCOPE_FREEZE §3.3 P2 死资产回收（AlphaResearch/Screening 等）、BACKLOG-021 回收站手法与 SHA256 核验
- 删除铁律：`[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('路径','OnlyErrorDialogs','SendToRecycleBin')`

## 验证命令

```powershell
cd frontend
$env:Path = "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0;$env:Path"
# 回收前记录 bundle
Get-ChildItem dist\assets -File | Sort-Object Length -Descending | Select-Object -First 6 | ForEach-Object { "$([math]::Round($_.Length/1KB))KB $($_.Name)" }
# build + 测试
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test:e2e
# 回收后对比
Get-ChildItem dist\assets -File | Sort-Object Length -Descending | Select-Object -First 6 | ForEach-Object { "$([math]::Round($_.Length/1KB))KB $($_.Name)" }
cd .. && git diff --check
```

## 完成证据（执行后填写）

### 执行基线与证据位置

- 执行日期：2026-09-03。开始时 HEAD 为 `29cbba7`，工作树与暂存区均干净；已读取 AGENTS、HANDOFF、EXEC_PLAN 与本卡全文。
- 原始日志、核验脚本和 JSON 位于仓库外：`C:\Users\Satanchen\AppData\Local\Temp\finquant-backlog022-20260903-01a06665\`（下称证据目录）。未向源码树新增脚本、依赖或测试。
- **前提校准**：卡片背景把约 1119 KiB 的 `index-dM8hBGUF.js` 误认为主包。回收前重新 build 后，`dist/index.html` 的入口实际为 `index-8ilTy0GW.js`（368,423 字节）；ECharts 已经是 `LazyEChart` 动态加载的独立 chunk。按目标 2 的例外条款记录实测结果，不扩大改动面，不声称本次取得 bundle 缩减。

### 1. 零引用与回收确认

- 回收前对 `frontend/src`、`frontend/e2e`、`frontend/tests` 共 288 文件做宽匹配，并用已安装的 TypeScript AST 检查 import/export/require/import()。除 6 个待回收文件外，三个组件名及全部导出符号（`BacktestResult`、四个 movers helper、`buildThemeCandidateChartOption`）引用为 **0**；E2E 引用 **0**；计算式动态加载 **0**；`import.meta.glob` **0**。
- 内部关系只有 `MarketMoversPanel → MarketThemesPanel`；三个同名测试分别引用对应组件，未发现外部 barrel re-export 或 helper 使用者。不能把内部关系误写为每个文件绝对零匹配。
- 回收前核对绝对路径均在本工作区内，保存路径、长度和 SHA256；随后仅对下表六个文件调用 `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(path,'OnlyErrorDialogs','SendToRecycleBin')`。回收后原路径均不存在，Shell 回收站记录的原目录/名称、回收载荷 SHA256 均逐一匹配，**6/6 通过**。没有使用 rm、Remove-Item、del，没有回收其他源码文件。

| 原路径（相对仓库根目录） | 字节数 | SHA256 | 回收站载荷名 |
|---|---:|---|---|
| `frontend/src/components/BacktestResultCard.tsx` | 5457 | `0595C403D113743620BFFC022339A831131D37F4B5B60F10425A9163809A5424` | `$RV0QBWD.tsx` |
| `frontend/src/components/MarketMoversPanel.tsx` | 19370 | `C1F1B0A02C6CE88A16E9D6E81CEC19824A103957C214F68E7733511A075AFE30` | `$RL4U893.tsx` |
| `frontend/src/components/MarketThemesPanel.tsx` | 11339 | `64A0630E712625254183FFA54D8BAD6D1921CDE4ADBDEF8021D3A3CC359C6B22` | `$RDTZTR1.tsx` |
| `frontend/tests/BacktestResultCard.test.tsx` | 3361 | `3977340A5EAA73BADA53D3F4482E0A4DAF22CF489B8F9D5E0EB43CA229E42C8D` | `$RIF2Y1M.tsx` |
| `frontend/tests/MarketMoversPanel.test.tsx` | 2948 | `D34B6F94763E66C0146B73C7302C90269C877E695974DE1F396D9703E011480C` | `$RPD1P0V.tsx` |
| `frontend/tests/MarketThemesPanel.test.tsx` | 3680 | `F3FF0D22DA646BD633F5BAFF76861C16425652F7F1AB88D3184118C4CD176C76` | `$RPV5CL5.tsx` |

- 六个载荷均位于 `E:\$RECYCLE.BIN\S-1-5-21-1866984205-3748508198-824681690-1002\`。原绝对路径、载荷绝对路径及 `SourceAbsent/HashMatched` 见 `recycle-confirmation.json`；原始清单见 `recycle-before.json`。
- 回收后重复 AST/宽匹配：282 文件，组件及导出符号残余 **0**；生产源码中 `echarts-for-react` 仅剩 `LazyEChart.tsx` 的 type-only import 与 `lazy(() => import(...))`。证据：`refs-before.json`、`refs-after.json`。可重跑：`node <证据目录>/audit.mjs refs-after`。

### 2. bundle 实测（未压缩字节，两个全新 build）

- 回收前、回收后均执行原命令 `bun run build`，OpenAPI prebuild 均为 **58 schemas fresh**，tsc/Vite 均退出 0；modules **4,243 → 4,243**，Vite 构建阶段分别 44.34s / 27.75s。
- `dist/index.html` 与 chunk AST 确认：入口静态依赖闭包只有 `index-8ilTy0GW.js` 和 `vendor-antd-TEedNHKs.js`；两者均没有 `[ECharts]` 标记。`LazyEChart-BP6_PtBb.js` 动态 import `index-dM8hBGUF.js`，后者含 `[ECharts]` 与版本 `6.1.0`，回收前后均如此。
- **33 个 JS chunk 的文件名、实际字节数及 SHA256 全部相同**，总 JS **3,629,057 → 3,629,057 字节（差值 0）**。没有新增 ECharts chunk；原来已是懒加载。死文件不在可达生产模块图内，因此移除其静态 import 没有改变产物。这是本次测量结果，不把源码回收包装成首屏优化。

| JS chunk（主包与 ECharts 身份见上文） | 回收前 bytes | 回收后 bytes | 差值 |
|---|---:|---:|---:|
| vendor-antd-TEedNHKs.js | 1564909 | 1564909 | 0 |
| index-dM8hBGUF.js（ECharts 懒加载） | 1145864 | 1145864 | 0 |
| index-8ilTy0GW.js（HTML 入口主包） | 368423 | 368423 | 0 |
| Research-CPMFR-9j.js | 207778 | 207778 | 0 |
| ResearchWorkspace-BLlcs0vd.js | 79152 | 79152 | 0 |
| Portfolio-C-YXCQYZ.js | 52143 | 52143 | 0 |
| StrategyLab-vaLmWlsL.js | 51400 | 51400 | 0 |
| Discover-BJKYH2Wi.js | 28987 | 28987 | 0 |
| Settings-DWOXmdom.js | 24488 | 24488 | 0 |
| Dashboard-Ckhajf7O.js | 17873 | 17873 | 0 |
| Alerts-4-tQJpWj.js | 14805 | 14805 | 0 |
| StockAnalysis-DFUXn_ee.js | 13778 | 13778 | 0 |
| ComparisonWorkspace-B0x80wrH.js | 11295 | 11295 | 0 |
| Knowledge-pSU7OfKn.js | 7909 | 7909 | 0 |
| comparisonWorkspace-CPtZYDB3.js | 6609 | 6609 | 0 |
| Models-qhq4HNB6.js | 5599 | 5599 | 0 |
| sharePreviewApi-CL0Znbfm.js | 5157 | 5157 | 0 |
| McpMarket-DBlDDNQx.js | 3617 | 3617 | 0 |
| LimitPool-1g2vgvus.js | 3006 | 3006 | 0 |
| Login-CzwjZGzr.js | 2882 | 2882 | 0 |
| EvidenceChip-Bk4EwETX.js | 2778 | 2778 | 0 |
| analysisApi-CB3WAsFS.js | 2576 | 2576 | 0 |
| ResultLayer-BYwyF1ox.js | 1607 | 1607 | 0 |
| CitationDetails-ORqIEU0_.js | 1562 | 1562 | 0 |
| FinancialMetric-Che1x3ku.js | 844 | 844 | 0 |
| TaskPageHeader-CMaMi0LV.js | 806 | 806 | 0 |
| productProgress-Dd_G79xO.js | 766 | 766 | 0 |
| mcpApi-C41Ews9S.js | 669 | 669 | 0 |
| LazyEChart-BP6_PtBb.js | 507 | 507 | 0 |
| MetricStrip-CufWE0jU.js | 466 | 466 | 0 |
| formatAStock-CvNOgK31.js | 339 | 339 | 0 |
| SourceChip-Barz_t06.js | 284 | 284 | 0 |
| StatusChip-BdnRZ0Wc.js | 179 | 179 | 0 |

- 证据：`build-before.log`、`build-after.log`、`bundle-before.json`、`bundle-after.json`、两个 `bundle-*-index.html`。两个 JSON 含全部 chunk SHA256 和静态/动态引用。可重跑：`node <证据目录>/audit.mjs bundle-current`。既有 >500 kB warning 两次均出现，本卡不改 chunk 配置或按需引入方案。

### 3. 全量门禁与测试数

- 基线 **124 files / 354 tests** 来自已提交 BACKLOG-021 的全量证据；本轮未额外跑回收前完整 Vitest。回收前 AST 实数：BacktestResultCard 3、MarketMoversPanel 3、MarketThemesPanel 2，合计 **3 文件 / 8 用例**，回收后应为 **121 files / 346 tests**。
- 回收后 `bun run build`：通过（见上文）。
- 回收后首轮 `bun run test`：121 文件（120 passed / 1 failed）、346 用例（345 passed / 1 failed），1033.69s；唯一失败为未修改的 `AlphaSimulationWorkbench.test.tsx:45` 既有用例超出默认 5000ms，并非断言值错误。该文件原参数单独复测 **1/1 files、2/2 tests 通过**（15.37s，测试执行 3.09s）。没有修改测试、超时、配置或依赖；第二轮原始 `bun run test` **121/121 files、346/346 tests 全绿**（1153.09s，exit 0），作为最终 Vitest 门禁。首轮、专项、最终日志分别为 `vitest.log`、`vitest-focused.log`、`vitest-final.log`。
- 回收后 `bun run test:e2e`：**Chromium 50/50 全绿**（报告用时 1.0m，exit 0），原 workers:2/retries:1，本次无重试、无跳过。启动前 netstat 确认 4173 无监听、CI 未设置；由原 Playwright webServer 启动 `127.0.0.1:4173`，测试结束后释放端口。所有既有 E2E 文件/断言均未修改。日志：`e2e.log`。
- `git diff --check` 通过；最终只变化 **10 个允许文件（6 回收 + 4 文档）**，其余 **3,970 个原跟踪文件 SHA256 不变**，包括全部 **253 个后端跟踪文件**、LazyEChart 及三个使用者、所有保留测试/E2E、依赖与配置、HANDOFF 和 reference。未跟踪文件新增 0、暂存区为空，HEAD 保持 `29cbba727cdd637b1ea9dbb73337147c76dddc89`；未 commit/push。

### 4. 依赖决策与文档范围

- 只读核对：package.json 仍声明 `@ant-design/pro-components: ^2.8.5`，src/tests/e2e 对其 import 为 0；`App.tsx:9` 仍 import `@ant-design/pro-layout`。本机已安装 pro-components 2.8.10 的 dependencies 明确包含 pro-layout 7.22.7，支持“疑似传递依赖”的判断。
- **决策：pro-components 疑似死依赖、pro-layout 依赖声明卫生留待明确的依赖变更授权与单独任务；本轮不清理、不安装、不升级任何依赖。** package.json / bun.lock 的最终 SHA256 与基线相同，见下节。
- `docs/ARCHITECTURE.md` 确有一处“原 BacktestResultCard 保留”的旧说明，仅同步该句为已回收、解析工具继续保留；其他架构说明不变。
- 本卡、EXEC_PLAN、带日期标题的 task/CHANGELOG 为授权记录文件；HANDOFF 不在严格允许列表，保持不动。

### 5. 重点保护文件 SHA256（前后全部相同）

| 保留文件（相对仓库根目录） | 回收前 = 回收后 SHA256 |
|---|---|
| `frontend/src/components/LazyEChart.tsx` | `0D78DE6A7ABFAFD31895963761F6F2432AF59170275CDDD2791C358CA6516B9C` |
| `frontend/src/components/research/ResearchCharts.tsx` | `11701E68FBCD051920C985A08FC8A9E77C6ACD412B32646292B41E5B6CA4F79A` |
| `frontend/src/components/research/BacktestCharts.tsx` | `B860199E2FB15E886202009D9117FF66E87593709BE126EF1F81BB61614766E3` |
| `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx` | `5183838CC656957D7EB273ACD8912AE85F6F8BBF1B296BEC5804CEE04BFAC232` |
| `frontend/package.json` | `D46A33D496C420164EC8FEFEC2589C0EDB7E631F771592CD83535CEF85507651` |
| `frontend/bun.lock` | `049D62D852E44D2E71E4D576086BA0DBD72A3BFC1853D08C2487ABBC9CC94C29` |
| `frontend/vite.config.ts` | `CF926F0E089E4E6626F8E0DB5732EC52FA660E318E2082FF721A0B71F148CD36` |
| `frontend/playwright.config.ts` | `E05DC8124CCD9692DBEFBF28CB490B2B4126DE8843FA3A63517C51696A9348CF` |

- `tracked-before.json` 保存开工时全部 3,980 个跟踪文件的 SHA256；`audit.mjs scope` 逐文件比较、检查允许清单/删除清单/未跟踪文件/暂存区/HEAD，并输出 `scope-final.json`。上述八文件及所有非允许文件最终比对通过，unexpected 为 0。回收站六个载荷在门禁结束后再次核对 SHA256，6/6 仍匹配。
- 完成边界：四项目标全部按卡片完成，其中 bundle 采用目标 2 明确允许的“无下降则记录实际结果”分支；不声称完成额外的 bundle 优化或依赖清理。
