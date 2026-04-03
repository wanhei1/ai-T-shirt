#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${PERF_OUTPUT_DIR:-$ROOT_DIR/artifacts/perf/latest}"
mkdir -p "$OUT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8185}"

echo "[perf] running API sync read/write test against $BASE_URL"

BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/perf/run-k6.sh" \
  "$ROOT_DIR/scripts/perf/k6/api-sync-rw.js" \
  --summary-export "$OUT_DIR/api-sync-rw-summary.json"

echo "[perf] api sync rw summary: $OUT_DIR/api-sync-rw-summary.json"
