#!/bin/bash
# Moves Auto Stock Manager's data from MariaDB into its Supabase project - ONE command, run on the server that
# runs the app (the one with MariaDB and ~/auto-stock-manager):
#
#     cd ~/auto-stock-manager && git pull && bash deploy/migrate_to_supabase.sh
#
# What it does, in order: asks for the three Supabase settings it is missing (typing is hidden) and saves them in
# backend/.env; installs what the new code needs; checks the Supabase connection; moves the photos and documents into
# Supabase Storage; copies every table; compares MariaDB and Supabase.
#
# What it never does: switch the app over (DB_BACKEND is not touched), delete anything, or run "purge".
#   * MariaDB's tables are only read. The one change to MariaDB is that each moved photo/document row gets a pointer
#     to its file in Storage; the original photo data stays in MariaDB.
#   * Safe to run again: copied rows are matched on their id, files already moved are skipped.
# Everything it prints is also saved to ~/supabase-migration-<date>.log (table names and numbers, no passwords).
set -euo pipefail
cd "$(dirname "$0")/../backend"

PY=venv/bin/python
[ -x "$PY" ] || { echo "Cannot find backend/venv/bin/python. Run this on the server, from inside ~/auto-stock-manager."; exit 1; }
[ -f .env ] || { echo "backend/.env not found. Run this on the server that runs the app."; exit 1; }

getenv() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//" || true; }

# normalise + validate one setting; prints the cleaned value, or nothing (and a reason on stderr) if it is not usable
clean_value() {
  local name="$1" v="$2"
  v="$(printf '%s' "$v" | tr -d '\r' | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//")"
  case "$name" in
    SUPABASE_URL)
      v="${v%/}"; v="${v%/rest/v1}"; v="${v%/}"
      [[ "$v" =~ ^https://[a-z0-9]+\.supabase\.co$ ]] || { echo "  That does not look right. It should look like https://abcdefgh.supabase.co (nothing after .co)." >&2; return 0; } ;;
    SUPABASE_SERVICE_ROLE_KEY)
      { [ "${#v}" -ge 40 ] && [[ "$v" != *" "* ]]; } || { echo "  That is too short to be the service_role key (it is a long text starting with eyJ... or sb_secret_...)." >&2; return 0; } ;;
    SUPABASE_DB_URL)
      [[ "$v" =~ ^postgres(ql)?://[^[:space:]]+@[^[:space:]]+$ ]] || { echo "  That should start with postgresql:// and contain your database password." >&2; return 0; }
      if [[ "$v" == *"["* || "$v" == *"]"* ]]; then echo "  It still has [ ] brackets. Replace [YOUR-PASSWORD] (brackets included) with your real database password." >&2; return 0; fi ;;
  esac
  printf '%s' "$v"
}

save_setting() {  # name, value: replaces any existing line for that setting
  sed -i "/^$1=/d" .env
  [ -z "$(tail -c1 .env)" ] || echo >> .env
  printf '%s=%s\n' "$1" "$2" >> .env
}

ensure_setting() {  # name, label
  local name="$1" label="$2" raw val
  raw="$(getenv "$name")"
  val=""
  if [ -n "$raw" ]; then val="$(clean_value "$name" "$raw" 2>/dev/null)"; fi
  if [ -n "$val" ] && [ "$val" = "$raw" ]; then echo "  $name: already set"; return; fi
  if [ -n "$val" ]; then save_setting "$name" "$val"; echo "  $name: was in .env with extra characters - tidied up"; return; fi
  if [ -n "$raw" ]; then echo "  $name is in .env but not usable - asking again."; fi
  while true; do
    read -r -s -p "  $label: " val; echo
    val="$(clean_value "$name" "$val")"
    if [ -n "$val" ]; then break; fi
  done
  save_setting "$name" "$val"
  echo "  $name: saved to backend/.env"
}

echo "== Supabase settings (paste each one and press Enter; nothing you type is shown)"
ensure_setting SUPABASE_URL "SUPABASE_URL (Supabase > Project Settings > API > Project URL)"
ensure_setting SUPABASE_SERVICE_ROLE_KEY "SUPABASE_SERVICE_ROLE_KEY (Supabase > Project Settings > API > service_role)"
ensure_setting SUPABASE_DB_URL "SUPABASE_DB_URL (Supabase > Connect > Session pooler, with your database password filled in)"

LOG="$HOME/supabase-migration-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
trap 'echo; echo "STOPPED. Nothing was deleted and the app was not switched over. Send the lines above to whoever is helping you (they hold no passwords)."' ERR

echo
echo "== $(date)  (log: $LOG)"
echo "== 1/5  Installing what the new code needs"
venv/bin/pip install -q -r requirements.txt

echo "== 2/5  Checking the Supabase connection"
$PY - <<'PYEOF'
import os, sys
from dotenv import load_dotenv
load_dotenv(".env")
import psycopg
try:
    with psycopg.connect(os.environ["SUPABASE_DB_URL"], connect_timeout=20, prepare_threshold=None) as c:
        have = c.execute("select to_regclass('public.users') is not null, "
                         "(select count(*) from information_schema.tables where table_schema='public')").fetchone()
except Exception as e:
    print(f"Could not connect to Supabase: {type(e).__name__}. Check SUPABASE_DB_URL (password, and use the Session pooler address).")
    sys.exit(1)
if not have[0]:
    print("Connected, but the tables are not there yet. In Supabase > SQL Editor run backend/supabase/0001_media_buckets.sql, then backend/supabase/schema.sql, then run this again.")
    sys.exit(1)
print(f"Connected. {have[1]} tables are ready in Supabase.")
PYEOF

echo "== 3/5  Moving photos and documents into Supabase Storage"
$PY migrate_media_to_supabase.py copy
echo "== 4/5  Checking every file really arrived"
$PY migrate_media_to_supabase.py verify
echo "== 5/5  Copying the data, then comparing it"
$PY copy_mysql_to_supabase.py copy
$PY copy_mysql_to_supabase.py check

trap - ERR
echo
echo "== DONE. The app was NOT switched over and nothing was deleted."
echo "== Send the lines above (from '5/5' down) to confirm they all say ok. Log saved at $LOG"
