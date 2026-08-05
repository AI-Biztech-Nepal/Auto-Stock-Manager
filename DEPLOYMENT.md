# Hamro G&G Auto OS — Deployment Guide
## Vercel (Frontend) + Render (Backend) + MongoDB Atlas

---

## Overview

| Service | What it hosts | Cost |
|---|---|---|
| **Vercel** | React frontend | Free |
| **Render** | FastAPI backend + file uploads | Free (always-on from $7/mo) |
| **MongoDB Atlas** | Database | Free (512 MB) |

---

## Step 1 — MongoDB Atlas (Database)

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

## Step 1B — Migrating the database to Hostinger MySQL (optional)

Hostinger shared/business hosting only offers MySQL, not MongoDB, so this isn't
a drop-in swap of `MONGO_URL` — the backend talks to MySQL through a
compatibility layer, `backend/sqldb.py`, so the 96 API endpoints don't need
individual rewrites. See `backend/schema.sql` for the table definitions.

1. **hPanel → Databases → MySQL Databases**: create a database + user, note
   the host/port/user/password/database name.
2. **hPanel → Databases → Remote MySQL**: add an allowed host (`%` for
   "anywhere", matching the Atlas `0.0.0.0/0` setting already in use) so
   Render can reach it — shared hosting doesn't allow inbound connections
   from arbitrary hosts by default.
3. Apply the schema via **phpMyAdmin** (Hostinger's hPanel links straight to
   it) or any MySQL client: import `backend/schema.sql`.
4. Add the `MYSQL_*` variables below to Render (leave `DB_BACKEND=mongo` for
   now — nothing changes yet).
5. Run the migration script **locally**, pointed at a scratch/staging copy
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
6. Flip Render's `DB_BACKEND` to `mysql` and redeploy. Keep the Atlas cluster
   intact (don't delete it) for a rollback window before decommissioning it.

---

## Step 2 — Render (Backend)

1. Go to **[render.com](https://render.com)** → Login with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repo → Set **Root Directory** to `backend`
4. Render auto-detects the `Dockerfile` ✓
5. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `MONGO_URL` | Your Atlas connection string |
   | `DB_NAME` | `hamro_gng_auto` |
   | `JWT_SECRET` | Any long random string |
   | `GEMINI_API_KEY` | From [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — powers the AI Assistant tab |
   | `CORS_ORIGINS` | *(set after Step 3)* |

6. Click **Create Web Service** → wait for build to finish
7. Copy your Render URL: `https://hamro-gng-auto-backend.onrender.com`

> **Free tier note:** Render free services spin down after 15 min of inactivity (cold start ~30s).
> Upgrade to the $7/mo Starter plan for always-on uptime.

---

## Step 3 — Vercel (Frontend)

1. Go to **[vercel.com](https://vercel.com)** → Login with GitHub
2. Click **"Add New Project"** → Import your GitHub repo
3. **IMPORTANT** — Set Root Directory to **`frontend`**
4. Framework: Vercel auto-detects **Create React App** ✓
5. Add Environment Variable:
   ```
   REACT_APP_BACKEND_URL = https://hamro-gng-auto-backend.onrender.com
   ```
   (use the Render URL from Step 2 — no trailing slash)
6. Click **Deploy** → Done!

---

## Step 4 — Connect CORS

After Vercel gives you your URL (e.g. `https://hamro-gng.vercel.app`):

1. Go back to **Render** → Your service → **Environment**
2. Update `CORS_ORIGINS` to your Vercel URL:
   ```
   CORS_ORIGINS = https://hamro-gng.vercel.app
   ```
3. Click **Save Changes** → Render auto-redeploys

---

## Step 5 — Persistent File Storage (for vehicle photos)

Render free tier does **not** support persistent disk. Options:
- **Paid plan ($7/mo):** Render dashboard → Your service → **Disks** → Add disk at `/app/uploads`
- **Free alternative:** Use Cloudinary or AWS S3 for photo storage (requires code change)

---

## Step 6 — Custom Domain (Optional)

- **Vercel**: Settings → Domains → Add `hamroauto.com.np`
- **Render**: Settings → Custom Domains → Add domain

---

## Environment Variables Summary

### Render (Backend)
| Variable | Required | Description |
|---|---|---|
| `DB_BACKEND` | ❌ | `mongo` (default) or `mysql` — see Step 1B |
| `MONGO_URL` | ✅ if `DB_BACKEND=mongo` | MongoDB Atlas connection string |
| `DB_NAME` | ✅ | `hamro_gng_auto` |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DB` | ✅ if `DB_BACKEND=mysql` | Hostinger MySQL connection details |
| `JWT_SECRET` | ✅ | Random secret for auth tokens |
| `GEMINI_API_KEY` | ✅ | For AI features (Pricing, Chatbot, Festival) — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `CORS_ORIGINS` | ✅ | Your Vercel frontend URL |

### Vercel (Frontend)
| Variable | Required | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | Your Render backend URL (no trailing slash) |

Vercel only hosts the React frontend, which calls the AI features through the backend's
`/api/ai/*` routes — it never touches `GEMINI_API_KEY` directly, so deleting/recreating
the Vercel project cannot affect the AI Assistant. If AI features stop working, the key
is missing (or was reset) on **Render**, not Vercel — see the table above.

---

## Verify Deployment

After deploying, test these:
```bash
# Health check
curl https://your-app.onrender.com/api/health

# Login
curl -X POST https://your-app.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Default login: **admin / admin123** (change this after first login!)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `CORS error` on frontend | Check `CORS_ORIGINS` in Render matches your Vercel URL exactly |
| `Cannot connect to DB` (Mongo) | Check MongoDB Atlas network access allows `0.0.0.0/0` |
| `Cannot connect to DB` (MySQL) | Check Hostinger hPanel → Remote MySQL has an allowed host covering Render's outbound traffic |
| `AI features not working` | Verify `GEMINI_API_KEY` is set in Render → your service → Environment (not Vercel) |
| `Photos not loading after redeploy` | Add a Render disk at `/app/uploads` (paid plan) |
| `Build failed on Render` | Check Render logs → usually a missing env var |
| Login works but pages crash | Check `REACT_APP_BACKEND_URL` in Vercel has no trailing slash |
| Slow first request | Normal on free tier (cold start) — upgrade to Starter for always-on |


---

## Overview

| Service | What it hosts | Cost |
|---|---|---|
| **Vercel** | React frontend | Free |
| **Railway** | FastAPI backend + file uploads | Free starter ($5/mo for volumes) |
| **MongoDB Atlas** | Database | Free (512 MB) |

---

## Step 1 — MongoDB Atlas (Database)

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

## Step 2 — Railway (Backend)

1. Go to **[railway.app](https://railway.app)** → Login with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repo → Choose the **`backend`** folder as root directory

   > If Railway asks for root directory, set it to `backend`

4. Railway auto-detects the `Dockerfile` and starts building

5. Go to **Variables** tab and add ALL variables from `backend/.env.example`:
   ```
   MONGO_URL         = mongodb+srv://...  (from Step 1)
   DB_NAME           = hamro_gng_auto
   JWT_SECRET        = any-long-random-string
   EMERGENT_LLM_KEY  = sk-emergent-...  (your key from Profile → Universal Key)
   CORS_ORIGINS      = https://your-app.vercel.app  (set after Step 3)
   ```

6. After deploy, go to **Settings** → **Networking** → **Generate Domain**
   - Your backend URL: `https://hamro-gng-auto-production.up.railway.app`

7. **Persistent File Storage** (for vehicle photos & legal documents):
   - Railway dashboard → Your service → **Volumes** tab
   - Add volume: Mount path = `/app/uploads`
   - This keeps uploaded files safe across deployments

---

## Step 3 — Vercel (Frontend)

1. Go to **[vercel.com](https://vercel.com)** → Login with GitHub
2. Click **"Add New Project"** → Import your GitHub repo
3. **IMPORTANT** — Set Root Directory to **`frontend`**
4. Framework: Vercel auto-detects **Create React App** ✓
5. Go to **Environment Variables** and add:
   ```
   REACT_APP_BACKEND_URL = https://your-railway-app.up.railway.app
   ```
   (use the Railway URL from Step 2)
6. Click **Deploy** → Done!

---

## Step 4 — Connect CORS

After Vercel gives you your URL (e.g. `https://hamro-gng.vercel.app`):

1. Go back to **Railway** → Variables
2. Update `CORS_ORIGINS` to your Vercel URL:
   ```
   CORS_ORIGINS = https://hamro-gng.vercel.app
   ```
3. Railway auto-redeploys

---

## Step 5 — Custom Domain (Optional)

- **Vercel**: Settings → Domains → Add `hamroauto.com.np`
- **Railway**: Settings → Networking → Custom Domain

---

## Environment Variables Summary

### Railway (Backend)
| Variable | Required | Description |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB Atlas connection string |
| `DB_NAME` | ✅ | `hamro_gng_auto` |
| `JWT_SECRET` | ✅ | Random secret for auth tokens |
| `EMERGENT_LLM_KEY` | ✅ | For AI features (Pricing, Chatbot, Festival) |
| `CORS_ORIGINS` | ✅ | Your Vercel frontend URL |
| `PORT` | ❌ | Set automatically by Railway |

### Vercel (Frontend)
| Variable | Required | Description |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | Your Railway backend URL |

---

## Verify Deployment

After deploying, test these:
```
# Health check
curl https://your-railway-app.up.railway.app/api/health

# Login
curl -X POST https://your-railway-app.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Default login: **admin / admin123** (change this in Settings after first login!)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `CORS error` on frontend | Check `CORS_ORIGINS` in Railway matches your Vercel URL exactly |
| `Cannot connect to DB` | Check MongoDB Atlas network access allows `0.0.0.0/0` |
| `AI features not working` | Verify `EMERGENT_LLM_KEY` is set in Railway variables |
| `Photos not persisting` | Add a Railway volume mounted at `/app/uploads` |
| `Build failed on Railway` | Check Railway logs → usually a missing env var |
| Login works but pages crash | Check `REACT_APP_BACKEND_URL` in Vercel has no trailing slash |
