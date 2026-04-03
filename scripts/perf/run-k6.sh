#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${1:-}"
shift || true

if [[ -z "$SCRIPT_PATH" ]]; then
  echo "Usage: $0 <k6-script-path> [k6 args...]"
  exit 1
fi

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "k6 script not found: $SCRIPT_PATH"
  exit 1
fi

if command -v k6 >/dev/null 2>&1; then
  exec k6 run "$SCRIPT_PATH" "$@"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Neither k6 nor docker is available. Install k6 or docker first."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "k6 is not installed, and Docker daemon is not accessible for current user."
  echo "Fix options:"
  echo "  1) Install k6 locally and rerun"
  echo "  2) Grant Docker permission (add user to docker group) and relogin"
  echo "  3) Run command with sudo if your environment allows it"
  exit 1
fi

script_dir="$(dirname "$SCRIPT_PATH")"
script_name="$(basename "$SCRIPT_PATH")"

exec docker run --rm -i \
  --network host \
  -v "$ROOT_DIR:$ROOT_DIR" \
  -w "$ROOT_DIR" \
  grafana/k6:latest run "$script_dir/$script_name" "$@"
