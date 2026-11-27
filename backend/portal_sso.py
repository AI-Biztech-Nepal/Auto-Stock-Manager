"""Single sign-on from the AI Biz Tech Nepal portal: one portal login opens this app.

The portal (apps/aibiztech/lib/sso.ts) signs a pass that lives for a minute (HS256, SSO_SECRET, the same value on both
sides) saying who signed in and for which business. This app trades it for its own session. It is deliberately narrow:

  * only the portal business(es) named in SSO_ORG_ID are accepted, and they open the FIRST company here (the dealership
    whose data is live). Nothing is ever created: no company, no account.
  * the person must already have a login in that company: the portal email is their sign-in email, or an Admin typed it
    on their card in Settings > Staff & Access ("AiBizTech email").
  * their role, restrictions and pause here still apply; the role the portal sends is not used.
  * each pass works once.

Off (503) until both SSO_SECRET (32+ characters) and SSO_ORG_ID are set.
"""
import hashlib
import logging
import os
import time

import jwt
from fastapi import HTTPException, Request
from pydantic import BaseModel, Field

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
    """The claims of a genuine, current, unused pass for a linked business. Raises HTTPException otherwise.
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
    if org not in orgs:
        raise HTTPException(403, f"This AI Biz Tech Nepal business is not linked to this Stock Manager. Its ID is {org}: the "
                                 "server's administrator adds it as SSO_ORG_ID.")
    now = time.time()
    for key, until in list(_used.items()):
        if until < now:
            _used.pop(key, None)
    key = hashlib.sha256(token.encode()).hexdigest()
    if key in _used:
        raise bad
    _used[key] = claims["exp"] + _LEEWAY
    return {**claims, "email": email, "org_id": org}


async def find_account(db, email: str, company_id: str):
    """The login in this company that the portal email stands for, or None."""
    if staff_access.ready and staff_access.portal_email_ready:
        linked = await db.staff_access.find_one({"portal_email": email, "company_id": company_id}, {"_id": 0})
        if linked and linked.get("status") != "removed":
            user = await db.users.find_one({"id": linked["id"], "company_id": company_id})
            if user:
                return user
    return await db.users.find_one({"username": email, "company_id": company_id})


def register(api_router, db, limiter, default_company_id, create_token, current_company_id):
    @api_router.post("/auth/sso")
    @limiter.limit("20/minute")
    async def portal_sso_login(request: Request, req: SsoRequest):
        claims = read_pass(req.token)
        company_id = await default_company_id()
        if not company_id:
            raise HTTPException(503, "This Stock Manager has no company yet.")
        current_company_id.set(company_id)
        user = await find_account(db, claims["email"], company_id)
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
