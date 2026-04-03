#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${PERF_OUTPUT_DIR:-$ROOT_DIR/artifacts/perf/latest}"
mkdir -p "$OUT_DIR"

BASE_URL="${BASE_URL:-http://127.0.0.1:8185}"

echo "[perf] running AI async queue test against $BASE_URL"

BASE_URL="$BASE_URL" "$ROOT_DIR/scripts/perf/run-k6.sh" \
  "$ROOT_DIR/scripts/perf/k6/ai-async-queue.js" \
  --summary-export "$OUT_DIR/ai-async-summary.json"

echo "[perf] ai async summary: $OUT_DIR/ai-async-summary.json"
