# IMPLEMENTATION_BRIEF — Vertical Slice 8：让"免工具链兜底"真正可达 + 首启引导一致

> Orchestrator 第五阶段产物，2026-09-13。来源：**A2 二轮 UX 审计的 P0**（`PRODUCT_UX_REPORT_R2.md`），**编排者已复核代码事实**。

## 目标
让**没有安装 Bun 的用户**也能用发行包（预置 `frontend/dist`）成功启动；并把 `start.bat` 内的首启引导与 VS-5 已改的 QUICKSTART/README 对齐。

## 用户场景
非技术中文投资者下载发行 ZIP（内含已构建的 `frontend/dist`），双击 `start.bat`。**现状**：脚本在 `:14-19` 无条件找 Bun，找不到就 `goto fail` **直接退出**——他永远走不到 `:57` 的"复用已有产物"逻辑，也就永远启动不了。而 `QUICKSTART:36` 明确承诺"已有页面产物会被复用"。这是**唯一会让"第一次成功使用"彻底归零**的环节（端口占用、未配 key、行情为空都还能降级使用）。

## 当前问题（已核实，行号为准）
1. **P0 顺序缺陷**：`start.bat:14-19` Bun 检查**无条件且致命**（`if not defined FQ_BUN ( ... goto fail )`）；而"复用 `frontend/dist`"的判断在 `:55-57`（`if not exist "frontend\dist\index.html" goto build_frontend`）——位于其后，**永远不可达**。
2. **P2 引导分叉（VS-5 遗留）**：`start.bat:89` 仍打印"可用记事本填写 `DEEPSEEK_API_KEY`"，而 VS-5 已把 `QUICKSTART:65` 与 `README` 改为**主推站内「设置 → 模型管理」**。脚本内提示与文档口径不一致。

## 理想行为
- 顶部只**探测** Bun，不再致命：找不到就记一个标记（如 `set "FQ_BUN_MISSING=1"`）继续往下走。
- **需要构建时才要求 Bun**：`frontend/dist/index.html` 存在且不比 `package.json` 旧 → **直接复用，全程不需要 Bun**；只有在**确实要构建**（无产物/产物过期）且 Bun 缺失时，才给出安装指引并退出。
- `start.bat:89` 的配置提示与 QUICKSTART/README 一致：**主推站内模型管理**，`.env` 作为进阶。

## 涉及模块
- `start.bat`（探测改非致命 + Bun 需求判定移到构建分支前 + 配置提示对齐）
- `docs/QUICKSTART.md`（如需补充"没有 Bun 也能用预置产物"的说明，保持与脚本一致）

## 不能破坏
- **Bun 存在时的行为完全不变**（仍优先 PATH、其次维护者备用路径）。
- 端口固定 8000、Ctrl+C 停止、`SERVE_FRONTEND=1`/`LOCAL_ONLY_MODE=1`、备份段（`:91-103`）、各退出码语义不变。
- 构建失败分支（`:build_failed`）文案保留并可指向安装指引。
- `start.bat` 必须保持 **CRLF**（LF-only = 0）与有效 UTF-8；不引入删除调用；不加依赖。

## 验收标准
1. **无 Bun + 产物存在且不过期** → 脚本**不退出**，能走到 `:launch`（可用"把 Bun 探测指向不存在路径"的方式实测）。
2. **无 Bun + 需构建**（无产物或产物过期）→ 给出"未找到 Bun + 安装指引 + 文档锚点"并退出（非静默、非误导）。
3. **有 Bun** → 与改动前行为一致（构建判断、复用逻辑不变）。
4. `start.bat` 中创建 `.env` 后的提示**必须逐字包含**以下两句（可判定，不留解释空间）：
   - `推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填）`
   - 并保留 `.env` 作为进阶路径的说明（含"保存后重启"）。
   理由：`docs/QUICKSTART.md:65` 与 `README.md:69` 已改为站内优先，脚本内提示必须同向，不得再只提"用记事本填写"。
5. `start.bat` CRLF 完整（LF-only = 0）、UTF-8 有效；`git diff --check` 通过。

## 错误场景
- 产物存在但 `package.json` 更新过 → 仍判定需要构建 → 无 Bun 时给指引退出（正确，不能假装能跑）。
- 产物时间检查异常（`errorlevel 2`）→ 保持既有"无法检查产物时间"分支。
- Bun 备用路径存在但 PATH 无 Bun → 仍视为有 Bun（既有逻辑）。

## 测试要求
bat 无自动化测试框架，采用**实测**验收（与 VS-6 同法）：
- 构造"无 Bun"场景（把探测路径指向不存在位置）分别验证：产物新鲜 → 走到 launch；产物缺失 → 给指引退出；
- 有 Bun 场景回归：复用/构建判断与改动前一致；
- 字节级：CRLF 统计、UTF-8 严格解码；
- 语法：`if` 块内 `^)`/`^|` 渲染正确。
由独立 Evaluator 复核实测证据 + "Bun 存在时零变化"。
