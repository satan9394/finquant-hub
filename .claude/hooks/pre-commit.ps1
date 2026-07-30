# pre-commit.ps1 — PreCommit hook: 提交前自动跑完整测试套件
# 输出：stdout JSON { systemMessage }
# 退出码：0 = 允许提交，非零 = 阻止提交

$ErrorActionPreference = 'Stop'

$PROJECT_DIR = 'E:\Code_file\Projects\finquant-hub'
$VENV_PYTHON = "$PROJECT_DIR\backend\.venv\Scripts\python.exe"
$FAILURE_MESSAGE = "⛔ 提交被阻止：后端测试失败。`n修复后重试提交。"

Write-Output "🚦 PreCommit: 运行后端测试套件..."

$testResult = & $VENV_PYTHON -m pytest "$PROJECT_DIR\backend" -q 2>&1
$testExit = $LASTEXITCODE

if ($testExit -ne 0) {
    $result = @{
        hookSpecificOutput = @{
            permissionDecision = 'deny'
            updatedInput = $null
        }
        systemMessage = "$FAILURE_MESSAGE`n`n$($testResult | Out-String)"
    }
    Write-Output ($result | ConvertTo-Json -Depth 10 -Compress)
    exit 1
}

$okMsg = $testResult | Select-String "passed|failed"
Write-Output "✅ PreCommit: $($okMsg.Line)"
exit 0
