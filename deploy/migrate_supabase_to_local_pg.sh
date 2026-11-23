#!/bin/bash
# Copies Auto Stock Manager's data from Supabase's Postgres into a Postgres running on THIS server (the VPS).
# Run it on the VPS, from ~/auto-stock-manager:   bash deploy/migrate_supabase_to_local_pg.sh
#
# What it does: dumps Supabase's `public` schema (read-only there), creates a local database + login, loads the dump into
# it, then compares the row count of every table on both sides.
# What it never does: write to Supabase, touch backend/.env, restart the app, or load into a local database that
# already has tables (it stops instead). Safe to run again after you drop the local database it made.
# Cutting over is a separate, manual step printed at the end, so you choose a quiet moment.
#
# Needs: postgresql server + client (pg_dump >= Supabase's version), run by a user that can `sudo -u postgres`.
set -euo pipefail
cd "$(dirname "$0")/../backend"
[ -f .env ] || { echo "backend/.env not found. Run this on the server that runs the app."; exit 1; }

getenv() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e "s/^[[:space:]\"']*//" -e "s/[[:space:]\"']*\$//" || true; }
SRC="${SRC_URL:-$(getenv SUPABASE_DB_URL)}"
[ -n "$SRC" ] || { echo "No SUPABASE_DB_URL in backend/.env (or pass SRC_URL=...)."; exit 1; }
DB="${LOCAL_DB:-asm}"; ROLE="${LOCAL_USER:-asm}"
OUT="$HOME/supabase-to-local-pg-$(date +%F-%H%M).dump"
LOG="$HOME/supabase-to-local-pg-$(date +%F-%H%M).log"
exec > >(tee -a "$LOG") 2>&1   # the log holds table names and numbers only, never the passwords

for c in pg_dump pg_restore psql; do command -v "$c" >/dev/null || { echo "$c not found. Install: sudo apt install postgresql postgresql-client"; exit 1; }; done
pgsrc() { psql "$SRC" -v ON_ERROR_STOP=1 -At "$@"; }
sudo -u postgres psql -At -c "select 1" >/dev/null || { echo "Cannot run psql as the postgres user (sudo -u postgres)."; exit 1; }

echo "== 1/5 Checking Supabase (read-only) =="
pgsrc -c "select 'connected, server ' || current_setting('server_version')"
SRV_MAJOR=$(pgsrc -c "show server_version_num" | cut -c1-2)
CLI_MAJOR=$(pg_dump --version | grep -oE '[0-9]+' | head -1)
[ "$CLI_MAJOR" -ge "$SRV_MAJOR" ] || { echo "pg_dump is version $CLI_MAJOR but Supabase runs $SRV_MAJOR. Install postgresql-client-$SRV_MAJOR (pgdg repo) and retry."; exit 1; }
echo "tables in Supabase public schema: $(pgsrc -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"

echo "== 2/5 Creating the local database '$DB' =="
if sudo -u postgres psql -At -c "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  N=$(sudo -u postgres psql -At -d "$DB" -c "select count(*) from information_schema.tables where table_schema='public'")
  [ "$N" = "0" ] || { echo "Local database '$DB' already has $N tables. Not touching it. Drop it first (sudo -u postgres dropdb $DB) or set LOCAL_DB=another_name."; exit 1; }
else
  sudo -u postgres createdb "$DB"
fi
PASS="$(openssl rand -hex 16)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$ROLE') then create role $ROLE login password '$PASS'; else alter role $ROLE password '$PASS'; end if; end \$\$;" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB" -c "create extension if not exists citext;" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "alter database $DB owner to $ROLE;" >/dev/null

echo "== 3/5 Dumping Supabase's public schema to $OUT =="
# --exclude-table asm_*: Supabase-only login tables from backend/supabase/0002_security.sql (they point at Supabase's auth schema; the app does not use them)
pg_dump "$SRC" --schema=public --no-owner --no-privileges --format=custom --exclude-table='public.asm_*' -f "$OUT"
ls -lh "$OUT" | awk '{print "dump size: " $5}'
pg_restore -l "$OUT" | grep -qi "auth\." && { echo "The dump still refers to Supabase's auth schema. Stop and ask for help; nothing was loaded."; exit 1; } || true

echo "== 4/5 Loading into local '$DB' =="
LOCAL="postgresql://$ROLE:$PASS@127.0.0.1:5432/$DB"
# A new database already has its own `public` schema, so leave the dump's CREATE SCHEMA / COMMENT ON SCHEMA out of the restore.
LIST="$(mktemp)"
pg_restore -l "$OUT" | grep -v -E ' SCHEMA - public | COMMENT - SCHEMA public ' > "$LIST"
pg_restore -L "$LIST" --section=pre-data --section=data --no-owner --no-privileges --exit-on-error -d "$LOCAL" "$OUT"
# Indexes and constraints go in last. The data was copied into Supabase from MariaDB with foreign-key checks off, so it can hold
# a row that points at something deleted long ago (e.g. a job card whose mechanic is gone). Adding such a rule as NOT VALID keeps it
# enforced for every new or changed row and leaves the old row alone, which is exactly the state Supabase is in.
POST="$(mktemp)"
pg_restore -L "$LIST" --section=post-data --no-owner --no-privileges -f "$POST" "$OUT"
sed -i -E '/ADD CONSTRAINT .* FOREIGN KEY .*;$/ s/;$/ NOT VALID;/' "$POST"
psql "$LOCAL" -v ON_ERROR_STOP=1 -q -f "$POST"
rm -f "$LIST" "$POST"

echo "== 5/5 Comparing row counts, table by table =="
BAD=0
for t in $(psql "$LOCAL" -At -c "select tablename from pg_tables where schemaname='public' order by 1"); do
  a=$(pgsrc -c "select count(*) from public.\"$t\""); b=$(psql "$LOCAL" -At -c "select count(*) from public.\"$t\"")
  if [ "$a" = "$b" ]; then printf "  ok   %-28s %s\n" "$t" "$a"; else printf "  DIFF %-28s supabase=%s local=%s\n" "$t" "$a" "$b"; BAD=1; fi
done
echo
if [ "$BAD" = 0 ]; then echo "Every table matches."; else echo "Some tables differ (see DIFF). A table written to during the copy can differ by a few rows; re-run at a quiet time."; fi
cat <<EOF

NOT switched yet. To cut over (at a quiet time, nobody entering data):
  1. Run this script once more (drop the local db first:  sudo -u postgres dropdb $DB) so it has the latest rows.
  2. In backend/.env set:   SUPABASE_DB_URL=$LOCAL     (the name is historical; any Postgres works)
     keep DB_BACKEND=postgres and keep the old SUPABASE_DB_URL line as a # comment: that is your way back.
  3. pm2 restart auto-stock-backend, then open /api/health: "db_backend":"postgres", "database":"ok".
  4. Photos/documents are in Supabase Storage, NOT in this copy. Leave SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as they are
     for now (see the notes about Storage), and make a nightly backup:  pg_dump "$LOCAL" -Fc -f ~/asm-\$(date +%F).dump
Local login password is in the URL above; it is not saved anywhere else. Copy it into backend/.env now.
EOF
