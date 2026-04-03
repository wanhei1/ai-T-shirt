#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

COMPOSE_FILE="${CHAOS_COMPOSE_FILE:-docker-compose.ha.yml}"
FAULT_SECONDS="${FAULT_SECONDS:-30}"
RECOVER_SECONDS="${RECOVER_SECONDS:-20}"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose -f "$COMPOSE_FILE")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose -f "$COMPOSE_FILE")
else
  echo "docker compose is required for dependency fault injection"
  exit 1
fi

cd "$BACKEND_DIR"

inject_one() {
  local service="$1"
  echo "[chaos] stopping $service for ${FAULT_SECONDS}s"
  "${COMPOSE_CMD[@]}" stop "$service"
  sleep "$FAULT_SECONDS"

  echo "[chaos] starting $service"
  "${COMPOSE_CMD[@]}" start "$service"
  sleep "$RECOVER_SECONDS"
}

inject_one redis
inject_one rabbitmq
inject_one postgres

echo "[chaos] dependency fault injection sequence completed"
