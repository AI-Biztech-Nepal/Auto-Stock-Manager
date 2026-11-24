"""Accept a portal (Supabase) login in Stock, next to Stock's own token. Prompt 2a bridge.

get_current_user (server.py) tries the old Stock HS256 token first, unchanged. Only when that fails AND the request
carries X-Org-Id does it call resolve() here, which returns the same dict shape the old token yields
({user_id, username, role, company_id}) plus org_id and via='portal'. ROLE_PERMISSIONS stays the one place that says
what each Stock role may do; the portal only decides who may enter and which role name they carry.

Reads core.* from the portal database through PORTAL_DB_URL: use a read-only role, never the Stock database.
"""
import asyncio
import json
import logging
import os
import re
import time
import uuid

import jwt
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


_known_kids: set = set()
_last_miss = [0.0]


def _verify(token: str) -> dict:
    """decode_token fetches the portal's signing keys over the network when it meets a key id it has not cached.
    Anyone can send garbage with X-Org-Id, so: no kid / wrong algorithm = refused with no network call, and an
    unseen kid is looked up at most once per _TTL per worker."""
    try:
        h = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid session")
    kid = h.get("kid")
    if not kid or h.get("alg") not in ("ES256", "RS256"):
        raise HTTPException(401, "Invalid session")
    if kid not in _known_kids and time.monotonic() - _last_miss[0] < _TTL:
        raise HTTPException(401, "Invalid session")
    try:
        claims = decode_token(token)
    except HTTPException:
        if kid not in _known_kids:
            _last_miss[0] = time.monotonic()
        raise
    _known_kids.add(kid)
    return claims


def _resolve_sync(token: str, org_id: str) -> dict:
    try:
        uuid.UUID(org_id)
    except (ValueError, AttributeError):
        raise HTTPException(401, "Invalid X-Org-Id")
    claims = _verify(token)
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


# ── which feature owns which route (Prompt 2) ──────────────────────────────
# First match wins; paths are without the /api prefix. A path that matches nothing is core and is never gated.
# Core on purpose: /vehicles CRUD (the inventory until the generic items core, Prompt 4), customers, sales, vendors,
# reports, settings, team, expenses, photos, presence, audit, backups. Not gated here: /fin, /emi*, /partners*,
# /finance/summary (go to Finance, Prompt 3c), /auth, /admin, /platform, /perf, /sync (infrastructure).
PATH_FEATURES_RAW = [
    (r"^/vehicles/[^/]+/(qr-data|legal-documents)(/|$)", "stock.vehicles"),
    (r"^/legal-documents(/|$)", "stock.vehicles"),
    (r"^/(sanakhat(/|$)|vehicles/[^/]+/sale-statuses$)", "stock.sanakhat"),
    (r"^/jobs(/|$)", "stock.job_cards"),
    (r"^/spare-parts(/|$)", "stock.spare_parts"),
    (r"^/warranties(/|$)", "stock.warranty"),
    (r"^/bookings(/|$)", "stock.bookings"),
    (r"^/crm(/|$)", "stock.crm"),
    (r"^/(ai|assistant)(/|$)", "stock.ai_assistant"),
    (r"^/(leads|public/leads)(/|$)", "stock.leads"),
    (r"^/(offers|public/offers)(/|$)", "stock.offers"),
    (r"^/(share|facebook|public/share)(/|$)", "stock.share"),
    (r"^/(visits|public/visits?)(/|$)", "stock.visits"),
    (r"^/public(/|$)", "stock.public_site"),
]
PATH_FEATURES = [(re.compile(rx), key) for rx, key in PATH_FEATURES_RAW]


def feature_for_path(path: str):
    path = path[4:] if path.startswith("/api/") else path
    for rx, key in PATH_FEATURES:
        if rx.search(path):
            return key
    return None


def portal_configured() -> bool:  # seam: without PORTAL_DB_URL feature gating is off and Stock behaves as before
    return bool(os.environ.get("PORTAL_DB_URL"))


_feat_cache: dict = {}
_org_cache: dict = {}


def _feature_cached(db, org_id: str, key: str) -> bool:
    hit = _feat_cache.get((org_id, key))
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    on = feature_on(db, org_id, key)
    _feat_cache[(org_id, key)] = (time.monotonic(), on)
    return on


def _org_for_company(db, company_id: str):
    hit = _org_cache.get(company_id)
    if hit and time.monotonic() - hit[0] < _TTL:
        return hit[1]
    org = db.fetch_value("select case when count(*) = 1 then min(org_id::text) end from core.legacy_tenant_map "
                         "where service_key = 'stock' and legacy_id = %s", (company_id,))
    _org_cache[company_id] = (time.monotonic(), org)
    return org


def _enforce_sync(path: str, company_id, org_id):
    key = feature_for_path(path)
    if not key or not (company_id or org_id):
        return
    if org_id:  # a portal login: the org is certain, so a lookup failure refuses (503) like the rest of the bridge
        if not _feature_cached(get_portal_db(), org_id, key):
            raise HTTPException(403, {"feature": key})
        return
    # Stock's own token, a public page or the assistant key: only a company id. Not set up, or no map row for this
    # company, means the catalogue default (allowed). A failed lookup also allows: a portal outage must not take
    # a live shop down. shortcut: fail-open, switch to fail-closed once every company is on the portal.
    if not portal_configured():
        return
    try:
        db = get_portal_db()
        org = _org_for_company(db, company_id)
        on = True if not org else _feature_cached(db, org, key)
    except Exception:
        logging.getLogger(__name__).exception("feature lookup failed; allowing %s", key)
        return
    if not on:
        raise HTTPException(403, {"feature": key})


async def enforce_feature(path: str, company_id=None, org_id=None):
    """403 {"feature": key} when the route's feature is off for this company/org. Cheap no-op for core routes."""
    if not feature_for_path(path):
        return
    try:
        await asyncio.to_thread(_enforce_sync, path, company_id, org_id)
    except HTTPException:
        raise
    except Exception:  # only reachable for a portal login (the other path fails open inside _enforce_sync)
        logging.getLogger(__name__).exception("portal feature lookup failed")
        raise HTTPException(503, "Portal login is temporarily unavailable")


_all_cache: dict = {}


def _features_sync(company_id, org_id):
    """{key: bool} for every stock.* feature, in one query, or None when the portal cannot answer (not set up, no map
    row, lookup failed): the screen then shows everything and the server's own 403s stay the real boundary."""
    if not (company_id or org_id) or (not org_id and not portal_configured()):
        return None
    try:
        db = get_portal_db()
        org = org_id or _org_for_company(db, company_id)
        if not org:
            return None
        hit = _all_cache.get(org)
        if hit and time.monotonic() - hit[0] < _TTL:
            return hit[1]
        # asks feature_on for the keys this code knows: the read-only role needs no grant on core.features
        raw = db.fetch_value(
            "select coalesce(jsonb_object_agg(k, core.feature_on(%s, k)), '{}'::jsonb) from unnest(%s::text[]) as k",
            (org, sorted({key for _, key in PATH_FEATURES_RAW})))
        feats = json.loads(raw) if isinstance(raw, (str, bytes)) else dict(raw or {})
        _all_cache[org] = (time.monotonic(), feats)
        return feats
    except Exception:
        logging.getLogger(__name__).exception("feature list lookup failed")
        return None


ITEMS_ONLY_FEATURES = {"stock.vehicles": False, "stock.sanakhat": False, "stock.job_cards": False, "stock.spare_parts": False}


def items_only(company_id) -> bool:
    """A company that sells goods, not vehicles (the shop in SHOP_SYNC_COMPANY_ID), is shown the Items screens without
    waiting for the portal to say so. shortcut: tied to the shop-sync company, widen to its own setting for a second shop."""
    return bool(company_id) and company_id == os.environ.get("SHOP_SYNC_COMPANY_ID", "").strip()


async def features_for(cu: dict):
    if not cu.get("org_id") and items_only(cu.get("company_id")):
        return dict(ITEMS_ONLY_FEATURES)
    return await asyncio.to_thread(_features_sync, cu.get("company_id"), cu.get("org_id"))


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
    _all_cache.clear()
    _feat_cache.clear()
    _org_cache.clear()
    _known_kids.clear()
    _last_miss[0] = 0.0
