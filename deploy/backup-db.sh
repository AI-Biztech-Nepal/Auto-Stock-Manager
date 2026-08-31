#!/bin/bash
# Daily database backup. Run from cron:
#   15 2 * * * /home/mansa/auto-stock-manager/deploy/backup-db.sh
#
# Uses ~/.my.cnf for credentials (host/user/password/database), so it follows whatever
# the app is currently pointed at. Keeps 14 days of gzipped dumps in ~/backups.
set -e

DEST="${BACKUP_DIR:-$HOME/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DB="$(awk -F= '/^database=/{print $2}' "$HOME/.my.cnf")"

mkdir -p "$DEST"
out="$DEST/${DB}-$(date +%F-%H%M).sql.gz"
mysqldump --single-transaction --no-tablespaces "$DB" | gzip > "$out"
find "$DEST" -name "${DB}-*.sql.gz" -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup -> $out ($(du -h "$out" | cut -f1))"
