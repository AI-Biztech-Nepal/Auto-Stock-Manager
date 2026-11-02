"""Rent, services on bills and the Cash account's details (finance_books.py), against an in-memory
stand-in for the database -- no MySQL and no running server needed:

    python -m unittest backend/tests/test_finance_rent.py

The stand-in understands only what finance_books.py asks of it: equality, $in and $ne filters, sort,
insert, update and delete.
"""
import asyncio
import re
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import finance_books  # noqa: E402


def _matches(doc, filt):
    for k, want in filt.items():
        have = doc.get(k)
        if isinstance(want, dict):
            if "$in" in want and have not in want["$in"]:
                return False
            if "$ne" in want and have == want["$ne"]:
                return False
        elif have != want:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, field, direction=1):
        self.docs = sorted(self.docs, key=lambda d: (d.get(field) is None, d.get(field) or ""), reverse=direction < 0)
        return self

    async def to_list(self, _length=None):
        return self.docs


class _Coll:
    def __init__(self):
        self.rows = []

    def find(self, filt=None, projection=None):
        return _Cursor([dict(d) for d in self.rows if _matches(d, filt or {})])

    async def find_one(self, filt=None, projection=None):
        found = [d for d in self.rows if _matches(d, filt or {})]
        return dict(found[0]) if found else None

    async def insert_one(self, doc):
        self.rows.append(dict(doc))

    async def insert_many(self, docs):
        self.rows.extend(dict(d) for d in docs)

    async def update_one(self, filt, update):
        for d in self.rows:
            if _matches(d, filt):
                d.update(update["$set"])
                return

    async def update_many(self, filt, update):
        for d in self.rows:
            if _matches(d, filt):
                d.update(update["$set"])

    async def delete_one(self, filt):
        for i, d in enumerate(self.rows):
            if _matches(d, filt):
                del self.rows[i]
                return

    async def delete_many(self, filt):
        self.rows = [d for d in self.rows if not _matches(d, filt)]


class _DB:
    def __init__(self):
        self._colls = {}

    def __getattr__(self, name):
        return self._colls.setdefault(name, _Coll())


class FinanceRentTests(unittest.TestCase):
    def setUp(self):
        self.db = _DB()
        router = APIRouter(prefix="/api")

        async def admin_only():
            return {"company_id": "c1"}

        finance_books.register(router, self.db, admin_only)
        app = FastAPI()
        app.include_router(router)
        self.api = TestClient(app)
        self.party = self.api.post("/api/fin/parties", json={"name": "Ram Renter", "phone": "9800000001"}).json()

    def _rent(self, **over):
        body = {"car": "Hilux", "customer_id": self.party["id"], "start_date": "2026-10-01", "rate_per_day": 3000}
        body.update(over)
        return self.api.post("/api/fin/rentals", json=body)

    def _rent_lines(self):
        return [e for e in self.db.fin_customer_ledger.rows if e["source_type"] == finance_books.RENT_SOURCE]

    # ── the arithmetic ─────────────────────────────────────────────────────
    def test_rent_days_count_both_ends_and_stop_at_today(self):
        r = {"start_date": "2026-10-01", "returned_on": "2026-10-03"}
        self.assertEqual(finance_books.rent_days(r, "2026-11-01"), ["2026-10-01", "2026-10-02", "2026-10-03"])
        out = {"start_date": "2026-10-30", "returned_on": None}
        self.assertEqual(finance_books.rent_days(out, "2026-11-01"), ["2026-10-30", "2026-10-31", "2026-11-01"])
        future = {"start_date": "2026-12-01", "returned_on": None}
        self.assertEqual(finance_books.rent_days(future, "2026-11-01"), [])

    # ── rent writes the renter's ledger ────────────────────────────────────
    def test_rental_books_one_daily_debit_per_day_out(self):
        with mock.patch.object(finance_books, "_today_np", return_value="2026-10-10"):
            r = self._rent(returned_on="2026-10-04")
            self.assertEqual(r.status_code, 200, r.text)
        lines = self._rent_lines()
        self.assertEqual(len(lines), 4)
        self.assertTrue(all(e["entry_type"] == "debit" and e["source"] == "booking" and e["amount"] == 3000 for e in lines))
        self.assertEqual(sorted(e["entry_date"] for e in lines)[0], "2026-10-01")
        self.assertEqual(lines[0]["note"], "Daily rent · Hilux")

    def test_reading_the_books_catches_up_new_days_without_duplicates(self):
        today = date(2026, 10, 3)
        with mock.patch.object(finance_books, "_today_np", return_value=today.isoformat()):
            self._rent()
            self.assertEqual(len(self._rent_lines()), 3)
        with mock.patch.object(finance_books, "_today_np", return_value=(today + timedelta(days=2)).isoformat()):
            books = self.api.get("/api/fin/books").json()
            self.api.get("/api/fin/books")  # a second read changes nothing
        self.assertEqual(len(self._rent_lines()), 5)
        self.assertEqual(len([e for e in books["customer_ledger"] if e["source_type"] == finance_books.RENT_SOURCE]), 5)
        self.assertTrue(books["rent_ready"])
        self.assertEqual(len(books["rentals"]), 1)

    def test_returning_a_rental_trims_its_lines_and_deleting_removes_them(self):
        with mock.patch.object(finance_books, "_today_np", return_value="2026-10-10"):
            rid = self._rent().json()["id"]
            self.assertEqual(len(self._rent_lines()), 10)
            r = self.api.put(f"/api/fin/rentals/{rid}", json={"car": "Hilux", "customer_id": self.party["id"], "start_date": "2026-10-01",
                                                               "rate_per_day": 3000, "returned_on": "2026-10-02"})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(len(self._rent_lines()), 2)
            # a different rate corrects the lines that are left
            self.api.put(f"/api/fin/rentals/{rid}", json={"car": "Hilux", "customer_id": self.party["id"], "start_date": "2026-10-01",
                                                          "rate_per_day": 3500, "returned_on": "2026-10-02"})
            self.assertEqual({e["amount"] for e in self._rent_lines()}, {3500})
            self.api.delete(f"/api/fin/rentals/{rid}")
        self.assertEqual(self._rent_lines(), [])

    def test_a_payment_survives_and_rent_lines_are_read_only(self):
        with mock.patch.object(finance_books, "_today_np", return_value="2026-10-02"):
            self._rent()
            paid = self.api.post("/api/fin/ledger/customer", json={"party_id": self.party["id"], "amount": 3000, "entry_date": "2026-10-02",
                                                                   "note": "Hilux · first day"})
            self.assertEqual(paid.status_code, 200, paid.text)
            line = self._rent_lines()[0]
            self.assertEqual(self.api.put(f"/api/fin/ledger/customer/{line['id']}", json={"amount": 1}).status_code, 403)
            self.assertEqual(self.api.delete(f"/api/fin/ledger/customer/{line['id']}").status_code, 403)
            self.api.delete(f"/api/fin/rentals/{self.db.fin_rentals.rows[0]['id']}")
        self.assertEqual([e["amount"] for e in self.db.fin_customer_ledger.rows], [3000])

    def test_no_renter_or_no_rate_books_nothing(self):
        with mock.patch.object(finance_books, "_today_np", return_value="2026-10-05"):
            self.assertEqual(self._rent(customer_id=None).status_code, 200)
            self.assertEqual(self._rent(car="Scorpio", rate_per_day=0).status_code, 200)
        self.assertEqual(self._rent_lines(), [])

    def test_a_vehicle_still_out_cannot_be_rented_again(self):
        with mock.patch.object(finance_books, "_today_np", return_value="2026-10-05"):
            self.assertEqual(self._rent().status_code, 200)
            again = self._rent(car="  hilux ")
            self.assertEqual(again.status_code, 409)
            self.assertIn("Returned on", again.json()["detail"])
            # once it is back it can go out again
            rid = self.db.fin_rentals.rows[0]["id"]
            self.api.put(f"/api/fin/rentals/{rid}", json={"car": "Hilux", "customer_id": self.party["id"], "start_date": "2026-10-01",
                                                          "rate_per_day": 3000, "returned_on": "2026-10-03"})
            self.assertEqual(self._rent(start_date="2026-10-04").status_code, 200)

    def test_rental_validation(self):
        self.assertEqual(self._rent(car="  ").status_code, 400)
        self.assertEqual(self._rent(returned_on="2026-09-01").status_code, 400)
        self.assertEqual(self._rent(start_date="not a date").status_code, 400)
        self.assertEqual(self._rent(customer_id="nobody").status_code, 404)
        self.assertEqual(self._rent(rate_per_day=-1).status_code, 400)

    # ── services on bills ──────────────────────────────────────────────────
    def test_services_are_kept_on_sale_and_purchase_bills_only(self):
        sale = self.api.post("/api/fin/transactions", json={
            "type": "sale", "amount": 10500, "customer_id": self.party["id"], "party_name": "Ram Renter",
            "items": [{"description": "Battery", "qty": 1, "rate": 10000, "amount": 10000}],
            "service_charges": [{"name": "Installation", "amount": 500}, {"name": "", "amount": 99}, {"name": "Free", "amount": 0}]})
        self.assertEqual(sale.status_code, 200, sale.text)
        self.assertEqual(sale.json()["service_charges"], [{"name": "Installation", "amount": 500.0}])
        self.assertEqual(sale.json()["installation_charge"], 500.0)
        # the debt it books is the whole bill, services included
        debit = [e for e in self.db.fin_customer_ledger.rows if e["source_type"] == "business_transaction"]
        self.assertEqual([e["amount"] for e in debit], [10500])
        expense = self.api.post("/api/fin/transactions", json={"type": "expense", "amount": 200, "party_name": "Tea",
                                                               "service_charges": [{"name": "x", "amount": 5}]})
        self.assertEqual(expense.json()["service_charges"], [])
        self.assertEqual(expense.json()["installation_charge"], 0)

    # ── the Cash account ───────────────────────────────────────────────────
    def test_cash_account_details_are_saved_once_and_reappear_in_the_books(self):
        self.assertIsNone(self.api.get("/api/fin/books").json()["cash_account"])
        self.api.put("/api/fin/cash-account", json={"name": "Shop cash", "address": "Pokhara"})
        self.api.put("/api/fin/cash-account", json={"name": "Shop cash drawer", "bank_name": " ", "address": "Pokhara"})
        self.assertEqual(len(self.db.fin_cash_account.rows), 1)
        cash = self.api.get("/api/fin/books").json()["cash_account"]
        self.assertEqual((cash["name"], cash["bank_name"], cash["address"]), ("Shop cash drawer", None, "Pokhara"))

    # ── before the second migration has been run ───────────────────────────
    def test_books_still_load_when_the_new_tables_are_missing(self):
        real = self.db.__class__.__getattr__

        def missing(db, name):
            if name in ("fin_rentals", "fin_cash_account"):
                raise_missing = type("C", (), {"find": lambda *_a, **_k: (_ for _ in ()).throw(Exception(f"(1146, \"Table 'x.{name}' doesn't exist\")"))})
                return raise_missing()
            return real(db, name)

        with mock.patch.object(self.db.__class__, "__getattr__", missing):
            books = self.api.get("/api/fin/books")
        self.assertEqual(books.status_code, 200, books.text)
        data = books.json()
        self.assertFalse(data["rent_ready"])
        self.assertEqual((data["rentals"], data["cash_account"]), ([], None))

    def test_a_missing_new_table_or_column_is_a_clear_503(self):
        async def boom(*_a, **_k):
            raise Exception("(1054, \"Unknown column 'installation_charge' in 'field list'\")")

        with mock.patch.object(_Coll, "insert_one", boom):
            r = self.api.post("/api/fin/transactions", json={"type": "expense", "amount": 5})
        self.assertEqual(r.status_code, 503)
        self.assertIn("migration_add_finance_rent.sql", r.json()["detail"])


# ── the schema step the server runs at start-up ───────────────────────────
class _RawDB:
    """The real database object's two raw-SQL methods, recording what they were asked to run."""
    def __init__(self, columns=(), fail_on=(), fail_fetch=False):
        self.ran, self.columns, self.fail_on, self.fail_fetch = [], list(columns), fail_on, fail_fetch

    async def execute_raw(self, sql):
        self.ran.append(sql)
        if any(f in sql for f in self.fail_on):
            raise Exception("(1142, \"ALTER command denied to user\")")

    async def fetch_raw(self, sql):
        if self.fail_fetch:
            raise Exception("information_schema unavailable")
        return [{"COLUMN_NAME": c} for c in self.columns]


def _registry_stub():
    return {"fin_transactions": {"columns": {"id", "type", "amount"}, "json_cols": {"items"}}}


def _ddl_columns(sql, table):
    """Column names of `CREATE TABLE IF NOT EXISTS <table> (...)` in a statement or a file, comments ignored."""
    sql = re.sub(r"--[^\n]*", "", sql)
    body = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\)\s*ENGINE", sql, re.S).group(1)
    parts, depth, cur = [], 0, ""
    for ch in body:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return {p.split()[0] for p in parts if p.split() and p.split()[0].upper() not in ("INDEX", "CONSTRAINT", "UNIQUE", "PRIMARY", "KEY")}


class FinanceSchemaTests(unittest.TestCase):
    def setUp(self):
        finance_books._services_ready = True

    def tearDown(self):
        finance_books._services_ready = True

    def _api(self):
        db = _DB()
        router = APIRouter(prefix="/api")

        async def admin_only():
            return {"company_id": "c1"}

        finance_books.register(router, db, admin_only)
        app = FastAPI()
        app.include_router(router)
        return TestClient(app), db

    def test_startup_creates_the_tables_adds_the_columns_and_lists_them(self):
        raw, registry = _RawDB(columns=["id", "installation_charge", "service_charges"]), _registry_stub()
        asyncio.run(finance_books.ensure_schema(raw, registry))
        self.assertEqual(len([q for q in raw.ran if q.startswith("CREATE TABLE IF NOT EXISTS")]), 2)
        self.assertTrue(all("ADD COLUMN IF NOT EXISTS" in q for q in raw.ran if q.startswith("ALTER")))
        self.assertEqual(len([q for q in raw.ran if q.startswith("ALTER")]), 2)
        meta = registry["fin_transactions"]
        self.assertTrue({"installation_charge", "service_charges"} <= meta["columns"])
        self.assertEqual(meta["json_cols"], {"items", "service_charges"})
        self.assertTrue(finance_books._services_ready)

    def test_if_the_database_refuses_finance_still_works_without_services(self):
        raw, registry = _RawDB(columns=["id", "type"], fail_on=("ALTER", "CREATE TABLE")), _registry_stub()
        asyncio.run(finance_books.ensure_schema(raw, registry))     # does not raise
        self.assertEqual(registry["fin_transactions"]["columns"], {"id", "type", "amount"}, "a missing column is never listed")
        self.assertFalse(finance_books._services_ready)
        api, db = self._api()
        party = api.post("/api/fin/parties", json={"name": "Ram"}).json()
        books = api.get("/api/fin/books").json()
        self.assertFalse(books["services_ready"])
        plain = api.post("/api/fin/transactions", json={"type": "sale", "amount": 500, "customer_id": party["id"], "party_name": "Ram"})
        self.assertEqual(plain.status_code, 200, plain.text)
        self.assertNotIn("service_charges", db.fin_transactions.rows[0])
        self.assertNotIn("installation_charge", db.fin_transactions.rows[0])
        self.assertEqual(len(db.fin_customer_ledger.rows), 1, "the bill still books its debt")
        with_services = api.post("/api/fin/transactions", json={"type": "sale", "amount": 600, "customer_id": party["id"],
                                                                "service_charges": [{"name": "Fitting", "amount": 100}]})
        self.assertEqual(with_services.status_code, 503)
        self.assertIn("migration_add_finance_rent.sql", with_services.json()["detail"])
        self.assertEqual(len(db.fin_transactions.rows), 1, "the refused bill was not saved without its services")

    def test_a_failed_check_leaves_services_off_and_never_raises(self):
        raw, registry = _RawDB(fail_fetch=True), _registry_stub()
        asyncio.run(finance_books.ensure_schema(raw, registry))
        self.assertFalse(finance_books._services_ready)
        self.assertNotIn("service_charges", registry["fin_transactions"]["columns"])

    def test_the_startup_statements_the_sql_file_and_the_sql_layer_agree(self):
        sql_file = (Path(__file__).resolve().parent.parent / "migration_add_finance_rent.sql").read_text(encoding="utf-8")
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from test_sqldb_registry import _registry
        registry = _registry()
        for table in ("fin_rentals", "fin_cash_account"):
            in_python = _ddl_columns(" ".join(finance_books.RENT_DDL), table)
            self.assertEqual(in_python, _ddl_columns(sql_file, table), f"{table}: start-up DDL and the .sql file differ")
            self.assertEqual(in_python, registry[table], f"{table}: DDL and sqldb.TABLES differ")
        for col, _kind in finance_books.SERVICE_COLUMNS:
            self.assertIn(col, sql_file)
            self.assertNotIn(col, registry["fin_transactions"], "listed statically it would break every read if the column is missing")


if __name__ == "__main__":
    unittest.main()
