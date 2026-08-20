param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\', '/')
$destinationRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\', '/')
$projectPrefix = $projectRoot + [IO.Path]::DirectorySeparatorChar
$destinationParent = Split-Path -Parent $destinationRoot

if ([string]::IsNullOrWhiteSpace($destinationRoot) -or $destinationRoot -eq [IO.Path]::GetPathRoot($destinationRoot)) {
    throw "Destination must be a new, specific directory."
}
if ($destinationRoot -eq $projectRoot -or $destinationRoot.StartsWith($projectPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Destination must be outside the FinQuant Hub project."
}
if (Test-Path -LiteralPath $destinationRoot) {
    throw "Destination already exists; refusing to merge or overwrite: $destinationRoot"
}
if ([string]::IsNullOrWhiteSpace($destinationParent) -or -not (Test-Path -LiteralPath $destinationParent -PathType Container)) {
    throw "Destination parent must already exist: $destinationParent"
}

$allowedTopFiles = @(
    ".dockerignore",
    ".env.example",
    ".gitattributes",
    ".gitignore",
    "AGENTS.md",
    "CHANGELOG.md",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "SECURITY.md",
    "Dockerfile",
    "README.md",
    "docker-compose.local.yml"
)
$allowedRoots = @(".github", "backend", "docker", "docs", "frontend", "scripts")
$privateRoots = @(".agents", ".claude", "artifacts", "docx", "knowledge", "output", "reference", "sites", "task")
$excludedDirectoryNames = @(
    ".git", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".venv",
    "__pycache__", "dist", "htmlcov", "node_modules", "playwright-report", "test-results"
)
$excludedCounts = [ordered]@{
    reference = 0
    private_workdirs = 0
    version_control = 0
    dependencies = 0
    build_test_cache = 0
    environment = 0
    database = 0
    wq_catalogue = 0
    reparse_points = 0
}
$included = New-Object System.Collections.Generic.List[object]

function Get-RelativePath {
    param([string]$Path)
    return $Path.Substring($projectRoot.Length).TrimStart('\', '/').Replace('\', '/')
}

function Add-Count {
    param([string]$Category, [int]$Count = 1)
    $excludedCounts[$Category] = [int]$excludedCounts[$Category] + $Count
}

function Get-ExclusionCategory {
    param([IO.FileSystemInfo]$Item, [string]$RelativePath)

    if (($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        return "reparse_points"
    }
    $segments = $RelativePath -split '/'
    foreach ($segment in $segments) {
        if ($segment -ieq ".git") { return "version_control" }
        if ($segment -ieq ".venv" -or $segment -ieq "node_modules") { return "dependencies" }
        if ($excludedDirectoryNames -icontains $segment) { return "build_test_cache" }
    }
    if ($RelativePath -ieq "backend/data" -or $RelativePath.StartsWith("backend/data/", [StringComparison]::OrdinalIgnoreCase)) {
        return "database"
    }
    $name = $Item.Name
    if (($name -ieq ".env" -or $name.StartsWith(".env.", [StringComparison]::OrdinalIgnoreCase)) -and $name -ine ".env.example") {
        return "environment"
    }
    if ($name -match '(?i)\.(db|sqlite|sqlite3)(?:[.-].*)?$') { return "database" }
    if ($name -match '(?i)^(wq_fields|wq_fields_summary)\.json$' -and
        $RelativePath.StartsWith("backend/app/data/", [StringComparison]::OrdinalIgnoreCase)) {
        return "wq_catalogue"
    }
    if ($name -match '(?i)\.(pyc|pyo|tsbuildinfo)$' -or $name -like ".coverage*") {
        return "build_test_cache"
    }
    return $null
}

function Copy-PublicFile {
    param([IO.FileInfo]$File)

    $relativePath = Get-RelativePath $File.FullName
    $category = Get-ExclusionCategory $File $relativePath
    if ($null -ne $category) {
        Add-Count $category
        return
    }
    $targetPath = Join-Path $destinationRoot ($relativePath.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $targetParent = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $targetParent -PathType Container)) {
        New-Item -ItemType Directory -Path $targetParent | Out-Null
    }
    Copy-Item -LiteralPath $File.FullName -Destination $targetPath
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash.ToLowerInvariant()
    $included.Add([ordered]@{ path = $relativePath; bytes = $File.Length; sha256 = $hash })
}

function Copy-PublicTree {
    param([IO.DirectoryInfo]$Directory)

    $relativePath = Get-RelativePath $Directory.FullName
    $category = Get-ExclusionCategory $Directory $relativePath
    if ($null -ne $category) {
        $fileCount = @(
            Get-ChildItem -LiteralPath $Directory.FullName -File -Force -Recurse -ErrorAction SilentlyContinue
        ).Count
        Add-Count $category ([Math]::Max(1, $fileCount))
        return
    }
    foreach ($child in Get-ChildItem -LiteralPath $Directory.FullName -Force | Sort-Object Name) {
        if ($child.PSIsContainer) {
            Copy-PublicTree $child
        } else {
            Copy-PublicFile $child
        }
    }
}

foreach ($privateRoot in $privateRoots) {
    $privatePath = Join-Path $projectRoot $privateRoot
    if (-not (Test-Path -LiteralPath $privatePath -PathType Container)) { continue }
    $count = @(Get-ChildItem -LiteralPath $privatePath -File -Force -Recurse -ErrorAction SilentlyContinue).Count
    if ($privateRoot -ieq "reference") {
        Add-Count "reference" $count
    } else {
        Add-Count "private_workdirs" $count
    }
}

New-Item -ItemType Directory -Path $destinationRoot | Out-Null
try {
    foreach ($name in $allowedTopFiles) {
        $sourcePath = Join-Path $projectRoot $name
        if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
            Copy-PublicFile (Get-Item -LiteralPath $sourcePath -Force)
        }
    }
    foreach ($name in $allowedRoots) {
        $sourcePath = Join-Path $projectRoot $name
        if (Test-Path -LiteralPath $sourcePath -PathType Container) {
            Copy-PublicTree (Get-Item -LiteralPath $sourcePath -Force)
        }
    }

    $sortedFiles = @($included | Sort-Object { $_.path })
    $treeInput = ($sortedFiles | ForEach-Object { "$($_.path)`0$($_.sha256)" }) -join "`n"
    [long]$includedBytes = 0
    foreach ($file in $sortedFiles) {
        $includedBytes += [long]$file.bytes
    }
    $treeBytes = [Text.Encoding]::UTF8.GetBytes($treeInput)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $treeHash = ([BitConverter]::ToString($sha.ComputeHash($treeBytes))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
    $manifest = [ordered]@{
        schema_version = "public-source-manifest/v1"
        source_kind = "dirty_worktree_allowlisted_snapshot"
        generated_at = (Get-Date).ToUniversalTime().ToString("o")
        source_root_name = Split-Path -Leaf $projectRoot
        included_file_count = $sortedFiles.Count
        included_bytes = $includedBytes
        tree_sha256 = $treeHash
        excluded_counts = $excludedCounts
        files = $sortedFiles
        notices = @(
            "This snapshot is not a Git commit or clean clone.",
            "reference and optional WQ catalogue files are intentionally excluded.",
            "No license grant is implied by this manifest."
        )
    }
    $manifestPath = Join-Path $destinationRoot "PUBLIC_SOURCE_MANIFEST.json"
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), $utf8NoBom)
} catch {
    Write-Warning "Export stopped. The non-overwritten partial destination is retained for inspection: $destinationRoot"
    throw
}

Write-Host "PUBLIC_SOURCE_EXPORT_PASS"
Write-Host "Destination: $destinationRoot"
Write-Host "Included files: $($included.Count)"
Write-Host "Tree SHA256: $treeHash"
Write-Host "The export directory was retained and was not initialized as a Git repository."
