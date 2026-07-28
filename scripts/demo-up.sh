#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DEMO_ENV_FILE:-$ROOT_DIR/.env.demo}"
ENV_FILE_REF=".env.demo"

if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/.env.demo.example"
  ENV_FILE_REF=".env.demo.example"
  echo "Using example demo env: $ENV_FILE"
  echo "Create $ROOT_DIR/.env.demo with real secrets before public hosting."
fi

export DEMO_ENV_FILE="$ENV_FILE_REF"

compose_args=(
  --env-file "$ENV_FILE"
  -f "$ROOT_DIR/docker-compose.demo.yml"
  up
  --build
  -d
)

docker compose "${compose_args[@]}" "$@"

echo "Demo stack requested. Proxy should be available at ${PUBLIC_BASE_URL:-http://localhost:8088}."
