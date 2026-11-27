"""Sign-in from the AI Biz Tech Nepal portal (portal_sso.py): who gets in, as whom, and who is refused.
No database, no network: users and staff rows are faked.
Run from backend/:  python -m pytest tests/test_portal_sso.py
"""
import os

os.environ.setdefault("JWT_SECRET", "unit-test-secret-not-the-default-xxxxxxxx")
for _k in ("MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "DB_NAME"):
    os.environ.setdefault(_k, "unused-no-connection-is-made")
os.environ.setdefault("DB_BACKEND", "mysql")

import time  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import portal_sso  # noqa: E402
import server  # noqa: E402
import staff_access as sa  # noqa: E402

SECRET = "s" * 48
ORG = "11111111-2222-3333-4444-555555555555"
COMPANY = "c1"


def sign(secret=SECRET, ttl=60, age=0, drop=(), **claims):
    now = int(time.time()) - age
    body = {"sub": "p1", "email": "Owner@Example.com", "name": "Owner", "org_id": ORG, "org_name": "Hamro", "org_role": "owner",
            "service": "stock", "role": "admin", "iss": "aibiztech", "aud": "stock", "iat": now, "exp": now + ttl,
            "jti": str(time.time_ns()), **claims}
    return jwt.encode({k: v for k, v in body.items() if k not in drop}, secret, algorithm="HS256")


class Coll:
    def __init__(self, rows):
        self.rows, self.writes = rows, 0

    async def find_one(self, filt=None, *a, **k):
        return next((dict(r) for r in self.rows if all(r.get(x) == v for x, v in (filt or {}).items())), None)

    async def insert_one(self, doc):
        self.writes += 1

    update_one = delete_one = insert_one


class Db:
    def __init__(self):
        self.users = Coll([
            {"id": "u1", "company_id": COMPANY, "username": "admin", "name": "Owner", "role": "admin"},
            {"id": "u2", "company_id": COMPANY, "username": "desk@example.com", "name": "Desk", "role": "stock_supervisor"},
            {"id": "u3", "company_id": "other", "username": "stranger@example.com", "name": "Other", "role": "admin"},
        ])
        self.companies = Coll([{"id": COMPANY, "name": "Hamro G&G Auto"}])
        self.staff_access = Coll([{"id": "u1", "company_id": COMPANY, "portal_email": "owner@example.com", "status": "active"}])


@pytest.fixture
def app(monkeypatch):
    db = Db()
    monkeypatch.setenv("SSO_SECRET", SECRET)
    monkeypatch.setenv("SSO_ORG_ID", ORG)
    for name in ("users", "companies", "staff_access"):
        monkeypatch.setattr(server.db._real_db, name, getattr(db, name), raising=False)
    monkeypatch.setattr(sa, "ready", True)
    monkeypatch.setattr(sa, "portal_email_ready", True)

    async def default_company():
        return COMPANY
    monkeypatch.setattr(server, "_default_company_id", default_company)
    monkeypatch.setattr(server.limiter, "enabled", False)
    portal_sso._used.clear()
    # the route captured default_company_id when it was registered
    for route in server.app.routes:
        if getattr(route, "path", "") == "/api/auth/sso":
            fn = route.endpoint
            while hasattr(fn, "__wrapped__"):
                fn = fn.__wrapped__
            cell = dict(zip(fn.__code__.co_freevars, fn.__closure__))["default_company_id"]
            monkeypatch.setattr(cell, "cell_contents", default_company)
    client = TestClient(server.app, raise_server_exceptions=False)

    def post(token):
        return client.post("/api/auth/sso", json={"token": token})
    post.db = db
    return post


def test_the_linked_portal_email_signs_in_to_that_account(app):
    r = app(sign())
    assert r.status_code == 200, r.text
    claims = jwt.decode(r.json()["token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert (claims["user_id"], claims["username"], claims["role"], claims["company_id"]) == ("u1", "admin", "admin", COMPANY)


def test_a_matching_sign_in_email_works_and_the_role_here_wins(app):
    r = app(sign(email="desk@example.com", role="admin"))  # the portal says admin; this app says front desk
    assert r.status_code == 200 and r.json()["role"] == "stock_supervisor"


@pytest.mark.parametrize("email", ["nobody@example.com", "stranger@example.com"])
def test_no_account_here_means_no_entry_and_nothing_is_created(app, email):
    r = app(sign(email=email))
    assert r.status_code == 403 and email in r.json()["detail"]
    assert app.db.users.writes == app.db.companies.writes == 0


def test_another_portal_business_is_refused(app):
    other = "99999999-2222-3333-4444-555555555555"
    r = app(sign(org_id=other))
    assert r.status_code == 403 and other in r.json()["detail"]


@pytest.mark.parametrize("token", [
    sign(secret="x" * 48), sign(age=600), sign(ttl=3600), sign(aud="attendance"), sign(iss="someone"), sign(drop=("exp",)),
    sign(drop=("iat",)), sign(email=""), sign(role=""), "not-a-token-at-all-but-long-enough",
    jwt.encode({"email": "owner@example.com", "org_id": ORG}, key="", algorithm="none"),
])
def test_bad_passes_are_refused_without_ending_the_session(app, token):
    assert app(token).status_code == 403  # never 401: the web app would jump to its login page


def test_a_pass_works_once(app):
    t = sign()
    assert app(t).status_code == 200
    assert app(t).status_code == 403


@pytest.mark.parametrize("name,value", [("SSO_SECRET", ""), ("SSO_SECRET", "short"), ("SSO_ORG_ID", "")])
def test_off_until_set_up(app, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    assert app(sign()).status_code == 503


def test_a_paused_person_stays_out(app):
    app.db.staff_access.rows.append({"id": "u2", "company_id": COMPANY, "status": "paused"})
    assert app(sign(email="desk@example.com")).status_code == 403


def test_a_removed_accounts_linked_email_does_not_open_it(app):
    app.db.staff_access.rows[0]["status"] = "removed"
    assert app(sign()).status_code == 403
