param(
    [ValidateSet("up", "down", "logs", "status", "doctor")]
    [string]$Action = "up"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env.local"
$composeFile = Join-Path $projectRoot "docker-compose.local.yml"
$composeArguments = @("compose", "--env-file", $envFile, "-f", $composeFile)
$script:DoctorFailures = 0
$script:ComposeAvailable = $false

function Write-DoctorResult {
    param(
        [ValidateSet("PASS", "WARN", "FAIL")]
        [string]$Level,
        [string]$Message
    )

    Write-Host "[$Level] $Message"
    if ($Level -eq "FAIL") {
        $script:DoctorFailures++
    }
}

function Read-LocalEnvironment {
    $values = @{}
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
        return $values
    }

    foreach ($line in [IO.File]::ReadAllLines($envFile)) {
        if ($line -match '^\s*(?:#|$)') {
            continue
        }
        $separator = $line.IndexOf('=')
        if ($separator -le 0) {
            continue
        }
        $name = $line.Substring(0, $separator).Trim()
        $values[$name] = $line.Substring($separator + 1).Trim()
    }
    return $values
}

function New-LocalEnvironment {
    if (Test-Path -LiteralPath $envFile) {
        return
    }

    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    $masterKey = [Convert]::ToBase64String($bytes).Replace("+", "-").Replace("/", "_")
    [IO.File]::WriteAllLines($envFile, @("MASTER_KEY=$masterKey", "LOCAL_PORT=5173"))
    Write-Host "Created .env.local with a random MASTER_KEY. The key was not displayed."
}

function Test-FrontendPort {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        Write-DoctorResult "PASS" "LOCAL_PORT $Port is available on 127.0.0.1."
    } catch {
        $runningServices = @()
        if ($script:ComposeAvailable) {
            $runningServices = @(& docker @composeArguments ps --status running --services 2>$null)
        }
        if ($runningServices -contains "frontend") {
            Write-DoctorResult "WARN" "LOCAL_PORT $Port is already used by the running FinQuant Hub frontend."
        } else {
            Write-DoctorResult "FAIL" "LOCAL_PORT $Port is occupied. Choose a free port in .env.local; no process was stopped."
        }
    } finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Get-LatestBuildInputTime {
    param([string[]]$Paths)

    $latest = [DateTime]::MinValue
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Container) {
            $items = Get-ChildItem -LiteralPath $path -File -Recurse -ErrorAction SilentlyContinue
        } elseif (Test-Path -LiteralPath $path -PathType Leaf) {
            $items = @(Get-Item -LiteralPath $path)
        } else {
            continue
        }
        foreach ($item in $items) {
            if ($item.LastWriteTimeUtc -gt $latest) {
                $latest = $item.LastWriteTimeUtc
            }
        }
    }
    return $latest
}

function Test-LocalImageFreshness {
    if (-not $script:ComposeAvailable) {
        return
    }

    $runningServices = @(& docker @composeArguments ps --status running --services 2>$null)
    $inputs = @{
        backend = @(
            (Join-Path $projectRoot "Dockerfile"),
            (Join-Path $projectRoot "docker-compose.local.yml"),
            (Join-Path $projectRoot "backend/app"),
            (Join-Path $projectRoot "backend/requirements.txt")
        )
        frontend = @(
            (Join-Path $projectRoot "Dockerfile"),
            (Join-Path $projectRoot "docker-compose.local.yml"),
            (Join-Path $projectRoot "docker/nginx.local.conf"),
            (Join-Path $projectRoot "frontend/src"),
            (Join-Path $projectRoot "frontend/index.html"),
            (Join-Path $projectRoot "frontend/package.json"),
            (Join-Path $projectRoot "frontend/bun.lock"),
            (Join-Path $projectRoot "frontend/tsconfig.json"),
            (Join-Path $projectRoot "frontend/tsconfig.app.json"),
            (Join-Path $projectRoot "frontend/vite.config.ts")
        )
    }

    foreach ($service in @("backend", "frontend")) {
        if ($runningServices -notcontains $service) {
            continue
        }
        $imageId = @(& docker @composeArguments images --quiet $service 2>$null) | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace("$imageId")) {
            Write-DoctorResult "WARN" "Cannot resolve the running $service image; freshness is UNKNOWN."
            continue
        }
        $createdText = & docker image inspect --format '{{.Created}}' $imageId 2>$null
        $created = [DateTimeOffset]::MinValue
        if ($LASTEXITCODE -ne 0 -or -not [DateTimeOffset]::TryParse("$createdText", [ref]$created)) {
            Write-DoctorResult "WARN" "Cannot read the running $service image timestamp; freshness is UNKNOWN."
            continue
        }
        $latestInput = Get-LatestBuildInputTime $inputs[$service]
        if ($latestInput -gt $created.UtcDateTime) {
            Write-DoctorResult "WARN" "Running $service image is older than its local build inputs. Run scripts/local.ps1 up to rebuild it."
        } else {
            Write-DoctorResult "PASS" "Running $service image is not older than its local build inputs."
        }
    }
}

function Invoke-Doctor {
    $script:DoctorFailures = 0
    $script:ComposeAvailable = $false
    Write-Host "FinQuant Hub local doctor (read-only)"

    $requiredFiles = @(
        $composeFile,
        (Join-Path $projectRoot "Dockerfile"),
        (Join-Path $projectRoot "docker/nginx.local.conf")
    )
    foreach ($requiredFile in $requiredFiles) {
        $relativePath = $requiredFile.Substring($projectRoot.Length).TrimStart('\', '/')
        if (Test-Path -LiteralPath $requiredFile -PathType Leaf) {
            Write-DoctorResult "PASS" "Found $relativePath."
        } else {
            Write-DoctorResult "FAIL" "Missing $relativePath. Restore it from the project checkout."
        }
    }

    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        Write-DoctorResult "FAIL" "Docker CLI is unavailable. Install Docker with Compose v2 and reopen the terminal."
    } else {
        Write-DoctorResult "PASS" "Docker CLI is available."

        $composeVersion = & docker compose version --short 2>$null
        if ($LASTEXITCODE -eq 0 -and "$composeVersion" -match '^v?2\.') {
            $script:ComposeAvailable = $true
            Write-DoctorResult "PASS" "Docker Compose v2 is available ($composeVersion)."
        } else {
            Write-DoctorResult "FAIL" "Docker Compose v2 is required. Update Docker/Compose and retry."
        }

        $serverVersion = & docker info --format '{{.ServerVersion}}' 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace("$serverVersion")) {
            Write-DoctorResult "PASS" "Docker daemon is reachable (server $serverVersion)."
        } else {
            Write-DoctorResult "FAIL" "Docker daemon is not reachable. Start Docker and retry."
        }
    }

    $environment = Read-LocalEnvironment
    $environmentIsValid = $true
    if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
        Write-DoctorResult "FAIL" ".env.local is missing. Run the 'up' action once to create it."
        $environmentIsValid = $false
    } else {
        Write-DoctorResult "PASS" "Found .env.local."
    }

    $masterKey = $environment["MASTER_KEY"]
    if ([string]::IsNullOrWhiteSpace($masterKey)) {
        Write-DoctorResult "FAIL" "MASTER_KEY is missing from .env.local. Generate a Fernet-compatible key."
        $environmentIsValid = $false
    } elseif ($masterKey -notmatch '^[A-Za-z0-9_-]{43}=$') {
        Write-DoctorResult "FAIL" "MASTER_KEY has an invalid format. Use 32 random bytes encoded as URL-safe base64."
        $environmentIsValid = $false
    } else {
        Write-DoctorResult "PASS" "MASTER_KEY format is valid; its value was not displayed."
    }

    $localPort = 0
    if (-not [int]::TryParse($environment["LOCAL_PORT"], [ref]$localPort) -or $localPort -lt 1 -or $localPort -gt 65535) {
        Write-DoctorResult "FAIL" "LOCAL_PORT must be an integer from 1 to 65535 in .env.local."
        $environmentIsValid = $false
    } else {
        Write-DoctorResult "PASS" "LOCAL_PORT is valid ($localPort)."
        Test-FrontendPort $localPort
    }

    if ([string]::IsNullOrWhiteSpace($environment["DEEPSEEK_API_KEY"])) {
        Write-DoctorResult "WARN" "No DEEPSEEK_API_KEY is configured. The app can start, but model-backed AI features need a compatible API key."
    } else {
        Write-DoctorResult "PASS" "An optional model API key is configured; its value was not displayed."
    }

    if ($script:ComposeAvailable -and $environmentIsValid -and (Test-Path -LiteralPath $composeFile -PathType Leaf)) {
        & docker @composeArguments config --quiet 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-DoctorResult "PASS" "docker-compose.local.yml resolves with .env.local."
            Test-LocalImageFreshness
        } else {
            Write-DoctorResult "FAIL" "Compose configuration is invalid. Review .env.local and docker-compose.local.yml."
        }
    } else {
        Write-DoctorResult "FAIL" "Compose configuration check could not run until Docker, Compose, files, and .env.local are valid."
    }

    if ($script:DoctorFailures -eq 0) {
        Write-Host "Doctor result: PASS"
        return 0
    }
    Write-Host "Doctor result: FAIL ($script:DoctorFailures check(s))"
    return 1
}

if ($Action -eq "doctor") {
    exit (Invoke-Doctor)
}

if ($Action -eq "up") {
    New-LocalEnvironment
    if ((Invoke-Doctor) -ne 0) {
        Write-Host "Startup was not attempted because doctor found blocking failures."
        exit 1
    }
} elseif (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    Write-Host ".env.local is missing. Run the 'up' action once to create it."
    exit 1
}

switch ($Action) {
    "up" { & docker @composeArguments up --build -d }
    "down" { & docker @composeArguments down }
    "logs" { & docker @composeArguments logs -f }
    "status" { & docker @composeArguments ps }
}

exit $LASTEXITCODE
