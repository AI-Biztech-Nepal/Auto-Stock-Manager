"""A vehicle sold on the Sales page posts a Sale bill to the customer's Finance Ledger (finance_books.sync_sale_bill),
against the same in-memory stand-in for the database as test_finance_rent.py:

    python -m unittest backend/tests/test_finance_sale_bill.py
"""
import asyncio
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import finance_books  # noqa: E402
from test_finance_rent import _DB  # noqa: E402


def run(coro):
    return asyncio.run(coro)


RAMJI = {"id": "c1", "name": "Ramji Prasad Ghimire", "contact_number": "9845270721", "address": "Hetauda"}


def a_sale(**over):
    sale = {"id": "s1", "customer_id": "c1", "vehicle_id": "v1", "sale_price": 100000, "total_amount": 100000, "sale_date": "2026-11-17"}
    sale.update(over)
    return sale


class SaleBillTests(unittest.TestCase):
    def setUp(self):
        self.db = _DB()

    def post(self, sale=None, customer=RAMJI, label="Honda Shine 2020 (78/4613)"):
        run(finance_books.sync_sale_bill(self.db, sale or a_sale(), customer, label))

    def bills(self):
        return [t for t in self.db.fin_transactions.rows if t.get("source_type") == finance_books.SALE_BILL_SOURCE]

    def debts(self):
        return [e for e in self.db.fin_customer_ledger.rows if e["source_type"] == "business_transaction"]

    def test_a_sale_books_a_sale_bill_and_a_debt_on_the_customers_ledger(self):
        self.post()
        (bill,) = self.bills()
        self.assertEqual((bill["type"], bill["amount"], bill["source_id"], bill["bill_date"]), ("sale", 100000, "s1", "2026-11-17"))
        self.assertEqual(bill["payment_mode"], "credit")  # a debt, not cash taken on the spot
        self.assertEqual(bill["note"], "Vehicle sale · Honda Shine 2020 (78/4613)")
        (party,) = self.db.fin_parties.rows
        self.assertEqual((party["name"], party["phone"], party["address"]), ("Ramji Prasad Ghimire", "9845270721", "Hetauda"))
        self.assertEqual(bill["customer_id"], party["id"])
        (debt,) = self.debts()
        self.assertEqual((debt["customer_id"], debt["entry_type"], debt["amount"], debt["source"], debt["entry_date"]),
                         (party["id"], "debit", 100000, "booking", "2026-11-17"))

    def test_the_customers_party_is_typed_customer(self):
        self.db.fin_party_types.rows.append({"id": "t-cust", "name": "Customer"})
        self.post()
        self.assertEqual(self.db.fin_parties.rows[0]["party_type_id"], "t-cust")

    def test_an_existing_party_is_reused_by_phone_or_by_name(self):
        self.db.fin_parties.rows.append({"id": "p-phone", "name": "Ramji (my spelling)", "phone": "9845270721"})
        self.post()
        self.assertEqual([p["id"] for p in self.db.fin_parties.rows], ["p-phone"])
        self.assertEqual(self.bills()[0]["customer_id"], "p-phone")

        other = _DB()
        other.fin_parties.rows.append({"id": "p-name", "name": "ramji prasad ghimire", "phone": None})
        run(finance_books.sync_sale_bill(other, a_sale(), RAMJI, ""))
        self.assertEqual(len(other.fin_parties.rows), 1)
        self.assertEqual(other.fin_transactions.rows[0]["customer_id"], "p-name")

    def test_the_same_name_with_another_phone_is_another_person(self):
        self.db.fin_parties.rows.append({"id": "p-other", "name": "Ramji Prasad Ghimire", "phone": "9800000009"})
        self.post()
        self.assertEqual(len(self.db.fin_parties.rows), 2)
        self.assertNotEqual(self.bills()[0]["customer_id"], "p-other")

    def test_saving_the_sale_again_updates_one_bill_and_keeps_what_finance_added(self):
        self.post()
        bill_id = self.bills()[0]["id"]
        self.db.fin_transactions.rows[0]["bill_no"] = "S-77"  # typed in Finance
        self.post(a_sale(sale_price=110000, total_amount=110000, sale_date="2026-11-18"))
        (bill,) = self.bills()
        self.assertEqual((bill["id"], bill["amount"], bill["bill_date"], bill["bill_no"]), (bill_id, 110000, "2026-11-18", "S-77"))
        (debt,) = self.debts()
        self.assertEqual((debt["amount"], debt["entry_date"]), (110000, "2026-11-18"))
        self.assertEqual(len(self.db.fin_parties.rows), 1)

    def test_extra_charges_are_part_of_what_the_customer_owes(self):
        self.post(a_sale(sale_price=100000, total_amount=108000))
        self.assertEqual(self.bills()[0]["amount"], 108000)

    def test_no_customer_posts_nothing_and_takes_back_an_earlier_bill(self):
        self.post(a_sale(customer_id=None), customer=None)
        self.assertEqual((self.bills(), self.debts(), self.db.fin_parties.rows), ([], [], []))
        self.post()
        self.assertEqual(len(self.bills()), 1)
        self.post(a_sale(customer_id=None), customer=None)  # the customer was taken off the sale
        self.assertEqual((self.bills(), self.debts()), ([], []))

    def test_a_returned_sale_is_billed_for_what_the_shop_kept(self):
        self.post()
        self.post(a_sale(returned=True, refund_amount=95000, retained_amount=5000))
        (bill,) = self.bills()
        self.assertEqual(bill["amount"], 5000)
        self.assertTrue(bill["note"].endswith("(returned)"))
        self.assertEqual(self.debts()[0]["amount"], 5000)
        # nothing kept: nothing owed, so the bill goes
        self.post(a_sale(returned=True, refund_amount=100000, retained_amount=0))
        self.assertEqual((self.bills(), self.debts()), ([], []))
        # the return is undone: back to the full amount
        self.post(a_sale(returned=False, retained_amount=None))
        self.assertEqual((self.bills()[0]["amount"], self.debts()[0]["amount"]), (100000, 100000))

    def test_a_deleted_sale_takes_its_bill_and_debt_with_it_but_not_other_entries(self):
        self.post()
        self.db.fin_customer_ledger.rows.append({"id": "pay", "customer_id": self.bills()[0]["customer_id"], "entry_type": "credit",
                                                 "amount": 40000, "source": "manual", "source_type": None, "source_id": None})
        run(finance_books.remove_sale_bill(self.db, "s1"))
        self.assertEqual((self.bills(), self.debts()), ([], []))
        self.assertEqual([e["id"] for e in self.db.fin_customer_ledger.rows], ["pay"])  # a payment received stays
        run(finance_books.remove_sale_bill(self.db, "s1"))  # nothing left: not an error

    def test_two_sales_to_one_customer_are_two_bills_on_one_ledger(self):
        self.post(a_sale(id="s1"))
        self.post(a_sale(id="s2", sale_price=50000, total_amount=50000))
        self.assertEqual(sorted(b["amount"] for b in self.bills()), [50000, 100000])
        self.assertEqual(len(self.db.fin_parties.rows), 1)

    def test_a_very_long_address_is_cut_to_what_the_bill_can_hold(self):
        self.post(customer={**RAMJI, "address": "H" * 500})
        self.assertEqual(len(self.bills()[0]["party_address"]), 300)
        self.assertEqual(len(self.db.fin_parties.rows[0]["address"]), 300)

    def test_a_problem_in_the_finance_books_never_stops_the_sale(self):
        class Broken:
            def __getattr__(self, name):
                raise RuntimeError("the finance tables are not there")
        run(finance_books.sync_sale_bill(Broken(), a_sale(), RAMJI, "x"))  # must not raise

    def test_reading_the_books_afterwards_does_not_duplicate_the_party(self):
        self.post()
        from fastapi import APIRouter, FastAPI
        from fastapi.testclient import TestClient
        router = APIRouter(prefix="/api")

        async def admin_only():
            return {"company_id": "c1"}

        finance_books.register(router, self.db, admin_only)
        app = FastAPI()
        app.include_router(router)
        self.db.customers.rows.append(dict(RAMJI))
        books = TestClient(app).get("/api/fin/books").json()
        self.assertEqual([p["name"] for p in books["parties"]], ["Ramji Prasad Ghimire"])
        self.assertEqual(len(books["transactions"]), 1)
        self.assertEqual(len(books["customer_ledger"]), 1)


def a_booking(**over):
    booking = {"id": "b1", "customer_id": "c1", "vehicle_id": "v1", "status": "active", "booking_amount": 50000,
               "payment_method": "Cash", "booking_date": "2026-11-10", "receipt_no": 19}
    booking.update(over)
    return booking


class BookingEntryTests(unittest.TestCase):
    """A booking's deposit on the customer's Finance Ledger (finance_books.sync_booking_entries)."""

    def setUp(self):
        self.db = _DB()

    def post(self, booking=None, customer=RAMJI, label="Honda Dio 2026 (064/1606)"):
        run(finance_books.sync_booking_entries(self.db, booking or a_booking(), customer, label))

    def rows(self, source_type):
        return [e for e in self.db.fin_customer_ledger.rows if e.get("source_type") == source_type]

    def net(self):
        """What the customer owes after everything on the ledger: debits less credits (negative = we owe them)."""
        return sum(e["amount"] if e["entry_type"] == "debit" else -e["amount"] for e in self.db.fin_customer_ledger.rows)

    def kept_bills(self):
        return [t for t in self.db.fin_transactions.rows if t.get("source_type") == finance_books.BOOKING_KEPT_SOURCE]

    def test_the_deposit_is_a_received_entry_on_the_customers_ledger(self):
        self.post()
        (dep,) = self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)
        (party,) = self.db.fin_parties.rows
        self.assertEqual((dep["customer_id"], dep["entry_type"], dep["amount"], dep["entry_date"], dep["receipt_no"]),
                         (party["id"], "credit", 50000, "2026-11-10", "19"))
        self.assertEqual(dep["source"], "manual")  # reads like any Received entry in Finance
        self.assertEqual(dep["note"], "Booking deposit · Honda Dio 2026 (064/1606) · Cash")
        self.assertIsNone(dep["bank_account_id"])
        self.assertEqual(self.net(), -50000)  # the customer has paid in advance

    def test_no_deposit_or_no_customer_posts_nothing(self):
        self.post(a_booking(booking_amount=0))
        self.assertEqual(self.db.fin_customer_ledger.rows, [])
        self.post(a_booking(), customer=None)
        self.assertEqual((self.db.fin_customer_ledger.rows, self.db.fin_parties.rows), ([], []))

    def test_editing_the_booking_updates_the_same_entry_and_zero_removes_it(self):
        self.post(a_booking(booking_amount=0))
        self.post(a_booking(booking_amount=20000))
        (dep,) = self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)
        entry_id = dep["id"]
        self.post(a_booking(booking_amount=30000, booking_date="2026-11-12"))
        (dep,) = self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)
        self.assertEqual((dep["id"], dep["amount"], dep["entry_date"]), (entry_id, 30000, "2026-11-12"))
        self.post(a_booking(booking_amount=0))
        self.assertEqual(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE), [])

    def test_a_bank_transfer_goes_to_the_bank_account_when_there_is_only_one(self):
        self.db.fin_bank_accounts.rows.append({"id": "bank1", "name": "Nabil"})
        self.post(a_booking(payment_method="Bank Transfer"))
        self.assertEqual(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)[0]["bank_account_id"], "bank1")
        self.post(a_booking(payment_method="Cash"))
        self.assertIsNone(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)[0]["bank_account_id"])
        self.db.fin_bank_accounts.rows.append({"id": "bank2", "name": "Global IME"})  # two to choose from: cash in hand
        self.post(a_booking(payment_method="Bank Transfer"))
        self.assertIsNone(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)[0]["bank_account_id"])

    def test_cancelling_pays_the_refund_back_and_books_what_was_kept_so_the_ledger_balances(self):
        self.post()
        self.post(a_booking(status="cancelled", cancelled_at="2026-11-20T08:00:00+00:00", refund_amount=45000, retained_amount=5000))
        (refund,) = self.rows(finance_books.BOOKING_REFUND_SOURCE)
        self.assertEqual((refund["entry_type"], refund["amount"], refund["entry_date"], refund["source"]), ("debit", 45000, "2026-11-20", "manual"))
        (kept,) = self.kept_bills()
        self.assertEqual((kept["type"], kept["amount"], kept["bill_date"], kept["payment_mode"]), ("sale", 5000, "2026-11-20", "credit"))
        self.assertEqual(kept["note"], "Booking cancelled: amount kept · Honda Dio 2026 (064/1606)")
        self.assertEqual(len(self.rows("business_transaction")), 1)      # the debt the kept bill books
        self.assertEqual(len(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)), 1)  # the deposit stays: it was received
        self.assertEqual(self.net(), 0)                                  # 50,000 in, 45,000 back, 5,000 kept

    def test_cancelling_with_everything_refunded_or_everything_kept(self):
        self.post()
        self.post(a_booking(status="cancelled", cancelled_at="2026-11-20T08:00:00+00:00", refund_amount=50000, retained_amount=0))
        self.assertEqual((len(self.rows(finance_books.BOOKING_REFUND_SOURCE)), self.kept_bills(), self.net()), (1, [], 0))
        self.post(a_booking(status="cancelled", cancelled_at="2026-11-20T08:00:00+00:00", refund_amount=0, retained_amount=50000))
        self.assertEqual((self.rows(finance_books.BOOKING_REFUND_SOURCE), self.kept_bills()[0]["amount"], self.net()), ([], 50000, 0))

    def test_deleting_the_booking_takes_everything_it_posted_out(self):
        self.post()
        self.post(a_booking(status="cancelled", cancelled_at="2026-11-20T08:00:00+00:00", refund_amount=45000, retained_amount=5000))
        self.db.fin_customer_ledger.rows.append({"id": "mine", "customer_id": "x", "entry_type": "credit", "amount": 1,
                                                 "source": "manual", "source_type": None, "source_id": None})
        run(finance_books.remove_booking_entries(self.db, "b1"))
        self.assertEqual([e["id"] for e in self.db.fin_customer_ledger.rows], ["mine"])
        self.assertEqual(self.db.fin_transactions.rows, [])
        run(finance_books.remove_booking_entries(self.db, "b1"))  # nothing left: not an error

    def test_a_sale_made_from_the_booking_keeps_the_deposit_and_bills_the_rest(self):
        self.post()
        self.post(a_booking(status="converted", sale_id="s1"))
        self.assertEqual(len(self.rows(finance_books.BOOKING_DEPOSIT_SOURCE)), 1)
        run(finance_books.sync_sale_bill(self.db, a_sale(total_amount=160000, sale_price=160000), RAMJI, "Honda Dio 2026 (064/1606)"))
        self.assertEqual(self.net(), 110000)  # sale 160,000 less the 50,000 already paid

    def test_the_booking_and_the_sale_share_one_party_for_the_customer(self):
        self.post()
        run(finance_books.sync_sale_bill(self.db, a_sale(), RAMJI, ""))
        self.assertEqual(len(self.db.fin_parties.rows), 1)

    def test_a_problem_in_the_finance_books_never_stops_the_booking(self):
        class Broken:
            def __getattr__(self, name):
                raise RuntimeError("the finance tables are not there")
        run(finance_books.sync_booking_entries(Broken(), a_booking(), RAMJI, "x"))  # must not raise

    def test_the_result_says_what_happened_so_the_page_can_tell_the_user(self):
        sync = lambda b, c=RAMJI, db=None: run(finance_books.sync_booking_entries(db or self.db, b, c, "x"))  # noqa: E731
        self.assertEqual(sync(a_booking()), "posted")
        self.assertEqual(sync(a_booking(booking_amount=0)), "nothing")      # no deposit: nothing on the ledger now
        self.assertEqual(sync(a_booking(), c=None), "nothing")              # no customer
        self.assertEqual(sync(a_booking(status="cancelled", refund_amount=50000, retained_amount=0, cancelled_at="2026-11-20T00:00:00+00:00")), "posted")

        class Broken:
            def __getattr__(self, name):
                raise RuntimeError("the finance tables are not there")
        failed = sync(a_booking(), db=Broken())
        self.assertTrue(failed.startswith("failed: RuntimeError: the finance tables are not there"), failed)

    def test_a_sale_reports_the_same_way(self):
        sync = lambda s, c=RAMJI, db=None: run(finance_books.sync_sale_bill(db or self.db, s, c, "x"))  # noqa: E731
        self.assertEqual(sync(a_sale()), "posted")
        self.assertEqual(sync(a_sale(customer_id=None), c=None), "nothing")

        class Broken:
            def __getattr__(self, name):
                raise RuntimeError("boom")
        self.assertTrue(sync(a_sale(), db=Broken()).startswith("failed: RuntimeError: boom"))


if __name__ == "__main__":
    unittest.main()
