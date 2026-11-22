"""An opening balance on each bank account and on the cash account (finance_books.py), against the same in-memory stand-in for
the database as test_finance_rent.py:

    python -m unittest backend/tests/test_finance_opening_balance.py
"""
import asyncio
import sys
import unittest
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import finance_books  # noqa: E402
from test_finance_rent import _DB  # noqa: E402


def _reset():
    finance_books._services_ready = finance_books._groups_ready = finance_books._types_ready = finance_books._opening_ready = True


class OpeningBalanceTests(unittest.TestCase):
    def setUp(self):
        _reset()
        self.db = _DB()
        router = APIRouter(prefix="/api")

        async def admin_only():
            return {"company_id": "c1"}

        finance_books.register(router, self.db, admin_only)
        app = FastAPI()
        app.include_router(router)
        self.api = TestClient(app)

    def tearDown(self):
        _reset()

    def test_a_bank_account_is_made_with_its_opening_balance_and_the_books_carry_it(self):
        r = self.api.post("/api/fin/accounts", json={"name": "Nabil", "opening_balance": 150000})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["opening_balance"], 150000)
        books = self.api.get("/api/fin/books").json()
        self.assertTrue(books["opening_ready"])
        self.assertEqual([(a["name"], a["opening_balance"]) for a in books["accounts"]], [("Nabil", 150000)])

    def test_changing_an_account_changes_its_balance_and_leaving_it_out_keeps_it(self):
        aid = self.api.post("/api/fin/accounts", json={"name": "Nabil", "opening_balance": 150000}).json()["id"]
        self.api.put(f"/api/fin/accounts/{aid}", json={"name": "Nabil Bank", "opening_balance": 90000.5})
        self.assertEqual(self.db.fin_bank_accounts.rows[0]["opening_balance"], 90000.5)
        self.api.put(f"/api/fin/accounts/{aid}", json={"name": "Nabil Bank 2"})          # an older form that does not send it
        row = self.db.fin_bank_accounts.rows[0]
        self.assertEqual((row["name"], row["opening_balance"]), ("Nabil Bank 2", 90000.5))
        self.api.put(f"/api/fin/accounts/{aid}", json={"name": "Nabil Bank 2", "opening_balance": 0})   # cleared on purpose
        self.assertEqual(self.db.fin_bank_accounts.rows[0]["opening_balance"], 0)

    def test_an_overdrawn_account_can_open_negative_and_amounts_are_rounded_to_paisa(self):
        r = self.api.post("/api/fin/accounts", json={"name": "Loan A/c", "opening_balance": -2500.456})
        self.assertEqual(r.json()["opening_balance"], -2500.46)

    def test_a_non_number_is_refused_before_anything_is_saved(self):
        r = self.api.post("/api/fin/accounts", json={"name": "Nabil", "opening_balance": "lots"})
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.db.fin_bank_accounts.rows, [])

    def test_the_cash_account_has_one_too(self):
        self.api.put("/api/fin/cash-account", json={"name": "Drawer", "opening_balance": 20000})
        self.assertEqual(self.db.fin_cash_account.rows[0]["opening_balance"], 20000)
        self.api.put("/api/fin/cash-account", json={"name": "Drawer"})                      # not sent: kept
        self.assertEqual(self.db.fin_cash_account.rows[0]["opening_balance"], 20000)
        self.api.put("/api/fin/cash-account", json={"name": "Drawer", "opening_balance": 5000})
        self.assertEqual(len(self.db.fin_cash_account.rows), 1)
        self.assertEqual(self.db.fin_cash_account.rows[0]["opening_balance"], 5000)

    def test_without_the_column_a_real_amount_is_refused_clearly_and_everything_else_still_saves(self):
        finance_books._opening_ready = False
        self.assertFalse(self.api.get("/api/fin/books").json()["opening_ready"])
        refused = self.api.post("/api/fin/accounts", json={"name": "Nabil", "opening_balance": 100})
        self.assertEqual(refused.status_code, 503)
        self.assertIn("opening_balance", refused.json()["detail"])
        self.assertEqual(self.db.fin_bank_accounts.rows, [], "nothing was saved without its balance")
        # no amount, or 0: nothing to refuse
        self.assertEqual(self.api.post("/api/fin/accounts", json={"name": "Nabil"}).status_code, 200)
        self.assertEqual(self.api.post("/api/fin/accounts", json={"name": "Global", "opening_balance": 0}).status_code, 200)
        self.assertNotIn("opening_balance", self.db.fin_bank_accounts.rows[0])
        aid = self.db.fin_bank_accounts.rows[0]["id"]
        self.assertEqual(self.api.put(f"/api/fin/accounts/{aid}", json={"name": "Nabil 2", "opening_balance": 5}).status_code, 503)
        self.assertEqual(self.db.fin_bank_accounts.rows[0]["name"], "Nabil", "a refused change changed nothing")
        self.assertEqual(self.api.put("/api/fin/cash-account", json={"name": "Drawer", "opening_balance": 5}).status_code, 503)
        self.assertEqual(self.db.fin_cash_account.rows, [])


class _RawDB:
    """The real database object's two raw-SQL methods: records what it was asked to run; `have` = the tables that have the column."""
    def __init__(self, have=(), fail_ddl=False, postgres=False):
        self.ran, self.have, self.fail_ddl, self.postgres = [], set(have), fail_ddl, postgres

    async def execute_raw(self, sql):
        self.ran.append(sql)
        if self.fail_ddl and sql.startswith("ALTER TABLE fin_") and "opening_balance" in sql:
            raise Exception("permission denied")

    async def fetch_raw(self, sql):
        table = sql.split("TABLE_NAME = '")[1].split("'")[0] if "TABLE_NAME = '" in sql else sql.split("table_name = '")[1].split("'")[0]
        cols = ["id", "installation_charge", "service_charges", "expense_group", "party_type_id"]
        if table in self.have:
            cols.append("opening_balance")
        key = "column_name" if self.postgres else "COLUMN_NAME"
        return [{key: c} for c in cols]


def _registry():
    return {t: {"columns": {"id"}} for t in ("fin_transactions", "fin_expense_categories", "fin_parties", "fin_bank_accounts", "fin_cash_account")}


class OpeningSchemaTests(unittest.TestCase):
    def setUp(self):
        _reset()

    def tearDown(self):
        _reset()

    def test_mysql_startup_adds_the_columns_and_lists_them_once_both_exist(self):
        raw, reg = _RawDB(have=finance_books.OPENING_TABLES), _registry()
        asyncio.run(finance_books.ensure_schema(raw, reg))
        self.assertEqual([q for q in raw.ran if "opening_balance" in q], finance_books.OPENING_DDL)
        self.assertTrue(all("opening_balance" in reg[t]["columns"] for t in finance_books.OPENING_TABLES))
        self.assertTrue(finance_books._opening_ready)

    def test_mysql_startup_leaves_balances_off_when_a_column_is_missing(self):
        raw, reg = _RawDB(have=["fin_bank_accounts"], fail_ddl=True), _registry()
        asyncio.run(finance_books.ensure_schema(raw, reg))                                   # does not raise
        self.assertFalse(finance_books._opening_ready)
        self.assertTrue(all("opening_balance" not in reg[t]["columns"] for t in finance_books.OPENING_TABLES), "a missing column is never listed")

    def test_postgres_startup_adds_the_column_with_postgres_types_then_lists_it(self):
        raw, reg = _RawDB(have=finance_books.OPENING_TABLES, postgres=True), _registry()
        asyncio.run(finance_books.ensure_schema_postgres(raw, reg))
        ddl = [q for q in raw.ran if "opening_balance" in q]
        self.assertEqual(len(ddl), 2)
        self.assertTrue(all("ADD COLUMN IF NOT EXISTS opening_balance double precision NOT NULL DEFAULT 0" in q for q in ddl), ddl)
        self.assertTrue(finance_books._opening_ready)
        self.assertTrue(all("opening_balance" in reg[t]["columns"] for t in finance_books.OPENING_TABLES))

    def test_postgres_startup_that_cannot_alter_leaves_balances_off_and_never_raises(self):
        raw, reg = _RawDB(have=[], fail_ddl=True, postgres=True), _registry()
        asyncio.run(finance_books.ensure_schema_postgres(raw, reg))
        self.assertFalse(finance_books._opening_ready)
        self.assertTrue(all("opening_balance" not in reg[t]["columns"] for t in finance_books.OPENING_TABLES))

    def test_the_schema_generator_knows_the_new_column(self):
        schema = (Path(__file__).resolve().parent.parent / "supabase" / "schema.sql").read_text(encoding="utf-8")
        for table in finance_books.OPENING_TABLES:
            self.assertIn(f'alter table "public"."{table}" add column if not exists "opening_balance" double precision default 0;', schema)


if __name__ == "__main__":
    unittest.main()
