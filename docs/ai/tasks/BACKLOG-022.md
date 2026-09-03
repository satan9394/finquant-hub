# BACKLOG-022 — 前端死组件回收 + bundle 瘦身（echarts 移出主包）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
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

- 回收文件清单（6 个）与回收站确认（路径/SHA256）
- 零引用再验证结果（src + e2e）
- bundle 前后对比表（主包/vendor/echarts chunk 字节数）
- 测试数变化（Vitest 减 3 文件、E2E 保持）；全量门禁结果
- 依赖零变化确认（package.json/bun.lock 未动）
- 记录决策：pro-components/pro-layout 依赖卫生留待授权
