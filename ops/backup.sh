#!/usr/bin/env bash
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/automatethis-pm}
API_ENV_FILE=${API_ENV_FILE:-$APP_DIR/apps/api/.env}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/automatethis-pm}
RETENTION_DAYS=${RETENTION_DAYS:-14}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET_DIR="$BACKUP_ROOT/$STAMP"
UPLOADS_DIR="$APP_DIR/apps/api/uploads"

if [ ! -f "$API_ENV_FILE" ]; then
  echo "Missing API env file: $API_ENV_FILE" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

DATABASE_URL=$(grep '^DATABASE_URL=' "$API_ENV_FILE" | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not found in $API_ENV_FILE" >&2
  exit 1
fi

PG_DUMP_URL=${DATABASE_URL%%\?schema=*}
export PGAPPNAME=automatethis-backup

pg_dump --clean --if-exists --no-owner --no-privileges --format=custom --file="$TARGET_DIR/database.dump" "$PG_DUMP_URL"

if [ -d "$UPLOADS_DIR" ]; then
  tar -C "$UPLOADS_DIR" -czf "$TARGET_DIR/uploads.tar.gz" .
else
  echo "No uploads directory found at $UPLOADS_DIR; writing placeholder." > "$TARGET_DIR/uploads.txt"
fi

cat > "$TARGET_DIR/manifest.txt" <<EOF
timestamp_utc=$STAMP
app_dir=$APP_DIR
api_env_file=$API_ENV_FILE
backup_root=$BACKUP_ROOT
retention_days=$RETENTION_DAYS
hostname=$(hostname)
uploads_dir=$UPLOADS_DIR
EOF

ln -sfn "$TARGET_DIR" "$BACKUP_ROOT/latest"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +

echo "Backup complete: $TARGET_DIR"
