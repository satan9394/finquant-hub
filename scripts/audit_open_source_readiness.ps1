$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = Split-Path -Parent $PSScriptRoot
$blocked = 0
$warnings = 0

function Write-Result {
    param(
        [ValidateSet("PASS", "WARN", "BLOCKED")]
        [string]$Level,
        [string]$Code,
        [string]$Message
    )
    Write-Host "[$Level] $Code - $Message"
    if ($Level -eq "BLOCKED") { $script:blocked++ }
    if ($Level -eq "WARN") { $script:warnings++ }
}

Push-Location $projectRoot
try {
    $license = Get-ChildItem -LiteralPath $projectRoot -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^LICENSE(?:\.|$)' }
    if ($license) {
        Write-Result PASS "ROOT_LICENSE" "Root license file exists."
    } else {
        Write-Result BLOCKED "ROOT_LICENSE" "No root LICENSE exists; maintainer legal choice is required."
    }

    foreach ($required in @("SECURITY.md", "CONTRIBUTING.md", "docs/LOCAL_DATA_AND_PRIVACY.md", "docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md")) {
        if (Test-Path -LiteralPath $required -PathType Leaf) {
            Write-Result PASS "COMMUNITY_FILE" "Found $required."
        } else {
            Write-Result BLOCKED "COMMUNITY_FILE" "Missing $required."
        }
    }

    $tracked = @(git -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw "git ls-files failed" }
    $trackedSensitive = @($tracked | Where-Object {
        ($_ -match '(^|/)\.env(?:\..+)?$' -and $_ -notmatch '\.env\.example$') -or
        $_ -match '\.(?:pem|key|p12|pfx)$'
    })
    if ($trackedSensitive.Count -eq 0) {
        Write-Result PASS "TRACKED_SECRET_FILES" "No tracked secret-like env/credential filename found."
    } else {
        foreach ($path in $trackedSensitive | Select-Object -First 20) {
            Write-Result BLOCKED "TRACKED_SECRET_FILE" $path
        }
    }

    $rg = Get-Command rg -ErrorAction SilentlyContinue
    if ($null -eq $rg) {
        Write-Result BLOCKED "SECRET_SCAN_TOOL" "rg is required for the value-redacted secret scan."
    } else {
        $secretPattern = '(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*(?=["''][A-Za-z0-9_-]{12,})|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----'
        $matches = @(& $rg.Source --hidden --pcre2 -n -o --no-heading --glob '!.git/**' --glob '!reference/**' --glob '!frontend/node_modules/**' --glob '!backend/.venv/**' $secretPattern . 2>$null)
        $rgExit = $LASTEXITCODE
        if ($rgExit -gt 1) { throw "rg secret scan failed" }
        if ($matches.Count -eq 0) {
            Write-Result PASS "SECRET_PREFIX_SCAN" "No hard-coded secret prefix or private-key header matched."
        } else {
            foreach ($match in $matches | Select-Object -First 30) {
                Write-Result BLOCKED "SECRET_PREFIX_MATCH" $match
            }
            if ($matches.Count -gt 30) {
                Write-Result BLOCKED "SECRET_PREFIX_MATCH" "$($matches.Count - 30) additional redacted matches omitted."
            }
        }
    }

    $referenceTracked = @($tracked | Where-Object { $_ -like 'reference/*' })
    if ($referenceTracked.Count -eq 0) {
        Write-Result PASS "REFERENCE_TRACKED" "reference/ has no tracked entries."
    } else {
        Write-Result BLOCKED "REFERENCE_TRACKED" "$($referenceTracked.Count) tracked reference/ entries require an inclusion and license decision."
    }

    if ($tracked -contains "backend/app/data/wq_fields.json") {
        Write-Result BLOCKED "WQ_CATALOG_LICENSE" "Bundled wq_fields.json redistribution permission is not established."
    } else {
        Write-Result PASS "WQ_CATALOG_LICENSE" "No bundled tracked WQ catalogue found."
    }

    $nestedGit = @()
    if (Test-Path -LiteralPath "reference" -PathType Container) {
        $nestedGit = @(Get-ChildItem -LiteralPath "reference" -Directory -Force | Where-Object {
            Test-Path -LiteralPath (Join-Path $_.FullName ".git")
        })
    }
    if ($nestedGit.Count -eq 0) {
        Write-Result PASS "NESTED_GIT" "No immediate nested Git repositories found under reference/."
    } else {
        Write-Result BLOCKED "NESTED_GIT" "$($nestedGit.Count) nested Git repositories require a publication decision."
    }

    $largeFiles = @(
        git -c core.quotepath=false ls-tree -rl HEAD |
            ForEach-Object {
                if ($_ -match '^\d+\s+blob\s+[0-9a-f]+\s+(\d+)\t(.+)$' -and [int64]$matches[1] -ge 5MB) {
                    [pscustomobject]@{ Path = $matches[2]; Bytes = [int64]$matches[1] }
                }
            }
    )
    $overGitHubLimit = @($largeFiles | Where-Object { $_.Bytes -ge 100MB })
    if ($overGitHubLimit.Count -gt 0) {
        foreach ($file in $overGitHubLimit) {
            Write-Result BLOCKED "TRACKED_FILE_100MB" "$($file.Path) ($($file.Bytes) bytes)"
        }
    } elseif ($largeFiles.Count -eq 0) {
        Write-Result PASS "LARGE_TRACKED_FILES" "No tracked file is 5 MB or larger."
    } else {
        foreach ($file in $largeFiles | Sort-Object Bytes -Descending | Select-Object -First 20) {
            Write-Result WARN "LARGE_TRACKED_FILE" "$($file.Path) ($($file.Bytes) bytes)"
        }
    }

    $status = @(git status --short)
    if ($LASTEXITCODE -ne 0) { throw "git status failed" }
    if ($status.Count -eq 0) {
        Write-Result PASS "WORKTREE" "Working tree is clean."
    } else {
        Write-Result WARN "WORKTREE" "$($status.Count) modified or untracked entries; this is not clean-clone evidence."
    }

    $result = if ($blocked -gt 0) { "BLOCKED" } elseif ($warnings -gt 0) { "WARN" } else { "PASS" }
    Write-Host "OPEN_SOURCE_READINESS=$result BLOCKED=$blocked WARN=$warnings"
    if ($blocked -gt 0) { exit 2 }
    exit 0
} finally {
    Pop-Location
}
