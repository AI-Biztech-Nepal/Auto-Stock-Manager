# Moving Stock onto the portal login (Prompt 2a)

## Roles stay in Stock
`ROLE_PERMISSIONS` in `backend/server.py` is still the only place that says what each Stock role may do
(`admin`, `stock_supervisor`, `parts_supervisor`, `social_media`, `sanakhat_officer`). The portal decides who may enter
and which role name they carry (`core.service_roles`, service `stock`); Stock turns that name into permissions exactly
as it does for its own tokens. Nothing about what a role can do moves to the portal.

## What is built (branch `portal-bridge-2a`)
- `backend/portal_bridge.py`: `get_current_user` accepts the old Stock token (unchanged) or a portal token plus
  `X-Org-Id`. Org to `company_id` through `core.legacy_tenant_map` (`service_key='stock'`); cached 60 s.
- Refused: missing/malformed `X-Org-Id`, non-member, service off or trial expired, member without a role, a role Stock
  does not know, an org with no map row (or several), a bad or expired token.
- `sanakhat_officer` is accepted only while `stock.sanakhat` is on for the org (it is vehicle paperwork).
- `require_feature('stock.x')` exists in `server.py` and is attached to no route yet (Prompt 2). Old-token callers pass
  (catalogue default); portal callers are checked against `core.feature_on` and get `403 {"feature": "stock.x"}`.
- Config: `PORTAL_DB_URL` (a READ-ONLY role on the portal database, `core` schema) and `SUPABASE_URL` (for the signing
  keys). Install `aibiz_auth` from the portal repo (pin a tag). Without it Stock still runs on its own tokens.

## Before anyone can log in through the portal (you do these; nothing was applied)
1. Map rows: `python backend/scripts/portal_cutover_report.py map stock_companies.json portal_orgs.json`, review, apply.
2. People: `... people stock_users.json stock_companies.json`. Decide the UUID for shared emails; give non-email
   usernames an email. Then migrate with the same UUID and bcrypt hash (see `import_users_to_supabase_auth.py`, which
   targets Stock's own Supabase project, not the portal's).
3. Roles: every user needs a `core.service_roles` row (service `stock`) with their current Stock role, so nobody
   loses a role.
4. `sanakhat_officer` in the portal (draft, NOT applied; portal repo decides):
```sql
update core.services set roles = array_append(roles, 'sanakhat_officer')
 where key = 'stock' and not 'sanakhat_officer' = any (roles);
-- and in core.check_service_role(): when new.role = 'sanakhat_officer', also require
-- core.feature_on(new.org_id, 'stock.sanakhat'), so only orgs with the vehicle paperwork pack can assign it.
```
   The portal's role picker should also hide it for orgs without `stock.sanakhat` (portal UI, later).

## Removed at cut-over, not before
`/auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, the verify-email routes, the staff
(Team) screens and `users`/`companies` writes in Stock; `create_token`; `/platform/*`; the Login/SignUp/ForgotPassword/
ResetPassword pages. The old HS256 path and `platform_owner` stay until installed APKs have all updated.
The frontend must send `Authorization: Bearer <portal token>` and `X-Org-Id`; it does not yet.
