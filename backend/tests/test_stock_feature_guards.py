"""Prompt 2: every stock.* feature gates the routes it owns. Same local fakes as test_portal_bridge (no database, no
network): off refuses with 403 {"feature": key}, on works, a missing flag row falls back to the catalogue default.
Run from backend/:  python -m pytest tests/test_stock_feature_guards.py
"""
import aibiz_auth
import pytest
from fastapi.testclient import TestClient

import portal_bridge
import terms
from test_portal_bridge import COMPANY, DEFAULT_ON, ORG, FakeJWKS, FakePortalDB, portal_token, server, stock_token

# One real route per feature (METHOD, path under /api). test_representative_routes_exist keeps this honest.
OWNED = {
    "stock.vehicles": [("GET", "/vehicles/1/qr-data"), ("GET", "/vehicles/1/legal-documents"), ("GET", "/legal-documents/1/file")],
    "stock.sanakhat": [("GET", "/sanakhat/vehicles"), ("PATCH", "/vehicles/1/sale-statuses")],
    "stock.job_cards": [("GET", "/jobs"), ("POST", "/jobs"), ("DELETE", "/jobs/1")],
    "stock.spare_parts": [("GET", "/spare-parts")],
    "stock.warranty": [("GET", "/warranties"), ("POST", "/warranties/1/void")],
    "stock.bookings": [("GET", "/bookings"), ("POST", "/bookings")],
    "stock.crm": [("GET", "/crm/overview")],
    "stock.ai_assistant": [("POST", "/ai/chatbot"), ("GET", "/assistant/key")],
    "stock.leads": [("GET", "/leads"), ("POST", "/public/leads")],
    "stock.offers": [("GET", "/offers/dashain"), ("POST", "/public/offers/dashain/spin")],
    "stock.share": [("GET", "/share/profile"), ("GET", "/facebook/status"), ("GET", "/public/share/1")],
    "stock.visits": [("GET", "/visits/summary"), ("POST", "/public/visit")],
    "stock.public_site": [("GET", "/public/vehicles"), ("GET", "/public/settings")],
}
CORE = [("GET", "/vehicles"), ("POST", "/sales"), ("GET", "/customers"), ("GET", "/reports/dashboard"), ("GET", "/settings"),
        ("GET", "/vehicles/1/photos"), ("GET", "/vendors"), ("GET", "/team")]
ALL = [(k, m, p) for k, routes in OWNED.items() for m, p in routes]


@pytest.fixture
def fake(monkeypatch):
    f = FakePortalDB()
    f.features = {}  # nothing set: every flag falls back to its catalogue default
    monkeypatch.setattr(portal_bridge, "get_portal_db", lambda: f)
    monkeypatch.setattr(portal_bridge, "portal_configured", lambda: True)
    monkeypatch.setattr(aibiz_auth, "_jwks", lambda: FakeJWKS())

    async def default_company():
        return COMPANY
    monkeypatch.setattr(server, "_default_company_id", default_company)
    portal_bridge.clear_caches()
    return f


class _Coll:
    def __init__(self, row):
        self.row = row

    async def find_one(self, *a, **k):
        return dict(self.row, company_id=COMPANY)


class _Db:
    """Stands in for server.db on the three routes that look a row up before they know the company."""

    def __init__(self):
        self.vehicles = _Coll({"id": "1", "status": "available"})
        self.legal_documents = _Coll({"id": "1"})
        self.settings = _Coll({})
        self.vehicle_photos = _Coll({})


HANDLER_LEVEL = {"/vehicles/1/qr-data", "/legal-documents/1/file", "/public/share/1"}


@pytest.fixture
def client(monkeypatch):
    # no database in these tests: fail at once instead of waiting for a connection that cannot come
    async def no_pool(*a, **k):
        raise RuntimeError("no database in tests")
    monkeypatch.setattr(server.db, "get_pool", no_pool, raising=False)
    for name in ("vehicles", "legal_documents", "settings", "vehicle_photos"):
        monkeypatch.setattr(server.db, name, getattr(_Db(), name), raising=False)
    monkeypatch.setattr(server, "_share_sig", lambda vid, p: "sig")
    return TestClient(server.app, raise_server_exceptions=False)


def is_public(path):
    return path.startswith("/public/")


def send(client, method, path, kind):
    # public routes take no login; their company is the default one
    if is_public(path):
        headers = {}
    elif kind == "old":
        headers = {"Authorization": f"Bearer {stock_token('admin')}"}
    else:
        headers = {"Authorization": f"Bearer {portal_token()}", "X-Org-Id": ORG}
    if path == "/public/share/1":
        path += "?p=0&s=sig"
    return client.request(method, "/api" + path, headers=headers)


def feature_refusal(r):
    d = r.json().get("detail") if r.headers.get("content-type", "").startswith("application/json") else None
    return r.status_code == 403 and isinstance(d, dict) and "feature" in d


def test_representative_routes_exist():
    def shape(p):
        return "/".join("{}" if seg.startswith("{") or seg.isdigit() else seg for seg in p.split("/"))
    real = {(m, shape(r.path[4:])) for r in server.api_router.routes if hasattr(r, "methods") for m in r.methods}
    for m, p in [(m, p) for _, m, p in ALL] + CORE:
        assert (m, shape(p)) in real, f"{m} {p} is not a real route"


@pytest.mark.parametrize("key,method,path", ALL)
@pytest.mark.parametrize("kind", ["old", "portal"])
def test_off_refuses_with_feature_key(fake, client, key, method, path, kind):
    if kind == "portal" and is_public(path):
        pytest.skip("public routes have no login")
    fake.features[(ORG, key)] = False
    r = send(client, method, path, kind)
    assert feature_refusal(r) and r.json()["detail"] == {"feature": key}, (r.status_code, r.text)


@pytest.mark.parametrize("key,method,path", ALL)
@pytest.mark.parametrize("kind", ["old", "portal"])
def test_on_is_not_refused(fake, client, key, method, path, kind):
    if kind == "portal" and is_public(path):
        pytest.skip("public routes have no login")
    fake.features[(ORG, key)] = True
    # the handler itself may fail (no database here); what matters is that it is not the feature refusal
    assert not feature_refusal(send(client, method, path, kind))


@pytest.mark.parametrize("key", sorted(OWNED))
def test_missing_flag_row_falls_back_to_catalogue_default(fake, client, key):
    method, path = OWNED[key][0]
    refused = feature_refusal(send(client, method, path, "old"))
    assert refused == (not DEFAULT_ON.get(key, False))


@pytest.mark.parametrize("method,path", CORE)
def test_core_routes_never_gated(fake, client, method, path):
    for key in OWNED:
        fake.features[(ORG, key)] = False
    assert not feature_refusal(send(client, method, path, "portal"))


def test_company_without_a_map_row_keeps_working(fake, client):
    fake.map = {}  # not on the portal yet: catalogue default, allowed
    assert not feature_refusal(send(client, "GET", "/jobs", "old"))


def test_portal_not_configured_means_no_gating(fake, client, monkeypatch):
    monkeypatch.setattr(portal_bridge, "portal_configured", lambda: False)
    fake.features[(ORG, "stock.job_cards")] = False
    assert not feature_refusal(send(client, "GET", "/jobs", "old"))


def test_lookup_failure_for_old_token_allows(fake, client, monkeypatch):
    def down(*a, **k):
        raise ConnectionError("portal db down")
    monkeypatch.setattr(fake, "fetch_value", down)
    assert not feature_refusal(send(client, "GET", "/jobs", "old"))


def test_lookup_failure_for_portal_login_is_503(fake, client, monkeypatch):
    def down(*a, **k):
        raise ConnectionError("portal db down")
    monkeypatch.setattr(fake, "fetch_value", down)
    assert send(client, "GET", "/jobs", "portal").status_code == 503


def test_flag_flip_is_seen_after_cache_expires(fake, client):
    fake.features[(ORG, "stock.job_cards")] = True
    assert not feature_refusal(send(client, "GET", "/jobs", "old"))
    fake.features[(ORG, "stock.job_cards")] = False
    assert not feature_refusal(send(client, "GET", "/jobs", "old"))  # cached for up to a minute
    portal_bridge.clear_caches()
    assert feature_refusal(send(client, "GET", "/jobs", "old"))


def _calls(dep):
    yield dep.call
    for d in dep.dependencies:
        yield from _calls(d)


def test_every_gated_route_has_a_guard():
    """A route whose path belongs to a feature must either sit behind get_current_user / the public-site dependency,
    or be one of the handlers that call enforce_feature themselves. Catches a new unauthenticated route."""
    unguarded = []
    for r in server.api_router.routes:
        if not hasattr(r, "dependant") or portal_bridge.feature_for_path(r.path) is None:
            continue
        calls = set(_calls(r.dependant))
        if server.get_current_user in calls or server._scope_to_default_company in calls:
            continue
        unguarded.append(r.path)
    allowed = {"/api/vehicles/{vid}/qr-data", "/api/legal-documents/{doc_id}/file", "/api/public/share/{vid}",
               "/api/assistant/briefing", "/api/assistant/lookup", "/api/facebook/callback"}
    assert set(unguarded) <= allowed, sorted(set(unguarded) - allowed)


# ── GET /api/features: what the screens use to hide things ─────────────────
def test_features_endpoint_for_portal_login(fake, client):
    fake.features[(ORG, "stock.vehicles")] = True
    fake.features[(ORG, "stock.crm")] = False
    r = send(client, "GET", "/features", "portal")
    f = r.json()["features"]
    assert r.status_code == 200 and f["stock.vehicles"] is True and f["stock.crm"] is False and f["stock.warranty"] is True


def test_features_endpoint_for_stock_token_uses_company_map(fake, client):
    fake.features[(ORG, "stock.job_cards")] = True
    assert send(client, "GET", "/features", "old").json()["features"]["stock.job_cards"] is True


def test_features_endpoint_null_when_company_not_linked(fake, client):
    fake.map = {}
    assert send(client, "GET", "/features", "old").json() == {"features": None, "terms": terms.VEHICLE}


def test_features_endpoint_null_when_portal_not_configured(fake, client, monkeypatch):
    monkeypatch.setattr(portal_bridge, "portal_configured", lambda: False)
    assert send(client, "GET", "/features", "old").json() == {"features": None, "terms": terms.VEHICLE}


def test_features_endpoint_null_when_lookup_fails(fake, client, monkeypatch):
    def down(*a, **k):
        raise ConnectionError("portal db down")
    monkeypatch.setattr(fake, "fetch_value", down)
    assert send(client, "GET", "/features", "old").json() == {"features": None, "terms": terms.VEHICLE}
