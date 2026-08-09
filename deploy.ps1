#Requires -Version 5.1
<#
.SYNOPSIS
  Build and deploy the muji-qms frontend (static SPA) on the mini PC.

.DESCRIPTION
  Installs dependencies (Bun) and compiles the production bundle to dist/, then
  restarts the Windows service if it exists. NOTE: VITE_API_URL and VITE_STORE_ID
  are baked into the bundle at build time, so .env must point at the mini PC's
  LAN IP (e.g. http://192.168.1.65:8000) BEFORE running this. Rebuild whenever
  the IP, store id, or frontend code changes.

.PARAMETER ServiceName
  Name of the NSSM Windows service that serves dist/. Default: muji-qms-frontend.

.PARAMETER SkipInstall
  Skip 'bun install' (use when dependencies are unchanged).

.EXAMPLE
  .\deploy.ps1
  .\deploy.ps1 -SkipInstall
#>
param(
  [string]$ServiceName = "muji-qms-frontend",
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "bun not found on PATH. Install Bun: powershell -c `"irm bun.sh/install.ps1 | iex`""
}
if (-not (Test-Path ".env")) {
  throw ".env not found in $PSScriptRoot. Create it from .env.example (set VITE_API_URL to the mini PC LAN IP) before building."
}

# Both values are compiled into the bundle, and a wrong one fails silently at the
# counter rather than here: a placeholder store id produces a screen that says
# "Connected" and shows an empty board forever. Catch it at build time instead.
$envLines = Get-Content ".env" | Where-Object { $_ -match '^\s*[^#]' }
function Get-EnvValue([string]$Name) {
  $line = $envLines | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Name\s*=", "").Trim().Trim('"').Trim("'")
}

$apiUrl  = Get-EnvValue "VITE_API_URL"
$storeId = Get-EnvValue "VITE_STORE_ID"

if ([string]::IsNullOrWhiteSpace($apiUrl)) {
  throw "VITE_API_URL is not set in .env. It must be the mini PC's LAN address, e.g. http://192.168.254.124:8000"
}
if ($apiUrl -match "localhost|127\.0\.0\.1") {
  throw "VITE_API_URL is '$apiUrl'. Tablets and the TV cannot reach the mini PC's loopback address - use its LAN IP."
}
if ([string]::IsNullOrWhiteSpace($storeId) -or $storeId -match "^your-store") {
  throw "VITE_STORE_ID is not set in .env (found '$storeId'). Without a real store UUID every screen shows an empty board."
}

Write-Host "[frontend] Building against $apiUrl (store $storeId)" -ForegroundColor Cyan

# The bundle is only usable if the backend it was compiled against is actually
# reachable from here. A 5s check now saves a trip back to the shop.
try {
  $probe = Invoke-WebRequest -Uri "$apiUrl/api/v1/orders/store/$storeId" -TimeoutSec 5 -UseBasicParsing
  Write-Host "[frontend] Backend reachable (HTTP $($probe.StatusCode))." -ForegroundColor Green
} catch {
  Write-Host "[frontend] WARNING: could not reach $apiUrl - $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "           Building anyway, but verify the backend service and the firewall rule for its port." -ForegroundColor Yellow
}

if (-not $SkipInstall) {
  Write-Host "[frontend] Installing dependencies..." -ForegroundColor Cyan
  bun install
}

Write-Host "[frontend] Building production bundle (tsc -b && vite build)..." -ForegroundColor Cyan
bun run build

if (-not (Test-Path "dist\index.html")) {
  throw "Build did not produce dist\index.html. Check the build output above."
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Write-Host "[frontend] Restarting service '$ServiceName'..." -ForegroundColor Cyan
  Restart-Service -Name $ServiceName
  Write-Host "[frontend] Deployed. Service '$ServiceName' restarted." -ForegroundColor Green
} else {
  Write-Host "[frontend] Built to dist\. Service '$ServiceName' not installed yet -" -ForegroundColor Yellow
  Write-Host "           run ..\setup-services.ps1 (elevated) to register it." -ForegroundColor Yellow
}
