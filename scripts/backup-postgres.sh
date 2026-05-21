#!/bin/bash
# PostgreSQL backup script for yituai tshirt project
# Runs daily via crontab, compresses with gzip, auto-cleans 14-day-old backups

set -euo pipefail

# --- Configuration ---
BACKUP_DIR="/usrhome/tyx/backup/tshirt-postgres"
PROJECT_DIR="/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer"
ENV_FILE="${PROJECT_DIR}/backend/.env"
RETENTION_DAYS=14
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/tshirt_db_${TIMESTAMP}.sql.gz"

# --- Read credentials from .env (no hardcoded password) ---
if [ ! -f "$ENV_FILE" ]; then
  echo "[$(date)] ERROR: .env file not found at $ENV_FILE" >&2
  exit 1
fi

# Extract DATABASE_URL and parse components
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -1 | sed 's/^DATABASE_URL=//' | tr -d '\r')
if [ -z "$DATABASE_URL" ]; then
  echo "[$(date)] ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

# Parse: postgresql://user:password@host:port/dbname
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

# --- Execute backup ---
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  2>&1 | gzip > "$BACKUP_FILE"

# Verify non-empty
FILE_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -lt 100 ]; then
  echo "[$(date)] ERROR: Backup file too small (${FILE_SIZE} bytes), possible failure" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Backup complete: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# --- Cleanup old backups ---
DELETED=$(find "$BACKUP_DIR" -name "tshirt_db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned $DELETED backup(s) older than ${RETENTION_DAYS} days"
fi

echo "[$(date)] Total backups: $(ls -1 "$BACKUP_DIR"/tshirt_db_*.sql.gz 2>/dev/null | wc -l)"
