#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${PERF_OUTPUT_DIR:-$ROOT_DIR/artifacts/perf/latest}"
mkdir -p "$OUT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8185}"
INJECT_FAULTS="${INJECT_FAULTS:-false}"

echo "[perf] running dependency chaos probe against $BASE_URL"

if [[ "$INJECT_FAULTS" == "true" ]]; then
  "$ROOT_DIR/scripts/perf/inject-dependency-faults.sh" &
  CHAOS_PID=$!
else
  CHAOS_PID=""
fi

cleanup() {
  if [[ -n "${CHAOS_PID:-}" ]] && kill -0 "$CHAOS_PID" >/dev/null 2>&1; then
    kill "$CHAOS_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/perf/run-k6.sh" \
  "$ROOT_DIR/scripts/perf/k6/dependency-chaos.js" \
  --summary-export "$OUT_DIR/dependency-chaos-summary.json"

if [[ -n "${CHAOS_PID:-}" ]]; then
  wait "$CHAOS_PID"
fi

echo "[perf] dependency chaos summary: $OUT_DIR/dependency-chaos-summary.json"
