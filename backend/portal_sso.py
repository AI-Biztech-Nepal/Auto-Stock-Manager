"""Single sign-on from the AI Biz Tech Nepal portal: one portal login opens this app.

The portal (apps/aibiztech/lib/sso.ts) signs a pass that lives for a minute (HS256, SSO_SECRET, the same value on both
sides) saying who signed in and for which business. This app trades it for its own session. It is deliberately narrow:

  * the portal business(es) named in SSO_ORG_ID open the FIRST company here (the dealership whose data is live). For
    these nothing is ever created: the person must already have a login in that company (the portal email is their sign-in
    email, or an Admin typed it on their card in Settings > Staff & Access, "AiBizTech email"), and the role the portal
    sends is not used.
  * every other portal business gets its OWN private company, never the first one. It is made the first time one of that
    business's admins opens the app; each of its people gets a login there the first time, with the role the portal sends.
    SSO_OWN_BUSINESSES=off turns this part off.
  * role, restrictions, pause and removal here still apply to everyone.
  * each pass works once.

Off (503) until both SSO_SECRET (32+ characters) and SSO_ORG_ID are set.
"""
import hashlib
import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

import portal_bridge
import staff_access

logger = logging.getLogger("server")

ISSUER, AUDIENCE = "aibiztech", "stock"
MAX_LIFETIME = 120  # seconds: the portal signs for 60
_LEEWAY = 30        # clock difference between the two servers
_used: dict = {}    # pass fingerprint -> when it expires (one worker; a pass lives a minute)


class SsoRequest(BaseModel):
    token: str = Field(min_length=20, max_length=4000)


def _settings():
    secret = os.environ.get("SSO_SECRET", "").strip()
    orgs = {o.strip().lower() for o in os.environ.get("SSO_ORG_ID", "").split(",") if o.strip()}
    return secret, orgs


def read_pass(token: str) -> dict:
    """The claims of a genuine, current, unused pass. "main" says whether it is for a business named in SSO_ORG_ID.
    Raises HTTPException otherwise.
    Never 401: the web app treats that as "your session ended" and jumps to its own sign-in page."""
    secret, orgs = _settings()
    if len(secret) < 32 or not orgs:
        raise HTTPException(503, "Sign-in from AI Biz Tech Nepal is not set up on this server yet.")
    bad = HTTPException(403, "This sign-in link is invalid or has expired. Open Stock Manager again from AI Biz Tech Nepal.")
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER, leeway=_LEEWAY,
                            options={"require": ["exp", "iat", "aud", "iss"]})
    except jwt.InvalidTokenError:
        raise bad
    if not 0 < claims["exp"] - claims["iat"] <= MAX_LIFETIME:
        raise bad
    email = str(claims.get("email") or "").strip().lower()
    org = str(claims.get("org_id") or "").strip().lower()
    if not email or not org or not claims.get("role"):
        raise bad
    main = org in orgs
    if not main:
        if os.environ.get("SSO_OWN_BUSINESSES", "").strip().lower() == "off":
            raise HTTPException(403, f"This AI Biz Tech Nepal business is not linked to this Stock Manager. Its ID is {org}: "
                                     "the server's administrator adds it as SSO_ORG_ID.")
        try:
            org = str(uuid.UUID(org))
        except ValueError:
            raise bad
    now = time.time()
    for key, until in list(_used.items()):
        if until < now:
            _used.pop(key, None)
    key = hashlib.sha256(token.encode()).hexdigest()
    if key in _used:
        raise bad
    _used[key] = claims["exp"] + _LEEWAY
    return {**claims, "email": email, "org_id": org, "main": main}


async def find_account(db, email: str, company_id: str):
    """The login in this company that the portal email stands for, or None."""
    if staff_access.ready and staff_access.portal_email_ready:
        linked = await db.staff_access.find_one({"portal_email": email, "company_id": company_id}, {"_id": 0})
        if linked and linked.get("status") != "removed":
            user = await db.users.find_one({"id": linked["id"], "company_id": company_id})
            if user:
                return user
    return await db.users.find_one({"username": email, "company_id": company_id})


def business_company_id(org_id: str) -> str:
    """The company here that belongs to a portal business: always the same one, so it is never made twice."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"aibiztech-org:{org_id}"))


async def _insert_once(coll, doc: dict) -> None:
    """Add the row unless a sign-in running at the same moment just did."""
    try:
        await coll.insert_one(dict(doc))
    except Exception:
        if not await coll.find_one({"id": doc["id"]}):
            raise


async def open_business(db, claims: dict, company_id: str, hash_password):
    """The login for this person in their business's own company, making the company and the login when they are new.
    The caller has already scoped the database to company_id."""
    email, org, role = claims["email"], claims["org_id"], str(claims["role"])
    if role not in portal_bridge.STOCK_ROLES:
        raise HTTPException(403, "Your AI Biz Tech Nepal role cannot use Stock Manager. Ask your admin.")
    now = datetime.now(timezone.utc).isoformat()
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        if role != "admin":
            raise HTTPException(403, "Your business has no Stock Manager yet. Ask its admin to open Stock Manager once first.")
        company = {"id": company_id, "name": str(claims.get("org_name") or "").strip()[:200] or "My business", "created_at": now}
        await _insert_once(db.companies, company)
        logger.info("Portal sign-in: new company %s for portal business %s", company_id, org)
    if not await db.settings.find_one({}, {"_id": 0, "id": 1}):
        await _insert_once(db.settings, {"id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"settings:{company_id}")),
                                         "company_id": company_id, "business_name": company["name"]})
    user_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{company_id}:{email}"))
    user = await db.users.find_one({"id": user_id, "company_id": company_id}) or await find_account(db, email, company_id)
    if user:
        return user
    if staff_access.ready and await db.staff_access.find_one({"id": user_id, "status": "removed"}, {"_id": 0, "id": 1}):
        raise HTTPException(403, "Your Stock Manager login was removed. Ask your admin.")
    # The username carries the business's id: the portal does not prove who owns an email address, so a login made here
    # must never take the plain address another business may need. The password is random: this login is portal-only.
    user = {"id": user_id, "company_id": company_id, "username": f"{email[:91]}#{org[:8]}", "role": role,
            "name": str(claims.get("name") or "").strip()[:200] or email.split("@")[0],
            "password_hash": await hash_password(secrets.token_urlsafe(32)), "email_verified_at": now, "created_at": now}
    await _insert_once(db.users, user)
    return user


def register(api_router, db, limiter, default_company_id, create_token, current_company_id, hash_password):
    @api_router.post("/auth/sso")
    @limiter.limit("20/minute")
    async def portal_sso_login(request: Request, req: SsoRequest):
        claims = read_pass(req.token)
        first = await default_company_id()
        if not first:
            raise HTTPException(503, "This Stock Manager has no company yet.")
        company_id = first if claims["main"] else business_company_id(claims["org_id"])
        current_company_id.set(company_id)
        if claims["main"]:
            user = await find_account(db, claims["email"], company_id)
        else:
            user = await open_business(db, claims, company_id, hash_password)
        if not user or user.get("role") == "platform_owner":
            raise HTTPException(403, f"No Stock Manager account is linked to {claims['email']}. An Admin can add that address "
                                     "under Settings > Staff & Access > AiBizTech email.")
        if await staff_access.is_paused(db, user):
            raise HTTPException(403, "Your access is paused. Ask your admin.")
        role = user.get("role", "admin")
        company = await db.companies.find_one({"id": company_id}, {"_id": 0, "name": 1})
        logger.info("Portal sign-in: %s as %s", claims["email"], user["username"])
        return {"token": create_token(user.get("id", ""), user["username"], role, company_id), "username": user["username"],
                "name": user.get("name", user["username"]), "role": role, "company_name": company["name"] if company else None}
