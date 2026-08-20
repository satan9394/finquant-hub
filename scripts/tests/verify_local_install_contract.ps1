$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts/verify_local_install.ps1"
$attributesPath = Join-Path $projectRoot ".gitattributes"
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw "verify_local_install.ps1 parser errors: $($parseErrors -join '; ')"
}
if (-not (Test-Path -LiteralPath $attributesPath -PathType Leaf) -or
    (Get-Content -Raw -Encoding UTF8 $attributesPath) -notmatch '(?m)^\*\.ps1\s+text\s+eol=lf\s*$') {
    throw ".gitattributes must keep PowerShell scripts LF-only in Windows clones"
}
$scriptBytes = [IO.File]::ReadAllBytes($scriptPath)
for ($index = 1; $index -lt $scriptBytes.Length; $index++) {
    if ($scriptBytes[$index - 1] -eq 13 -and $scriptBytes[$index] -eq 10) {
        throw "verify_local_install.ps1 contains CRLF bytes"
    }
}

$text = Get-Content -Raw -Encoding UTF8 $scriptPath
$requiredMarkers = @(
    'finquant-hub-aios083-',
    'config", "--quiet',
    'build',
    'up", "-d',
    'api/health',
    'api/auth/me',
    'local-capabilities/v1',
    'aios083.persistence_probe',
    'fingerprint_match',
    'integrity_check',
    'LOCAL_INSTALL_VERIFY_PASS'
)
foreach ($marker in $requiredMarkers) {
    if (-not $text.Contains($marker)) {
        throw "Local install verifier is missing contract marker: $marker"
    }
}

$forbidden = @('down -v', 'volume rm', 'docker volume prune', 'Remove-Item', '-p finquant-hub-local')
foreach ($marker in $forbidden) {
    if ($text.Contains($marker)) {
        throw "Local install verifier contains forbidden operation or target: $marker"
    }
}

Write-Host "LOCAL_INSTALL_CONTRACT_PASS"
