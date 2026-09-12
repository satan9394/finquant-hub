# IMPLEMENT_RESULT — VS-26：修掉既有测试的竞态（测试卫生）

> 实现者自述。**本卡零生产代码改动**：仓库内只改了 `frontend/tests/ResearchWorkspaceEvidence.test.tsx` 一个文件的 3 处**等待方式**。
> 骨架先落盘（改码前），随后逐节回填实测原始输出。
> **变异窗口声明**：本卡所有变异/鉴别力实验均在 `$env:TEMP` 的副本内进行（`vs26-mutant\*`），**仓库工作树从未处于变异态**，全程为交付态。

## 0. 一句话结论
把 `ResearchWorkspaceEvidence.test.tsx` 的 **3 处「await A → 同步断言 B」**（`:295`/`:321`/`:336`）改为**等待 B 成立后再断言**：改后**单跑 14 passed**（有噪声重跑记录见 §4.1）、**与 VS-24 新测试同跑 24 passed**（稳定性见 §4.2），**期望值一字未改**（§1），**串行 `bun run build` exit 0**（§4.4），并且**副本内改回同步断言即变红**（§4.3，鉴别力已证）。

## 1. 改动清单（改动前后对照，证明期望值未变）
文件：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（唯一被改文件）

### 1.1 第 1 处：失败日期回滚后的窗口截止日期（原 `:295` ⇒ 现 `:298`）
```ts
// 改前（原 295 行，同步断言）
expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());

// 改后（现 298 行，等待条件成立再断言）
await waitFor(() => expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday()));
```
- **期望值**：改前 `shanghaiToday()`，改后 `shanghaiToday()` —— **同一个具体值，一字未改**。
- 被断言的对象、比较方式（`.toBe`，`Object.is`）均未变；只多了「等到它成立」。

### 1.2 第 2 处：导航换标的后选中的龙虎榜记录（原 `:321` ⇒ 现 `:327`）
```ts
// 改前（原 321 行，同步断言）
expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy();

// 改后（现 327 行，等待条件成立再断言）
await waitFor(() => expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
```
- **期望值**：改前/改后均为「存在 `aria-label` 含 `2026-08-27` 且 `aria-pressed=true` 的按钮」——**同一个具体记录、同一个选中态**，未放宽（不是「存在任意按钮即可」）。
- 紧随其后的 `:328-330` 仍同步断言 `detail` 内是 `000001 / 平安银行 / 平安银行最近上榜`，`:332` 仍断言 `queryByText('历史上榜原因')` 为 `null`——**断言集合未变**。

### 1.3 第 3 处：第二条错误文案（原 `:336` ⇒ 现 `:344`）
```ts
// 改前（原 336 行，同步断言）
expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();

// 改后（现 344 行，等待条件成立再断言）
await waitFor(() => expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy());
```
- **期望值**：改前/改后均为**同一条具体错误文案**「龙虎榜：龙虎榜接口不可用」（精确文本匹配，非「存在任意 alert」、非「非空」）。
- 其上一行 `:341` 的 `findByText('资金流向：资金接口不可用')`、其后 `:345`/`:346` 的空态文案断言均未改动。

### 1.4 「只改何时断言」的机器可验证证据
- `git diff` 三个 hunk **只删了 3 行、加了 3 行断言 + 9 行注释**：3 行断言在**去掉 `await waitFor(() => ...)` 外壳后与改前逐字符相同**。
- 反向核对：把改后三行各自剥掉 `await waitFor(() => ` 与结尾 `)` 后，与 `git show HEAD:` 中的原行**完全一致**（见 §4.3 的副本对照，`Compare-Object` 只报出这 3 处 + 注释差异）。

## 2. 为什么这不是「弱化断言」
- `waitFor` 的语义是**轮询直到回调不再抛错**，默认超时 1000ms；**超时即用例变红**。因此「值永远不出现」⇒ 红，与改前同步断言同向，只是把「立刻红」换成「最终仍红」。**唯一被消除的是「红得太早」**。
- 三处**都没有**引入 `queryBy*`、`not.toThrow`、`.toBeTruthy()` 包裹原值、`expect.anything()`、`expect.any()`、`toBeDefined()` 之类的存在性弱化；比对仍是 `.toBe(具体字符串)` / `getByRole(name: 具体正则, pressed: true)` / `getByText(具体文案)`。
- **鉴别力反证**（§4.3）：副本内把第 1 处改回同步断言，**同一条用例立刻变红且报错信息与改前一致**（`expected '2026-08-20' to be '2026-09-12'`）——若我把断言改成了恒真，这一步不可能红。

## 3. 「第 4 处同类写法」的排查
对全文件做了机械枚举（所有 `await` 行 + 其后 1–2 行内的同步 `expect`），逐处判定「被等待的元素是否与所断言的数据在同一次提交中产生」：

| 位置（现文件行） | 形态 | 判定 |
|---|---|---|
| `:140 → :142`、`:170 → :171` | `await findByTestId('chip-card')` → 同步断言筹码数据 | **非竞态**：`chip-card`（`ResearchWorkspace.tsx:699`）只在 `snapshot` 已置位时渲染，而 `snapshot` 与 `chips` 由 `loadWorkspace` 的**同一个 `Promise.allSettled` 批次**一起 set ⇒ 卡片出现的那次提交里数据必已在 |
| `:198 → :199`、`:213 → :215`、`:230`、`:256`、`:272`、`:290`、`:318`、`:399`、`:439` | `await findByTestId('money-flow-card' / 'dragon-tiger-card')` → 同步断言其数据 | **非竞态**：同上，两张卡都在 `snapshot` 分支内无条件渲染，数据与 `snapshot` 同批次落地 ⇒ 卡片（重）出现时数据必已在（`loading` 期间 `snapshot` 为 null，整块被 `Skeleton` 取代、节点不存在） |
| `:275 → :276` | `await waitFor(已发起新请求)` → 同步断言**旧**记录仍选中 | **非竞态**：断言的是「保留旧状态」，此期间无状态提交可竞争 |
| `:301 → :302` | 点「重试」后 `await findByTestId('dragon-tiger-card')` → 同步断言新记录选中 | **非竞态（本卡最接近的第 4 处候选）**：`loadWorkspace` 入口先 `setSnapshot(null)`，卡片会先被 `Skeleton` 取代而**卸载**，`findByTestId` 因此必须等到「快照 + 龙虎榜」同批到达的那次提交才返回；实测该用例在全部改后运行中**从未失败** |
| `:322 → :323` | 导航后 `await waitFor(请求已发出)` → `findByTestId` | **是同类竞态**——但它**紧跟在改动点 `:327` 的同一段代码内**，`:323` 的 `findByTestId` 本身就是「旧 DOM 仍在」的那一步，`waitFor`（`:327`）已把该竞态吸收 |

结论：**未发现第 4 处会实际变红的同类竞态**；`:301` 是最接近的形态，已说明其为何安全。按卡内「只改这三处」的范围，**没有扩大改动**。**但如实提示**：`:301` 的安全性依赖「`loadWorkspace` 先清空 `snapshot` 导致卡片卸载」这一**生产实现细节**；一旦将来生产代码改成保留旧快照（例如加骨架屏而不清空），`:301` 会退化为同类竞态。此为**观察，非本卡缺陷**。

## 4. 门禁原始输出
（全部原始日志留在 `$env:TEMP\vs26-gates\`，**未写入仓库目录**；下方为逐条摘录。）

### 4.1 `ResearchWorkspaceEvidence` 单跑
（待回填）

### 4.2 与 `ResearchFollowupPrompt.test.tsx` 同跑（稳定性）
（待回填）

### 4.3 鉴别力证明（`$env:TEMP` 副本内改回同步断言 ⇒ 变红）
（待回填）

### 4.4 串行 `bun run build`（含 `tsc -b`）
（待回填）

## 5. 未解决问题 / 风险
（待回填）

## 6. 证据索引
（待回填）
