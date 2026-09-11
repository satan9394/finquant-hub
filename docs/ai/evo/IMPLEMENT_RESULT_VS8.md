# IMPLEMENT_RESULT — Vertical Slice 8：免工具链兜底可达 + 首启引导一致

> 执行者：IMPLEMENTER（隔离 Worker）。日期：2026-09-11。**未 commit**（按任务卡要求）。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS8.md`
> 起始基线：`git HEAD = 5723dc7`，工作树干净；`start.bat` md5 = `8A387DEBE7FB6938CB59B01B05EFD942`，8649 bytes，157 CRLF / 0 LF-only。
>
> **会话期间 HEAD 前移说明**：执笔过程中编排者提交了 `687bc86`（仅改 `docs/ai/evo/PRODUCT_STATE.md`，与 VS-8 无关）。已核实 `git diff --name-only 5723dc7 HEAD -- start.bat` 为**空**，即**父仓提交从未触碰 `start.bat`**；`git diff --numstat HEAD` 显示本工作树相对 HEAD 的差异正好只有本次改动的 `start.bat 15/5`、`docs/QUICKSTART.md 3/1`、`README.md 1/1`，**没有任何父仓改动被覆盖或回退**。（`git show HEAD:start.bat` 的 md5 与基线不同纯属重定向的换行转换假象：blob 为 LF 形式 8492 bytes = 8649 − 157。）

---

## 1. 改动清单（含行号）

### 1.1 `start.bat`（+15 / −5，改后 167 行，9682 bytes，md5 `F3CB8DCD2D950CDB666144C12692949C`）

| 位置 | 改动 |
| --- | --- |
| **L13-14**（新增注释） | 说明此处只探测不拦截：发行包可能自带 `frontend\dist`，那种情况全程不需要 Bun；缺 Bun 只记标记，等确认"确实需要构建"时再处理。 |
| **L16**（新增） | `set "FQ_BUN_MISSING="` — 先清空标记，避免继承外部环境变量。 |
| **L17-18**（原 L14-15，**逻辑未动**） | 保持"先 PATH（`where bun`）再维护者备用路径（`D:\...\v22.19.0\bun.exe`）"的顺序与写法完全不变。 |
| **L19**（新增） | `if not defined FQ_BUN set "FQ_BUN_MISSING=1"` — 取代原 L16-19 的 `if not defined FQ_BUN ( ... goto fail )` 致命块。**顶部不再 `goto fail`。** |
| **L68-69**（新增） | `:build_frontend` 内、`cd frontend` 之前插入：`rem 到这里才真正需要 Bun...` + `if defined FQ_BUN_MISSING goto bun_missing`。这是**唯一**检查 `FQ_BUN_MISSING` 的地方。 |
| **L91-92**（改写，原为 1 行 L89） | 配置提示对齐验收标准第 4 条（逐字，见 §3.4）。 |
| **L158-162**（新增） | `:bun_missing` 标签块：错误说明 + `https://bun.sh` 安装指引 + `docs\QUICKSTART.md` 锚点。 |
| **L156 / L164**（未改） | `:build_failed` 仍以 `goto fail` 收尾；`:fail` 仍是 `pause` + `popd` + `exit /b 1`。新块插在两者之间，**不会串标签**。 |

改动后的关键顺序（`start.bat`）：

```
L12-19   探测 Bun（非致命，只记 FQ_BUN_MISSING）
L22-34   端口检查（未改）
L37-53   Python venv（未改）
L55-65   :frontend —— 产物新鲜 → echo 复用 → goto environment   ← 全程不碰 Bun
L67-69   :build_frontend —— 这里才 if defined FQ_BUN_MISSING goto bun_missing
L70-81   实际构建（未改）
L83-92   :environment —— .env 创建 + 新配置提示
L94-106  :backup（未改，L95-99 原样保留）
L108-126 :launch（未改）
L128-146 :pip_failed / :venv_failed（未改）
L147-156 :build_failed（未改，文案与 goto fail 保留）
L158-162 :bun_missing（新增）
L164-167 :fail
```

### 1.2 `docs/QUICKSTART.md`（+2 / −1，改后 188 行，LF 保留）

- **L11**：`- Python 3.12 与 Bun（已附带 frontend/dist 页面产物且未过期时，启动**不需要 Bun**，见下方"提示没装 Bun / Python"）。Windows 双击路径**不需要 Docker**。`
- **L125**（新增段）：说明"产物不比 `package.json` 旧 → 直接复用、全程不需要 Bun；只有产物缺失或过期才要求安装 Bun 并给指引退出"，并提示可用窗口是否出现"复用已有 frontend\dist"自判。

### 1.3 `README.md`（+1 / −1）— 卡外一致性修正

- **L69**（Windows 一键启动小节）：`先安装 Python 3.12（勾选加入 PATH）与 Bun（若发行包已附带 frontend/dist 且未过期，则启动不需要 Bun），然后...`
  - 前后文：该句位于 `#### Windows 一键启动`（L67）之下；同段后半"需要时构建前端（否则复用 dist）"已与新行为同向，故只改这一句。
  - **未触碰** `README.md:50`（路径 B 前置条件）、`:59-60`（`bun install` / `bun run dev` 开发命令）、`:131-132`（数据/更新说明）——这些是开发者路径，Bun 本就是必需的。

---

## 2. 实测环境与方法

夹具目录 `%TEMP%\fq-vs8\`（**已在收尾时整体送入回收站**）。方法：

1. 用 `cmd /c "git show HEAD:start.bat > old-start.bat"` 导出**改动前**脚本，校验 md5 = `8A387DEBE7FB6938CB59B01B05EFD942`，与实测基线一致 → 对照组成立。
2. 每个场景造一个最小项目目录：`backend\.venv\Scripts\python.exe`（用 `where.exe` 复制充当 stub，**不会真的起服务**，只用于证明流程走到了 `:launch` 并让 `errorlevel 0` 成立）、`backend\.env.example`、`frontend\dist\index.html`、`frontend\package.json`。
3. "无 Bun"场景 = 把 `start.bat` 中**探测那两行**（`where bun` 那行与备用路径那行）替换为 `set "FQ_BUN="`，其余一字不改（等价于任务卡允许的"把探测指向不存在路径"）。
4. "产物新鲜" = `package.json` mtime 置为 −30 分钟、`index.html` 置为当前（脚本判据是 `package.json > index.html` 才算过期）；"产物过期" = `index.html` 置为 −60 分钟。
5. 直接以 `cmd /c "<case>\start.bat" < nul > out.txt 2>&1` 运行并 `cmd /c type out.txt` 取回原始输出；`< nul` 让 `pause` 立即返回。

### 2.1 关于夹具回显异常的说明（重要，不计入脚本缺陷）

首轮夹具用 `Start-Process cmd.exe -WindowStyle Hidden` 启动，捕获到形如
`'<乱码>' is not recognized as an internal or external command` 的**伪报错**。经交叉验证确认这是**夹具/宿主环境问题，不是脚本缺陷**：

- 同一份临时文件用 `cmd /c "start.bat"`、`cmd /c "call start.bat"`、`cmd /c run.bat`（非隐藏）执行，**中文与 `^)` 全部渲染正常**；只有隐藏窗口那条路径出现乱码。
- **对照组**：把**完全未改动**的原始 `start.bat`（md5 已验证为基线值）置于同一隐藏启动方式下，进入其既有中文块 `:build_failed` 时出现**同款**乱码（`'tend' is not recognized`、`The system cannot find the path specified.`）。既然未改动的旧文件同样出现，即可判定与本次改动无关。
- 因此 §3 的定稿证据**一律改用直接 `cmd /c` 调用**，绕开该假象。

---

## 3. 实测原始输出

### 3.1 验收标准 1：无 Bun + 产物新鲜 → 走到 `:launch`（**通过**）

夹具：`n-fresh-nobun`，`package.json=2026-09-11T17:28:48.9689204Z`，`index.html=2026-09-11T17:58:48.9689204Z`（产物更新）。

```
===== CASE n-fresh-nobun  (start.bat exit=0) =====
[准备] 复用已有 frontend\dist。
[配置] 已创建 backend\.env。推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填）。
[进阶] 想改用文件配置时，可用记事本编辑 backend\.env 填写 DEEPSEEK_API_KEY，保存后重启才生效。
[提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
[启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[停止] 保持本窗口打开，使用完毕按 Ctrl+C 停止服务。
C:\Users\Satanchen\AppData\Roaming\Python\Python313\Scripts\uvicorn.exe
```

（末行是 stub 被 `where` 解析出的真实路径，证明 `:launch` 的 uvicorn 行确实执行；退出码 0。）

**对照（同一夹具、改动前脚本）** —— 这正是本卡要修的 P0：

```
===== CASE o-fresh-nobun  (start.bat exit=1) =====
[错误] 未找到 Bun。请访问 https://bun.sh 安装，重新打开窗口后再双击 start.bat。
Press any key to continue . . .
```

旧脚本在同一"产物新鲜 + 无 Bun"输入下**硬停并退出 1**，新脚本走到 launch 且退出 0 → **回归被消除**。

### 3.2 验收标准 2：无 Bun + 需构建 → 给指引并退出（**通过**）

产物**缺失**：

```
===== CASE n-missing-nobun  (start.bat exit=1) =====
[错误] 未找到 Bun，而当前需要构建前端页面，无法继续。
[怎么做] 1) 打开 https://bun.sh 按官网步骤安装 Windows 版本，装完后关闭本窗口，再重新双击 start.bat；
[怎么做] 2) 如果拿到的是已附带 frontend\dist 页面产物的发行包，产物存在且未过期时本来不需要 Bun；产物被删或过期后仍需按上一步安装。
[文档] 详见 docs\QUICKSTART.md 的"提示没装 Bun / Python，或安装、构建失败"一节。
Press any key to continue . . .
```

产物**过期**（`package.json=2026-09-11T17:28:56Z` > `index.html=2026-09-11T16:58:56Z`）：

```
===== CASE n-stale-nobun  (start.bat exit=1) =====
[错误] 未找到 Bun，而当前需要构建前端页面，无法继续。
[怎么做] 1) 打开 https://bun.sh 按官网步骤安装 Windows 版本，装完后关闭本窗口，再重新双击 start.bat；
[怎么做] 2) 如果拿到的是已附带 frontend\dist 页面产物的发行包，产物存在且未过期时本来不需要 Bun；产物被删或过期后仍需按上一步安装。
[文档] 详见 docs\QUICKSTART.md 的"提示没装 Bun / Python，或安装、构建失败"一节。
Press any key to continue . . .
```

两者均**非静默、非误导**：给出 `https://bun.sh`、文档锚点、并解释了"预置产物为何原本不需要 Bun"。

### 3.3 验收标准 3：有 Bun 时行为不变（**通过**）

本机 PATH 中有 Bun（`C:\Users\Satanchen\.bun\bin\bun.exe`）。

产物新鲜 → 与改动前一致地复用、不构建：

```
===== CASE n-fresh-bun  (start.bat exit=0) =====
[准备] 复用已有 frontend\dist。
[配置] 已创建 backend\.env。推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填）。
[进阶] 想改用文件配置时，可用记事本编辑 backend\.env 填写 DEEPSEEK_API_KEY，保存后重启才生效。
[提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
[启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[停止] 保持本窗口打开，使用完毕按 Ctrl+C 停止服务。
C:\Users\Satanchen\AppData\Roaming\Python\Python313\Scripts\uvicorn.exe
```

产物过期 → 仍按老路走构建，且 `:build_failed` 文案完整保留：

```
===== CASE n-stale-bun  (start.bat exit=1) =====
[准备] 正在安装锁文件中的前端依赖，首次安装需要网络。
bun install v1.4.0 (34cbb9a40)

[8.00ms] done
[准备] 正在构建前端，请稍候。
$ exit 1
error: script "build" exited with code 1
[错误] 前端页面准备失败，通常是网络不通或 Bun 未正确安装。
[怎么做] 1) 确认网络可用后重新双击 start.bat；
[怎么做] 2) 仍失败请对照 docs\QUICKSTART.md 的"提示没装 Bun / Python，或安装、构建失败"一节处理。
[进阶] 在 frontend 目录依次运行：bun install --frozen-lockfile 与 bun run build
若 bun 不在 PATH，请使用其完整安装路径。
Press any key to continue . . .
```

（`bun install` / `bun run build` 正常被调用；夹具的 `build` 脚本故意 `exit 1`，以验证失败分支未被破坏。）

### 3.4 验收标准 4：配置提示逐字（**通过**）

对 `start.bat` 全文字符串包含性检查（PowerShell `.Contains()`）：

```
A1 推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填） => True
A2 .env 进阶含"保存后重启" => True
A3 https://bun.sh => True
A4 docs\QUICKSTART.md 锚点 => True
```

实际渲染（取自 §3.1 原始输出，非改写）：

```
[配置] 已创建 backend\.env。推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填）。
[进阶] 想改用文件配置时，可用记事本编辑 backend\.env 填写 DEEPSEEK_API_KEY，保存后重启才生效。
```

### 3.5 验收标准 5：字节级（**通过**）

```
start.bat          bytes=9682 CRLF=167 LF_only=0 strictUTF8=True
docs\QUICKSTART.md bytes=14735 CRLF=0 LF_only=187 strictUTF8=True
README.md          bytes=10677 CRLF=0 LF_only=152 strictUTF8=True
```

- `start.bat`：**LF-only = 0**（167 CRLF = 167 行，含末行）；UTF-8 严格解码（`UTF8Encoding(false, true)`，抛异常即失败）通过；无 BOM。
- 两份 Markdown 改动前后均为 LF-only（`.gitattributes` 会在 checkout 时转 CRLF），本次**保持了原有风格**，未引入混合换行。

`git diff --check`：退出码 **0**，无空白错误（stderr 仅有 git 对 md 文件 "LF will be replaced by CRLF" 的常规提示，与本次改动无关，改动前同样存在）。

```
 README.md          |  2 +-
 docs/QUICKSTART.md |  4 +++-
 start.bat          | 20 +++++++++++++++-----
 3 files changed, 19 insertions(+), 7 deletions(-)
```

### 3.6 `if` 块内 `^)` / `^|` 渲染（**通过**）

占用 8000 端口后运行新脚本：

```
===== CASE n-portbusy  (start.bat exit=1) =====
[错误] 8000 端口已被占用，通常是上一次的程序没有完全关闭。
[怎么做] 1) 先看任务栏是否还有本程序的黑色窗口，有就按 Ctrl+C 关闭；
[怎么做] 2) 还不行就重启电脑，然后再双击 start.bat。
[进阶] 想查出占用者：在命令提示符运行 netstat -ano | findstr 8000
[文档] 详见 docs\QUICKSTART.md 的"提示“8000 端口已被占用”"一节。
Press any key to continue . . .
```

`^)` 渲染为 `)`、`^|` 渲染为 `|`，无残留脱字符。新增的 `:bun_missing` 块同样逐字渲染正确（见 §3.2 原始输出，其中 `2^)` 渲染为 `2)`）。

### 3.7 标签顺序与 `goto fail` 完整性（**通过，静态核对**）

- `:build_failed`（L150）→ L156 `goto fail`，**其后不会被 `:bun_missing` 截断**。
- `:bun_missing`（L158-162）**无 `goto`**，自然落入 `:fail`（L164）→ `pause` / `popd` / `exit /b 1`，与 `:build_failed` 的收尾方式一致。
- 实测旁证：§3.2 两个场景均打印了完整指引**并且**出现 `Press any key to continue . . .` 后退出，说明落到了 `:fail` 的 `pause`，而非"batch label not found"。
- `git show HEAD:start.bat` 与本地旧文件 md5 一致（两处均 `8A387DEB...`），确保对照有效。

---

## 4. 逻辑级论证（配合 §3.1，回答"为什么产物新鲜时不需要 Bun"）

`FQ_BUN_MISSING` 在全文**只被读取一次**，即 L69（`:build_frontend` 内）。而流程在产物存在且不过期时，于 `:frontend`（L57-65）就：

```
L57  if not exist "frontend\dist\index.html" goto build_frontend   → 产物存在，不跳
L58  比较 package.json 与 index.html 的 mtime
L63  if errorlevel 1 goto build_frontend                            → 新鲜，不跳
L64  echo [准备] 复用已有 frontend\dist。
L65  goto environment                                               → 直接进入 :environment
```

即**根本不会执行到 L69**，`FQ_BUN_MISSING` 是否置位对结果无影响。§3.1 的实测输出（`[准备] 复用已有 frontend\dist。` → 配置 → `:launch`，exit 0）与之一致。

---

## 5. 未解决问题

1. **`start.bat` 无自动化测试**：本卡的全部结论来自手工实测夹具。夹具未纳入仓库（按"不删除/不新增依赖"约束，用完已送回收站），因此**该验证不可在 CI 复现**——若日后要防回归，需要 Evaluator 另行决定是否引入 bat 测试基线。
2. **构建过期判据仍只看 `package.json` 与 `dist/index.html` 的 mtime**（L56 注释已声明 `ponytail` 限制）。源码更新但 `package.json` 未动时，仍会复用旧产物——这是**既有限制，本卡未改**（任务卡"不能破坏"项与 VS-8 目标均未要求）。
3. **`docs/QUICKSTART.md:11` 与 `README.md:69` 的"你需要准备什么"仍把 Bun 列为准备项**：已用括号补上"若已附带 `frontend/dist` 且未过期则不需要 Bun"的前提。是否进一步把 Bun 降级为"仅在需要重建页面时"，属于文档口径的更大改动，超出本卡，留给编排者判断。
4. **夹具中的 stub `python.exe` 用 `where.exe` 冒充**：它会真的执行并返回 0，因此 §3.1/§3.3 能证明"走到了 `:launch` 并退出 0"，但**不能**证明真实 FastAPI 服务能起来（本卡未触碰后端，且实际起服务不在本卡范围）。

---

## 6. 风险

| 风险 | 评估 | 缓解 |
| --- | --- | --- |
| 新增 `FQ_BUN_MISSING` 未清理导致串场景 | 低 | L16 显式 `set "FQ_BUN_MISSING="`；脚本用 `setlocal`（L3），退出即回收 |
| 有人把 `:bun_missing` 插在 `:build_failed` 之前而破坏 `goto fail` 落点 | 低 | 已实测落在 `:fail`；标签顺序在 §3.7 记录 |
| 发行包未附带 `dist` 时用户仍看到 Bun 报错 | 中（预期行为） | 这正是验收标准 2 的要求；文案已明确"产物被删或过期后仍需安装"，并解释预置产物场景 |
| 文档（QUICKSTART/README）与脚本再次分叉 | 中 | 本次已三处同向（脚本提示 / QUICKSTART L11+L125 / README L69）；建议后续把该口径写进 VS-5 类一致性 checklist |
| 隐藏窗口启动时中文乱码 | 低（环境，非脚本） | 已用未改动对照组证明与本次改动无关（§2.1） |

---

## 7. 证据索引

| 证据 | 位置 |
| --- | --- |
| 基线 md5 / 字节统计 | §2、§3.5；`8A387DEBE7FB6938CB59B01B05EFD942` |
| 改动前/后同夹具对照（验收 1） | §3.1（`o-fresh-nobun` vs `n-fresh-nobun`） |
| 指引与退出（验收 2） | §3.2 |
| 有 Bun 回归（验收 3） | §3.3 |
| 逐字提示（验收 4） | §3.4 |
| CRLF / UTF-8 / diff --check（验收 5） | §3.5 |
| `^)` `^|` 渲染 | §3.6 |
| 夹具假象的对照组证伪 | §2.1 |
| 改动行号 | §1 |

**未执行**：`git commit`（按任务卡要求）。**未删除**仓库内任何文件。**未新增**任何依赖。临时夹具目录 `%TEMP%\fq-vs8\` 已用 `Microsoft.VisualBasic.FileIO.FileSystem::DeleteDirectory(..., 'SendToRecycleBin')` 送入回收站。
