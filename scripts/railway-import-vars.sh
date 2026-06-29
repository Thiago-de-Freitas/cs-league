#!/usr/bin/env bash
# Aplica variáveis Railway a partir dos arquivos .env do repositório.
# Uso: ./scripts/railway-import-vars.sh [back|front|worker|all]

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
EXTRA=()
[[ "${SKIP_DEPLOYS:-}" == "1" ]] && EXTRA+=(--skip-deploys)

import_env() {
  local service="$1"
  local file="$2"
  echo ">> $service <- $file"
  railway variable import --file "$file" --service "$service" --yes "${EXTRA[@]}"
}

case "$TARGET" in
  back)   import_env gamers-league-back   "$ROOT/railway.back.env" ;;
  front)  import_env gamers-league-front  "$ROOT/Frontend/railway.env" ;;
  worker) import_env gamers-league-worker "$ROOT/Worker/railway.env" ;;
  all)
    import_env gamers-league-back   "$ROOT/railway.back.env"
    import_env gamers-league-front  "$ROOT/Frontend/railway.env"
    import_env gamers-league-worker "$ROOT/Worker/railway.env"
    ;;
  *) echo "Uso: $0 [back|front|worker|all]" >&2; exit 1 ;;
esac

echo "Concluído."
