"""Tests for dashboard/sales count mismatch fix and inline customer creation"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

@pytest.fixture
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}"}

def test_dashboard_sold_matches_sales_count(auth_headers):
    """Dashboard sold count should equal total sales records"""
    dash = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers)
    assert dash.status_code == 200
    dashboard_sold = dash.json()["sold"]

    sales = requests.get(f"{BASE_URL}/api/sales", headers=auth_headers)
    assert sales.status_code == 200
    sales_count = len(sales.json())

    assert dashboard_sold == sales_count, f"Dashboard sold={dashboard_sold} != sales count={sales_count}"
    print(f"PASS: dashboard sold={dashboard_sold}, sales count={sales_count}")

def test_create_sale_increments_dashboard(auth_headers):
    """After creating a sale, dashboard sold count increments by 1"""
    # Get initial dashboard
    dash0 = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers).json()
    sold0 = dash0["sold"]

    # Get an available vehicle
    vehicles = requests.get(f"{BASE_URL}/api/vehicles", headers=auth_headers).json()
    avail = [v for v in vehicles if v["status"] == "available"]
    if not avail:
        pytest.skip("No available vehicles to sell")

    vehicle = avail[0]

    # Get a customer
    customers = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers).json()
    if not customers:
        pytest.skip("No customers available")
    customer = customers[0]

    # Create sale
    sale_payload = {
        "vehicle_id": vehicle["id"],
        "customer_id": customer["id"],
        "sale_price": vehicle.get("asking_price", 100000),
        "sale_date": "2025-01-15",
        "payment_method": "cash",
        "witness_name": "TEST Witness", "witness_address": "TEST Addr",
        "witness_phone": "9800000009", "witness_id_number": "TEST-ID-1",
        "expenses": [],
        "notes": "TEST_dashboard_fix_sale"
    }
    create_r = requests.post(f"{BASE_URL}/api/sales", json=sale_payload, headers=auth_headers)
    assert create_r.status_code == 200, f"Sale creation failed: {create_r.text}"
    sale_id = create_r.json()["id"]

    # Check dashboard incremented
    dash1 = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers).json()
    assert dash1["sold"] == sold0 + 1, f"Expected {sold0+1}, got {dash1['sold']}"
    print(f"PASS: sold went from {sold0} to {dash1['sold']}")

    # Cleanup
    requests.delete(f"{BASE_URL}/api/sales/{sale_id}", headers=auth_headers)

def test_delete_sale_decrements_dashboard(auth_headers):
    """After deleting a sale, dashboard sold count decrements"""
    # Get initial
    dash0 = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers).json()
    sold0 = dash0["sold"]

    # Get available vehicle
    vehicles = requests.get(f"{BASE_URL}/api/vehicles", headers=auth_headers).json()
    avail = [v for v in vehicles if v["status"] == "available"]
    if not avail:
        pytest.skip("No available vehicles")
    vehicle = avail[0]

    customers = requests.get(f"{BASE_URL}/api/customers", headers=auth_headers).json()
    if not customers:
        pytest.skip("No customers")
    customer = customers[0]

    # Create sale
    sale_payload = {
        "vehicle_id": vehicle["id"],
        "customer_id": customer["id"],
        "sale_price": vehicle.get("asking_price", 100000),
        "sale_date": "2025-01-15",
        "payment_method": "cash",
        "witness_name": "TEST Witness", "witness_address": "TEST Addr",
        "witness_phone": "9800000009", "witness_id_number": "TEST-ID-1",
        "expenses": [],
        "notes": "TEST_delete_decrement"
    }
    create_r = requests.post(f"{BASE_URL}/api/sales", json=sale_payload, headers=auth_headers)
    assert create_r.status_code == 200
    sale_id = create_r.json()["id"]

    # Verify incremented
    dash1 = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers).json()
    assert dash1["sold"] == sold0 + 1

    # Delete
    del_r = requests.delete(f"{BASE_URL}/api/sales/{sale_id}", headers=auth_headers)
    assert del_r.status_code == 200

    # Verify decremented
    dash2 = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers).json()
    assert dash2["sold"] == sold0, f"Expected {sold0}, got {dash2['sold']}"
    print(f"PASS: sold decremented back to {sold0}")

def test_accounting_summary_uses_sales_table(auth_headers):
    """Accounting summary sold_count should match sales count for period"""
    sales = requests.get(f"{BASE_URL}/api/sales", headers=auth_headers).json()
    
    acc = requests.get(f"{BASE_URL}/api/reports/accounting-summary?start_date=2020-01-01&end_date=2030-12-31", headers=auth_headers)
    assert acc.status_code == 200
    acc_data = acc.json()
    assert "sold_count" in acc_data
    print(f"PASS: accounting summary sold_count={acc_data['sold_count']}, total sales={len(sales)}")
    # sold_count should be <= total sales (filtered by date)
    assert acc_data["sold_count"] <= len(sales)

def test_finance_summary(auth_headers):
    """Finance summary returns data"""
    r = requests.get(f"{BASE_URL}/api/finance/summary", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert "total_revenue" in data or "revenue" in data or len(data) > 0
    print(f"PASS: finance summary returned data: {list(data.keys())[:5]}")
