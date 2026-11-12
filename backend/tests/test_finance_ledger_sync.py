"""The Finance Ledger carrying everyone from the main Ledger (customers, vendors, staff), against the same in-memory
stand-in for the database as test_finance_rent.py:

    python -m unittest backend/tests/test_finance_ledger_sync.py
"""
import sys
import unittest
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import finance_books  # noqa: E402
from test_finance_rent import _DB  # noqa: E402


class LedgerSyncTests(unittest.TestCase):
    def setUp(self):
        self.db = _DB()
        router = APIRouter(prefix="/api")

        async def admin_only():
            return {"company_id": "c1"}

        finance_books.register(router, self.db, admin_only)
        app = FastAPI()
        app.include_router(router)
        self.api = TestClient(app)

    def _books(self):
        return self.api.get("/api/fin/books").json()

    def _typed(self, books):
        names = {t["id"]: t["name"] for t in books["party_types"]}
        return {p["name"]: (names.get(p.get("party_type_id")), p["phone"]) for p in books["parties"]}

    def test_customers_vendors_and_staff_arrive_typed_by_where_they_came_from(self):
        self.db.customers.rows.append({"id": "c", "name": "Sita Customer", "contact_number": "9811111111", "address": "Pokhara"})
        self.db.vendors.rows.append({"id": "v", "name": "Hari Vendor", "phone": "9822222222"})
        self.db.team_members.rows.append({"id": "t", "name": "Gita Staff", "contact": "9833333333"})
        books = self._books()
        self.assertEqual(self._typed(books), {"Sita Customer": ("Customer", "9811111111"), "Hari Vendor": ("Vendor", "9822222222"),
                                              "Gita Staff": ("Employee", "9833333333")})
        self.assertEqual([p["address"] for p in books["parties"] if p["name"] == "Sita Customer"], ["Pokhara"])

    def test_reading_again_adds_no_duplicates_and_picks_up_new_people(self):
        self.db.customers.rows.append({"id": "c", "name": "Sita Customer", "contact_number": "9811111111"})
        self._books()
        self._books()
        self.assertEqual(len(self.db.fin_parties.rows), 1)
        self.db.customers.rows.append({"id": "c2", "name": "Ram Customer", "contact_number": "9844444444"})
        self.assertEqual(len(self._books()["parties"]), 2)

    def test_someone_already_in_finance_is_matched_by_phone_and_left_alone(self):
        mine = self.api.post("/api/fin/parties", json={"name": "Sita (Finance spelling)", "phone": "9811111111"}).json()
        self.db.customers.rows.append({"id": "c", "name": "Sita Customer", "contact_number": "+977 9811111111"})
        books = self._books()
        self.assertEqual([(p["id"], p["name"]) for p in books["parties"]], [(mine["id"], "Sita (Finance spelling)")])

    def test_matched_by_name_when_a_phone_is_missing_on_either_side(self):
        self.api.post("/api/fin/parties", json={"name": "Ram Shrestha"})
        self.db.customers.rows.append({"id": "c", "name": "ram shrestha", "contact_number": "9811111111"})
        self.db.vendors.rows.append({"id": "v", "name": "Hari", "phone": "9822222222"})
        self.api.post("/api/fin/parties", json={"name": "Hari", "phone": "9822222222"})
        self.db.team_members.rows.append({"id": "t", "name": "Hari", "contact": ""})
        self.assertEqual(len(self._books()["parties"]), 2)

    def test_same_name_with_a_different_phone_is_a_different_person(self):
        self.api.post("/api/fin/parties", json={"name": "Ram Shrestha", "phone": "9800000001"})
        self.db.customers.rows.append({"id": "c", "name": "Ram Shrestha", "contact_number": "9800000002"})
        self.assertEqual(len(self._books()["parties"]), 2)

    def test_one_phone_in_two_main_ledgers_makes_one_party(self):
        self.db.customers.rows.append({"id": "c", "name": "Sita", "contact_number": "9811111111"})
        self.db.vendors.rows.append({"id": "v", "name": "Sita Traders", "phone": "9811111111"})
        books = self._books()
        self.assertEqual(self._typed(books), {"Sita": ("Customer", "9811111111")})

    def test_unusable_phones_and_blank_names_are_handled(self):
        self.db.customers.rows.append({"id": "a", "name": "Landline Lal", "contact_number": "014567890"})
        self.db.customers.rows.append({"id": "b", "name": "  ", "contact_number": "9811111111"})
        self.db.customers.rows.append({"id": "c", "name": "No Phone Nari", "contact_number": None})
        self.assertEqual(self._typed(self._books()), {"Landline Lal": ("Customer", None), "No Phone Nari": ("Customer", None)})

    def test_a_deleted_ledger_type_leaves_the_new_party_untyped(self):
        books = self._books()
        for t in books["party_types"]:
            if t["name"] == "Customer":
                self.api.delete(f"/api/fin/party-types/{t['id']}")
        self.db.customers.rows.append({"id": "c", "name": "Sita", "contact_number": "9811111111"})
        self.assertEqual(self._typed(self._books()), {"Sita": (None, "9811111111")})


if __name__ == "__main__":
    unittest.main()
