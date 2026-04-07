#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8185}"
READY_PATH="${READY_PATH:-/health/ready}"
TARGET_RTO_MINUTES="${TARGET_RTO_MINUTES:-15}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-5}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1800}"
FAULT_INJECTION_COMMAND="${FAULT_INJECTION_COMMAND:-}"
RECOVERY_COMMAND="${RECOVERY_COMMAND:-}"
OUTPUT_DIR="${OUTPUT_DIR:-artifacts/dr}"

mkdir -p "${OUTPUT_DIR}"

ready_url="${API_BASE_URL}${READY_PATH}"
start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start_epoch="$(date +%s)"

echo "[dr-az] target endpoint: ${ready_url}"
echo "[dr-az] drill started at ${start_ts}"

check_ready() {
  curl -fsS --max-time 3 "${ready_url}" >/dev/null
}

until check_ready; do
  echo "[dr-az] waiting service ready before drill..."
  sleep 2
done

echo "[dr-az] baseline ready confirmed"

if [[ -n "${FAULT_INJECTION_COMMAND}" ]]; then
  echo "[dr-az] executing fault injection command"
  eval "${FAULT_INJECTION_COMMAND}"
else
  echo "[dr-az] no FAULT_INJECTION_COMMAND configured, please trigger AZ failover manually now"
fi

first_down_epoch=""
recovered_epoch=""

deadline=$((start_epoch + TIMEOUT_SECONDS))
while [[ "$(date +%s)" -lt "${deadline}" ]]; do
  now_epoch="$(date +%s)"

  if check_ready; then
    if [[ -n "${first_down_epoch}" ]]; then
      recovered_epoch="${now_epoch}"
      break
    fi
  else
    if [[ -z "${first_down_epoch}" ]]; then
      first_down_epoch="${now_epoch}"
      echo "[dr-az] first outage observed at $(date -u -d @${now_epoch} +%Y-%m-%dT%H:%M:%SZ)"
    fi
  fi

  sleep "${POLL_INTERVAL_SECONDS}"
done

if [[ -n "${RECOVERY_COMMAND}" ]]; then
  echo "[dr-az] executing recovery command"
  eval "${RECOVERY_COMMAND}"
fi

if [[ -z "${first_down_epoch}" ]]; then
  rto_seconds=0
  outcome="no-observed-outage"
elif [[ -n "${recovered_epoch}" ]]; then
  rto_seconds=$((recovered_epoch - first_down_epoch))
  outcome="recovered"
else
  rto_seconds=${TIMEOUT_SECONDS}
  outcome="timeout-not-recovered"
fi

target_rto_seconds=$((TARGET_RTO_MINUTES * 60))
if [[ "${rto_seconds}" -le "${target_rto_seconds}" ]]; then
  slo_status="PASS"
else
  slo_status="FAIL"
fi

report_file="${OUTPUT_DIR}/az-failover-drill-$(date -u +%Y%m%dT%H%M%SZ).md"

cat > "${report_file}" <<EOF
# AZ Failover Drill Report

- Started at (UTC): ${start_ts}
- Endpoint: ${ready_url}
- Outcome: ${outcome}
- Target RTO: ${TARGET_RTO_MINUTES} minutes
- Observed RTO: ${rto_seconds} seconds
- RTO Status: ${slo_status}

## Commands
- Fault injection: ${FAULT_INJECTION_COMMAND:-manual}
- Recovery: ${RECOVERY_COMMAND:-manual}

## Notes
- If RTO Status is FAIL, create P0/P1 remediation items and schedule re-drill.
EOF

echo "[dr-az] report generated: ${report_file}"
if [[ "${slo_status}" == "FAIL" ]]; then
  echo "[dr-az] RTO target breached"
  exit 1
fi

echo "[dr-az] drill passed"
