# IMPLEMENT_RESULT — Vertical Slice 14：把"产物疑似过期"从硬退出降级为"警告后照常启动"

> **实现者：Orchestrator 接管**（原计划派出的 Implementer 未派出——本环境 429 让三个子代理连续中断，而本卡需跑 cmd 夹具、对中断尤其敏感，故按 VS-13 先例由编排者带夹具实现）。
> **⚠️ 独立评估不可省**——已派独立 Evaluator 复核（见 `EVALUATION_RESULT_VS14.md`）。

## 一、改动（1 文件）
`start.bat`（+16 / −2）：
- `:63` 由 `if errorlevel 1 goto build_frontend` 改为 **`goto stale_frontend`**（新增分岔点）。
- 新增 **`:stale_frontend`**：产物存在但判为偏旧时——**有 Bun 仍照旧构建**；**无 Bun 不再硬退出**。
- 新增 **`:stale_frontend_nobun`**：打印警示（"产物可能偏旧、将用现有产物启动、如需最新界面请装 Bun 后重跑"），随后**落入 `:reuse_frontend`** 照常复用并继续启动。
- 新增 **`:reuse_frontend`**：复用时**打印所用产物的构建时间**（`for %%I in ("frontend\dist\index.html") do ... %%~tI`），供用户自查是否看到旧界面（缓解"假阴性静默跑旧前端"）。
- 附带发现（写进注释）：原注释 `:56` 自认"只按 package.json 与 index.html 的时间判断过期"，本条正是该判据的**假阳性**后果。

**为什么是这个做法**（而非构建指纹）：指纹需要改前端构建产物（vite 侧），属更大改动，已记 LATER；本卡只消除"把用户挡在门外"这一最重后果。

## 二、门禁实测（原始输出）
**字节级**：`bytes=11684  CRLF=185  LF总=185  LF-only=0`；严格 UTF-8 校验 **OK**；无 BOM。

**夹具实测**（把 `start.bat` 的 L55-L80 决策块**逐字**抽出，接上镜像真实结构的 `:build_frontend`/`:bun_missing` 桩，4 个沙箱各控一种状态组合，经 `cmd.exe` 实跑）：
```
场景1 无 Bun + 产物缺失   → REACHED=bun_missing              （保留硬退出与安装指引）
场景2 无 Bun + 产物过期   → [提示] 前端产物可能偏旧…但本机未安装 Bun。
                            将直接使用现有产物启动；若界面与预期不符，请安装 Bun 后重新运行本脚本。
                           [准备] 复用已有 frontend\dist（构建时间：2026/09/11 18:31）。
                           REACHED=environment                ← 本卡的修复：不再硬退出
场景3 无 Bun + 产物新鲜   → [准备] 复用已有 frontend\dist（构建时间：…）。REACHED=environment
场景4 有 Bun + 产物过期   → REACHED=build_frontend_with_bun   （行为不变，仍构建）
```
中文显示正常、`%%~tI` 时间戳正确输出 ⇒ cmd 层与 `chcp 65001` 配合无恙。

## 三、已发现并**有意不改**的一处（附证据与推理）
夹具暴露：场景 2/4 的进程退出码为 **1**。根因是 `:58` 的时间检查**故意 `exit 1`** 表示"过期"，而 `goto`/`echo`/`for` **都不重置 errorlevel**，该值一路带到脚本结束。
**但结论是不改**，依据：
1. 真实脚本的最终退出码由 **`:launch` 的 L137 前台 uvicorn** 决定（或其后的 `:fail`）；泄漏的 1 一定在此之前被覆盖——要么被 `:backup` 的 PowerShell（L116-117）覆盖，要么在 DB 不存在时（L114 直接 `goto launch`）被 uvicorn 覆盖。
2. 场景 4 的 1 是**夹具假象**：我的 `:build_frontend` 桩只 `echo`，而真实的该分支会 `call bun run build`（重置 errorlevel）。
3. 为真实脚本中**不可观测**的现象，往关键启动文件里加一行语义隐晦的命令，风险大于收益。
**残留（低）**：若日后有人在 `:launch` 的 uvicorn **之前**加入 `if errorlevel` 判断，会踩到这个陈旧值。故在此明确记账。

## 四、未解决问题 / 风险
1. **未消除假阴性方向**：只改源码不改 `package.json` 时仍判"新鲜"、静默跑旧前端。本卡仅通过**打印产物时间**让用户可自查；真正的修复（构建指纹）记 LATER。
2. **`:58` 的判据本身未动**（仍是时间戳比较），本卡只改**后果**。若评估者认为应连判据一并换掉，请明确指出——但那会引入构建产物改动，超出本卡边界。
3. 独立评估是唯一验收来源（本卡由编排者实现）。
