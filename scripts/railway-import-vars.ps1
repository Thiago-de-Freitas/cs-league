# Aplica variáveis Railway a partir dos arquivos .env do repositório.
# Pré-requisitos: railway CLI instalado e projeto linkado (railway link).
# Shared variable JWT_SECRET deve existir em Project Settings → Shared Variables.

param(
    [ValidateSet("back", "front", "worker", "all")]
    [string]$Target = "all",
    [switch]$SkipDeploys
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$extra = @()
if ($SkipDeploys) { $extra += "--skip-deploys" }

function Import-RailwayEnv {
    param([string]$Service, [string]$File)
    if (-not (Test-Path $File)) {
        Write-Error "Arquivo não encontrado: $File"
    }
    Write-Host ">> $Service <- $File"
    & railway variable import --file $File --service $Service --yes @extra
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

switch ($Target) {
    "back"   { Import-RailwayEnv "gamers-league-back"   (Join-Path $root "railway.back.env") }
    "front"  { Import-RailwayEnv "gamers-league-front"  (Join-Path $root "Frontend\railway.env") }
    "worker" { Import-RailwayEnv "gamers-league-worker" (Join-Path $root "Worker\railway.env") }
    "all" {
        Import-RailwayEnv "gamers-league-back"   (Join-Path $root "railway.back.env")
        Import-RailwayEnv "gamers-league-front"  (Join-Path $root "Frontend\railway.env")
        Import-RailwayEnv "gamers-league-worker" (Join-Path $root "Worker\railway.env")
    }
}

Write-Host "Concluído. Verifique nomes dos serviços no dashboard se alguma referência falhar."
