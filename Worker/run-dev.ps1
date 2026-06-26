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
if (-not $env:HIGHLIGHT_CLIPS_PATH) {
  $env:HIGHLIGHT_CLIPS_PATH = Join-Path $root "Backend\data\highlights"
}
if (-not $env:BACKEND_INTERNAL_URL) {
  $env:BACKEND_INTERNAL_URL = "http://localhost:3000"
}
if (-not $env:INTERNAL_SERVICE_KEY) {
  $env:INTERNAL_SERVICE_KEY = "dev-internal-service-key"
}
if (-not $env:STEAM_EXE_PATH) {
  $steam = "C:\Program Files (x86)\Steam\steam.exe"
  if (Test-Path $steam) {
    $env:STEAM_EXE_PATH = $steam
  }
}
if (-not $env:CS2_EXE_PATH) {
  $cs2 = "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe"
  if (Test-Path $cs2) {
    $env:CS2_EXE_PATH = $cs2
  }
}
if (-not $env:HIGHLIGHT_RENDER_MODE) {
  if ($env:CS2_EXE_PATH) {
    $env:HIGHLIGHT_RENDER_MODE = "cs2"
  } else {
    $env:HIGHLIGHT_RENDER_MODE = "auto"
  }
}

Set-Location $PSScriptRoot
$env:PYTHONUNBUFFERED = "1"
Write-Host ("Worker CS League - DATABASE_URL=" + $env:DATABASE_URL)
Write-Host ("DEMO_STORAGE_PATH=" + $env:DEMO_STORAGE_PATH)
if ($env:STEAM_EXE_PATH) { Write-Host ("STEAM_EXE_PATH=" + $env:STEAM_EXE_PATH) }
if ($env:CS2_EXE_PATH) { Write-Host ("CS2_EXE_PATH=" + $env:CS2_EXE_PATH) }
if ($env:HIGHLIGHT_RENDER_MODE) { Write-Host ("HIGHLIGHT_RENDER_MODE=" + $env:HIGHLIGHT_RENDER_MODE) }
python worker.py
