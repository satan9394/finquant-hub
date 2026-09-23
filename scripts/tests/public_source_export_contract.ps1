$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$scriptPath = Join-Path $projectRoot "scripts/export_public_source.ps1"
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw "export_public_source.ps1 parser errors: $($parseErrors -join '; ')"
}

$text = Get-Content -Raw -Encoding UTF8 $scriptPath
foreach ($marker in @("public-source-manifest/v1", "dirty_worktree_allowlisted_snapshot", "wq_catalogue", "tree_sha256", "Destination must be outside", "Destination already exists")) {
    if (-not $text.Contains($marker)) {
        throw "Public-source exporter is missing: $marker"
    }
}
foreach ($forbidden in @("Remove-Item", "MASTER_KEY=")) {
    if ($text -match [regex]::Escape($forbidden)) {
        throw "Public-source exporter contains a forbidden mutation or secret value marker: $forbidden"
    }
}
if ($text -match '(?im)^\s*&?\s*git\s+(init|add|commit|push)\b') {
    throw "Public-source exporter contains a forbidden Git mutation"
}

$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss") + "-" + [guid]::NewGuid().ToString("N").Substring(0, 6)
$destination = Join-Path ([IO.Path]::GetTempPath()) "finquant-hub-public-contract-$runId"
& $scriptPath -Destination $destination | Out-Host

$manifestPath = Join-Path $destination "PUBLIC_SOURCE_MANIFEST.json"
$manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
if ($manifest.schema_version -ne "public-source-manifest/v1" -or
    $manifest.source_kind -ne "dirty_worktree_allowlisted_snapshot" -or
    $manifest.included_file_count -lt 1 -or
    $manifest.tree_sha256 -notmatch '^[a-f0-9]{64}$') {
    throw "Public-source manifest contract is invalid"
}
if ($manifest.excluded_counts.reference -lt 1 -or $manifest.excluded_counts.wq_catalogue -lt 1 -or
    $manifest.excluded_counts.dependencies -lt 1 -or $manifest.excluded_counts.database -lt 1) {
    throw "Public-source exclusion counts do not prove the required boundaries"
}

$actualFiles = @(Get-ChildItem -LiteralPath $destination -File -Force -Recurse)
$forbiddenFiles = @($actualFiles | Where-Object {
    $relative = $_.FullName.Substring($destination.Length).TrimStart('\', '/').Replace('\', '/')
    $relative -match '(^|/)\.git(/|$)' -or
    $relative -match '(^|/)reference(/|$)' -or
    $relative -match '(?i)(^|/)wq_fields(_summary)?\.json$' -or
    $relative -match '(?i)(^|/)\.env(?:\.|$)' -and $_.Name -ine '.env.example' -or
    $_.Name -match '(?i)\.(db|sqlite|sqlite3)(?:[.-].*)?$'
})
if ($forbiddenFiles.Count -ne 0) {
    throw "Forbidden files escaped into public source: $($forbiddenFiles.FullName -join ', ')"
}
foreach ($entry in $manifest.files) {
    $path = Join-Path $destination ($entry.path.Replace('/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Manifest entry is missing: $($entry.path)"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($actualHash -ne $entry.sha256) {
        throw "Manifest hash mismatch: $($entry.path)"
    }
}

$existingRefused = $false
try {
    & $scriptPath -Destination $destination 2>$null | Out-Null
} catch {
    $existingRefused = $_.Exception.Message -match "already exists"
}
if (-not $existingRefused) { throw "Exporter did not refuse an existing destination" }

$insideDestination = Join-Path $projectRoot ".public-export-contract-forbidden"
$insideRefused = $false
try {
    & $scriptPath -Destination $insideDestination 2>$null | Out-Null
} catch {
    $insideRefused = $_.Exception.Message -match "outside"
}
if (-not $insideRefused -or (Test-Path -LiteralPath $insideDestination)) {
    throw "Exporter did not refuse a destination inside the project"
}

Write-Host "PUBLIC_SOURCE_EXPORT_CONTRACT_PASS"
Write-Host "Retained contract export: $destination"
