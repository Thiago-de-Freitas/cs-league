# Inicia o worker de analise de demos (requer Postgres + Redis via docker-compose.dev.yml)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://csleague:csleague@localhost:5432/csleague"
}
if (-not $env:REDIS_URL) {
  $env:REDIS_URL = "redis://localhost:6379"
}
if (-not $env:DEMO_STORAGE_PATH) {
  $env:DEMO_STORAGE_PATH = Join-Path $root "Backend\data\demos"
}

Set-Location $PSScriptRoot
Write-Host ("Worker CS League - DATABASE_URL=" + $env:DATABASE_URL)
Write-Host ("DEMO_STORAGE_PATH=" + $env:DEMO_STORAGE_PATH)
python worker.py
