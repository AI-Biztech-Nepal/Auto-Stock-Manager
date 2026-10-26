# Moving Auto Stock Manager to Supabase (option C)

The goal: Auto Stock Manager built like Jageer Nepal and Finance — the app talks to Supabase directly
(database rules decide who sees what, triggers and database functions keep the books straight, Edge Functions
do what needs a secret key), the website on Vercel, and **no VPS**. Everything goes into the FINANCE Supabase
project (`boiiqzkkbyzqkqsxuzyp`), as `asm_*` tables, so Finance can read the dealership's records directly.

The shop keeps working the whole time: MySQL stays the live database until the last step, and nothing on the
VPS is deleted until everything has been running on Supabase.

## Stages

| # | Stage | What changes for staff | Status |
|---|---|---|---|
| 0 | Photos and documents to Supabase Storage (`media_storage.py`, `migrate_media_to_supabase.py`) | Nothing visible; photos load faster | built — run on the VPS |
| 0 | Every table copied into Supabase (`copy_mysql_to_supabase.py`), MySQL untouched | Nothing | built — run on the VPS |
| 1 | Security rules in the database (`FINANCE/supabase/migrations/0014_asm_security.sql`) and logins in Supabase Auth with the same passwords (`import_users_to_supabase_auth.py`) | Nothing yet | built — run after stage 0 |
| 2 | Login screen signs in through Supabase; read-only screens (inventory, customers, vendors, lists, reports) read Supabase directly | Same screens, same passwords | next |
| 3 | Everything that changes data — add vehicle, sale, return, booking, vendor payment, parts in/out, job cards — as database functions (each one all-or-nothing, like the backend does today) | Same screens | |
| 4 | What needs a secret key or heavy work, as Edge Functions: AI assistant (Gemini), emails (Resend → Supabase Auth's own), Facebook posting, Excel/PDF reports, the storefront's public API and visit counter | Same | |
| 5 | Cutover: a final copy, MySQL set read-only, the app switched to Supabase for good; the admin website moved to Vercel | Log in once more | |
| 6 | After some weeks without problems: the Python backend and MySQL switched off, the VPS retired | — | |

Stages 2–4 go screen by screen. While they run, a screen that has moved and one that has not must not both
write the same records — so a screen moves only when everything it writes has moved with it, and until
cutover (stage 5) the moved screens are tested against the copy, not used by staff.

## Run order for stages 0 and 1

On the VPS, in `~/auto-stock-manager/backend/` (the backend `.env` needs `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`):

```bash
venv/bin/python migrate_media_to_supabase.py copy
venv/bin/python migrate_media_to_supabase.py verify
venv/bin/python copy_mysql_to_supabase.py schema && cat supabase_schema.sql   # → Supabase SQL Editor → Run
venv/bin/python copy_mysql_to_supabase.py copy
venv/bin/python copy_mysql_to_supabase.py check
```

Then in Supabase's SQL Editor: `FINANCE/supabase/migrations/0014_asm_security.sql`. Then on the VPS:

```bash
venv/bin/python import_users_to_supabase_auth.py            # dry run
venv/bin/python import_users_to_supabase_auth.py --apply
```

Do not run `migrate_media_to_supabase.py purge` yet — that empties the photo copies in MySQL, and they stay
until stage 6.

## One thing to settle first

`backend/finance_books.py` (Finance books inside Auto Stock Manager, on MySQL, `fin_*` tables) was started
the same day this plan was made. Under this plan the books live in the Finance app on Supabase, which can read
the dealership's `asm_*` records directly — so new work on `finance_books.py` would be redone. Pause it.
