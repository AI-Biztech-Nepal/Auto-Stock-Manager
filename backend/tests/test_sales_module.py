"""Sales Module Tests - GET/POST/DELETE sales, summary, vehicle status updates"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture(scope="module")
def token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def available_vehicle(auth):
    """Get or create an available vehicle for testing"""
    resp = auth.get(f"{BASE_URL}/api/vehicles?status=available")
    assert resp.status_code == 200
    vehicles = resp.json()
    if vehicles:
        return vehicles[0]
    # Create one
    v = auth.post(f"{BASE_URL}/api/vehicles", json={
        "brand": "TEST_Honda", "model": "TEST_Activa", "year": 2022,
        "engine_cc": 110, "purchase_price": 150000,
        "purchase_date": "2024-01-01", "purchase_source": "Individual",
        "selling_price": 180000, "registration_number": "TEST-SALES-001"
    })
    assert v.status_code == 200
    return v.json()


# ── Summary ──────────────────────────────────────────────────────────────────
class TestSalesSummary:
    def test_get_summary(self, auth):
        resp = auth.get(f"{BASE_URL}/api/sales/summary")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "total_sales" in data
        assert "total_revenue" in data
        assert "this_month_sales" in data
        assert "avg_sale_price" in data
        print(f"Summary: {data}")

    def test_get_sales_list(self, auth):
        resp = auth.get(f"{BASE_URL}/api/sales")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"Total sales: {len(data)}")


# ── Create + Delete ──────────────────────────────────────────────────────────
class TestSalesCRUD:
    sale_id = None
    vehicle_id = None

    def test_create_sale(self, auth, available_vehicle):
        TestSalesCRUD.vehicle_id = available_vehicle["id"]
        payload = {
            "vehicle_id": available_vehicle["id"],
            "sale_price": 185000,
            "extra_expenses": [
                {"name": "Registration Transfer Fee", "amount": 2000},
                {"name": "TEST_Custom Fee", "amount": 500}
            ],
            "payment_method": "Cash",
            "notes": "TEST sale",
            "witness_name": "TEST Witness", "witness_address": "TEST Addr",
            "witness_phone": "9800000009", "witness_id_number": "TEST-ID-1",
        }
        resp = auth.post(f"{BASE_URL}/api/sales", json=payload)
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["vehicle_id"] == available_vehicle["id"]
        assert data["sale_price"] == 185000
        assert data["expenses_total"] == 2500
        assert data["total_amount"] == 187500
        assert data["payment_method"] == "Cash"
        assert len(data["extra_expenses"]) == 2
        TestSalesCRUD.sale_id = data["id"]
        print(f"Created sale: {data['id']}, total: {data['total_amount']}")

    def test_vehicle_marked_sold(self, auth):
        """After sale, vehicle status must be 'sold'"""
        assert TestSalesCRUD.vehicle_id, "No vehicle_id from create test"
        resp = auth.get(f"{BASE_URL}/api/vehicles/{TestSalesCRUD.vehicle_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "sold", f"Expected sold, got {resp.json()['status']}"

    def test_sold_vehicle_not_in_available_list(self, auth):
        resp = auth.get(f"{BASE_URL}/api/vehicles?status=available")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert TestSalesCRUD.vehicle_id not in ids, "Sold vehicle still in available list"

    def test_create_sale_already_sold_fails(self, auth):
        """Trying to sell an already sold vehicle should return 400"""
        assert TestSalesCRUD.vehicle_id
        resp = auth.post(f"{BASE_URL}/api/sales", json={
            "vehicle_id": TestSalesCRUD.vehicle_id,
            "sale_price": 200000,
            "payment_method": "Cash"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"

    def test_sale_in_list(self, auth):
        """Verify created sale appears in list with enriched fields"""
        assert TestSalesCRUD.sale_id
        resp = auth.get(f"{BASE_URL}/api/sales")
        assert resp.status_code == 200
        sale = next((s for s in resp.json() if s["id"] == TestSalesCRUD.sale_id), None)
        assert sale is not None, "Sale not found in list"
        assert "vehicle_info" in sale
        assert "customer_name" in sale
        print(f"Sale in list: vehicle_info={sale.get('vehicle_info')}, customer={sale.get('customer_name')}")

    def test_delete_sale_restores_vehicle(self, auth):
        """Delete sale - vehicle should go back to available"""
        assert TestSalesCRUD.sale_id
        resp = auth.delete(f"{BASE_URL}/api/sales/{TestSalesCRUD.sale_id}")
        assert resp.status_code == 200
        assert "restored" in resp.json().get("message", "").lower() or "deleted" in resp.json().get("message", "").lower()

        # Verify vehicle restored
        v_resp = auth.get(f"{BASE_URL}/api/vehicles/{TestSalesCRUD.vehicle_id}")
        assert v_resp.status_code == 200
        assert v_resp.json()["status"] == "available", f"Expected available, got {v_resp.json()['status']}"

    def test_vehicle_back_in_available_list(self, auth):
        resp = auth.get(f"{BASE_URL}/api/vehicles?status=available")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert TestSalesCRUD.vehicle_id in ids, "Vehicle not back in available list after delete"

    def test_delete_nonexistent_sale(self, auth):
        resp = auth.delete(f"{BASE_URL}/api/sales/nonexistent-id-12345")
        assert resp.status_code == 404


class TestSalesWithCustomer:
    """Test sale creation with customer link"""
    sale_id = None
    vehicle_id = None
    customer_id = None

    def test_create_customer_and_sale(self, auth, available_vehicle):
        TestSalesWithCustomer.vehicle_id = available_vehicle["id"]
        # Create test customer
        c_resp = auth.post(f"{BASE_URL}/api/customers", json={
            "name": "TEST_Customer Sales", "contact_number": "9800000001"
        })
        assert c_resp.status_code == 200
        TestSalesWithCustomer.customer_id = c_resp.json()["id"]

        # Create sale with customer
        resp = auth.post(f"{BASE_URL}/api/sales", json={
            "vehicle_id": available_vehicle["id"],
            "customer_id": TestSalesWithCustomer.customer_id,
            "sale_price": 170000,
            "payment_method": "Bank Transfer",
            "extra_expenses": [],
            "witness_name": "TEST Witness", "witness_address": "TEST Addr",
            "witness_phone": "9800000009", "witness_id_number": "TEST-ID-1",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["customer_id"] == TestSalesWithCustomer.customer_id
        TestSalesWithCustomer.sale_id = data["id"]

    def test_customer_name_in_sale_list(self, auth):
        resp = auth.get(f"{BASE_URL}/api/sales")
        assert resp.status_code == 200
        sale = next((s for s in resp.json() if s.get("id") == TestSalesWithCustomer.sale_id), None)
        if sale:
            assert sale.get("customer_name") == "TEST_Customer Sales"

    def test_cleanup(self, auth):
        if TestSalesWithCustomer.sale_id:
            auth.delete(f"{BASE_URL}/api/sales/{TestSalesWithCustomer.sale_id}")
        if TestSalesWithCustomer.customer_id:
            auth.delete(f"{BASE_URL}/api/customers/{TestSalesWithCustomer.customer_id}")
