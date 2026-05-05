#!/usr/bin/env bash
set -euo pipefail

REPORT_PATH="${GITLEAKS_REPORT_PATH:-.reports/gitleaks.sarif}"
mkdir -p "$(dirname "$REPORT_PATH")"

tracked_env_files="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '\.example$' || true)"
if [[ -n "$tracked_env_files" ]]; then
  echo "[secret-scan] blocked: tracked non-example env files detected"
  echo "$tracked_env_files"
  echo "Move secrets to untracked .env files and keep only *.example templates in git."
  exit 1
fi

if command -v gitleaks >/dev/null 2>&1; then
  echo "[secret-scan] using local gitleaks"
  exec gitleaks detect --source . --config .gitleaks.toml --redact --exit-code 1 --report-format sarif --report-path "$REPORT_PATH"
fi

if command -v docker >/dev/null 2>&1; then
  echo "[secret-scan] local gitleaks not found, using docker image"
  exec docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect --source /repo --config /repo/.gitleaks.toml --redact --exit-code 1 --report-format sarif --report-path /repo/"$REPORT_PATH"
fi

echo "[secret-scan] gitleaks is not installed and docker is unavailable"
echo "Install gitleaks: https://github.com/gitleaks/gitleaks"
exit 1
