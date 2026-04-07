#!/usr/bin/env bash
set -euo pipefail

TARGET_RTO_MINUTES="${TARGET_RTO_MINUTES:-60}"
TARGET_RPO_MINUTES="${TARGET_RPO_MINUTES:-15}"
BACKUP_SNAPSHOT_AT="${BACKUP_SNAPSHOT_AT:-}"
OUTAGE_STARTED_AT="${OUTAGE_STARTED_AT:-}"
RESTORE_COMPLETED_AT="${RESTORE_COMPLETED_AT:-}"
OUTPUT_DIR="${OUTPUT_DIR:-artifacts/dr}"

if [[ -z "${BACKUP_SNAPSHOT_AT}" ]]; then
  echo "BACKUP_SNAPSHOT_AT is required (RFC3339, e.g. 2026-04-04T08:00:00Z)"
  exit 1
fi

if [[ -z "${OUTAGE_STARTED_AT}" ]]; then
  echo "OUTAGE_STARTED_AT is required (RFC3339)"
  exit 1
fi

if [[ -z "${RESTORE_COMPLETED_AT}" ]]; then
  RESTORE_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

mkdir -p "${OUTPUT_DIR}"

backup_epoch="$(date -d "${BACKUP_SNAPSHOT_AT}" +%s)"
outage_epoch="$(date -d "${OUTAGE_STARTED_AT}" +%s)"
restore_epoch="$(date -d "${RESTORE_COMPLETED_AT}" +%s)"

if [[ "${restore_epoch}" -lt "${outage_epoch}" ]]; then
  echo "RESTORE_COMPLETED_AT must be >= OUTAGE_STARTED_AT"
  exit 1
fi

rto_seconds=$((restore_epoch - outage_epoch))
rpo_seconds=$((outage_epoch - backup_epoch))

if [[ "${rpo_seconds}" -lt 0 ]]; then
  rpo_seconds=0
fi

target_rto_seconds=$((TARGET_RTO_MINUTES * 60))
target_rpo_seconds=$((TARGET_RPO_MINUTES * 60))

rto_status="PASS"
rpo_status="PASS"

if [[ "${rto_seconds}" -gt "${target_rto_seconds}" ]]; then
  rto_status="FAIL"
fi

if [[ "${rpo_seconds}" -gt "${target_rpo_seconds}" ]]; then
  rpo_status="FAIL"
fi

report_file="${OUTPUT_DIR}/cross-region-restore-drill-$(date -u +%Y%m%dT%H%M%SZ).md"

cat > "${report_file}" <<EOF
# Cross-Region Restore Drill Report

- Backup snapshot at (UTC): ${BACKUP_SNAPSHOT_AT}
- Outage started at (UTC): ${OUTAGE_STARTED_AT}
- Restore completed at (UTC): ${RESTORE_COMPLETED_AT}

- Target RTO: ${TARGET_RTO_MINUTES} minutes
- Observed RTO: ${rto_seconds} seconds
- RTO Status: ${rto_status}

- Target RPO: ${TARGET_RPO_MINUTES} minutes
- Observed RPO: ${rpo_seconds} seconds
- RPO Status: ${rpo_status}

## Evidence Checklist
- [ ] DB restore logs attached
- [ ] Object storage replication verification attached
- [ ] Queue recovery verification attached
- [ ] Job-state consistency check attached
EOF

echo "[dr-cross-region] report generated: ${report_file}"

if [[ "${rto_status}" == "FAIL" || "${rpo_status}" == "FAIL" ]]; then
  echo "[dr-cross-region] target breached"
  exit 1
fi

echo "[dr-cross-region] drill passed"
