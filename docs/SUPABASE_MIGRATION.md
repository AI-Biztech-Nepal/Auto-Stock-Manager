# Moving Auto Stock Manager's database from MySQL/MariaDB to Supabase

Auto Stock Manager keeps its own Supabase project. The app itself does not change: the backend stays on the VPS
and talks to Supabase's Postgres instead of MariaDB. It is one setting, `DB_BACKEND`:

| `DB_BACKEND` | Database | Code |
|---|---|---|
| `mysql` | MariaDB on the VPS (today) | `backend/sqldb.py` |
| `postgres` | Supabase | `backend/pgdb.py`, tables in `backend/supabase/schema.sql` |

Nothing is deleted from MariaDB at any point. Until you are happy, MariaDB stays as it is (the one change: the photo
step adds a pointer to each photo/document row, and the original file data stays in the row), and going back is
changing `DB_BACKEND` back to `mysql` and restarting.

Pushing this code to `main` is safe: the VPS auto-deploys it, but the backend keeps using MariaDB until
`DB_BACKEND=postgres` is in its `.env`.

## What you need

- A Supabase project (Supabase dashboard → New project), and from it:
  - `SUPABASE_URL` — Project URL, `https://<ref>.supabase.co` (nothing after `.co`)
  - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role` key (server-side only)
  - `SUPABASE_DB_URL` — Connect → connection string (URI), the **Session pooler** one, with `[YOUR-PASSWORD]`
    replaced by your database password (brackets included). Special characters in the password must be
    URL-encoded (`@` → `%40`).
- These three go in the backend's `.env` on the VPS. Never commit or paste them.

## Steps

**Quick way for steps 2–5, in one command.** On the server, after step 1:

```bash
cd ~/auto-stock-manager && git pull && bash deploy/migrate_to_supabase.sh
```

It asks for the three Supabase settings (what you type is hidden) and saves them in `backend/.env`, installs the
packages, checks the Supabase connection, prepares the tables and buckets, moves the photos and documents, copies every
table and runs `check`. It never switches the app over and never deletes anything, and it can be run again. Everything it prints is also saved in
`~/supabase-migration-<date>.log` (table names and numbers, no passwords). The manual steps below do the same thing
one at a time.

**1. Back up MariaDB.** `deploy/backup-db.sh` (or your usual dump). Keep it until the move is finished.

**2. Supabase tables and photo buckets.** Nothing to paste: the move creates them (and brings an older copy up to
date) by itself, using `backend/supabase/0001_media_buckets.sql` (the two photo buckets) and
`backend/supabase/schema.sql` (all 45 tables, built from `backend/schema.sql`, the Finance books migrations
`migration_add_finance_*.sql` and the columns and tables `server.py` / `finance_books.py` add at startup: same columns,
defaults, unique rules, indexes and foreign keys). Doing the steps by hand, run `venv/bin/python copy_mysql_to_supabase.py prepare` now, before step 4 (safe
to run again). If the app gains a table or column later, `schema.sql` has to be regenerated. A table or column
that exists only in your live MariaDB is added by the copy step, so nothing is left behind.

**3. Get the code and settings onto the VPS.** `git pull`, then in `~/auto-stock-manager/backend/`:
`venv/bin/pip install -r requirements.txt`, and add the three Supabase settings above to `.env`. Do **not** change
`DB_BACKEND` yet.

**4. Move the photos and documents into Supabase Storage** (they are not copied with the tables):

```bash
venv/bin/python migrate_media_to_supabase.py copy
venv/bin/python migrate_media_to_supabase.py verify
```

Do not run `purge` yet. That empties the copies in MariaDB, and they are the way back.

**5. Copy the data.** Read-only on MariaDB; run it as often as you like (rows are matched on their primary key, so
a second run updates instead of duplicating). The whole copy is one transaction: it lands completely or not at all.

```bash
venv/bin/python copy_mysql_to_supabase.py copy
venv/bin/python copy_mysql_to_supabase.py check   # row counts and every money/number total, side by side
```

The visit log (`page_views`) and the login log (`audit_logs`) change all day while the live site is used, so they are copied last, and
`check` accepts up to 25 newer rows of those two in MariaDB (it says so on the line). Everything else must match exactly.

`check` must say everything matches. `copy` refuses to start if a photo or document is still only in MariaDB
(go back to step 4). The Finance books tables (`fin_*`) are copied like everything else. `auth_tokens` (one-time
email links) are not.

**6. Switch over, at a quiet time** (nobody entering data):
1. Run step 5 again (`copy`, then `check`) so Supabase has the latest.
2. In the VPS `.env` set `DB_BACKEND=postgres`.
3. `pm2 restart auto-stock-backend`.
4. Open `https://<your-api>/api/health`. It must show `"db_backend":"postgres"` and `"database":"ok"`.
5. Log in and look around: inventory, a customer, a sale, spare parts, a photo.

**Going back:** set `DB_BACKEND=mysql`, `pm2 restart auto-stock-backend`. Anything entered *after* the switch is in
Supabase only; to bring it back to MariaDB you would have to copy it over by hand, so decide within the first day or
two. Afterwards MariaDB can be kept as a plain backup.

**7. Later, once it has run without problems for some weeks:** `migrate_media_to_supabase.py purge` (frees the photo
copies in MariaDB), then retire MariaDB.

## Without a login on the server (temporary tool)

If nobody can log in to the server, the app can do the move itself. `backend/migration_tool.py` (owner-only) runs the
same two scripts on the server, and `tools/run_migration.py` drives it from any PC using the app's normal login. Nothing
is deleted anywhere.

1. Commit and push to GitHub. The server updates itself within a minute or two.
2. On your PC, in the project folder (it reads the three `SUPABASE_` values from `backend/.env`; the password you type
   for the app is hidden):
   - `python tools/run_migration.py test` — checks the Supabase and MariaDB connections; copies nothing
   - `python tools/run_migration.py copy` — moves photos and data and compares them; the app keeps using MariaDB
   - `python tools/run_migration.py switch` — the same, then only if everything matches makes the app use Supabase and
     restarts it (do this at a quiet time; it asks you to type SWITCH)
   - `python tools/run_migration.py rollback` — makes the app use MariaDB again
3. When the move is done and you are happy: delete `backend/migration_tool.py` and `tools/run_migration.py`, delete the
   `migration_tool` lines near the bottom of `backend/server.py`, and push again.

Who may use it: the platform owner, or an admin of the original (oldest) business. A company created by a later
signup can never qualify. The tool never logs or returns the Supabase settings; `switch` writes them to the server's
`.env` (the old file is kept next to it as `.env.before-migration-<time>`).

Safety net: if the app starts with `DB_BACKEND=postgres` and cannot reach Supabase, it runs on MariaDB instead of
staying down (`/api/health` then says `"db_backend":"mysql"`). Anything saved after the switch is in Supabase only, so
after a fallback, fix the connection and copy again before switching once more.

## Moving to a different Supabase project (for example a nearer region)

A Supabase project's region cannot be changed, so it means a new project: create it, replace the three `SUPABASE_` lines in
`backend/.env` (keep the old ones as `#` comments), and run the move again (COPY, then SWITCH). The photo step looks at what is
really in the new project's Storage and uploads again everything that is not there, from the originals that stay in MariaDB
until `purge` - the database's "already moved" marks from the earlier project are not trusted. The old project is left
untouched as a spare. Measured round trip from Nepal (TCP connect to the Supabase pooler): Seoul 160 ms, Singapore 89 ms,
Mumbai 51 ms; the app asks the database ~30 questions per screen, so the region decides how fast screens feel.

## Backups

After the switch Supabase holds the only live copy, and the free plan has no automatic backups. `tools/backup_supabase.py`
(double-click `backup-supabase.bat`) saves everything to `%USERPROFILE%\AutoStockBackups`: every table as a compressed CSV in a new
dated folder (one consistent snapshot, with a manifest of row counts and checksums), and the photos and documents into a folder that
only ever gains files. It reads from Supabase only and deletes nothing, in Supabase or in the backup folder. `verify` checks a backup
is complete and undamaged. `restore <dated folder>` loads a backup into an EMPTY project (and `restore-files` uploads the saved photos);
tested: a restore is identical to the original in every row and column. The data folder contains customers' details and password
hashes: keep it private, not in a synced or shared folder.

### Automatic backups (nothing to remember)

The app does this by itself (`backend/auto_backup.py`), so `backup-supabase.bat` is only needed for an extra copy on your own PC.
Every night at 02:30 Nepal time it runs the same tool on the server: all the data as one dated folder (checked afterwards), plus any
photos and documents not saved yet (the first night downloads them all, about 1 GB, later nights only the new ones). It keeps the
newest 14 nights and one per week for 8 weeks, and only ever removes old dated data folders, and only after the new backup has been
checked and found complete. It never deletes anything in Supabase or in the photo folder.

* **Where:** `BACKUP_DIR` (default `~/AutoStockBackups` of the user the app runs as). Photos and documents are copied only while the
  disk has at least 3 GB free; otherwise the data is still saved and Settings says the photos were skipped.
* **Nothing to do after a restart:** if the server was off at 02:30, or a try failed, it catches up (a backup older than 26 hours is
  made soon after the app starts; a failed try is repeated every 30 minutes, up to 4 times).
* **Check it:** Settings > Automatic Backups (the main company's Admin only) shows the last good backup, the copies kept, the next
  run and the free disk, and has a **Back up now** button. If no backup has worked for 36 hours, or two tries in a row failed, the
  sidebar bell shows a red warning.
* **Switch it off:** `AUTO_BACKUP=off` in `backend/.env`, then restart. `BACKUP_AT=03:15` changes the time.
* **Restore:** the same as for a manual backup: `python tools/backup_supabase.py restore <the dated folder>` (into an empty project),
  then `restore-files`. Run it where `backend/.env` points at the new project.
* **Not covered:** a backup on the same server protects against deleted or damaged data, not against losing the server and Supabase
  together. For that, copy the backup folder somewhere else now and then (or run `backup-supabase.bat` on your PC occasionally).

## Photos and the public storefront

The public storefront (hamroauto.com.np, a separate Next.js site) only loads photos from an approved list of addresses
(`remotePatterns` in its `next.config`). Your app's address is on it; the new Supabase project's address
(`<project>.supabase.co`) is **not** (checked: it answers `"url" parameter is not allowed`). So by default
(`PHOTO_LINKS=app`) the app keeps every photo address on itself and sends the picture, reading it from Supabase Storage when
that is where it is, and the storefront needs no change. To use the direct Supabase addresses instead (faster), first add
the project's host to the storefront's `remotePatterns`, then set `PHOTO_LINKS=cdn` in the server's `.env`.

A photo that has been copied to Storage still has its original in MariaDB until `purge`. Until the app has the Supabase
settings (`SUPABASE_URL` and key) it ignores the Storage pointer and serves that original, so moving the files first cannot
make photos disappear from the live site.

## What behaves differently on Postgres (already handled in `pgdb.py`)

- **Capital letters.** MariaDB compared text without caring about case, Postgres does. The one place that
  matters is login: `users.username` is a case-insensitive column, so "Admin" and "admin" still find the same account
  and still cannot both exist. Everything else matches exactly, the way it did on MongoDB.
- **Sorting.** Postgres puts empty values last when sorting A→Z and first when sorting Z→A; MariaDB did the
  opposite. `pgdb.py` asks for MariaDB's order, so lists look the same.
- **Numbers vs text.** Comparing a text column with a number works as before.
- **Dates** stay plain ISO text (`2026-03-01T10:00:00`) and money stays `double precision`, exactly as in MariaDB.

## Security

Every table has Row Level Security switched on with no policies, so the public Supabase API key can read nothing.
The backend connects directly with the database password, which is not subject to those rules. Keep
`SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY` out of git, chat and the frontend.

## Not part of this plan

`backend/supabase/0002_security.sql` and `backend/import_users_to_supabase_auth.py` belong to an earlier idea, where
the website would talk to Supabase directly with no backend. They are not needed for this move.

## Testing

`backend/pgdb.py` was checked against a real Supabase Postgres in a throwaway schema (dropped afterwards): every
operation the app uses (filters, sorting, JSON and boolean columns, the atomic stock guard under 20 simultaneous
sales, foreign keys, unique rules, auto-numbered ids), the copy script with MariaDB-style rows (re-runs, rollback of
a bad row), and the app's existing backend test suite against the running app (92 pass; 5 skip themselves on an
empty database or because they need MariaDB directly). **It has not been run against your real MariaDB data**: the
copy and `check` steps on the VPS are what prove that, so do not skip them.
