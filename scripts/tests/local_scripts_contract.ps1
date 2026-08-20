$ErrorActionPreference = "Stop"
Add-Type -AssemblyName Microsoft.VisualBasic

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$powerShellScript = Join-Path $projectRoot "scripts/local.ps1"
$posixScript = Join-Path $projectRoot "scripts/local.sh"
$attributesPath = Join-Path $projectRoot ".gitattributes"
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile($powerShellScript, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -ne 0) {
    throw "local.ps1 parser errors: $($parseErrors -join '; ')"
}

$bash = Get-Command bash -ErrorAction SilentlyContinue
if ($null -eq $bash) {
    throw "bash is required to validate scripts/local.sh"
}
if (-not (Test-Path -LiteralPath $attributesPath -PathType Leaf) -or
    (Get-Content -Raw -Encoding UTF8 $attributesPath) -notmatch '(?m)^\*\.sh\s+text\s+eol=lf\s*$') {
    throw ".gitattributes must keep shell scripts LF-only in Windows clones"
}
$posixBytes = [IO.File]::ReadAllBytes($posixScript)
for ($index = 1; $index -lt $posixBytes.Length; $index++) {
    if ($posixBytes[$index - 1] -eq 13 -and $posixBytes[$index] -eq 10) {
        throw "scripts/local.sh contains CRLF bytes"
    }
}
Push-Location $projectRoot
try {
    & $bash.Source -n "scripts/local.sh"
    if ($LASTEXITCODE -ne 0) {
        throw "bash -n failed for scripts/local.sh"
    }
} finally {
    Pop-Location
}

$powerShellText = Get-Content -Raw -Encoding UTF8 $powerShellScript
$posixText = Get-Content -Raw -Encoding UTF8 $posixScript
foreach ($action in @("up", "down", "logs", "status", "doctor")) {
    if ($powerShellText -notmatch [regex]::Escape('"' + $action + '"')) {
        throw "local.ps1 is missing action: $action"
    }
    if ($posixText -notmatch ("\b" + [regex]::Escape($action) + "\b")) {
        throw "local.sh is missing action: $action"
    }
}
if ($powerShellText -match 'down.+-v' -or $posixText -match 'down.+-v') {
    throw "Local scripts must never remove the named volume"
}

$shellHost = if ($PSVersionTable.PSEdition -eq "Core") {
    Join-Path $PSHOME "pwsh.exe"
} else {
    (Get-Command powershell.exe).Source
}
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("finquant-local-contract-" + [guid]::NewGuid().ToString("N"))

function New-Fixture {
    param([switch]$IncludeDockerfile)

    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot "scripts") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $fixtureRoot "docker") -Force | Out-Null
    Copy-Item -LiteralPath $powerShellScript -Destination (Join-Path $fixtureRoot "scripts/local.ps1")
    Copy-Item -LiteralPath (Join-Path $projectRoot "docker-compose.local.yml") -Destination $fixtureRoot
    Copy-Item -LiteralPath (Join-Path $projectRoot "docker/nginx.local.conf") -Destination (Join-Path $fixtureRoot "docker/nginx.local.conf")
    if ($IncludeDockerfile) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "Dockerfile") -Destination $fixtureRoot
    }
}

function Invoke-FixtureScript {
    param([string]$Action)

    $output = & $shellHost -NoProfile -File (Join-Path $fixtureRoot "scripts/local.ps1") $Action 2>&1 | Out-String
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
}

try {
    New-Fixture -IncludeDockerfile
    $missing = Invoke-FixtureScript "doctor"
    if ($missing.ExitCode -eq 0 -or $missing.Output -notmatch '\[FAIL\].*\.env\.local') {
        throw "doctor must fail clearly when .env.local is missing"
    }

    $knownSecret = ('A' * 43) + '='
    [IO.File]::WriteAllLines((Join-Path $fixtureRoot ".env.local"), @("MASTER_KEY=$knownSecret", "LOCAL_PORT=70000"))
    $invalidHash = (Get-FileHash -Algorithm SHA256 (Join-Path $fixtureRoot ".env.local")).Hash
    $invalid = Invoke-FixtureScript "doctor"
    if ($invalid.ExitCode -eq 0 -or $invalid.Output -notmatch '\[FAIL\].*LOCAL_PORT') {
        throw "doctor must fail clearly for an invalid LOCAL_PORT"
    }
    if ($invalid.Output.Contains($knownSecret)) {
        throw "doctor output exposed MASTER_KEY"
    }
    if ((Get-FileHash -Algorithm SHA256 (Join-Path $fixtureRoot ".env.local")).Hash -ne $invalidHash) {
        throw "doctor modified .env.local"
    }

    [IO.File]::WriteAllLines((Join-Path $fixtureRoot ".env.local"), @("MASTER_KEY=$knownSecret", "LOCAL_PORT=61234"))
    $validHash = (Get-FileHash -Algorithm SHA256 (Join-Path $fixtureRoot ".env.local")).Hash
    $valid = Invoke-FixtureScript "doctor"
    if ($valid.ExitCode -ne 0 -or $valid.Output -notmatch 'Doctor result: PASS') {
        throw "doctor should pass for the valid fixture: $($valid.Output)"
    }
    if ((Get-FileHash -Algorithm SHA256 (Join-Path $fixtureRoot ".env.local")).Hash -ne $validHash) {
        throw "doctor modified a valid .env.local"
    }

    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
        $fixtureRoot,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
    New-Fixture
    $firstUp = Invoke-FixtureScript "up"
    $generatedEnv = Join-Path $fixtureRoot ".env.local"
    if ($firstUp.ExitCode -eq 0 -or -not (Test-Path -LiteralPath $generatedEnv)) {
        throw "first up must create .env.local before failing the missing-file preflight"
    }
    $generatedText = Get-Content -Raw -Encoding UTF8 $generatedEnv
    if ($generatedText -notmatch '(?m)^MASTER_KEY=[A-Za-z0-9_-]{43}=\r?$') {
        throw "first up did not generate a Fernet-compatible MASTER_KEY"
    }
    $generatedKey = [regex]::Match($generatedText, '(?m)^MASTER_KEY=([^\r\n]+)').Groups[1].Value
    $generatedHash = (Get-FileHash -Algorithm SHA256 $generatedEnv).Hash
    $secondUp = Invoke-FixtureScript "up"
    if ((Get-FileHash -Algorithm SHA256 $generatedEnv).Hash -ne $generatedHash) {
        throw "up overwrote an existing .env.local"
    }
    if ($firstUp.Output.Contains($generatedKey) -or $secondUp.Output.Contains($generatedKey)) {
        throw "up output exposed MASTER_KEY"
    }
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
            $fixtureRoot,
            [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
            [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
        )
    }
}

Write-Host "LOCAL_SCRIPTS_CONTRACT_PASS"
