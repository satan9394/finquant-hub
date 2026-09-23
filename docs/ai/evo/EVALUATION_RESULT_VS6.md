# EVALUATION RESULT — VS-6（独立验收）

- **卡**：VS-6 首启启动体验（浏览器等服务就绪后自动打开 + 四个失败分支面向非技术用户）
- **实现 commit**：`5128e3a`（产品演进 VS-6）
- **验收人**：EVALUATOR（独立，不修改任何实现文件）
- **验收时间**：2026-09-11
- **判定**：**REJECT**（2 项必修；致命风险已排除，修复量小）

---

## 0. 结论速览

| 验收项 | 结果 |
| --- | --- |
| ① `:launch` 不再先开浏览器（无 uvicorn 前的直接 `start "" "http://..."`） | 通过 |
| ① 等待器在**后台**、前台 uvicorn 不被阻塞（致命风险点） | 通过（实测 199ms 即继续） |
| ① 就绪后打开、未就绪会等待 | 通过（就绪 504ms 返回；未就绪持续等待） |
| ① 等待上限 ≤90s | **不通过**（实测 90 次迭代 ≈ 295s） |
| ① 超时也打开一次 | 通过（循环外兜底 `Start-Process`） |
| ② 四个失败分支「原因+步骤+文档指引」且**与实际错误匹配** | **部分不通过**（Python 环境分支信息与实际错误不符） |
| ② 保留进阶命令 | 通过（4/4 分支均有 `[进阶]`） |
| 无删除调用 | 通过 |
| 换行/编码（CRLF + UTF-8 严格解码） | 通过 |
| 提交范围 | 通过（恰好 4 文件） |
| QUICKSTART 与新行为一致、无「浏览器可能比服务更早打开」 | 通过 |

---

## 1. 致命风险点专项（重点质疑 1）：`:launch` 前台是否被等待器阻塞

**结论：不阻塞，服务能正常起来。此风险排除。**

- 结构证据（`start.bat:111-115`）：第 111-112 行为 `rem`；第 113 行 `start "" /b powershell.exe ...` 后，第 114 行 `cd backend`、第 115 行 `".venv\Scripts\python.exe" -m uvicorn ...` 紧随其后，中间无任何 `goto`/`pause`/管道重定向。第 113 行的 `""` 是 `start` 的标题占位，`/b` 表示不开新窗口、异步返回。
- 实测证据（复刻同一结构，把 `Start-Process` 换成写标记文件以免真的弹浏览器）：

  ```
  after_marker_at_ms = 199      <-- 后继命令在 199ms 就执行了
  cmd_alive_at_that_moment = True
  ```

  即 `start "" /b` 立即返回，后继行（对应 uvicorn）在 0.2 秒内即被执行；等待器的 6 秒轮询完全在后台进行。
- 附带确认：`start "" /b <console app>` 的子进程与 `cmd` **共用同一控制台**，用户 Ctrl+C / 关窗口时等待器一同结束，不会残留孤儿进程。

---

## 2. 等待器语义实测（重点质疑 2）

命令与 `start.bat:113` 同构（仅把 `Start-Process 'http://...'` 替换为标记文件输出，避免评测时真的弹出浏览器）：

| 场景 | 命令要点 | 实测结果 | 判定 |
| --- | --- | --- | --- |
| 端口未监听，轮询 3 次 | `for(i<3){connect 18998}catch{sleep 1}` | `TIMEOUT_AFTER_LOOP`，9855ms | 正确等待，未提前返回 |
| 端口已监听（临时 TcpListener） | `for(i<90){connect 18999; → 输出 CONNECTED; exit 0}` | `CONNECTED_LAUNCH`，**504ms** | 就绪即返回，无多余等待 |
| 失败路径异常 | `Start-Process` 抛错时（无默认浏览器等）走 `catch` → `Start-Sleep 1` → 继续轮询 | 循环内异常被静默吞掉 | 见 3.3：非静默兜底（循环外那次未被捕获，会打印 PowerShell 报错）；用户仍可从窗口看到「也可手动访问」，**不构成「既没浏览器也没提示」** |

---

## 3. 判定项（REJECT 依据）

### 3.1 【必修·阻断】等待上限不是 90 秒：把「迭代次数」当成了「秒」

- **位置**：`start.bat:112`（注释）、`start.bat:113`（循环）
- **问题**：注释写「后台等待最多约 90 秒」，但循环是 `for($i=0;$i -lt 90;$i++){ try{connect}catch{Start-Sleep -Seconds 1} }`——**每轮耗时 = 连接失败耗时 + 1 秒**，与「秒」无关。卡面验收标准明确写「≤90s」，实测不达标。
- **证据**（本机实测）：

  ```
  单次失败连接（127.0.0.1 未监听端口）: 2092ms
  再测: 2358ms / 2054ms / 2037ms
  用 IPAddress::Loopback 对象: 2038ms（排除字符串解析/双栈回退的解释）
  用 'localhost': 4110ms
  3 轮完整循环: 9855ms  -> 约 3.28s/轮
  外推 90 轮: 90 x 3.28s ≈ 295s ≈ 4.9 分钟
  ```

  注：本机 loopback 被拒连接的 2 秒延迟可能是评测沙箱/安全过滤造成；无论成因，**计数迭代而非计时**的设计使等待时长随机器变化，若目标机出现 SYN 丢弃（DROP 而非 REJECT，单次可达 21s），90 轮将膨胀到 30 分钟以上。
- **根因**：用循环计数近似时间上限。
- **建议修复**（一行级，机器无关）：改用截止时间。

  ```bat
  rem 后台等待最多约 90 秒；超时同样尝试打开一次
  start "" /b powershell.exe -NoProfile -Command "$deadline=(Get-Date).AddSeconds(90); while((Get-Date) -lt $deadline){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8000); $c.Close(); Start-Process 'http://127.0.0.1:8000'; exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; Start-Process 'http://127.0.0.1:8000'"
  ```

- **修复后预期**：无论单次连接耗时多少，兜底打开都不晚于 ~90 秒，注释与实现一致。
- **验证方法**：在 8000 无监听的情况下双击/运行 `start.bat`，计时到浏览器（或兜底动作）触发的时间应 ≤ 95s。

### 3.2 【必修·应改】Python 环境分支的「原因」与实际错误不匹配

- **位置**：`start.bat:128`（`:venv_failed` 文案），触发点包含 `start.bat:53`
- **问题**：`start.bat:52-53` 的 `pip install -r requirements.txt` 失败时也 `goto venv_failed`，但文案断言「**通常是没有装 Python 3.12 或安装时没勾选加入 PATH**」，并让用户去下载安装包、重装并勾选 PATH、**重启电脑**。而此刻 `.venv` 是刚刚由本机 Python 3.12 成功创建的（`start.bat:41/48` 已成功），前提自相矛盾——真实原因通常是**网络不通/磁盘空间/依赖下载失败**。这属于卡面「重点质疑」中点名的「让用户去改不该改的东西」。
- **证据**：`:venv_failed` 的三个入口分别为 `start.bat:42`（`py -3.12 -m venv` 失败）、`start.bat:49`（`python -m venv` 失败）、`start.bat:53`（**pip install 失败，非环境缺失**）。
- **建议修复**：把 pip 安装失败拆成独立分支，文案改为「依赖下载失败，通常是网络问题」+ 重试/换网建议，保留 `[进阶] pip install -r requirements.txt`；仅保留真正缺 Python 3.12 的入口指向官网重装。
- **验证方法**：断网后删除/复用现有 `.venv` 触发安装，确认提示指向网络而非重装 Python。

### 3.3 【建议·不阻断】文档指引的锚点对不准

- `start.bat:131` 指向 `docs\QUICKSTART.md` 的「第二步」——但 Python 3.12 的下载与勾选 PATH 步骤实际在 `docs/QUICKSTART.md:13-22`「你需要准备什么」，而「第二步」是 `QUICKSTART.md:32`「双击 start.bat」。非技术用户按「第二步」找安装图文会找不到。建议改指「你需要准备什么」一节（或同时给出 Python 3.12 链接所在段落）。
- `start.bat:24` 指向「常见问题」（`QUICKSTART.md:92` 的章节名）与 `start.bat:32` 指向「提示 8000 端口已被占用」，均非文档中的精确标题（实际标题为 `QUICKSTART.md:94`「提示“8000 端口已被占用”或“5173 已被占用”」）。建议按原文标题逐字复制，便于搜索/对照。
- `start.bat:141` 指向「提示没装 Bun / Python」一节——与 `QUICKSTART.md:119` 标题前缀一致，**无误**；`start.bat:117/119` 指向「常见问题」为泛指引，可接受。

### 3.4 【观察·未验证，不作为判定依据】就绪判定是「端口可连接」，不等于「应用可服务」

uvicorn 在 `startup()` 中先 `create_server()`（绑定并 listen），再执行 lifespan 启动（本项目含 52 张表初始化）。因此轮询探测到端口可连接时，应用可能尚未完成初始化，浏览器仍可能短暂撞到一次错误页。QUICKSTART:40 已用「**一般**不会先看到『无法连接』」做了弱化表述，未见明显夸大；本次未端到端启动真实服务验证该窗口宽度，故仅记录。

---

## 4. 通过项证据

### 4.1 结构：`:launch` 已无「uvicorn 之前直接开浏览器」

`git show 5128e3a -- start.bat` 的关键改动：

```diff
-start "" "http://127.0.0.1:8000"
+rem 首启体验：等 8000 端口可连接后再打开浏览器…
+start "" /b powershell.exe -NoProfile -Command "for($i=0;$i -lt 90;…"
 cd backend
 ".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

浏览器启动不再是 uvicorn 之前的一次 `start ""`，而是交给后台等待器，**改法正确**。

### 4.2 成功路径无行为变化

diff 的改动仅落在：端口检查提示文案、`:launch` 的等待器、uvicorn 失败分支、`:venv_failed`、`:build_failed`。**端口（8000，`start.bat:22/115`）、Ctrl+C 语义（`:108`）、备份段（`:91-103`）、退出码（成功 `exit /b 0` `:125`，失败 `exit /b 1` `:148`）均未改动**；`set "SERVE_FRONTEND=1"` / `set "LOCAL_ONLY_MODE=1"`（`:109-110`）保持不动。

### 4.3 无删除调用

`grep 'Item|Delete|delete|RecycleBin|copy /b|erase' start.bat` 仅 3 处命中，全部无害：`Get-Item`（`:58` 时间比较）、`copy /b`（`:84` 复制模板）、`New-Item`/`Copy-Item`/`Get-ChildItem`（`:96` 备份）。无任何删除/回收站以外的清理调用。

### 4.4 换行与编码（字节级）

```
file_len = 7863 bytes
CR = 148, CRLF_pairs = 148, LF_total = 148, lone_CR = 0, bare_LF_only = 0
BOM = 40-65-63  ("@ec"，无 UTF-8 BOM)
UTF-8 严格解码（ExceptionFallback）= OK, chars = 5829, contains_CJK = True
```

即**全部 148 个换行均为 CRLF、无裸 LF、无 BOM、UTF-8 严格解码通过、中文完整无乱码**。

### 4.5 提交范围

```
docs/QUICKSTART.md                      |  4 ++--
docs/ai/evo/IMPLEMENTATION_BRIEF_VS6.md | 46 +++++++
docs/ai/evo/IMPLEMENT_RESULT_VS6.md     | 30 +++++
start.bat                               | 37 +++++-----
4 files changed, 102 insertions(+), 15 deletions(-)
```

恰好 `start.bat` + `QUICKSTART.md` + 两个 evo 文档，无越界改动。

### 4.6 QUICKSTART 与实现一致

- `QUICKSTART.md:40`：已改为「脚本会在服务就绪后**自动打开默认浏览器**…（它会等一会儿，直到页面能打开为止，因此一般不会先看到"无法连接"）」，并保留「没自动弹出就等 `Uvicorn running` 后手动访问」的兜底。
- `QUICKSTART.md:65`：已改为「等服务就绪后浏览器会**自动打开**」。
- 全仓检索「浏览器可能比服务更早打开」仅命中历史评测记录 `docs/ai/evo/RAW_*_findings.md`（原始发现存档，非用户文档）；**面向用户的 `docs/QUICKSTART.md` 已无该相反表述**。
- 遗留不一致：`docs/ai/evo/IMPLEMENT_RESULT_VS6.md:12/29` 声称「最多等 ~90 秒」，与 3.1 的实测不符；修复 3.1 后该文档自然成立。

---

## 5. 复验清单（修复后）

1. 断网/慢启动场景：临时占用 8000 使其不可用，运行 `start.bat`，计时兜底打开动作 ≤95s（对应 3.1）。
2. 模拟 pip 失败（如临时改 `requirements.txt` 为不存在的包名），确认提示指向网络/依赖而非「重装 Python 3.12」（对应 3.2）。
3. 正常路径回归：8000 空闲时双击 `start.bat`，确认服务在窗口内正常启动、浏览器在服务就绪后打开、Ctrl+C 退出码为 0（确认等待器未影响前台）。
4. 复跑字节级检查：`CR=CRLF=LF=行数`、UTF-8 严格解码通过。
