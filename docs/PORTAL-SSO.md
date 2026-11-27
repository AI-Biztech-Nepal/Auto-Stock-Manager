# One login from the AI Biz Tech Nepal portal

"Stock Manager" in the portal opens this live app inside the portal, already signed in. Same app, same data.
Off until both sides are set; signing in here directly keeps working either way.

## Set up (in this order)

1. Make one secret (32+ characters): `openssl rand -hex 32`. It goes in both places below; never into git or a chat.
2. This server, `backend/.env`:
   ```
   SSO_SECRET=<the secret>
   SSO_ORG_ID=<the portal organization id of this business>
   ```
   Then `pm2 restart auto-stock-backend`. The id: in the portal's Supabase SQL editor, `select id, name from core.organizations;`
   (If it is wrong, the sign-in screen says which id it was given.)
3. In this app: Settings > Staff & Access. For anyone in the main business whose portal email differs from their
   sign-in email (an account called `admin`, say), type it in **AiBizTech email** and save.
4. Merge the portal branch `stock-live-app` into the portal's `main`.
5. The portal's Vercel project, environment variables, then redeploy:
   ```
   SSO_SECRET=<the same secret>
   SSO_SERVICES=stock            (add to any already listed, comma separated)
   STOCK_LIVE_APP=1
   STOCK_LIVE_URL=https://stock.hamroauto.com.np
   ```

To undo: remove `STOCK_LIVE_APP` in Vercel and redeploy (the portal shows its own /stock pages again).

## What it will and will not do
- The business(es) in `SSO_ORG_ID` open the first company in this database. For them no account is created, and role,
  Staff & Access limits and pause come from this app, not the portal.
- Every other portal business gets its **own private company** here, made the first time one of its admins opens Stock
  Manager. Its people get a login there on first sign-in, with their portal role; after that, role and limits are managed
  in this app. Removing someone in the portal stops new sign-ins. `SSO_OWN_BUSINESSES=off` in `backend/.env` turns this
  off.
- A pass lasts a minute and works once.
- The portal's dashboard figures still come from the portal's own `stock` tables, not from this app.

`docs/PORTAL-CUTOVER.md` describes the other, unfinished route (accepting the portal's Supabase session); it is not needed for this.
