# scripts/package.ps1
# Cortex Single-JAR Packaging Script
# 1. Builds production frontend bundle
# 2. Copies frontend/dist into cortex-backend/src/main/resources/static/
# 3. Runs mvn clean package -DskipTests to generate cortex-backend/target/cortex.jar

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RootDir "frontend"
$BackendDir = Join-Path $RootDir "cortex-backend"
$StaticDir = Join-Path $BackendDir "src\main\resources\static"
$TargetJar = Join-Path $BackendDir "target\cortex.jar"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Building Cortex Single-JAR Package      " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Build frontend
Write-Host "`n[1/3] Building frontend bundle (npm run build)..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# 2. Prepare backend static directory
Write-Host "`n[2/3] Copying dist/ to cortex-backend/src/main/resources/static/..." -ForegroundColor Yellow
if (Test-Path $StaticDir) {
    Get-ChildItem -Path $StaticDir -Recurse | Remove-Item -Force -Recurse
} else {
    New-Item -ItemType Directory -Path $StaticDir -Force | Out-Null
}

$DistDir = Join-Path $FrontendDir "dist"
Copy-Item -Path "$DistDir\*" -Destination $StaticDir -Recurse -Force
Write-Host "Copied $( (Get-ChildItem -Path $StaticDir -Recurse | Measure-Object).Count ) static assets into $StaticDir" -ForegroundColor Green

# 3. Package backend with Maven
Write-Host "`n[3/3] Packaging backend into single JAR (mvn clean package)..." -ForegroundColor Yellow
Push-Location $BackendDir
try {
    $mvnCmd = if (Test-Path ".\mvnw.cmd") { ".\mvnw.cmd" } else { "mvn" }
    & $mvnCmd clean package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        throw "Maven package failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if (Test-Path $TargetJar) {
    # 4. Packaging Guard: Verify critical artifacts and routes inside the JAR
    Write-Host "`n[Packaging Guard] Verifying JAR contents and route integrity..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($TargetJar)
    try {
        $staticEntry = $zip.Entries | Where-Object { $_.FullName -like "*static/index.html" }
        if (-not $staticEntry) {
            throw "Packaging Guard Failed: static/index.html missing from $TargetJar"
        }

        $controllerEntry = $zip.Entries | Where-Object { $_.FullName -like "*CortexController.class" }
        if (-not $controllerEntry) {
            throw "Packaging Guard Failed: CortexController.class missing from $TargetJar"
        }

        $stream = $controllerEntry.Open()
        $reader = New-Object System.IO.StreamReader($stream)
        $controllerContent = $reader.ReadToEnd()
        $stream.Close()

        $requiredRoutes = @('/traverse/impact', '/traverse/path', '/traverse/change-impact')
        foreach ($route in $requiredRoutes) {
            if (-not $controllerContent.Contains($route)) {
                throw "Packaging Guard Failed: Route '$route' not found in compiled CortexController inside $TargetJar"
            }
        }
        Write-Host "Packaging Guard Passed: static/index.html and all /traverse/* routes confirmed inside $TargetJar" -ForegroundColor Green
    } finally {
        $zip.Dispose()
    }

    $jarSizeMb = [math]::Round((Get-Item $TargetJar).Length / 1MB, 2)
    Write-Host "`n==========================================" -ForegroundColor Green
    Write-Host "  SUCCESS: Packaged Single-JAR Artifact  " -ForegroundColor Green
    Write-Host "  Output: $TargetJar ($jarSizeMb MB)" -ForegroundColor Green
    Write-Host "  Run:    java -jar `"$TargetJar`"" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
} else {
    throw "Target JAR was not found at $TargetJar"
}
