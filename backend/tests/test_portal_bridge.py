"""Prompt 2a: Stock accepts a portal login next to its own token. Fully local: a throwaway RSA key stands in for the
portal's signing key, and FakePortalDB applies the same rules as aibiz_auth.ROLE_SQL / legacy_tenant_map / feature_on
to plain dicts. The SQL text itself is NOT executed here (no local Postgres; see the 2a summary).
Run from backend/:  python -m pytest tests/test_portal_bridge.py
"""
import os
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET", "unit-test-secret-not-the-default-xxxxxxxx")
for _k in ("MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DB"):
    os.environ.setdefault(_k, "unused-no-connection-is-made")
os.environ.setdefault("DB_BACKEND", "mysql")
os.environ.setdefault("SUPABASE_URL", "https://example.invalid")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import aibiz_auth  # noqa: E402
import portal_bridge  # noqa: E402
import server  # noqa: E402

ORG, OTHER_ORG, COMPANY = str(uuid.uuid4()), str(uuid.uuid4()), "stock-company-1"
USER = str(uuid.uuid4())
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeJWKS:
    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": KEY.public_key()})()


# core.features.default_on in the portal's 20261102000000_stock_features.sql (its own tests check the SQL)
DEFAULT_ON = {"stock.warranty": True, "stock.bookings": True, "stock.crm": True, "stock.ai_assistant": True}


class FakePortalDB:
    """members: {(org,user): role|None}; services: {org: 'active'|'trial'|'trial_expired'|'none'}."""

    def __init__(self):
        self.members = {(ORG, USER): "stock_supervisor"}
        self.services = {ORG: "active", OTHER_ORG: "none"}
        self.map = {ORG: [COMPANY]}
        self.features = {(ORG, "stock.sanakhat"): True}

    def fetch_value(self, sql, params=()):
        if "core.service_roles" in sql:
            org, user, service = params
            ok = self.services.get(org) in ("active", "trial") and service == "stock"
            return self.members.get((org, user)) if ok else None
        if "legacy_tenant_map" in sql and "legacy_id = %s" in sql:  # company -> org
            orgs = [o for o, cs in self.map.items() if params[0] in cs]
            return orgs[0] if len(orgs) == 1 else None
        if "legacy_tenant_map" in sql:
            ids = self.map.get(params[0], [])
            return ids[0] if len(ids) == 1 else None
        if "core.feature_on" in sql:
            return self.features.get(tuple(params), DEFAULT_ON.get(params[1], False))  # missing row = catalogue default
        raise AssertionError(sql)


def portal_token(sub=USER, exp_minutes=5, aud="authenticated"):
    return jwt.encode({"sub": sub, "aud": aud, "email": "u@example.com",
                       "exp": datetime.now(timezone.utc) + timedelta(minutes=exp_minutes)}, KEY, algorithm="RS256",
                      headers={"kid": "k1"})


def stock_token(role="admin", company_id=COMPANY):
    return server.create_token("old-user", "old@example.com", role, company_id)


@pytest.fixture
def fake(monkeypatch):
    f = FakePortalDB()
    monkeypatch.setattr(portal_bridge, "get_portal_db", lambda: f)
    monkeypatch.setattr(aibiz_auth, "_jwks", lambda: FakeJWKS())
    portal_bridge.clear_caches()
    return f


@pytest.fixture
def client():
    app = FastAPI()

    @app.get("/who")
    async def who(cu: dict = Depends(server.get_current_user)):
        return {k: cu.get(k) for k in ("role", "company_id", "org_id", "via")}

    @app.get("/feat")
    async def feat(cu: dict = Depends(server.require_feature("stock.sanakhat"))):
        return {"ok": True, "via": cu.get("via")}

    return TestClient(app)


def call(client, token, org=ORG, path="/who"):
    h = {"Authorization": f"Bearer {token}"}
    if org:
        h["X-Org-Id"] = org
    return client.get(path, headers=h)


# ── old token ─────────────────────────────────────────────────────────────
def test_old_token_still_works_without_org_header(fake, client):
    r = call(client, stock_token("stock_supervisor"), org=None)
    assert r.status_code == 200 and r.json() == {"role": "stock_supervisor", "company_id": COMPANY, "org_id": None, "via": None}


def test_old_token_still_works_even_if_org_header_sent(fake, client):
    assert call(client, stock_token()).json()["via"] is None


def test_old_expired_token_still_says_expired(fake, client):
    t = jwt.encode({"user_id": "x", "role": "admin", "company_id": COMPANY,
                    "exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, os.environ["JWT_SECRET"], algorithm="HS256")
    r = call(client, t)
    assert r.status_code == 401 and r.json()["detail"] == "Token expired"


def test_garbage_token_without_org_is_invalid(fake, client):
    r = call(client, "not-a-token", org=None)
    assert r.status_code == 401 and r.json()["detail"] == "Invalid token"


# ── portal token ──────────────────────────────────────────────────────────
def test_portal_token_gets_role_and_company(fake, client):
    r = call(client, portal_token())
    assert r.status_code == 200
    assert r.json() == {"role": "stock_supervisor", "company_id": COMPANY, "org_id": ORG, "via": "portal"}


@pytest.mark.parametrize("role", ["admin", "parts_supervisor", "social_media"])
def test_each_stock_role_passes_through(fake, client, role):
    fake.members[(ORG, USER)] = role
    assert call(client, portal_token()).json()["role"] == role


def test_missing_org_header_refused(fake, client):
    assert call(client, portal_token(), org=None).status_code == 401


def test_malformed_org_header_refused(fake, client):
    assert call(client, portal_token(), org="not-a-uuid").status_code == 401


def test_wrong_org_refused(fake, client):
    assert call(client, portal_token(), org=OTHER_ORG).status_code == 403


def test_user_not_a_member_refused(fake, client):
    assert call(client, portal_token(sub=str(uuid.uuid4()))).status_code == 403


def test_member_without_role_refused(fake, client):
    fake.members[(ORG, USER)] = None
    assert call(client, portal_token()).status_code == 403


def test_service_not_on_for_org_refused(fake, client):
    fake.services[ORG] = "none"
    assert call(client, portal_token()).status_code == 403


def test_expired_trial_refused(fake, client):
    fake.services[ORG] = "trial_expired"
    assert call(client, portal_token()).status_code == 403


def test_expired_portal_token_refused(fake, client):
    assert call(client, portal_token(exp_minutes=-1)).status_code == 401


def test_token_signed_by_someone_else_refused(fake, client):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    t = jwt.encode({"sub": USER, "aud": "authenticated", "exp": time.time() + 300}, other, algorithm="RS256", headers={"kid": "k1"})
    assert call(client, t).status_code == 401


def test_unknown_stock_role_refused(fake, client):
    fake.members[(ORG, USER)] = "finance_clerk"
    assert call(client, portal_token()).status_code == 403


def test_unmapped_org_refused(fake, client):
    fake.map[ORG] = []
    r = call(client, portal_token())
    assert r.status_code == 403 and "not linked" in r.json()["detail"]


def test_org_with_two_stock_companies_refused(fake, client):
    fake.map[ORG] = ["a", "b"]
    assert call(client, portal_token()).status_code == 403


# ── sanakhat_officer only when stock.sanakhat is on (vehicle paperwork) ───
def test_sanakhat_officer_allowed_when_feature_on(fake, client):
    fake.members[(ORG, USER)] = "sanakhat_officer"
    assert call(client, portal_token()).json()["role"] == "sanakhat_officer"


def test_sanakhat_officer_refused_when_feature_off(fake, client):
    fake.members[(ORG, USER)] = "sanakhat_officer"
    fake.features[(ORG, "stock.sanakhat")] = False
    r = call(client, portal_token())
    assert r.status_code == 403 and r.json()["detail"] == {"feature": "stock.sanakhat"}


# ── require_feature (not attached to routes yet) ──────────────────────────
def test_feature_guard_on_allows_portal_user(fake, client):
    assert call(client, portal_token(), path="/feat").json() == {"ok": True, "via": "portal"}


def test_feature_guard_off_refuses_with_feature_key(fake, client):
    fake.features[(ORG, "stock.sanakhat")] = False
    r = call(client, portal_token(), path="/feat")
    assert r.status_code == 403 and r.json()["detail"] == {"feature": "stock.sanakhat"}


def test_feature_guard_lets_old_token_through(fake, client):
    fake.features[(ORG, "stock.sanakhat")] = False
    assert call(client, stock_token(), org=None, path="/feat").status_code == 200


# ── failure path: a server without portal setup must not 500 ──────────────
def test_portal_not_installed_is_plain_invalid_token(fake, client, monkeypatch):
    def boom(token):
        raise ImportError("no aibiz_auth")
    monkeypatch.setattr(portal_bridge, "decode_token", boom)
    r = call(client, portal_token())
    assert r.status_code == 401 and r.json()["detail"] == "Invalid token"


def test_portal_db_down_is_503_not_500(fake, client, monkeypatch):
    def down(*a, **k):
        raise ConnectionError("db down")
    monkeypatch.setattr(fake, "fetch_value", down)
    assert call(client, portal_token()).status_code == 503


# ── garbage tokens must not cause key lookups ─────────────────────────────
def test_token_without_kid_refused_without_lookup(fake, client, monkeypatch):
    calls = []
    monkeypatch.setattr(portal_bridge, "decode_token", lambda t: calls.append(t))
    t = jwt.encode({"sub": USER, "aud": "authenticated", "exp": time.time() + 300}, KEY, algorithm="RS256")
    assert call(client, t).status_code == 401 and calls == []


def test_unknown_kid_looked_up_once_per_minute(fake, client, monkeypatch):
    calls = []

    def bad(t):
        calls.append(t)
        raise server.HTTPException(401, "Invalid session")
    monkeypatch.setattr(portal_bridge, "decode_token", bad)
    t = jwt.encode({"sub": USER, "aud": "authenticated", "exp": time.time() + 300}, KEY, algorithm="RS256", headers={"kid": "zzz"})
    for _ in range(5):
        assert call(client, t).status_code == 401
    assert len(calls) == 1


def test_known_kid_unaffected_by_earlier_miss(fake, client):
    t = jwt.encode({"sub": USER, "aud": "authenticated", "exp": time.time() + 300}, KEY, algorithm="RS256", headers={"kid": "zzz"})
    call(client, t)  # unknown kid, real decode succeeds with the fake JWKS, so it becomes known
    assert call(client, portal_token()).status_code == 200
