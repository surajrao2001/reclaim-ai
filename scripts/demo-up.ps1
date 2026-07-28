$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$envFile = if ($env:DEMO_ENV_FILE) { $env:DEMO_ENV_FILE } else { Join-Path $root ".env.demo" }
$envFileRef = ".env.demo"

if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $root ".env.demo.example"
    $envFileRef = ".env.demo.example"
    Write-Host "Using example demo env: $envFile"
    Write-Host "Create $root\.env.demo with real secrets before public hosting."
}

$env:DEMO_ENV_FILE = $envFileRef

$composeArgs = @(
    "compose",
    "--env-file",
    $envFile,
    "-f",
    (Join-Path $root "docker-compose.demo.yml"),
    "up",
    "--build",
    "-d"
) + $args

& docker @composeArgs

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$publicBaseUrl = if ($env:PUBLIC_BASE_URL) { $env:PUBLIC_BASE_URL } else { "http://localhost:8088" }
Write-Host "Demo stack requested. Proxy should be available at $publicBaseUrl."
