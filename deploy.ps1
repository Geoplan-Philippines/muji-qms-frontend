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
