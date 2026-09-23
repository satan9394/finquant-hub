# EVALUATION_RESULT — Vertical Slice 8（独立验收）

> 验收者：EVALUATOR（独立，不采信实现者自述）。日期：2026-09-11。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS8.md`；实现者报告：`docs/ai/evo/IMPLEMENT_RESULT_VS8.md`。
> 验收对象：`start.bat`（工作树 HEAD 版本）。**未修改任何实现文件。**

## 判定：**ACCEPT**

产物本身四项必做核对全部独立复现通过；无阻断性缺陷。报告正文有 **2 处证据表述不准**（不影响产物正确性），列于 §5 供修正。

### 版本定位（重要，先澄清）

开始验收时 `HEAD = ec0fa6c`，验收过程中编排者又提交了 `3a47aa1`（仅 `PRODUCT_STATE.md`）。经 `git show --stat ec0fa6c` 确认，**VS-8 的实质改动位于 `ec0fa6c`**（`start.bat` 20 行变更 + `README.md` + `docs/QUICKSTART.md` + 本报告文件），其父提交为 `687bc86`。工作树与 `HEAD` 对这三个文件 `git diff --stat` 为**空** → 无提交后漂移，验收对象即已提交产物。

---

## 1. `start.bat` 三件事（独立核对，非采信报告）

### 1.1 `FQ_BUN_MISSING` 全文只被读取判定一次 ✅

`Select-String` 全文命中仅 3 处（注释中的散文提及不计）：

```
L16: set "FQ_BUN_MISSING="
L19: if not defined FQ_BUN set "FQ_BUN_MISSING=1"
L69: if defined FQ_BUN_MISSING goto bun_missing      ← 唯一读取判定，位于 :build_frontend 内
```

顶部 L12-19 已无任何 `goto fail`。独立 diff 证实被删的 5 行正是旧版致命块：

```diff
-if not defined FQ_BUN (
-    echo [错误] 未找到 Bun。请访问 https://bun.sh 安装，重新打开窗口后再双击 start.bat。
-    goto fail
-)
+if not defined FQ_BUN set "FQ_BUN_MISSING=1"
```

### 1.2 产物新鲜路径确实绕过判定 ✅

```
L57 if not exist "frontend\dist\index.html" goto build_frontend   → 存在，不跳
L59-62 powershell 比较 mtime；errorlevel 2 才 fail
L63 if errorlevel 1 goto build_frontend                          → 新鲜，不跳
L64 echo [准备] 复用已有 frontend\dist。
L65 goto environment
```

`goto build_frontend` 全文仅 L57、L63 两处，均在 `:build_frontend` **之前**；`:environment`(L83) 之后到 `:launch`(L108) 无任何回环进入构建。**不存在"置位后又回头进构建"的路径。**

### 1.3 标签完整性 ✅

`:build_failed`(L150) 末尾为 `goto fail`(L156)；新增 `:bun_missing`(L158-162) **无 `goto`**，自然落入 `:fail`(L164) 的 `pause` / `popd` / `exit /b 1`，与 `:build_failed` 收尾一致，不会串标签。

---

## 2. 字节级复核（自跑，未采信报告数字）

```
NEW start.bat bytes=9682  LF=167  CR=167  LF_only=0  md5=F3CB8DCD2D950CDB666144C12692949C
NEW strictUTF8=True（UTF8Encoding($false,$true)，无异常）  BOM=64,101,99（'@ec'，无 BOM）
```

与报告 §3.5 的 `bytes=9682 / CRLF=167 / LF_only=0 / strictUTF8=True / md5 F3CB8DCD...` **完全一致**。

旧版基线复算（`git show ec0fa6c^:start.bat`，cmd 重定向保留原始字节）：

```
OLD raw bytes=8492  LF=157  LF_only=157  md5=29F7EB2CAB5556DC1642370FDE2E8413   ← git blob 为 LF 形式
OLD + LF→CRLF 转换后：bytes=8649  md5=8A387DEBE7FB6938CB59B01B05EFD942          ← 与报告基线 md5 逐位相同
```

→ 报告的 `8649 bytes / 157 CRLF / md5 8A387DEB...` 是**真实且可复现**的（为 CRLF 工作树形态），其 §1 "git show 的 md5 与基线不同纯属换行假象"的解释成立。

---

## 3. A/B 实测（自己跑，原始输出）

夹具 `%TEMP%\vs8-eval\{old,new}\`：`frontend\dist\index.html`（当前 mtime）、`frontend\package.json`（−30 分钟）、`backend\.venv\Scripts\python.exe`（`where.exe` stub）、`backend\.env.example`。两版脚本**仅**把 Bun 探测两行替换为删除（等价于"无 Bun"），其余一字未改；`cmd /c "<case>\start.bat" <nul` 运行。8000 端口已确认空闲。

```
===== CASE old exit=1 =====
[错误] 未找到 Bun。请访问 https://bun.sh 安装，重新打开窗口后再双击 start.bat。
Press any key to continue . . .
--- backend\.env created: False

===== CASE new exit=0 =====
[准备] 复用已有 frontend\dist。
[配置] 已创建 backend\.env。推荐在网页「设置 → 模型管理」中填写 API Key（加密保存、立即生效、重启无需重填）。
[进阶] 想改用文件配置时，可用记事本编辑 backend\.env 填写 DEEPSEEK_API_KEY，保存后重启才生效。
[提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
[启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
[停止] 保持本窗口打开，使用完毕按 Ctrl+C 停止服务。
C:\Users\Satanchen\AppData\Roaming\Python\Python313\Scripts\uvicorn.exe
--- backend\.env created: True
```

旧版在**同一输入**（产物新鲜 + 无 Bun）下硬停 exit 1；新版复用产物并走到 `:launch`，exit 0，且 `backend\.env` 被创建 → 证明流程确实通过了 `:environment`。**VS-8 目标达成，前后对照成立。** 新版输出与报告 §3.1 **逐行一致**。

（副作用处理：`start.bat` L117 会 `start "" /b` 派发一个最多 90 秒的浏览器等待器；已在每次运行后按 `CommandLine like '*TcpClient*'` 定向结束该残留进程，避免 90 秒后误开浏览器。未影响被测脚本逻辑。）

---

## 4. 对实现者报告的质疑结论

| 报告主张 | 独立复核 | 结论 |
| --- | --- | --- |
| §3.1 旧脚本同输入硬停 exit 1、新脚本 exit 0 | 本机重建夹具复现，输出逐行一致 | **成立** |
| 基线 md5 `8A387DEB...` | LF→CRLF 复算逐位相同 | **成立** |
| §2.1 隐藏窗口乱码是夹具/环境问题 | 未复现其隐藏窗口夹具（成本高）；但直接 `cmd /c` 路径中文、`^)`、`^|` 全部渲染正常，且定稿证据全部来自该路径 | **不影响判定**（其结论未被依赖） |
| §3.4 逐字包含性 | 自跑 `.Contains()`：A1=`True`、A2=`True` | **成立** |
| §5.4 "stub python.exe 不能证明真实服务能起来" | **是诚实的边界限定**：报告明说只能证明"走到 `:launch` 且退出 0"，未越界宣称服务可用 | **成立** |
| §3.7 "`git show HEAD:start.bat` 与本地旧文件 md5 一致（两处均 8A387DEB）" | **不成立**：`git show` 原样输出的是 LF blob，md5=`29F7EB2C...`；需 LF→CRLF 转换才等于 `8A387DEB...`。报告自身 §1 已正确说明此点，§3.7 与之自相矛盾 | 证据表述错误（不影响对照有效性） |
| §1.1 "L156 / L164（未改），`:build_failed` 仍以 `goto fail` 收尾" | **"未改"不准确**：旧版 `:build_failed` 无 `goto fail`（靠自然落入 `:fail`），该行是**本次新增**（diff 中为 `+goto fail`）。但"改后以 `goto fail` 收尾"这一实质结论**正确** | 措辞错误（不影响产物） |

---

## 5. 残留观察（非阻断，供后续卡参考）

1. **`errorlevel 2` 分支不涉及 Bun，文案准确**：L59-61 在 `frontend\package.json` 缺失/不可读时给"无法检查前端产物时间"并 `goto fail`。不是 Bun 误导，但这是"产物存在却也起不来"的路径——若发行包只带 `frontend\dist` 不带 `package.json`，仍会硬停。属**既有限制，本卡未触碰**（`frontend/package.json` 为仓库跟踪文件，正常发行包应含）。
2. **`:build_failed` 文案（L151 "通常是网络不通或 Bun 未正确安装"）不构成误导**：无 Bun 时 L69 已先行拦截并进入 `:bun_missing`，该文案只在**确有 Bun 但构建失败**时出现。逻辑上不可达"缺 Bun 却看到 build_failed"。
3. **有 Bun 时行为零变化（已用 diff 核实）**：本次对 `start.bat` 的改动为 `+15/−5`，全部集中在 L13-14 注释、L16、L19、L68-69、L91-92、L156 新增 `goto fail`、L158-162 新增块。`call "%FQ_BUN%" install --frozen-lockfile`(L73)、`call "%FQ_BUN%" run build`(L78)、`:build_failed` 全部文案（L151-155）**均在 diff 中未出现**，即逐字未改。
4. **文档三处同向 ✅**：脚本 L91/L92 主推「设置 → 模型管理」并把 `.env` 降为"进阶"；`docs/QUICKSTART.md` L11 与新增 L125 补"产物未过期则不需要 Bun"前提，L66 主推模型管理；`README.md` L69 同步前提并保留"在网页「设置 → 模型管理」新增模型并粘贴 API Key"主口径。`README.md:50`（开发者路径前置条件）与 `:59-60`（`bun run dev`）保持 Bun 必需，属合理的路径区分，非分叉。
5. 报告 §4 给出的"产物新鲜时不执行到 L69"逻辑论证与实测一致，可采信。

## 6. 验收边界

本次验收证明的是：**脚本控制流与文案在夹具层面的正确性**。未证明（也不在本卡范围）：真实 FastAPI 服务可启动、真实 Bun 构建成功、发行包实际打包形态。实现者 §5 已作同等限定，口径一致。

---

## 7. 证据索引

| 证据 | 来源 |
| --- | --- |
| `FQ_BUN_MISSING` 全文命中（L16/L19/L69） | `Select-String start.bat` |
| 旧版致命块被删、`+goto fail` 被加 | `git --no-pager diff 687bc86 ec0fa6c -- start.bat` |
| 字节/换行/UTF-8/md5 | `[IO.File]::ReadAllBytes` + `Get-FileHash` + `UTF8Encoding($false,$true)` |
| 基线 md5 复算 | `git show ec0fa6c^:start.bat` + LF→CRLF 转换 |
| A/B 运行原始输出 | `%TEMP%\vs8-eval\{old,new}\out.txt`（已随夹具送回收站） |
| 文档同向 | `git diff ec0fa6c^ ec0fa6c -- docs/QUICKSTART.md README.md` |

临时目录 `%TEMP%\vs8-eval\` 已用 `Microsoft.VisualBasic.FileIO.FileSystem::DeleteDirectory(...,'SendToRecycleBin')` 送入回收站（已验证不存在）。**未删除仓库内任何文件，未修改任何实现文件。**
