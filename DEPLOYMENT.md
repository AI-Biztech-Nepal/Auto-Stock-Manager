# Hamro G&G Auto OS — Deployment Guide
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
