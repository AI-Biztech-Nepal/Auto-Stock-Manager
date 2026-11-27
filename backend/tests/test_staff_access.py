"""Settings > Staff & Access (staff_access.py): what a person's changes allow, refuse and leave to their role, checked
against the app's real routes. No database, no network: the stored record is faked.
Run from backend/:  python -m pytest tests/test_staff_access.py
"""
import os

os.environ.setdefault("JWT_SECRET", "unit-test-secret-not-the-default-xxxxxxxx")
for _k in ("MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "DB_NAME"):
    os.environ.setdefault(_k, "unused-no-connection-is-made")
os.environ.setdefault("DB_BACKEND", "mysql")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
import staff_access as sa  # noqa: E402

EVERY = {s: "edit" for s in sa.SECTIONS}


@pytest.mark.parametrize("overrides,method,path,want", [
    ({}, "GET", "/leads", None),                                  # nothing changed: the role decides
    ({"finance": "view"}, "GET", "/fin/books", True),
    ({"finance": "view"}, "POST", "/fin/transactions", False),
    ({"finance": "edit"}, "POST", "/fin/transactions", True),
    ({"finance": "none"}, "GET", "/fin/books", False),
    ({"finance": "none"}, "GET", "/leads", None),                 # an unchanged section follows the role
    ({"leads": "view"}, "POST", "/leads/seen", True),
    ({"leads": "view"}, "POST", "/leads/1/accept", False),
    ({"inventory": "none"}, "GET", "/vehicles", None),            # other screens still read vehicles through their role
    ({"inventory": "none"}, "POST", "/vehicles", False),
    ({"inventory": "view"}, "PUT", "/vehicles/1", None),          # Sales may still be what allows it
    ({"inventory": "view", "sales": "view"}, "PUT", "/vehicles/1", False),
    ({"jobs": "view"}, "GET", "/vehicles/1/expenses", None),      # costs do not come with job cards
    ({"ledger": "view"}, "GET", "/customers/7", True),
    ({"sanakhat": "edit"}, "PATCH", "/vehicles/1/sale-statuses", True),
])
def test_decide(overrides, method, path, want):
    assert sa.decide(overrides, method, path) is want


@pytest.mark.parametrize("method,path", [
    ("DELETE", "/vehicles/1"), ("POST", "/vehicles/1/return"), ("POST", "/vehicles/import"), ("POST", "/sales/import"),
    ("POST", "/sales/1/undo-return"), ("DELETE", "/bookings/1"), ("POST", "/bookings/1/cancel"), ("PUT", "/settings"),
    ("PUT", "/staff/1"), ("GET", "/staff"), ("DELETE", "/auth/users/1"), ("PUT", "/auth/users/1"), ("GET", "/sync/export"),
    ("POST", "/sync/push"), ("GET", "/admin/backups"), ("GET", "/audit-logs"), ("DELETE", "/items/1"),
    ("DELETE", "/customers/1"), ("DELETE", "/vehicles/1/legal-documents/2"), ("POST", "/warranties/1/restore"),
])
def test_admin_actions_are_never_granted(method, path):
    assert sa.decide(EVERY, method, path) is None


def test_unknown_values_are_dropped():
    assert sa.clean_access({"finance": "edit", "leads": "all", "settings": "edit"}) == {"finance": "edit"}
    assert sa.clean_access(None) == {}


@pytest.fixture
def call(monkeypatch):
    async def no_pool(*a, **k):
        raise RuntimeError("no database in tests")
    monkeypatch.setattr(server.db, "get_pool", no_pool, raising=False)
    monkeypatch.setattr(sa, "ready", True)
    client = TestClient(server.app, raise_server_exceptions=False)

    def _call(method, path, role="stock_supervisor", access=None, status="active", record=True):
        async def record_for(db, uid):
            return {"access": access or {}, "status": status} if record else None
        monkeypatch.setattr(sa, "record_for", record_for)
        token = server.create_token("u1", "x@example.com", role, "c1")
        return client.request(method, "/api" + path, headers={"Authorization": f"Bearer {token}"}, json={}).status_code
    return _call


# "passed the permission check" = anything but 401 / 403 (the handler then fails on the missing database)
def passed(code):
    return code not in (401, 403)


def test_role_behaviour_is_unchanged_without_a_record(call):
    assert passed(call("GET", "/leads", record=False))
    assert call("GET", "/jobs", record=False) == 403
    assert call("GET", "/reports/financial", record=False) == 403


def test_granting_a_section_opens_it_past_the_role(call):
    assert passed(call("GET", "/jobs", access={"jobs": "view"}))
    assert call("POST", "/jobs", access={"jobs": "view"}) == 403
    assert passed(call("GET", "/reports/financial", access={"reports": "view"}))
    assert passed(call("GET", "/fin/books", role="parts_supervisor", access={"finance": "view"}))


def test_taking_access_away(call):
    assert call("GET", "/leads", access={"leads": "none"}) == 403
    assert call("POST", "/fin/transfers", access={"finance": "view"}) == 403


def test_grant_does_not_reach_admin_actions(call):
    assert call("DELETE", "/vehicles/1", access=EVERY) == 403
    assert call("PUT", "/settings", access=EVERY) == 403
    assert call("GET", "/staff", access=EVERY) == 403


def test_paused_or_removed_login_is_refused(call):
    for status in ("paused", "removed"):
        assert call("GET", "/leads", status=status) == 401
        assert call("GET", "/features", status=status) == 401


def test_admin_is_never_restricted(call):
    assert passed(call("GET", "/leads", role="admin", access={"leads": "none"}, status="paused"))


def test_an_unreadable_restriction_is_not_ignored(call, monkeypatch):
    async def boom(db, uid):
        raise RuntimeError("database away")
    call("GET", "/leads")  # sets the client up
    monkeypatch.setattr(sa, "ready", True)
    monkeypatch.setattr(sa, "record_for", boom)
    client = TestClient(server.app, raise_server_exceptions=False)
    token = server.create_token("u1", "x@example.com", "stock_supervisor", "c1")
    assert client.get("/api/leads", headers={"Authorization": f"Bearer {token}"}).status_code == 503
