param(
    [ValidateRange(30, 300)]
    [int]$HealthTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $projectRoot "docker-compose.local.yml"
$runId = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss") + "-" + [guid]::NewGuid().ToString("N").Substring(0, 6)
$projectName = "finquant-hub-aios083-$runId".ToLowerInvariant()
$runRoot = Join-Path ([IO.Path]::GetTempPath()) $projectName
$envFile = Join-Path $runRoot ".env.local"
$composeArguments = @("compose", "-p", $projectName, "--env-file", $envFile, "-f", $composeFile)
$started = $false

if ($projectName -notmatch '^finquant-hub-aios083-[a-z0-9-]+$' -or $projectName -eq "finquant-hub-local") {
    throw "Refusing an unexpected Compose project name: $projectName"
}
if (-not (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
    throw "Missing docker-compose.local.yml"
}

function Invoke-Compose {
    param([string[]]$Arguments)

    & docker @composeArguments @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed: $($Arguments -join ' ')"
    }
}

function Find-LoopbackPort {
    foreach ($candidate in 55173..55272) {
        $listener = $null
        try {
            $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
            $listener.Start()
            return $candidate
        } catch {
            continue
        } finally {
            if ($null -ne $listener) {
                $listener.Stop()
            }
        }
    }
    throw "No free loopback port found in 55173..55272"
}

function New-MasterKey {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_")
}

function Invoke-ContainerPython {
    param([string]$Code)

    $output = & docker @composeArguments exec -T backend python -c $Code
    if ($LASTEXITCODE -ne 0) {
        throw "Container database verification failed"
    }
    return ($output | Out-String).Trim()
}

$localPort = Find-LoopbackPort
New-Item -ItemType Directory -Path $runRoot | Out-Null
[IO.File]::WriteAllLines($envFile, @("MASTER_KEY=$(New-MasterKey)", "LOCAL_PORT=$localPort"))

Write-Host "[PASS] Isolated project selected: $projectName"
Write-Host "[PASS] Isolated loopback port selected: $localPort"
Write-Host "[PASS] Temporary env created without displaying its MASTER_KEY."

try {
    $existingServices = @(
        & docker @composeArguments ps --services 2>$null |
            Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }
    )
    if ($existingServices.Count -ne 0) {
        throw "Refusing to reuse an existing Compose project"
    }

    Invoke-Compose @("config", "--quiet")
    Write-Host "[PASS] Isolated Compose configuration resolves."

    Invoke-Compose @("build")
    Write-Host "[PASS] Docker images built from the current release source."

    Invoke-Compose @("up", "-d")
    $started = $true
    $baseUrl = "http://127.0.0.1:$localPort"
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    $health = $null
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 3
            if ($health.status -eq "ok") {
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if ($null -eq $health -or $health.status -ne "ok") {
        throw "Isolated health endpoint did not become ready within $HealthTimeoutSeconds seconds"
    }
    Write-Host "[PASS] Backend health is OK (version $($health.version), db $($health.db))."

    $frontend = Invoke-WebRequest -UseBasicParsing -Uri $baseUrl -TimeoutSec 5
    if ($frontend.StatusCode -ne 200 -or $frontend.Content -notmatch 'id="root"') {
        throw "Frontend entrypoint did not return the expected application shell"
    }
    Write-Host "[PASS] Frontend entrypoint returned HTTP 200."

    $currentUser = Invoke-RestMethod -Uri "$baseUrl/api/auth/me" -TimeoutSec 5
    if (-not $currentUser.user.local_mode) {
        throw "Isolated stack is not in local-only mode"
    }
    try {
        Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"email":"local@example.invalid"}' -Uri "$baseUrl/api/auth/request-code" -TimeoutSec 5 | Out-Null
        throw "Local-only mode unexpectedly exposed email login"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) {
            throw
        }
    }
    Write-Host "[PASS] Local owner works without a session and email login remains unavailable."

    $capabilities = (Invoke-RestMethod -Uri "$baseUrl/api/dashboard/stats" -TimeoutSec 5).capabilities
    if ($capabilities.contract_version -ne "local-capabilities/v1" -or
        $capabilities.runtime_mode -ne "LOCAL_ONLY" -or
        $capabilities.model_ai.status -ne "UNCONFIGURED" -or
        $capabilities.market_data.status -ne "RUNTIME_CHECK_REQUIRED") {
        throw "Local capability degradation contract is incorrect"
    }
    Write-Host "[PASS] No-key capability contract is honest: AI UNCONFIGURED; market RUNTIME_CHECK_REQUIRED."

    $inspectCode = @'
import json, sqlite3
p='/app/backend/data/finquant.db'
c=sqlite3.connect(p)
tables=[r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
logical=[t for t in tables if not (t.startswith('memory_fts_') and t != 'memory_fts')]
c.execute("insert or replace into system_settings(key,value_json) values(?,?)", ('aios083.persistence_probe', json.dumps({'value':'probe'})))
c.commit()
print(json.dumps({'schema_version':c.execute('pragma user_version').fetchone()[0], 'logical_table_count':len(logical), 'probe':True}))
'@
    $initialDatabase = (Invoke-ContainerPython $inspectCode) | ConvertFrom-Json
    if ($initialDatabase.schema_version -ne 23 -or $initialDatabase.logical_table_count -ne 52 -or -not $initialDatabase.probe) {
        throw "Unexpected database contract in isolated volume"
    }
    Write-Host "[PASS] SQLite schema v23 has 52 logical tables; persistence probe stored."

    Invoke-Compose @("down")
    $started = $false
    Invoke-Compose @("up", "-d")
    $started = $true
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    do {
        Start-Sleep -Seconds 2
        try {
            $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 3
        } catch {
            $health = $null
        }
    } while (($null -eq $health -or $health.status -ne "ok") -and (Get-Date) -lt $deadline)
    if ($null -eq $health -or $health.status -ne "ok") {
        throw "Restarted isolated stack did not become healthy"
    }
    $probeCode = "import json,sqlite3; c=sqlite3.connect('/app/backend/data/finquant.db'); r=c.execute(`"select value_json from system_settings where key=?`",('aios083.persistence_probe',)).fetchone(); print(json.dumps({'probe':bool(r),'schema_version':c.execute('pragma user_version').fetchone()[0]}))"
    $persisted = (Invoke-ContainerPython $probeCode) | ConvertFrom-Json
    if (-not $persisted.probe -or $persisted.schema_version -ne 23) {
        throw "Named-volume persistence check failed after down/up"
    }
    Write-Host "[PASS] Persistence probe survived down/up without volume deletion."

    $backupCode = @'
import hashlib, json, sqlite3
from pathlib import Path
src=Path('/app/backend/data/finquant.db'); bak=Path('/app/backend/data/aios083-backup.db'); rst=Path('/app/backend/data/aios083-restore.db')
if bak.exists() or rst.exists(): raise SystemExit('backup targets already exist; refusing overwrite')
def reserve(path):
 with path.open('xb'): pass
 return sqlite3.connect(path)
def fp(path):
 c=sqlite3.connect(path); h=hashlib.sha256()
 tables=[r[0] for r in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")]
 for table in tables:
  h.update(table.encode())
  rows=[]
  for row in c.execute('select * from "'+table.replace('"','""')+'"'):
   rows.append(hashlib.sha256(repr(tuple(row)).encode()).digest())
  for row_hash in sorted(rows): h.update(row_hash)
 integrity=c.execute('pragma integrity_check').fetchone()[0]; version=c.execute('pragma user_version').fetchone()[0]; c.close()
 return h.hexdigest(), integrity, version
s=sqlite3.connect(src); b=reserve(bak); s.backup(b); b.close(); s.close()
b=sqlite3.connect(bak); r=reserve(rst); b.backup(r); r.close(); b.close()
a=fp(src); z=fp(rst)
try:
 with bak.open('xb'): pass
 overwrite_refused=False
except FileExistsError:
 overwrite_refused=True
print(json.dumps({'fingerprint_match':a[0]==z[0], 'source_integrity':a[1], 'restore_integrity':z[1], 'schema_version':z[2], 'targets_exist':bak.exists() and rst.exists(), 'overwrite_refused':overwrite_refused}))
'@
    $recovery = (Invoke-ContainerPython $backupCode) | ConvertFrom-Json
    if (-not $recovery.fingerprint_match -or $recovery.source_integrity -ne "ok" -or
        $recovery.restore_integrity -ne "ok" -or $recovery.schema_version -ne 23 -or
        -not $recovery.targets_exist -or -not $recovery.overwrite_refused) {
        throw "SQLite backup/restore verification failed"
    }
    Write-Host "[PASS] SQLite backup/restore fingerprints and integrity match; existing targets are not overwritten."

    $volumeNames = @(& docker volume ls --filter "label=com.docker.compose.project=$projectName" --format '{{.Name}}')
    if ($volumeNames.Count -ne 1 -or $volumeNames[0] -notmatch [regex]::Escape($projectName)) {
        throw "Could not identify the isolated named volume safely"
    }
    Write-Host "LOCAL_INSTALL_VERIFY_PASS"
    Write-Host "Evidence project: $projectName"
    Write-Host "Preserved volume: $($volumeNames[0])"
    Write-Host "Preserved private env: $envFile"
} finally {
    if ($started) {
        & docker @composeArguments down | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not stop the isolated project cleanly: $projectName"
        }
    }
    Write-Host "The isolated named volume was not deleted."
}
