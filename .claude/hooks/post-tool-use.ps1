# post-tool-use.ps1 — PostToolUse hook: 编辑后自动 lint/类型检查
# 输入：stdin JSON { tool_name, tool_input, tool_result }
# 输出：stdout JSON { hookSpecificOutput: {}, systemMessage }
# 退出码：0 = 继续

$ErrorActionPreference = 'Stop'
$inputJson = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputJson)) { exit 0 }

try {
    $data = $inputJson | ConvertFrom-Json
} catch { exit 0 }
if (-not $data -or -not $data.tool_name) { exit 0 }

# 只拦截 Edit / Write 工具
$toolName = $data.tool_name
if ($toolName -ne 'Edit' -and $toolName -ne 'Write') { exit 0 }

$PROJECT_DIR = 'E:\Code_file\Projects\finquant-hub'
$VENV_PYTHON = "$PROJECT_DIR\backend\.venv\Scripts\python.exe"
$RUFF = "$PROJECT_DIR\backend\.venv\Scripts\ruff.exe"

$messages = @()

# ---- 检查后端文件 — 运行 ruff ----
# ruff 检查通常 < 500ms，每次编辑后都跑不影响体验
$ruffResult = & $RUFF check "$PROJECT_DIR\backend" 2>&1
$ruffExit = $LASTEXITCODE
if ($ruffExit -ne 0) {
    # 提取违反摘要（跳过详细 diff）
    $errors = $ruffResult | Select-String "Found (\d+) error" | ForEach-Object { $_.Matches.Value }
    $messages += "ruff: $errors（运行 `cd backend && .venv\Scripts\python.exe -m ruff check .` 查看详情）"
}

# ---- 检查前端文件 — 只在前端文件变动时触发 ----
$filePath = $data.tool_input.file_path
if ($filePath -and $filePath -match 'frontend') {
    $buildResult = cmd /c "cd $PROJECT_DIR\frontend && bun run build 2>&1"
    $buildExit = $LASTEXITCODE
    if ($buildExit -ne 0) {
        $messages += "前端构建失败：$($buildResult | Select-String 'error' | Select-Object -Last 3 | Out-String)"
    }
}

if ($messages.Count -gt 0) {
    $result = @{
        hookSpecificOutput = @{}
        systemMessage = "⚠️ 编辑后检查发现以下问题：`n$($messages -join "`n")`n建议修复后再提交。"
    }
    Write-Output ($result | ConvertTo-Json -Depth 10 -Compress)
}

exit 0
