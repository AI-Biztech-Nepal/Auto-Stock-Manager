# Auto Stock Manager — Deployment Guide
## Vercel (Frontend) + Self-Hosted VPS (Backend)

---

## Overview

| Service | What it hosts | Cost |
|---|---|---|
| **Vercel** | React frontend | Free |
| **Self-hosted VPS** | FastAPI backend + file uploads + MySQL | Your VPS plan |

The backend runs on your own VPS (via PM2), talking to a MySQL database
(`DB_BACKEND=mysql`). MongoDB Atlas is documented below only because the
backend can still run against it (`DB_BACKEND=mongo`, the code default) if
you ever spin up a fresh environment without your own DB server.

---

## Security Checklist

Run through this whenever you're not sure what state production is actually in (e.g.
taking over the project, or after not touching it for a while).

1. **`JWT_SECRET` is a real random value.** The backend now refuses to start if this is
   unset or still the old code default (`hamro-gng-2024`) — anyone who's read the source
   knows that value, so a deployment still using it lets tokens be forged. Check the
   backend's running environment (PM2: `pm2 env <id>`, or read the `.env` the process
   loads) and confirm it's a long random string, e.g. generate one with:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
   If you rotate it, every existing login session is invalidated (everyone has to log in
   again) — that's expected, not a bug.
2. **`CORS_ORIGINS` is set explicitly**, not left to default to `*`. The backend logs a
   warning on startup if it's unset — check the PM2 logs (`pm2 logs`) for it.
3. **The tenant-isolation DB hardening migration has actually run.** `backend/schema.sql`
   defines `company_id` as `NOT NULL` with a `FOREIGN KEY` on every tenant table, but a
   database created before `backend/migration_harden_company_id.sql` existed won't have
   those constraints unless that migration was run against it by hand. Confirm with:
   ```sql
   SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND (CONSTRAINT_NAME LIKE 'fk_%_company' OR CONSTRAINT_NAME LIKE 'chk_%');
   ```
   You should see one `fk_..._company` row per tenant table (customers, vehicles, sales,
   etc. — the full list is in the migration file) plus `fk_users_company` and
   `chk_users_company_or_platform_owner`. If the list is short or empty, read
   `backend/migration_harden_company_id.sql` top-to-bottom before running it — it has a
   pre-check query to run first and explains why (the 2026-08-18/19 incident).
4. **Rate limits are now in effect**: `/api/auth/login` allows 5 attempts/minute and
   `/api/auth/signup` allows 3/hour, per source IP (see `server.py`'s `limiter`). Repeated
   429 responses in logs during legitimate use usually means many staff share one outbound
   IP (e.g. behind the same office NAT) hitting login around the same time — not an attack.
5. **Default login changed.** If `admin` / `admin123` still works on production, change it
   immediately (Settings → Change Password after logging in).

---

## Email verification & password reset (Resend)

Self-signup (`/signup`) creates an account that can't log in until it clicks a
verification link (staff accounts an admin creates via Team Accounts are exempt —
see `server.py`'s `/auth/register`). Both that and `/forgot-password` need
[Resend](https://resend.com) configured to actually send anything — without it, the
app doesn't error, it just silently never emails anyone (check the backend logs for
`RESEND_API_KEY not set` warnings if verification emails aren't arriving).

1. Sign up at resend.com, create an API key, set `RESEND_API_KEY` on the backend.
2. Set `FRONTEND_URL` to your real deployed frontend URL (e.g. your Vercel URL) — this
   is what verification/reset links point at.
3. **For real users to actually receive email** (not just your own Resend account's
   address), verify a sending domain: Resend dashboard → Domains → Add Domain, add the
   DNS records it gives you, wait for verification, then set `RESEND_FROM` to an
   address on that domain, e.g. `Auto Stock Manager <no-reply@yourdomain.com>`. Until
   this is done, `RESEND_FROM` defaults to Resend's sandbox sender, which only
   delivers to the Resend account owner's own address — fine for testing, not for
   production signups.
4. Restart the backend after setting these.

---

## Auto-deploy on push to main

A GitHub webhook hits this app's own VPS listener on every push to `main`, which pulls,
reinstalls Python deps if `requirements.txt` changed, and restarts the backend under PM2
— no manual SSH step needed for routine deploys. Set up once as follows (it's already
running in production as of 2026-08-20; this section is for recreating it if the VPS is
ever rebuilt):

1. On the VPS, in `~/auto-stock-manager/deploy/`:
   ```bash
   cp webhook.ecosystem.config.js.example webhook.ecosystem.config.js
   ```
   Edit the copy and replace `WEBHOOK_SECRET` with a real random value, e.g.:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   (This file is gitignored — it must never be committed.)
2. Start it:
   ```bash
   pm2 start webhook.ecosystem.config.js && pm2 save
   ```
3. Add the nginx location block from `deploy/nginx-deploy-webhook-snippet.conf` to
   `/etc/nginx/sites-available/auto-stock-backend` (the live config for this app's own
   subdomain — not `deploy/admin-web.nginx.conf` in this same directory, which is a
   different, unrelated app's reference copy). Then:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. On GitHub: repo Settings → Webhooks → Add webhook, pointing at
   `https://autostock.203-134-250-70.sslip.io/deploy-webhook`, content type
   `application/json`, secret matching step 1, events: just `push`.

This app deliberately runs its **own** webhook listener/process/port, isolated from a
similar (older, unrelated) setup on the same VPS for a different app — see the comments
in `deploy/webhook-listener.js` for why. Deploy logs land at
`~/auto-stock-manager/deploy/last-deploy.log` on the VPS after each run.

**If auto-deploy ever seems to silently stop working**: check `pm2 show
auto-stock-deploy-webhook` is `online`, check GitHub's repo → Settings → Webhooks →
(this webhook) → Recent Deliveries for failed deliveries, and remember this deploy
mechanism is separate from the DB/env-var concerns in the Security Checklist above — a
failed deploy here doesn't touch `JWT_SECRET`, `CORS_ORIGINS`, etc.

---

## MongoDB Atlas (Database) — optional

Only needed if running with `DB_BACKEND=mongo` instead of your own MySQL.

1. Go to **[cloud.mongodb.com](https://cloud.mongodb.com)** → Create account
2. Click **"Build a Cluster"** → Choose **Free (M0 Shared)**
3. Select region closest to Nepal (Singapore `ap-southeast-1` recommended)
4. **Connect** → **Drivers** → Copy the connection string
5. Replace `<password>` with your DB user password
6. Your `MONGO_URL` will look like:
   ```
   mongodb+srv://username:password@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

> **Important**: In Atlas → Network Access → Add IP Address → **"Allow Access from Anywhere"** (`0.0.0.0/0`)

---

## Migrating the database to MySQL

MySQL is reached through a compatibility layer, `backend/sqldb.py`, so the
API endpoints don't need individual rewrites. See `backend/schema.sql` for
the table definitions.

1. Create a MySQL database + user on your host, note the
   host/port/user/password/database name.
2. Apply the schema via **phpMyAdmin** or any MySQL client: import
   `backend/schema.sql`.
3. Set the `MYSQL_*` environment variables (see below) on the backend.
4. Run the migration script **locally**, pointed at a scratch/staging copy
   first, then at production during a short maintenance window:
   ```bash
   cd backend
   pip install -r requirements.txt
   MONGO_URL=... DB_NAME=... \
   MYSQL_HOST=... MYSQL_PORT=3306 MYSQL_USER=... MYSQL_PASSWORD=... MYSQL_DB=... \
   python migrate_to_mysql.py
   ```
   It prints a per-collection row-count verification report at the end —
   confirm every line says `OK` before cutting over.
5. Flip `DB_BACKEND` to `mysql` and restart the backend (`pm2 restart`).

---

## Vercel (Frontend)

1. Go to **[vercel.com](https://vercel.com)** → Login with GitHub
2. Click **"Add New Project"** → Import your GitHub repo
3. **IMPORTANT** — Set Root Directory to **`frontend`**
4. Framework: Vercel auto-detects **Create React App** ✓
5. Add Environment Variable:
   ```
   REACT_APP_BACKEND_URL = <your VPS backend URL>
   ```
   (no trailing slash)
6. Click **Deploy** → Done!

### Custom Domain (Optional)
- **Vercel**: Settings → Domains → Add `hamroauto.com.np`

---

## Environment Variables Summary

### Backend (VPS)
| Variable | Required | Description |
|---|---|---|
| `DB_BACKEND` | ❌ | `mongo` (default) or `mysql` |
| `MONGO_URL` | ✅ if `DB_BACKEND=mongo` | MongoDB Atlas connection string |
| `DB_NAME` | ✅ | `hamro_gng_auto` |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DB` | ✅ if `DB_BACKEND=mysql` | MySQL connection details |
| `JWT_SECRET` | ✅ | Random secret for auth tokens |
| `GEMINI_API_KEY` | ✅ | For AI features (Pricing, Chatbot, Festival) — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `CORS_ORIGINS` | ✅ | Your Vercel frontend URL |
| `RESEND_API_KEY` | ❌ (but see below) | Sends email-verification and password-reset emails. Without it, signup/reset still work but no email is ever sent — accounts get stuck unverified. |
| `RESEND_FROM` | ❌ | Sender address, e.g. `Auto Stock Manager <no-reply@yourdomain.com>`. Defaults to Resend's sandbox address, which can only email your own Resend account — real users won't receive anything until you verify a domain and set this. |
| `FRONTEND_URL` | ✅ if `RESEND_API_KEY` set | Your deployed frontend's URL (no trailing slash) — used to build the links inside verification/reset emails. Defaults to `http://localhost:3000`, which is wrong for production. |

### Vercel (Frontend)
| Variable | Required | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | Your VPS backend URL (no trailing slash) |

Vercel only hosts the React frontend, which calls the AI features through the backend's
`/api/ai/*` routes — it never touches `GEMINI_API_KEY` directly, so deleting/recreating
the Vercel project cannot affect the AI Assistant. If AI features stop working, the key
is missing (or was reset) on the **backend**, not Vercel — see the table above.

---

## Verify Deployment

After deploying, test these against your VPS backend URL:
```bash
# Health check
curl https://your-backend-url/api/health

# Login
curl -X POST https://your-backend-url/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Default login: **admin / admin123** (change this after first login!)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `CORS error` on frontend | Check `CORS_ORIGINS` on the backend matches your Vercel URL exactly |
| `Cannot connect to DB` (Mongo) | Check MongoDB Atlas network access allows `0.0.0.0/0` |
| `Cannot connect to DB` (MySQL) | Check the MySQL server allows connections from the backend's host |
| `AI features not working` | Verify `GEMINI_API_KEY` is set in the backend's environment (not Vercel) |
| Login works but pages crash | Check `REACT_APP_BACKEND_URL` in Vercel has no trailing slash |
