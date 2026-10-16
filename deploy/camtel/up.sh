#!/usr/bin/env bash
# Démarre la stack ANSAR sur le VPS (à lancer depuis la racine du dépôt).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_FILE="$ROOT/deploy/camtel/docker-compose.yml"
ENV_FILE="$ROOT/deploy/camtel/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Manque $ENV_FILE — copie .env.example et renseigne DATABASE_URL / FRONTEND_URL."
  exit 1
fi

cd "$ROOT"

PROFILE_ARGS=()
if grep -qE '^DATABASE_URL=.*@db:' "$ENV_FILE" 2>/dev/null; then
  PROFILE_ARGS=(--profile with-db)
  echo "Postgres local détecté (@db) → profile with-db"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "${PROFILE_ARGS[@]}" up -d --build "$@"
echo "OK — ouvrir http://<IP_VPS>:${HTTP_PORT:-80}  et  /api/health"
