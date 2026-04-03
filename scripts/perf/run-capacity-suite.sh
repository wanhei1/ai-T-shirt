#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${PERF_OUTPUT_DIR:-$ROOT_DIR/artifacts/perf/$STAMP}"
mkdir -p "$OUT_DIR"

echo "[perf] output directory: $OUT_DIR"

PERF_OUTPUT_DIR="$OUT_DIR" "$ROOT_DIR/scripts/perf/run-api-sync-rw.sh"
PERF_OUTPUT_DIR="$OUT_DIR" "$ROOT_DIR/scripts/perf/run-ai-async.sh"
PERF_OUTPUT_DIR="$OUT_DIR" INJECT_FAULTS="${INJECT_FAULTS:-false}" "$ROOT_DIR/scripts/perf/run-dependency-chaos.sh"

echo "[perf] capacity suite finished"
echo "[perf] summaries:"
echo "  - $OUT_DIR/api-sync-rw-summary.json"
echo "  - $OUT_DIR/ai-async-summary.json"
echo "  - $OUT_DIR/dependency-chaos-summary.json"
