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

**Quick way for steps 3–5, in one command.** On the server, after steps 1 and 2:

```bash
cd ~/auto-stock-manager && git pull && bash deploy/migrate_to_supabase.sh
```

It asks for the three Supabase settings (what you type is hidden) and saves them in `backend/.env`, installs the
packages, checks the Supabase connection, moves the photos and documents, copies every table and runs `check`. It
never switches the app over and never deletes anything, and it can be run again. Everything it prints is also saved in
`~/supabase-migration-<date>.log` (table names and numbers, no passwords). The manual steps below do the same thing
one at a time.

**1. Back up MariaDB.** `deploy/backup-db.sh` (or your usual dump). Keep it until the move is finished.

**2. Set up Supabase (once).** In the Supabase SQL Editor run, in this order:
1. `backend/supabase/0001_media_buckets.sql` — the photo and document storage buckets
2. `backend/supabase/schema.sql` — every table, built from `backend/schema.sql` plus the columns and tables the app
   adds at startup: same columns, defaults, unique rules, indexes and foreign keys (safe to run again). Tables that
   exist only in your live MariaDB (the old `fin_*` ones) are created by the copy step.

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

`check` must say everything matches. `copy` refuses to start if a photo or document is still only in MariaDB
(go back to step 4). The leftover `fin_*` tables from the removed Finance section are copied too, so nothing is
left behind. `auth_tokens` (one-time email links) are not.

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
