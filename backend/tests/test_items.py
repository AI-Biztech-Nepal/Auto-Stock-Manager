"""Prompt 4: generic stock items. A small in-memory stand-in for the database, so the real routes run with no server.
Run from backend/:  python -m pytest tests/test_items.py
"""
import pytest
from fastapi.testclient import TestClient

import portal_bridge
import terms
from test_portal_bridge import server, stock_token


class Cur:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *a, **k):
        return self

    async def to_list(self, n=None):
        return self.rows


class Coll:
    """Just enough of the Mongo-style collection API that the item and sale routes use."""

    def __init__(self, rows=None):
        self.rows = rows or []

    @staticmethod
    def _match(r, f):
        for k, c in (f or {}).items():
            v = r.get(k)
            if isinstance(c, dict):
                if "$in" in c and v not in c["$in"]: return False
                if "$gte" in c and not (v is not None and v >= c["$gte"]): return False
                if "$ne" in c and v == c["$ne"]: return False
            elif v != c:
                return False
        return True

    def find(self, f=None, proj=None):
        return Cur([dict(r) for r in self.rows if self._match(r, f)])

    async def find_one(self, f=None, proj=None):
        return next((dict(r) for r in self.rows if self._match(r, f)), None)

    async def insert_one(self, doc):
        self.rows.append(dict(doc))

    @staticmethod
    def _apply(r, u):
        r.update(u.get("$set", {}))
        for k, v in u.get("$inc", {}).items():
            r[k] = (r.get(k) or 0) + v

    async def update_one(self, f, u):
        for r in self.rows:
            if self._match(r, f):
                self._apply(r, u)
                return type("R", (), {"matched_count": 1})
        return type("R", (), {"matched_count": 0})

    async def find_one_and_update(self, f, u, return_document=None):
        for r in self.rows:
            if self._match(r, f):
                self._apply(r, u)
                return dict(r)
        return None

    async def delete_one(self, f):
        for i, r in enumerate(self.rows):
            if self._match(r, f):
                del self.rows[i]
                return type("R", (), {"deleted_count": 1})
        return type("R", (), {"deleted_count": 0})

    async def count_documents(self, f=None):
        return len([r for r in self.rows if self._match(r, f)])


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(portal_bridge, "portal_configured", lambda: False)  # no portal in these tests: no feature gating

    async def none(*a, **k):
        return {}
    monkeypatch.setattr(server.crm, "seller_for_sale", none)
    monkeypatch.setattr(server.crm, "lead_for_sale", none)
    for name in ("items", "sales", "customers", "vehicles", "vehicle_photos"):
        monkeypatch.setattr(server.db, name, Coll(), raising=False)
    return TestClient(server.app, raise_server_exceptions=False)


def H(role="admin"):
    return {"Authorization": f"Bearer {stock_token(role)}"}


def make(client, **kw):
    body = {"name": "Cabin suitcase", "sku": "SC-1", "category": "Bags", "cost": 2000, "price": 3500, "quantity": 5, **kw}
    r = client.post("/api/items", json=body, headers=H())
    assert r.status_code == 200, r.text
    return r.json()


def test_create_list_and_sku_must_be_unique(client):
    it = make(client)
    assert it["status"] == "available" and it["quantity"] == 5
    assert client.post("/api/items", json={"name": "Other", "sku": "SC-1"}, headers=H()).status_code == 400
    assert [i["name"] for i in client.get("/api/items", headers=H()).json()] == ["Cabin suitcase"]
    assert [i["name"] for i in client.get("/api/items?q=bags", headers=H()).json()] == ["Cabin suitcase"]
    assert client.get("/api/items?q=nothing", headers=H()).json() == []


def test_serial_number_means_one_unit(client):
    assert make(client, sku="P-1", serial_number="SN123", quantity=9)["quantity"] == 1


def test_cost_is_admin_only(client):
    make(client)
    assert "cost" in client.get("/api/items", headers=H("admin")).json()[0]
    assert "cost" not in client.get("/api/items", headers=H("stock_supervisor")).json()[0]


def test_roles_without_items_permission_are_refused(client):
    assert client.get("/api/items", headers=H("sanakhat_officer")).status_code == 403
    assert client.post("/api/items", json={"name": "x"}, headers=H("stock_supervisor")).status_code == 403


def test_sell_reduces_stock_and_records_cost(client):
    it = make(client)
    r = client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 3500, "quantity": 2, "paid_cash": 7000}, headers=H())
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["item_id"] == it["id"] and s["vehicle_id"] is None and s["quantity"] == 2
    assert s["sale_price"] == 7000 and s["cost_at_sale"] == 4000 and s["payment_status"] == "Paid"
    assert client.get(f"/api/items/{it['id']}", headers=H()).json()["quantity"] == 3


def test_cannot_sell_more_than_in_stock_and_last_unit_marks_sold(client):
    it = make(client, quantity=2)
    assert client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 1, "quantity": 3}, headers=H()).status_code == 400
    assert client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 1, "quantity": 2}, headers=H()).status_code == 200
    now = client.get(f"/api/items/{it['id']}", headers=H()).json()
    assert now["quantity"] == 0 and now["status"] == "sold"
    assert client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 1}, headers=H()).status_code == 400


def test_unlisted_item_cannot_be_sold(client):
    it = make(client, unlisted=True)
    assert it["status"] == "unlisted"
    assert client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 1}, headers=H()).status_code == 400


def test_sale_list_names_the_item_and_shows_profit(client):
    it = make(client)
    client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 3500, "quantity": 2}, headers=H())
    s = client.get("/api/sales", headers=H()).json()[0]
    assert s["vehicle_info"].startswith("Cabin suitcase") and s["profit"] == 3000 and s["total_investment"] == 4000
    one = client.get(f"/api/sales/{s['id']}", headers=H()).json()
    assert one["item_info"] == "Cabin suitcase" and one["profit"] == 3000


def test_reconcile_does_not_flag_item_sales(client):
    it = make(client)
    client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 10}, headers=H())
    assert client.get("/api/sales/reconcile", headers=H()).json()["count"] == 0


def test_deleting_a_sale_puts_the_units_back(client):
    it = make(client, quantity=2)
    sid = client.post(f"/api/items/{it['id']}/sell", json={"unit_price": 10, "quantity": 2}, headers=H()).json()["id"]
    assert client.get(f"/api/items/{it['id']}", headers=H()).json()["status"] == "sold"
    assert client.delete(f"/api/sales/{sid}", headers=H()).status_code == 200
    back = client.get(f"/api/items/{it['id']}", headers=H()).json()
    assert back["quantity"] == 2 and back["status"] == "available"


def test_item_with_sales_cannot_be_deleted_but_one_without_can(client):
    sold, fresh = make(client), make(client, sku="SC-2")
    client.post(f"/api/items/{sold['id']}/sell", json={"unit_price": 10}, headers=H())
    assert client.delete(f"/api/items/{sold['id']}", headers=H()).status_code == 400
    assert client.delete(f"/api/items/{fresh['id']}", headers=H()).status_code == 200
    assert client.get(f"/api/items/{fresh['id']}", headers=H()).status_code == 404


def test_edit_keeps_sku_unique(client):
    a, b = make(client), make(client, sku="SC-2")
    r = client.put(f"/api/items/{b['id']}", json={"name": "B", "sku": "SC-1"}, headers=H())
    assert r.status_code == 400
    assert client.put(f"/api/items/{a['id']}", json={"name": "A2", "sku": "SC-1", "quantity": 7}, headers=H()).json()["quantity"] == 7


# ── vocabulary ─────────────────────────────────────────────────────────
def test_terms_default_to_vehicles_when_unknown_or_vehicles_on():
    assert terms.terms_for(None)["item"] == "Vehicle"
    assert terms.terms_for({"stock.vehicles": True})["items"] == "Vehicles"


def test_terms_are_generic_when_vehicles_off():
    t = terms.terms_for({"stock.vehicles": False, "stock.crm": True})
    assert (t["item"], t["items"], t["add"]) == ("Item", "Items", "Add Item")
    assert not any("ehicle" in v for v in t.values())


def test_business_type_overrides_the_feature_guess():
    assert terms.terms_for({"stock.vehicles": False}, "vehicle_dealership")["item"] == "Vehicle"
