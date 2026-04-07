#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL_INPUT="${DATABASE_URL:-}"
DATABASE_URLS_INPUT="${DATABASE_URLS:-}"
BACKUP_OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-artifacts/backup}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_TABLES_RAW="${BACKUP_TABLES:-orders,memberships,membership_transactions,order_idempotency_keys,all_designs,cart_items,design_usage_rewards,referral_redemptions}"

read_env_file_value() {
  local file_path="$1"
  local key="$2"
  if [[ ! -f "${file_path}" ]]; then
    return 0
  fi
  grep -E "^${key}=" "${file_path}" 2>/dev/null | tail -n 1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/\r$//' | xargs || true
}

if [[ -z "${DATABASE_URL_INPUT}" && -z "${DATABASE_URLS_INPUT}" ]]; then
  DATABASE_URL_INPUT="$(read_env_file_value "backend/.env" "DATABASE_URL")"
  DATABASE_URLS_INPUT="$(read_env_file_value "backend/.env" "DATABASE_URLS")"
fi

if [[ -z "${DATABASE_URL_INPUT}" && -n "${DATABASE_URLS_INPUT}" ]]; then
  DATABASE_URL_INPUT="$(echo "${DATABASE_URLS_INPUT}" | cut -d',' -f1 | xargs)"
fi

if [[ -z "${DATABASE_URL_INPUT}" ]]; then
  echo "DATABASE_URL or DATABASE_URLS is required"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found; install postgresql-client first"
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore not found; install postgresql-client first"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found; install postgresql-client first"
  exit 1
fi

mkdir -p "${BACKUP_OUTPUT_DIR}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_OUTPUT_DIR}/daily-backup-${stamp}.dump"
restore_list_file="${BACKUP_OUTPUT_DIR}/daily-backup-${stamp}-restore-list.txt"
report_json="${BACKUP_OUTPUT_DIR}/daily-backup-${stamp}-report.json"
report_md="${BACKUP_OUTPUT_DIR}/daily-backup-${stamp}-report.md"

IFS=',' read -r -a raw_tables <<<"${BACKUP_TABLES_RAW}"
TABLE_ARGS=()
for table in "${raw_tables[@]}"; do
  t="$(echo "${table}" | xargs)"
  [[ -z "${t}" ]] && continue
  TABLE_ARGS+=("--table=public.${t}")
done

if [[ "${#TABLE_ARGS[@]}" -eq 0 ]]; then
  echo "No tables selected for backup"
  exit 1
fi

echo "[daily-backup] creating dump: ${backup_file}"
pg_dump \
  --dbname "${DATABASE_URL_INPUT}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  "${TABLE_ARGS[@]}" \
  --file "${backup_file}"

echo "[daily-backup] verifying archive readability"
pg_restore --list "${backup_file}" > "${restore_list_file}"

required_tables=(orders memberships membership_transactions)
missing_required=()
for table in "${required_tables[@]}"; do
  if ! grep -Eq "TABLE DATA[[:space:]]+public[[:space:]]+${table}" "${restore_list_file}"; then
    missing_required+=("${table}")
  fi
done

if [[ "${#missing_required[@]}" -gt 0 ]]; then
  echo "[daily-backup] missing required tables in archive list: ${missing_required[*]}"
  exit 1
fi

orders_total="$(psql "${DATABASE_URL_INPUT}" -t -A -c "SELECT COUNT(*) FROM orders;" | xargs)"
orders_last_24h="$(psql "${DATABASE_URL_INPUT}" -t -A -c "SELECT COUNT(*) FROM orders WHERE created_at >= NOW() - INTERVAL '24 hours';" | xargs)"
latest_order_time="$(psql "${DATABASE_URL_INPUT}" -t -A -c "SELECT COALESCE(MAX(created_at)::text, '') FROM orders;" | xargs)"

restore_verification_status="PASS"
restore_verification_note="Archive readable via pg_restore --list; required tables present in backup catalog."

cat > "${report_json}" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backupFile": "${backup_file}",
  "restoreListFile": "${restore_list_file}",
  "restoreVerification": {
    "status": "${restore_verification_status}",
    "note": "${restore_verification_note}"
  },
  "orders": {
    "total": ${orders_total:-0},
    "last24h": ${orders_last_24h:-0},
    "latestOrderTime": "${latest_order_time}"
  }
}
EOF

cat > "${report_md}" <<EOF
# Daily Backup Report

- Generated At (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Backup File: ${backup_file}
- Restore List: ${restore_list_file}

## Restore Verification

- Status: ${restore_verification_status}
- Note: ${restore_verification_note}

## Order Recoverability Snapshot

- Total Orders: ${orders_total:-0}
- Orders in last 24h: ${orders_last_24h:-0}
- Latest Order Time: ${latest_order_time:-N/A}

## Acceptance

- [x] Daily backup generated
- [x] Restore readability verified
- [x] Last-24h recoverability snapshot recorded
EOF

cp "${report_json}" "${BACKUP_OUTPUT_DIR}/latest-backup-report.json"
cp "${report_md}" "${BACKUP_OUTPUT_DIR}/latest-backup-report.md"

if [[ "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${BACKUP_RETENTION_DAYS}" -gt 0 ]]; then
  find "${BACKUP_OUTPUT_DIR}" -type f -name 'daily-backup-*' -mtime "+${BACKUP_RETENTION_DAYS}" -delete
fi

echo "[daily-backup] backup complete"
echo "[daily-backup] report: ${report_md}"
