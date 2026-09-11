@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
rem 从脚本所在目录运行，支持从资源管理器双击及带空格的路径。
pushd "%~dp0"
if errorlevel 1 (
    echo [错误] 无法进入项目目录，请把项目解压到可访问的本地文件夹。
    pause
    exit /b 1
)

rem 优先使用 PATH 中的 Bun，其次使用本机已知安装位置。
set "FQ_BUN="
for /f "delims=" %%B in ('where bun 2^>nul') do if not defined FQ_BUN set "FQ_BUN=%%B"
if not defined FQ_BUN if exist "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" set "FQ_BUN=D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe"
if not defined FQ_BUN (
    echo [错误] 未找到 Bun。请访问 https://bun.sh 安装，重新打开窗口后再双击 start.bat。
    goto fail
)

rem 固定使用 8000；占用时退出，不换端口、不结束其他进程。
powershell.exe -NoProfile -Command "try { if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 8000) { exit 1 }; exit 0 } catch { exit 2 }"
if errorlevel 2 (
    echo [错误] 无法检查端口状态。请重启电脑后重试；仍失败请查看 docs\QUICKSTART.md 的"常见问题"。
    goto fail
)
if errorlevel 1 (
    echo [错误] 8000 端口已被占用，通常是上一次的程序没有完全关闭。
    echo [怎么做] 1^) 先看任务栏是否还有本程序的黑色窗口，有就按 Ctrl+C 关闭；
    echo [怎么做] 2^) 还不行就重启电脑，然后再双击 start.bat。
    echo [进阶] 想查出占用者：在命令提示符运行 netstat -ano ^| findstr 8000
    echo [文档] 详见 docs\QUICKSTART.md 的"提示“8000 端口已被占用”"一节。
    goto fail
)

rem 仅在缺少项目 Python 环境时创建，并安装 requirements.txt 中的现有依赖。
if exist "backend\.venv\Scripts\python.exe" goto frontend
echo [准备] 正在创建 Python 3.12 环境，首次安装可能需要几分钟。
where py >nul 2>&1
if errorlevel 1 goto python_path
call py -3.12 -m venv "backend\.venv"
if errorlevel 1 goto venv_failed
goto install_backend

:python_path
call python -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>&1
if errorlevel 1 goto venv_failed
call python -m venv "backend\.venv"
if errorlevel 1 goto venv_failed

:install_backend
"backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if errorlevel 1 goto pip_failed

:frontend
rem ponytail: 只按 package.json 与 index.html 的时间判断过期；源码更新后需手动重建。
if not exist "frontend\dist\index.html" goto build_frontend
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; try { if ((Get-Item -LiteralPath 'frontend/package.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath 'frontend/dist/index.html').LastWriteTimeUtc) { exit 1 }; exit 0 } catch { exit 2 }"
if errorlevel 2 (
    echo [错误] 无法检查前端产物时间，请确认 frontend\package.json 存在且可读。
    goto fail
)
if errorlevel 1 goto build_frontend
echo [准备] 复用已有 frontend\dist。
goto environment

:build_frontend
cd frontend
if exist "node_modules\" goto run_build
echo [准备] 正在安装锁文件中的前端依赖，首次安装需要网络。
call "%FQ_BUN%" install --frozen-lockfile
if errorlevel 1 goto build_failed

:run_build
echo [准备] 正在构建前端，请稍候。
call "%FQ_BUN%" run build
if errorlevel 1 goto build_failed
if not exist "dist\index.html" goto build_failed
cd ..

:environment
rem 只复制模板；已有配置不覆盖，不读取或显示任何密钥。
if exist "backend\.env" goto backup
copy /b "backend\.env.example" "backend\.env" >nul
if errorlevel 1 (
    echo [错误] 无法复制 backend\.env.example，请确认模板存在且目录可写。
    goto fail
)
echo [配置] 已创建 backend\.env，可用记事本填写 DEEPSEEK_API_KEY，保存后重启。

:backup
rem G-01: 启动前自动备份数据库（服务未启动时 WAL 已落盘，安全）。失败不阻塞启动。
rem 滚动保留最新 7 份，超过时只提示不自动删除（遵守"删除一律进回收站"铁律，由用户处理）。
if not exist "backend\data\finquant.db" goto launch
powershell.exe -NoProfile -Command ^
  "$db='backend\data\finquant.db'; if(-not (Test-Path $db)){exit 0}; $dir=Join-Path (Split-Path $db -Parent) 'backups'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'; $dest=Join-Path $dir ('finquant-backup-'+$stamp+'.db'); Copy-Item -LiteralPath $db -Destination $dest -Force -ErrorAction SilentlyContinue; if(-not (Test-Path $dest)){exit 1}; $files=@(Get-ChildItem -LiteralPath $dir -Filter 'finquant-backup-*.db' | Sort-Object Name -Descending); if($files.Count -gt 7){ Write-Host '[提示] 备份已超过 7 份，请按需保留后手动清理（回收站）多余文件。' }; exit 0"
if errorlevel 1 goto backup_failed
echo [准备] 已备份数据库到 backend\data\backups。
goto launch

:backup_failed
echo [提示] 数据库备份失败，不影响启动；数据仍可用（可检查磁盘空间后重试）。
goto launch

:launch
echo [提示] AI 聊天、讨论和研究需要有效的模型 API key；未配置时仍可使用非 AI 功能。
echo [启动] 正在启动服务，就绪后会自动打开浏览器（也可手动访问 http://127.0.0.1:8000）。
echo [停止] 保持本窗口打开，使用完毕按 Ctrl+C 停止服务。
set "SERVE_FRONTEND=1"
set "LOCAL_ONLY_MODE=1"
rem 首启体验：等 8000 端口可连接后再打开浏览器，避免用户先看到"无法连接"错误页。
rem 按"截止时间"计时（本轮最多 90 秒）——不能按循环次数，因为每次失败连接本身就要 2 秒左右。
rem 超时同样尝试打开一次（窗口已提示可手动访问）。
start "" /b powershell.exe -NoProfile -Command "$deadline=(Get-Date).AddSeconds(90); while((Get-Date) -lt $deadline){ try{ $c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',8000); $c.Close(); Start-Process 'http://127.0.0.1:8000'; exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; Start-Process 'http://127.0.0.1:8000'"
cd backend
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
if errorlevel 1 (
    echo [错误] 服务启动失败。请先看本窗口上方最后几行的红字/错误信息。
    echo [怎么做] 1^) 关闭本窗口，重新双击 start.bat 再试一次；
    echo [怎么做] 2^) 仍失败请把本窗口内容截图，对照 docs\QUICKSTART.md 的"常见问题"排查。
    echo [进阶] 依赖不完整时，可在 backend 目录运行：
    echo .venv\Scripts\python.exe -m pip install -r requirements.txt
    goto fail
)
popd
exit /b 0

:pip_failed
echo [错误] 依赖下载/安装失败。此时 Python 环境已就绪，问题通常出在网络或磁盘空间。
echo [怎么做] 1^) 确认网络可用（必要时切换网络或稍后重试），关闭本窗口后重新双击 start.bat；
echo [怎么做] 2^) 检查磁盘剩余空间是否充足；
echo [怎么做] 3^) 仍失败请把本窗口最后几行错误截图，对照 docs\QUICKSTART.md 的"常见问题"排查。
echo [进阶] 手动补齐依赖：在 backend 目录运行 .venv\Scripts\python.exe -m pip install -r requirements.txt
goto fail

:venv_failed
echo [错误] Python 运行环境准备失败，通常是没有装 Python 3.12 或安装时没勾选加入 PATH。
echo [怎么做] 1^) 打开 https://www.python.org/downloads/release/python-31210/ 下载 Windows 安装包；
echo [怎么做] 2^) 安装时务必勾选 Add python.exe to PATH，装完重启电脑；
echo [怎么做] 3^) 重新双击 start.bat。详细图文步骤见 docs\QUICKSTART.md 的"你需要准备什么"。
echo [进阶] 若你熟悉命令行，也可在项目根目录依次运行：
echo cd backend
echo python -m venv .venv
echo .venv\Scripts\python.exe -m pip install -r requirements.txt
goto fail

:build_failed
echo [错误] 前端页面准备失败，通常是网络不通或 Bun 未正确安装。
echo [怎么做] 1^) 确认网络可用后重新双击 start.bat；
echo [怎么做] 2^) 仍失败请对照 docs\QUICKSTART.md 的"提示没装 Bun / Python，或安装、构建失败"一节处理。
echo [进阶] 在 frontend 目录依次运行：bun install --frozen-lockfile 与 bun run build
echo 若 bun 不在 PATH，请使用其完整安装路径。

:fail
pause
popd
exit /b 1
