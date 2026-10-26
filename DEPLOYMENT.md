# Auto Stock Manager — Deployment Guide
## Self-Hosted VPS (Frontend + Backend)

> The admin frontend moved off Vercel to the VPS (see **Admin frontend on the VPS** below). The older
> Vercel instructions further down are kept only as history.

---

## Overview

| Service | What it hosts | Cost |
|---|---|---|
| **Self-hosted VPS** | React admin frontend (nginx), FastAPI backend + file uploads + MySQL | Your VPS plan |
| **Hostinger** | DNS for hamroauto.com.np, and the public storefront | Your Hostinger plan |
| ~~Vercel~~ | Retired. It used to host the admin frontend. | |

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

## Storefront visit tracking (Visits page)

The admin **Visits** page shows traffic to hamroauto.com.np. The storefront (separate Next.js
app) must report each page view to the backend. Add this client component to its root layout
(`API_URL` = this backend's public URL):

```jsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function VisitBeacon() {
  const path = usePathname();
  useEffect(() => {
    let id = localStorage.getItem("hamro_vid");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("hamro_vid", id); }
    navigator.sendBeacon(`${API_URL}/api/public/visit`,
      JSON.stringify({ visitor_id: id, path, referrer: document.referrer }));
  }, [path]);
  return null;
}
```

Only a random browser id, the path, the referrer host and mobile/desktop are stored -- no IP address.
Visits appear from the moment the beacon is live; nothing is back-filled.

### Or read the numbers from Google Analytics 4

If the storefront already has GA4, the Visits page can show its history instead:
1. Google Cloud: enable the **Google Analytics Data API**, create a service account and download its JSON key.
2. GA4 -> Admin -> Property access management: add the service account's email as **Viewer**.
3. On the VPS set `GA4_PROPERTY_ID` (numeric id, GA4 -> Admin -> Property details) and `GA4_CREDENTIALS_JSON` (the key's JSON, or the path to the file), then restart the backend.

### Google Search keywords and countries (Search Console)

The Visits page can also show what people typed into Google and which countries those searches came from:
1. Google Cloud: enable the **Google Search Console API** and create a service account + JSON key.
2. Search Console -> Settings -> Users and permissions: add the service account email as a user (Restricted is enough).
3. On the VPS set `GSC_CREDENTIALS_JSON` (key JSON or path to the file; falls back to `GA4_CREDENTIALS_JSON`) and `GSC_SITE_URL` (`sc-domain:hamroauto.com.np` for a Domain property, or the full URL for a URL-prefix property), then restart the backend.

Search Console data runs 2 to 3 days behind and only exists from when the site was verified.

## Photos and documents in Supabase Storage

Vehicle photos and legal documents used to live in MySQL as base64 and pass through the backend on every
view (with up to 300MB of them cached in its memory). With Supabase Storage switched on, they are kept in the
FINANCE Supabase project instead (`backend/media_storage.py`): photos in the public `asm-photos` bucket, served
by its CDN; documents in the private `asm-documents` bucket, opened through hour-long signed links. The app's
`/file` links keep working and redirect there, and the storefront gets the CDN links directly.

1. Supabase (FINANCE project) → SQL Editor: run `FINANCE/supabase/migrations/0013_asm_media_buckets.sql`.
2. On the VPS, in the backend's `.env`: `SUPABASE_URL=https://boiiqzkkbyzqkqsxuzyp.supabase.co` and
   `SUPABASE_SERVICE_ROLE_KEY=` (Project Settings → API → service_role; server-side only, never the
   frontend). Restart the backend. From here on new uploads go to Storage.
3. Move what is already there, from `~/auto-stock-manager/backend/`:
   ```bash
   python migrate_media_to_supabase.py copy     # uploads, keeps the database copy; safe to re-run
   python migrate_media_to_supabase.py verify   # every file really in Storage?
   python migrate_media_to_supabase.py purge    # empties the database copies (only if verify passes)
   ```
   then in MySQL `OPTIMIZE TABLE vehicle_photos, legal_documents;` to give the disk space back.

Without the two settings nothing changes: uploads keep going into MySQL, as before.

## Copying the database to Supabase (MySQL stays as it is)

`backend/copy_mysql_to_supabase.py` copies every MySQL table into the FINANCE Supabase project as
`asm_<table>` (Row Level Security on, no policies: only the service role key can reach them). It only reads
MySQL; the app keeps running on it. Re-run any time to bring Supabase up to date. Uses the same two Supabase
settings as above. From `~/auto-stock-manager/backend/`:

```bash
venv/bin/python copy_mysql_to_supabase.py schema   # writes supabase_schema.sql
cat supabase_schema.sql                            # paste into Supabase SQL Editor -> Run
venv/bin/python copy_mysql_to_supabase.py copy
venv/bin/python copy_mysql_to_supabase.py check    # row counts side by side
```

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

## Admin frontend on the VPS (stock.hamroauto.com.np)

The admin app is built and served by the VPS itself; nginx serves `/var/www/auto-stock-frontend` and
passes `/api` to the backend on the same box, so the browser sees one origin (no CORS). Each push to
`main` runs `deploy/redeploy.sh`, which restarts the backend and, **only if the push changed something
under `frontend/`** (Android files excluded), runs `deploy/build-frontend.sh`. That script refuses to run
when the server has under ~1.8 GB of free memory, builds at low priority, and replaces the live site only
after the build fully succeeded, so a failed build leaves the previous version being served.

```bash
bash ~/auto-stock-manager/deploy/build-frontend.sh          # publish the current checkout by hand
FORCE_FRONTEND=1 bash ~/auto-stock-manager/deploy/redeploy.sh   # full deploy, rebuilding the frontend
```

### One-time setup (needs sudo on the VPS and the DNS account)

1. **DNS (Hostinger -> Domains -> hamroauto.com.np -> DNS records):** add an **A** record, name `stock`,
   value `203.134.250.70`. Check it with `nslookup stock.hamroauto.com.np 8.8.8.8`.
2. **nginx + HTTPS on the VPS** (commands are at the top of `deploy/nginx-stock.conf`): copy it to
   `sites-available`, enable it, `nginx -t`, reload, then `sudo certbot --nginx -d stock.hamroauto.com.np`.
3. **Let the deploy script publish:** `sudo chown -R mansa:mansa /var/www/auto-stock-frontend`.
4. **First publish:** `bash ~/auto-stock-manager/deploy/build-frontend.sh`, then open
   https://stock.hamroauto.com.np/login.
5. **Backend settings** (`backend/.env`): set `FRONTEND_URL=https://stock.hamroauto.com.np` and add the same
   address to `CORS_ORIGINS`, then `pm2 restart auto-stock-backend`. `FRONTEND_URL` is used in emailed
   verify/reset links, the Facebook connect redirect and share links.
6. **Facebook app** (developers.facebook.com -> your app -> Facebook Login -> Valid OAuth Redirect URIs): add
   `https://stock.hamroauto.com.np/api/facebook/callback`.
7. **`hamroauto.com.np/stock`:** the storefront is on Hostinger, a different server, so this address is a
   redirect, not a copy. In hPanel -> Websites -> Redirects (or the storefront's own redirect rules) send
   `https://hamroauto.com.np/stock` (and `/stock/`) to `https://stock.hamroauto.com.np/login`.
8. **Android app:** `frontend/capacitor.config.json` already points at the new address. Rebuild and reinstall
   the APK (the old APK still opens the old Vercel address and stops working once Vercel is off).
9. **Retire Vercel only after** all of the above work (log in, upload a photo, Facebook connect, the Android
   app): Vercel -> the project -> Settings -> delete, or disconnect the GitHub repo.

Everyone signs in once more on the new address, because the browser keeps the login per address.

---

## Vercel (Frontend) — retired, kept for history

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
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ❌ | Keeps vehicle photos and legal documents in Supabase Storage instead of MySQL (see **Photos and documents in Supabase Storage**). Without them they stay in MySQL. |
| `FB_APP_ID` / `FB_APP_SECRET` | ❌ | Turns on "Post to Facebook Page" on the Share tab (see **Facebook Page posting** below). Without them the button is hidden. Also needs `FRONTEND_URL`. |

### Vercel (Frontend)
| Variable | Required | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | Your VPS backend URL (no trailing slash) |

Vercel only hosts the React frontend, which calls the AI features through the backend's
`/api/ai/*` routes — it never touches `GEMINI_API_KEY` directly, so deleting/recreating
the Vercel project cannot affect the AI Assistant. If AI features stop working, the key
is missing (or was reset) on the **backend**, not Vercel — see the table above.

### Facebook Page posting
Lets the Share tab publish a vehicle's photos and caption straight to the business's Facebook
Page, from a computer or phone. Facebook only allows this for Pages, not personal profiles,
groups or Marketplace.

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps), **Create app**,
   pick the **Business** type (or "Other", then "Business").
2. Add the **Facebook Login for Business** product. In its settings, add this as a **Valid OAuth
   Redirect URI**: `<FRONTEND_URL>/api/facebook/callback` (e.g.
   `https://auto-stock-manager.vercel.app/api/facebook/callback`).
3. Copy **App ID** and **App Secret** (App settings > Basic) into the backend env as `FB_APP_ID`
   and `FB_APP_SECRET`, then restart the backend. (Set `FB_REDIRECT_URI` only if the redirect
   URI above can't be built from `FRONTEND_URL`.)
4. In the app, log in as an Admin, open **Share**, click **Connect Facebook Page** and approve.

While the Meta app is in **Development** mode, only people with a role on the Meta app (you)
can connect a Page. That's enough for your own dealership. Letting other companies on this
platform connect their own Pages needs Meta **App Review** for `pages_manage_posts`,
`pages_read_engagement` and `pages_show_list`, plus business verification.

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
