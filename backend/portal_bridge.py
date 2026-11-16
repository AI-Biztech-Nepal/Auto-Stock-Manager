"""Accept a portal (Supabase) login in Stock, next to Stock's own token. Prompt 2a bridge.

get_current_user (server.py) tries the old Stock HS256 token first, unchanged. Only when that fails AND the request
carries X-Org-Id does it call resolve() here, which returns the same dict shape the old token yields
({user_id, username, role, company_id}) plus org_id and via='portal'. ROLE_PERMISSIONS stays the one place that says
what each Stock role may do; the portal only decides who may enter and which role name they carry.

Reads core.* from the portal database through PORTAL_DB_URL: use a read-only role, never the Stock database.
"""
import asyncio
import logging
import os
import time
import uuid

from fastapi import Depends, HTTPException, Request


# aibiz_auth is imported lazily: a server without it installed must keep running on Stock's own tokens.
def decode_token(token: str) -> dict:  # seam
    from aibiz_auth import decode_token as _decode
    return _decode(token)


def check_access(db, claims, org_id, service_key, roles):  # seam
    from aibiz_auth import check_access as _check
    return _check(db, claims, org_id, service_key, roles)


SERVICE = "stock"
# Roles Stock understands. A portal role outside this set is refused rather than guessed at.
STOCK_ROLES = {"admin", "stock_supervisor", "parts_supervisor", "social_media", "sanakhat_officer"}
# A role that only makes sense with a feature on (Sanakhat is vehicle paperwork): refused when the org has it off.
ROLE_FEATURE = {"sanakhat_officer": "stock.sanakhat"}

# shortcut: in-process cache, per worker, a revoked role lingers up to TTL; shorten TTL or add pub/sub if that matters.
_TTL = 60
_ctx_cache: dict = {}
_company_cache: dict = {}


class PortalDB:
    """Sync, read-only. aibiz_auth wants fetch_value(sql, params) -> first column of first row or None."""

    def fetch_value(self, sql, params=()):
        import psycopg  # lazy: only needed when a portal token actually arrives

        with psycopg.connect(os.environ["PORTAL_DB_URL"], autocommit=True, connect_timeout=10) as conn:
            row = conn.execute(sql, params).fetchone()
            return row[0] if row else None


_db = None


def get_portal_db():  # seam: tests replace this
    global _db
    if _db is None:
        _db = PortalDB()
    return _db


def feature_on(db, org_id: str, key: str) -> bool:  # seam: tests (and Prompt 2) can fake core.feature_on
    return bool(db.fetch_value("select core.feature_on(%s, %s)", (org_id, key)))


def check_feature(db, org_id: str, key: str) -> None:
    if not feature_on(db, org_id, key):
        raise HTTPException(403, {"feature": key})


def _company_for_org(db, org_id: str):
    hit = _company_cache.get(org_id)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    # exactly one Stock company per org; none or several is a setup problem, not something to guess
    cid = db.fetch_value(
        "select case when count(*) = 1 then min(legacy_id) end from core.legacy_tenant_map "
        "where service_key = 'stock' and org_id = %s", (org_id,))
    if cid:
        _company_cache[org_id] = (time.monotonic(), cid)
    return cid


def _resolve_sync(token: str, org_id: str) -> dict:
    try:
        uuid.UUID(org_id)
    except (ValueError, AttributeError):
        raise HTTPException(401, "Invalid X-Org-Id")
    claims = decode_token(token)
    key = (claims["sub"], org_id)
    hit = _ctx_cache.get(key)
    if hit and time.monotonic() - hit[0] < _TTL:
        return dict(hit[1])
    db = get_portal_db()
    ctx = check_access(db, claims, org_id, SERVICE, None)  # 403 unless active member + live service + a role
    if ctx.role not in STOCK_ROLES:
        raise HTTPException(403, "No access to this service")
    if ctx.role in ROLE_FEATURE:
        check_feature(db, org_id, ROLE_FEATURE[ctx.role])
    company_id = _company_for_org(db, org_id)
    if not company_id:
        raise HTTPException(403, "This organization is not linked to Auto Stock Manager yet")
    user = {"user_id": ctx.user_id, "username": claims.get("email") or ctx.user_id, "role": ctx.role,
            "company_id": company_id, "org_id": org_id, "via": "portal"}
    _ctx_cache[key] = (time.monotonic(), user)
    return dict(user)


async def resolve(token: str, org_id: str) -> dict:
    try:
        return await asyncio.to_thread(_resolve_sync, token, org_id)
    except HTTPException:
        raise
    except (ImportError, KeyError):
        # Portal login not set up on this server (no aibiz_auth / SUPABASE_URL / PORTAL_DB_URL): same answer as before
        raise HTTPException(401, "Invalid token")
    except Exception:
        logging.getLogger(__name__).exception("portal login lookup failed")
        raise HTTPException(503, "Portal login is temporarily unavailable")


def make_feature_guard(get_user):
    """require_feature('stock.x'), built on the app's own get_current_user so there is one login path.
    Not attached to any route yet (that is Prompt 2).
    Old-token callers carry no org, so they get the catalogue default: allowed, as installed apps must keep working."""

    def require_feature(key: str):
        async def dep(cu: dict = Depends(get_user)):
            if cu.get("via") == "portal":
                await asyncio.to_thread(check_feature, get_portal_db(), cu["org_id"], key)
            return cu

        return dep

    return require_feature


def clear_caches():
    _ctx_cache.clear()
    _company_cache.clear()
