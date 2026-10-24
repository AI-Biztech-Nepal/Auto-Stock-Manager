"""Finance books: parties, two ledgers, bills, expenses, bank accounts and statement import.

A port of the FINANCE project's rules (finance-port/FINANCE-SPEC.md), with its database
triggers rewritten as plain code so they run on MySQL:

  * A sale or purchase BILL is not money. Against a saved party it books a debt on that party's
    ledger (sale -> customer ledger debit, purchase -> vendor ledger debit); the cash arrives later
    as its own payment entry. An EXPENSE is paid on the spot.
  * Cash in hand is bank_account_id = null. There is no "cash" account row.
  * Ledger rows written by a bill (source = "booking") are read-only here; change the bill.
  * Statement lines are remembered by the bank's reference code so a re-import cannot double-count.

The tables are created by migration_add_finance_books.sql, which is run by hand -- nothing in this
module creates or alters a table. Until it has been run, every endpoint answers 503 with a clear
message and the Finance screens show a "not set up yet" notice.
"""
import functools
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

SETUP_MESSAGE = ("Finance books are not set up yet. Run backend/migration_add_finance_books.sql "
                 "on the database once, then reload this page.")

LEDGER_SIDES = {"customer": ("fin_customer_ledger", "customer_id"),
                "vendor": ("fin_vendor_ledger", "vendor_id")}
BILL_TYPES = {"sale", "purchase", "expense"}
STATEMENT_KINDS = {"expense", "in", "out", "withdraw", "deposit"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id() -> str:
    return str(uuid.uuid4())


def _clean(s: Optional[str]) -> Optional[str]:
    s = (s or "").strip()
    return s or None


def _phone(s: Optional[str]) -> Optional[str]:
    digits = re.sub(r"\D", "", s or "")
    return digits or None


def _amount(v) -> float:
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise HTTPException(400, "Amount must be a number")
    if not v > 0:
        raise HTTPException(400, "Amount must be greater than 0")
    return round(v, 2)


def _safe(fn):
    """Turn "table doesn't exist" into a clear 503 instead of a 500."""
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            text = str(e)
            if "1146" in text or "doesn't exist" in text:
                raise HTTPException(503, SETUP_MESSAGE)
            raise
    return wrapper


# ── request bodies ────────────────────────────────────────────────────────
class PartyBody(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None


class AccountBody(BaseModel):
    name: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder_name: Optional[str] = None
    address: Optional[str] = None


class TransferBody(BaseModel):
    from_account_id: Optional[str] = None  # null = cash in hand
    to_account_id: Optional[str] = None
    amount: float
    note: Optional[str] = None
    transfer_date: str


class CategoryBody(BaseModel):
    name: str


class ItemBody(BaseModel):
    name: str
    rate: Optional[float] = None


class LineItem(BaseModel):
    description: str = ""
    qty: float = 0
    rate: float = 0
    amount: float = 0


class BillBody(BaseModel):
    type: str
    amount: float
    note: Optional[str] = None
    party_name: Optional[str] = None
    customer_id: Optional[str] = None
    bill_no: Optional[str] = None
    bill_date: Optional[str] = None
    party_address: Optional[str] = None
    vat_pan_no: Optional[str] = None
    items: List[LineItem] = Field(default_factory=list)
    discount_amount: float = 0
    vat_amount: float = 0
    expense_category_id: Optional[str] = None
    payment_mode: Optional[str] = None
    bank_account_id: Optional[str] = None


class LedgerBody(BaseModel):
    party_id: str
    entry_type: str = "credit"
    amount: float
    note: Optional[str] = None
    bank_account_id: Optional[str] = None
    entry_date: Optional[str] = None
    receipt_no: Optional[str] = None


class LedgerEdit(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None
    bank_account_id: Optional[str] = None
    entry_date: Optional[str] = None
    receipt_no: Optional[str] = None
    clear_bank_account: bool = False


class StatementRow(BaseModel):
    reference: str
    kind: str
    amount: float
    entry_date: Optional[str] = None
    party: Optional[str] = None
    category: Optional[str] = None
    note: Optional[str] = None


class StatementCommit(BaseModel):
    bank_account_id: Optional[str] = None
    rows: List[StatementRow]


class StatementCheck(BaseModel):
    references: List[str]


def register(api_router, db, admin_only):
    """Attach the /fin/* routes. `db` is the company-scoped database wrapper from server.py."""

    async def _party_or_404(pid: Optional[str]) -> dict:
        p = await db.fin_parties.find_one({"id": pid}, {"_id": 0}) if pid else None
        if not p:
            raise HTTPException(404, "Party not found")
        return p

    async def _account_ok(aid: Optional[str]) -> Optional[str]:
        if not aid:
            return None
        if not await db.fin_bank_accounts.find_one({"id": aid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Bank account not found")
        return aid

    async def _all(coll, sort_field="created_at") -> list:
        return await coll.find({}, {"_id": 0}).sort(sort_field, 1).to_list(100000)

    async def _sync_bill_ledger(t: dict):
        """Keep the debt a bill books in step with the bill (what the original triggers did)."""
        for coll, field, kind in ((db.fin_customer_ledger, "customer_id", "sale"),
                                  (db.fin_vendor_ledger, "vendor_id", "purchase")):
            existing = await coll.find_one({"source_type": "business_transaction", "source_id": t["id"]}, {"_id": 0})
            if t["type"] == kind and t.get("customer_id") and (t.get("amount") or 0) > 0:
                fields = {field: t["customer_id"], "amount": t["amount"], "note": t.get("note"),
                          "entry_date": t.get("bill_date")}
                if existing:
                    await coll.update_one({"id": existing["id"]}, {"$set": fields})
                else:
                    await coll.insert_one({"id": _id(), "entry_type": "debit", "source": "booking",
                                           "source_type": "business_transaction", "source_id": t["id"],
                                           "bank_account_id": None, "receipt_no": None, "created_at": _now(), **fields})
            elif existing:
                await coll.delete_one({"id": existing["id"]})

    # ── everything, in one read ────────────────────────────────────────────
    @api_router.get("/fin/books")
    @_safe
    async def fin_books(cu: dict = Depends(admin_only)):
        """All of the company's books at once. The screens compute balances from this one payload
        with a single shared money module, so two screens can never disagree."""
        return {
            "parties": await _all(db.fin_parties, "name"),
            "accounts": await _all(db.fin_bank_accounts, "name"),
            "transfers": await _all(db.fin_account_transfers),
            "categories": await _all(db.fin_expense_categories, "name"),
            "items": await _all(db.fin_items, "name"),
            "transactions": await _all(db.fin_transactions),
            "customer_ledger": await _all(db.fin_customer_ledger),
            "vendor_ledger": await _all(db.fin_vendor_ledger),
        }

    # ── parties ────────────────────────────────────────────────────────────
    @api_router.post("/fin/parties")
    @_safe
    async def fin_create_party(body: PartyBody, cu: dict = Depends(admin_only)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Name is required")
        phone = _phone(body.phone)
        if phone:
            dup = await db.fin_parties.find_one({"phone": phone}, {"_id": 0})
            if dup:
                raise HTTPException(409, f"{dup['name']} already has this phone number")
        now = _now()
        doc = {"id": _id(), "name": name, "phone": phone, "address": _clean(body.address),
               "created_at": now, "updated_at": now}
        await db.fin_parties.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.put("/fin/parties/{pid}")
    @_safe
    async def fin_update_party(pid: str, body: PartyBody, cu: dict = Depends(admin_only)):
        await _party_or_404(pid)
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Name is required")
        phone = _phone(body.phone)
        if phone:
            dup = await db.fin_parties.find_one({"phone": phone, "id": {"$ne": pid}}, {"_id": 0})
            if dup:
                raise HTTPException(409, f"{dup['name']} already has this phone number")
        await db.fin_parties.update_one({"id": pid}, {"$set": {
            "name": name, "phone": phone, "address": _clean(body.address), "updated_at": _now()}})
        return await db.fin_parties.find_one({"id": pid}, {"_id": 0})

    @api_router.delete("/fin/parties/{pid}")
    @_safe
    async def fin_delete_party(pid: str, cu: dict = Depends(admin_only)):
        """The party's whole ledger goes with them; bills keep their typed party_name."""
        await _party_or_404(pid)
        await db.fin_customer_ledger.delete_many({"customer_id": pid})
        await db.fin_vendor_ledger.delete_many({"vendor_id": pid})
        await db.fin_transactions.update_many({"customer_id": pid}, {"$set": {"customer_id": None}})
        await db.fin_parties.delete_one({"id": pid})
        return {"ok": True}

    # ── bank accounts + transfers ──────────────────────────────────────────
    async def _account_name_free(name: str, exclude: Optional[str] = None):
        for a in await db.fin_bank_accounts.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000):
            if a["id"] != exclude and (a["name"] or "").strip().lower() == name.lower():
                raise HTTPException(409, "You already have an account with this name")

    @api_router.post("/fin/accounts")
    @_safe
    async def fin_create_account(body: AccountBody, cu: dict = Depends(admin_only)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Account name is required")
        await _account_name_free(name)
        now = _now()
        doc = {"id": _id(), "name": name, "bank_name": _clean(body.bank_name), "account_number": _clean(body.account_number),
               "account_holder_name": _clean(body.account_holder_name), "address": _clean(body.address),
               "created_at": now, "updated_at": now}
        await db.fin_bank_accounts.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.put("/fin/accounts/{aid}")
    @_safe
    async def fin_update_account(aid: str, body: AccountBody, cu: dict = Depends(admin_only)):
        await _account_ok(aid)
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Account name is required")
        await _account_name_free(name, exclude=aid)
        await db.fin_bank_accounts.update_one({"id": aid}, {"$set": {
            "name": name, "bank_name": _clean(body.bank_name), "account_number": _clean(body.account_number),
            "account_holder_name": _clean(body.account_holder_name), "address": _clean(body.address), "updated_at": _now()}})
        return await db.fin_bank_accounts.find_one({"id": aid}, {"_id": 0})

    @api_router.delete("/fin/accounts/{aid}")
    @_safe
    async def fin_delete_account(aid: str, cu: dict = Depends(admin_only)):
        """Rows that used the account fall back to cash in hand (bank_account_id = null)."""
        await _account_ok(aid)
        for coll in (db.fin_transactions, db.fin_customer_ledger, db.fin_vendor_ledger):
            await coll.update_many({"bank_account_id": aid}, {"$set": {"bank_account_id": None}})
        await db.fin_account_transfers.delete_many({"$or": [{"from_account_id": aid}, {"to_account_id": aid}]})
        await db.fin_bank_accounts.delete_one({"id": aid})
        return {"ok": True}

    @api_router.post("/fin/transfers")
    @_safe
    async def fin_create_transfer(body: TransferBody, cu: dict = Depends(admin_only)):
        amount = _amount(body.amount)
        src, dst = await _account_ok(body.from_account_id), await _account_ok(body.to_account_id)
        if src == dst:
            raise HTTPException(400, "Choose two different accounts")
        doc = {"id": _id(), "from_account_id": src, "to_account_id": dst, "amount": amount,
               "note": _clean(body.note), "transfer_date": body.transfer_date, "created_at": _now()}
        await db.fin_account_transfers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.put("/fin/transfers/{tid}")
    @_safe
    async def fin_update_transfer(tid: str, body: TransferBody, cu: dict = Depends(admin_only)):
        if not await db.fin_account_transfers.find_one({"id": tid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Transfer not found")
        amount = _amount(body.amount)
        src, dst = await _account_ok(body.from_account_id), await _account_ok(body.to_account_id)
        if src == dst:
            raise HTTPException(400, "Choose two different accounts")
        await db.fin_account_transfers.update_one({"id": tid}, {"$set": {
            "from_account_id": src, "to_account_id": dst, "amount": amount,
            "note": _clean(body.note), "transfer_date": body.transfer_date}})
        return await db.fin_account_transfers.find_one({"id": tid}, {"_id": 0})

    @api_router.delete("/fin/transfers/{tid}")
    @_safe
    async def fin_delete_transfer(tid: str, cu: dict = Depends(admin_only)):
        await db.fin_account_transfers.delete_one({"id": tid})
        return {"ok": True}

    # ── expense categories + remembered bill items ─────────────────────────
    async def _category_name_free(name: str, exclude: Optional[str] = None):
        for c in await db.fin_expense_categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000):
            if c["id"] != exclude and (c["name"] or "").strip().lower() == name.lower():
                raise HTTPException(409, "This category already exists")

    @api_router.post("/fin/categories")
    @_safe
    async def fin_create_category(body: CategoryBody, cu: dict = Depends(admin_only)):
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Category name is required")
        await _category_name_free(name)
        now = _now()
        doc = {"id": _id(), "name": name, "created_at": now, "updated_at": now}
        await db.fin_expense_categories.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.put("/fin/categories/{cid}")
    @_safe
    async def fin_update_category(cid: str, body: CategoryBody, cu: dict = Depends(admin_only)):
        if not await db.fin_expense_categories.find_one({"id": cid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Category not found")
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Category name is required")
        await _category_name_free(name, exclude=cid)
        await db.fin_expense_categories.update_one({"id": cid}, {"$set": {"name": name, "updated_at": _now()}})
        return await db.fin_expense_categories.find_one({"id": cid}, {"_id": 0})

    @api_router.delete("/fin/categories/{cid}")
    @_safe
    async def fin_delete_category(cid: str, cu: dict = Depends(admin_only)):
        await db.fin_transactions.update_many({"expense_category_id": cid}, {"$set": {"expense_category_id": None}})
        await db.fin_expense_categories.delete_one({"id": cid})
        return {"ok": True}

    @api_router.post("/fin/items")
    @_safe
    async def fin_remember_item(body: ItemBody, cu: dict = Depends(admin_only)):
        """Remember a typed line-item name (and its latest rate) so the next bill can offer it."""
        name = _clean(body.name)
        if not name:
            raise HTTPException(400, "Item name is required")
        for it in await db.fin_items.find({}, {"_id": 0}).to_list(20000):
            if (it["name"] or "").strip() == name:
                await db.fin_items.update_one({"id": it["id"]}, {"$set": {"rate": body.rate, "updated_at": _now()}})
                return {**it, "rate": body.rate}
        now = _now()
        doc = {"id": _id(), "name": name, "rate": body.rate, "created_at": now, "updated_at": now}
        await db.fin_items.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ── bills and expenses ─────────────────────────────────────────────────
    async def _bill_doc(body: BillBody) -> dict:
        if body.type not in BILL_TYPES:
            raise HTTPException(400, "Type must be sale, purchase or expense")
        amount = _amount(body.amount)
        if body.customer_id:
            await _party_or_404(body.customer_id)
        bank = await _account_ok(body.bank_account_id)
        mode = body.payment_mode if body.payment_mode in ("cash", "bank", "credit") else ("bank" if bank else "cash")
        return {
            "type": body.type, "amount": amount, "note": _clean(body.note), "party_name": _clean(body.party_name),
            "customer_id": body.customer_id or None, "bill_no": _clean(body.bill_no), "bill_date": _clean(body.bill_date),
            "party_address": _clean(body.party_address), "vat_pan_no": _clean(body.vat_pan_no),
            "items": [i.model_dump() for i in body.items],
            "discount_amount": max(0.0, float(body.discount_amount or 0)), "vat_amount": max(0.0, float(body.vat_amount or 0)),
            "expense_category_id": body.expense_category_id or None, "payment_mode": mode, "bank_account_id": bank,
        }

    @api_router.post("/fin/transactions")
    @_safe
    async def fin_create_bill(body: BillBody, cu: dict = Depends(admin_only)):
        doc = await _bill_doc(body)
        now = _now()
        doc.update({"id": _id(), "source_type": None, "source_id": None, "created_at": now, "updated_at": now})
        await db.fin_transactions.insert_one(doc)
        doc.pop("_id", None)
        await _sync_bill_ledger(doc)
        return doc

    @api_router.put("/fin/transactions/{tid}")
    @_safe
    async def fin_update_bill(tid: str, body: BillBody, cu: dict = Depends(admin_only)):
        existing = await db.fin_transactions.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Entry not found")
        doc = await _bill_doc(body)
        doc["updated_at"] = _now()
        await db.fin_transactions.update_one({"id": tid}, {"$set": doc})
        merged = {**existing, **doc}
        await _sync_bill_ledger(merged)
        return merged

    @api_router.delete("/fin/transactions/{tid}")
    @_safe
    async def fin_delete_bill(tid: str, cu: dict = Depends(admin_only)):
        """Deleting a bill removes the debt it booked; payments already recorded survive."""
        await db.fin_customer_ledger.delete_many({"source_type": "business_transaction", "source_id": tid})
        await db.fin_vendor_ledger.delete_many({"source_type": "business_transaction", "source_id": tid})
        await db.fin_transactions.delete_one({"id": tid})
        return {"ok": True}

    # ── manual payments on the two ledgers ─────────────────────────────────
    def _side(side: str):
        if side not in LEDGER_SIDES:
            raise HTTPException(404, "Unknown ledger")
        table, field = LEDGER_SIDES[side]
        return getattr(db, table), field

    @api_router.post("/fin/ledger/{side}")
    @_safe
    async def fin_create_ledger_entry(side: str, body: LedgerBody, cu: dict = Depends(admin_only)):
        """Received (customer, credit) / Payment out (vendor, credit). A customer debit typed by hand
        is a refund paid out. Direction decides the table, which is the bug this design prevents."""
        coll, field = _side(side)
        if body.entry_type not in ("credit", "debit"):
            raise HTTPException(400, "entry_type must be credit or debit")
        if side == "vendor" and body.entry_type != "credit":
            raise HTTPException(400, "Only payments out can be entered by hand on a vendor")
        await _party_or_404(body.party_id)
        doc = {"id": _id(), field: body.party_id, "entry_type": body.entry_type, "amount": _amount(body.amount),
               "note": _clean(body.note), "source": "manual", "source_type": None, "source_id": None,
               "bank_account_id": await _account_ok(body.bank_account_id), "entry_date": _clean(body.entry_date),
               "receipt_no": _clean(body.receipt_no), "created_at": _now()}
        await coll.insert_one(doc)
        doc.pop("_id", None)
        return doc

    async def _manual_entry(side: str, eid: str):
        coll, _ = _side(side)
        e = await coll.find_one({"id": eid}, {"_id": 0})
        if not e:
            raise HTTPException(404, "Entry not found")
        if e.get("source") != "manual":
            raise HTTPException(403, "This was recorded by a bill. Change it on the bill, and this entry follows.")
        return coll, e

    @api_router.put("/fin/ledger/{side}/{eid}")
    @_safe
    async def fin_update_ledger_entry(side: str, eid: str, body: LedgerEdit, cu: dict = Depends(admin_only)):
        coll, _ = await _manual_entry(side, eid)
        upd = {}
        if body.amount is not None:
            upd["amount"] = _amount(body.amount)
        if body.note is not None:
            upd["note"] = _clean(body.note)
        if body.entry_date is not None:
            upd["entry_date"] = _clean(body.entry_date)
        if body.receipt_no is not None:
            upd["receipt_no"] = _clean(body.receipt_no)
        if body.clear_bank_account:
            upd["bank_account_id"] = None
        elif body.bank_account_id is not None:
            upd["bank_account_id"] = await _account_ok(body.bank_account_id)
        if upd:
            await coll.update_one({"id": eid}, {"$set": upd})
        return await coll.find_one({"id": eid}, {"_id": 0})

    @api_router.delete("/fin/ledger/{side}/{eid}")
    @_safe
    async def fin_delete_ledger_entry(side: str, eid: str, cu: dict = Depends(admin_only)):
        coll, _ = await _manual_entry(side, eid)
        await coll.delete_one({"id": eid})
        return {"ok": True}

    # ── bank statement import ──────────────────────────────────────────────
    @api_router.post("/fin/statement/check")
    @_safe
    async def fin_statement_check(body: StatementCheck, cu: dict = Depends(admin_only)):
        """Which of these reference codes have already been imported."""
        refs = [r for r in {(r or "").strip() for r in body.references} if r]
        if not refs:
            return {"known": []}
        found = await db.fin_statement_imports.find({"reference_code": {"$in": refs}}, {"_id": 0, "reference_code": 1}).to_list(len(refs))
        return {"known": [f["reference_code"] for f in found]}

    @api_router.post("/fin/statement/commit")
    @_safe
    async def fin_statement_commit(body: StatementCommit, cu: dict = Depends(admin_only)):
        """Write the reviewed lines. Expenses -> expense bills; payment in -> customer credit; payment
        out -> vendor credit; withdraw/deposit are the owner's own money moving, so only the marker is
        written. Parties and categories are matched by name (case-insensitive) and created once per
        name. Each line's marker is written in the same pass, so a failure part-way can be re-run."""
        bank = await _account_ok(body.bank_account_id)
        parties = {(p["name"] or "").strip().lower(): p for p in await db.fin_parties.find({}, {"_id": 0}).to_list(100000)}
        cats = {(c["name"] or "").strip().lower(): c for c in await db.fin_expense_categories.find({}, {"_id": 0}).to_list(10000)}
        known = set((await fin_statement_check(StatementCheck(references=[r.reference for r in body.rows]), cu))["known"])
        done, skipped = 0, 0

        async def party_for(name: Optional[str]) -> Optional[dict]:
            name = _clean(name)
            if not name:
                return None
            key = name.lower()
            if key not in parties:
                now = _now()
                doc = {"id": _id(), "name": name, "phone": None, "address": None, "created_at": now, "updated_at": now}
                await db.fin_parties.insert_one(doc)
                doc.pop("_id", None)
                parties[key] = doc
            return parties[key]

        async def category_for(name: Optional[str]) -> Optional[str]:
            name = _clean(name)
            if not name:
                return None
            key = name.lower()
            if key not in cats:
                now = _now()
                doc = {"id": _id(), "name": name, "created_at": now, "updated_at": now}
                await db.fin_expense_categories.insert_one(doc)
                doc.pop("_id", None)
                cats[key] = doc
            return cats[key]["id"]

        for row in body.rows:
            ref = row.reference.strip()
            if not ref or ref in known:
                skipped += 1
                continue
            if row.kind not in STATEMENT_KINDS:
                raise HTTPException(400, f"Unknown line type: {row.kind}")
            amount = _amount(row.amount)
            if row.kind == "expense":
                now = _now()
                await db.fin_transactions.insert_one({
                    "id": _id(), "type": "expense", "amount": amount, "note": _clean(row.note), "party_name": _clean(row.party),
                    "customer_id": None, "bill_no": None, "bill_date": _clean(row.entry_date), "party_address": None,
                    "vat_pan_no": None, "items": [], "discount_amount": 0, "vat_amount": 0,
                    "expense_category_id": await category_for(row.category), "payment_mode": "bank" if bank else "cash",
                    "bank_account_id": bank, "source_type": None, "source_id": None, "created_at": now, "updated_at": now})
            elif row.kind in ("in", "out"):
                party = await party_for(row.party)
                if not party:
                    raise HTTPException(400, f"Line {ref} needs a party name")
                side = "customer" if row.kind == "in" else "vendor"
                coll, field = _side(side)
                await coll.insert_one({"id": _id(), field: party["id"], "entry_type": "credit", "amount": amount,
                                       "note": _clean(row.note), "source": "manual", "source_type": None, "source_id": None,
                                       "bank_account_id": bank, "entry_date": _clean(row.entry_date), "receipt_no": None,
                                       "created_at": _now()})
            await db.fin_statement_imports.insert_one({"id": _id(), "reference_code": ref, "created_at": _now()})
            known.add(ref)
            done += 1
        return {"imported": done, "skipped": skipped}
