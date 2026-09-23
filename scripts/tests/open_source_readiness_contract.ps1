$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts/audit_open_source_readiness.ps1"
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw "audit_open_source_readiness.ps1 parser errors: $($parseErrors -join '; ')"
}

$text = Get-Content -Raw -Encoding UTF8 $scriptPath
foreach ($marker in @("ROOT_LICENSE", "TRACKED_SECRET_FILES", "SECRET_PREFIX_SCAN", "REFERENCE_TRACKED", "WQ_CATALOG_LICENSE", "NESTED_GIT", "TRACKED_FILE_100MB", "WORKTREE", "OPEN_SOURCE_READINESS=")) {
    if (-not $text.Contains($marker)) {
        throw "Open-source readiness audit is missing: $marker"
    }
}
foreach ($forbidden in @("Remove-Item", "git add", "git commit", "git push", "api_key.*value", "down -v")) {
    if ($text -match [regex]::Escape($forbidden)) {
        throw "Open-source readiness audit contains a forbidden mutation or value output: $forbidden"
    }
}

Write-Host "OPEN_SOURCE_READINESS_CONTRACT_PASS"
