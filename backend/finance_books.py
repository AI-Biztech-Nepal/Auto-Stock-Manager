"""Finance books: parties, two ledgers, bills, expenses, bank accounts and statement import.

A port of the FINANCE project's rules (finance-port/FINANCE-SPEC.md), with its database
triggers rewritten as plain code so they run on MySQL:

  * A sale or purchase BILL is not money. Against a saved party it books a debt on that party's
    ledger (sale -> customer ledger debit, purchase -> vendor ledger debit); the cash arrives later
    as its own payment entry. An EXPENSE is paid on the spot.
  * Cash in hand is bank_account_id = null. There is no "cash" account row.
  * Ledger rows written by a bill (source = "booking") are read-only here; change the bill.
  * Statement lines are remembered by the bank's reference code so a re-import cannot double-count.

Rent, services on bills and the Cash account's details come from the FINANCE-NEPAL project's
later migrations and live in migration_add_finance_rent.sql:

  * RENT: a vehicle given out by the day. The renter owes the daily rate for every day it is out
    (the day it went out and the day it came back both count). Those days are written onto the
    renter's customer ledger as read-only "Daily rent" debits (source = "booking", source_type =
    "rental_rent"), kept in step whenever a rental changes and caught up to today whenever the books
    are read; the renter pays them as ordinary Received entries.

The tables are created by migration_add_finance_books.sql and migration_add_finance_rent.sql,
which are run by hand -- nothing in this module creates or alters a table. Until they have been run,
every endpoint answers 503 with a clear message and the Finance screens show a "not set up yet" notice.
"""
import asyncio
import functools
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

SETUP_MESSAGE = ("Finance books are not set up yet. Run backend/migration_add_finance_books.sql "
                 "on the database once, then reload this page.")

UPGRADE_MESSAGE = ("Rent and bill services need one more database update, which the server applies when it starts "
                   "and could not. Run backend/migration_add_finance_rent.sql on the database once, then reload this page.")

RENT_SOURCE = "rental_rent"
_RENT_NS = uuid.UUID("5b0c6a4e-8f3a-4c57-9f0e-2a6c1d7b9e10")
_rent_lock = asyncio.Lock()

# ── the second half's schema, applied at start-up ─────────────────────────
# Same idempotent pattern server.py uses for its other post-schema additions (CREATE TABLE IF NOT EXISTS,
# ADD COLUMN IF NOT EXISTS), so no step is left to do by hand. migration_add_finance_rent.sql is the same
# statements for running by hand if the database user may not alter tables. Every statement is additive and a
# failure only logs a warning: Finance keeps working without Rent / services (see ensure_schema).
RENT_DDL = [
    "CREATE TABLE IF NOT EXISTS fin_rentals ("
    "id VARCHAR(36) NOT NULL PRIMARY KEY, company_id VARCHAR(36) NOT NULL, car VARCHAR(250) NOT NULL, "
    "model VARCHAR(150) NULL, customer_id VARCHAR(36) NULL, customer_name VARCHAR(200) NULL, "
    "start_date VARCHAR(20) NOT NULL, end_date VARCHAR(20) NULL, returned_on VARCHAR(20) NULL, "
    "rate_per_day DOUBLE NOT NULL DEFAULT 0, note VARCHAR(500) NULL, created_at VARCHAR(40), updated_at VARCHAR(40), "
    "INDEX idx_fin_rentals_company (company_id, start_date), "
    "CONSTRAINT fk_fin_rentals_company FOREIGN KEY (company_id) REFERENCES companies(id), "
    "CONSTRAINT fk_fin_rentals_party FOREIGN KEY (customer_id) REFERENCES fin_parties(id) ON DELETE SET NULL"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    "CREATE TABLE IF NOT EXISTS fin_cash_account ("
    "id VARCHAR(36) NOT NULL PRIMARY KEY, company_id VARCHAR(36) NOT NULL, name VARCHAR(150) NULL, "
    "bank_name VARCHAR(150) NULL, account_number VARCHAR(60) NULL, account_holder_name VARCHAR(150) NULL, "
    "address VARCHAR(300) NULL, updated_at VARCHAR(40), UNIQUE KEY uq_fin_cash_company (company_id), "
    "CONSTRAINT fk_fin_cash_company FOREIGN KEY (company_id) REFERENCES companies(id)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
]
# Services on sale / purchase bills: two columns on an existing table.
SERVICE_COLUMNS = (("installation_charge", "DOUBLE NOT NULL DEFAULT 0"), ("service_charges", "LONGTEXT NULL"))

# Whether fin_transactions can hold services. sqldb.TABLES only lists those two columns once they are known to
# exist (every read selects every listed column, so listing a missing one would break ALL of Finance). Starts
# True for a backend with no schema to check (the Mongo one, and the tests); ensure_schema decides for MySQL.
_services_ready = True


async def ensure_schema(db, registry=None):
    """Called once from server.py's start-up on MySQL. `db` is the real database object (execute_raw /
    fetch_raw). Creates what the Rent screen needs, adds the two service columns, and only then tells the SQL
    layer's table registry about them. Never raises: a database user that cannot alter tables simply leaves
    Rent and services off, and the rest of Finance exactly as it was."""
    global _services_ready
    if registry is None:
        import sqldb
        registry = sqldb.TABLES
    _services_ready = False
    for ddl in RENT_DDL:
        try:
            await db.execute_raw(ddl)
        except Exception:  # noqa: BLE001
            logger.warning("Could not ensure the Rent tables", exc_info=True)
    for col, kind in SERVICE_COLUMNS:
        try:
            await db.execute_raw(f"ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS {col} {kind}")
        except Exception:  # noqa: BLE001
            logger.warning("Could not ensure fin_transactions.%s", col, exc_info=True)
    try:
        rows = await db.fetch_raw("SELECT COLUMN_NAME FROM information_schema.COLUMNS "
                                  "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fin_transactions'")
        have = {r["COLUMN_NAME"] for r in rows}
    except Exception:  # noqa: BLE001
        logger.warning("Could not check fin_transactions' columns", exc_info=True)
        have = set()
    if all(col in have for col, _ in SERVICE_COLUMNS):
        meta = registry["fin_transactions"]
        meta["columns"].update(col for col, _ in SERVICE_COLUMNS)
        meta.setdefault("json_cols", set()).add("service_charges")
        _services_ready = True
    else:
        logger.warning("Finance services are off: fin_transactions has no installation_charge / service_charges columns")

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


def _today_np() -> str:
    """Today in Nepal -- the day rent is counted up to, whatever time zone the server runs in."""
    return datetime.now(ZoneInfo("Asia/Kathmandu")).date().isoformat()


def _date(v: Optional[str], what: str, required: bool = False) -> Optional[str]:
    v = (v or "").strip()
    if not v:
        if required:
            raise HTTPException(400, f"{what} is required")
        return None
    try:
        return date.fromisoformat(v[:10]).isoformat()
    except ValueError:
        raise HTTPException(400, f"{what} must be a date (YYYY-MM-DD)")


def _money(v, what: str) -> float:
    try:
        v = float(v or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, f"{what} must be a number")
    if v < 0:
        raise HTTPException(400, f"{what} cannot be negative")
    return round(v, 2)


def car_key(s: Optional[str]) -> str:
    """A vehicle's name as bills and payments compare it: trimmed, one space between words, lower case."""
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def rent_days(rental: dict, today: str) -> List[str]:
    """Every day a rental has been out, as YYYY-MM-DD: from the day it went out to the day it came back
    (or today while it is still out; never past today)."""
    try:
        start = date.fromisoformat(str(rental.get("start_date"))[:10])
        last = date.fromisoformat(min(str(rental.get("returned_on") or today)[:10], today))
    except ValueError:
        return []
    return [(start + timedelta(days=i)).isoformat() for i in range((last - start).days + 1)]


def _is_missing_table(e: Exception) -> bool:
    return "1146" in str(e) or "doesn't exist" in str(e)


def _safe(fn):
    """Turn "table doesn't exist" / "column doesn't exist" into a clear 503 instead of a 500."""
    @functools.wraps(fn)
    async def wrapper(*args, **kwargs):
        try:
            return await fn(*args, **kwargs)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            text = str(e)
            if _is_missing_table(e):
                # fin_rentals / fin_cash_account belong to the second migration.
                second = any(t in text for t in ("fin_rentals", "fin_cash_account"))
                raise HTTPException(503, UPGRADE_MESSAGE if second else SETUP_MESSAGE)
            if "1054" in text or "Unknown column" in text:
                raise HTTPException(503, UPGRADE_MESSAGE)
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


class ServiceLine(BaseModel):
    name: str = ""
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
    service_charges: List[ServiceLine] = Field(default_factory=list)  # sale / purchase only; part of `amount`


class RentalBody(BaseModel):
    car: str
    model: Optional[str] = None
    customer_id: Optional[str] = None
    start_date: str
    end_date: Optional[str] = None       # None keeps the due-back day a rental already has
    returned_on: Optional[str] = None
    rate_per_day: float = 0
    note: Optional[str] = None


class CashAccountBody(BaseModel):
    name: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_holder_name: Optional[str] = None
    address: Optional[str] = None


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

    async def _sync_rental_rent():
        """Make the renters' ledgers match their rentals: one "Daily rent" debit per rental per day it has
        been out, nothing for a rental with no renter or no rate. Lines no longer due (a rental removed or
        returned earlier, its renter or rate changed) go; changed ones are corrected; missing days are added.
        Idempotent, so it is safe to call on every write and every read."""
        async with _rent_lock:
            today = _today_np()
            wanted = {}
            for r in await _all(db.fin_rentals, "start_date"):
                rate = float(r.get("rate_per_day") or 0)
                if not r.get("customer_id") or not rate > 0:
                    continue
                for day in rent_days(r, today):
                    sid = str(uuid.uuid5(_RENT_NS, f"{r['id']}:{day}"))
                    wanted[sid] = {"customer_id": r["customer_id"], "amount": rate,
                                   "note": f"Daily rent · {r['car']}", "entry_date": day}
            ledger = db.fin_customer_ledger
            existing = await ledger.find({"source_type": RENT_SOURCE}, {"_id": 0}).to_list(1000000)
            kept, stale = set(), []
            for e in existing:
                w = wanted.get(e.get("source_id"))
                if not w or e["source_id"] in kept or e["customer_id"] != w["customer_id"]:
                    stale.append(e["id"])
                    continue
                kept.add(e["source_id"])
                changed = {k: w[k] for k in ("amount", "note", "entry_date") if e.get(k) != w[k]}
                if changed:
                    await ledger.update_one({"id": e["id"]}, {"$set": changed})
            for i in range(0, len(stale), 500):
                await ledger.delete_many({"id": {"$in": stale[i:i + 500]}})
            now = _now()
            missing = [{"id": _id(), "entry_type": "debit", "source": "booking", "source_type": RENT_SOURCE,
                        "source_id": sid, "bank_account_id": None, "receipt_no": None, "created_at": now, **w}
                       for sid, w in wanted.items() if sid not in kept]
            if missing:
                await ledger.insert_many(missing)

    async def _optional(coll, sort_field="created_at"):
        """A table from migration_add_finance_rent.sql: None until that migration has been run, so the
        rest of the books keep working in the meantime."""
        try:
            return await _all(coll, sort_field)
        except Exception as e:  # noqa: BLE001
            if _is_missing_table(e):
                return None
            raise

    # ── everything, in one read ────────────────────────────────────────────
    @api_router.get("/fin/books")
    @_safe
    async def fin_books(cu: dict = Depends(admin_only)):
        """All of the company's books at once. The screens compute balances from this one payload
        with a single shared money module, so two screens can never disagree."""
        rentals = await _optional(db.fin_rentals, "start_date")
        cash_rows = await _optional(db.fin_cash_account, "updated_at")
        if rentals:
            await _sync_rental_rent()  # catches up the days since the books were last read
        return {
            "parties": await _all(db.fin_parties, "name"),
            "accounts": await _all(db.fin_bank_accounts, "name"),
            "transfers": await _all(db.fin_account_transfers),
            "categories": await _all(db.fin_expense_categories, "name"),
            "items": await _all(db.fin_items, "name"),
            "transactions": await _all(db.fin_transactions),
            "customer_ledger": await _all(db.fin_customer_ledger),
            "vendor_ledger": await _all(db.fin_vendor_ledger),
            "rentals": rentals or [],
            "cash_account": (cash_rows or [None])[0],
            # False while the Rent tables / service columns are not in the database: the screens say so.
            "rent_ready": rentals is not None and cash_rows is not None,
            "services_ready": _services_ready,
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
        # Services (installation, repair, outsourced work ...) belong to sale and purchase bills only. They are
        # part of `amount` already, so the ledgers and every total that reads it follow without any change.
        services = []
        if body.type in ("sale", "purchase"):
            for line in body.service_charges:
                name, value = _clean(line.name), _money(line.amount, "A service amount")
                if name and value > 0:
                    services.append({"name": name, "amount": value})
        doc = {
            "type": body.type, "amount": amount, "note": _clean(body.note), "party_name": _clean(body.party_name),
            "customer_id": body.customer_id or None, "bill_no": _clean(body.bill_no), "bill_date": _clean(body.bill_date),
            "party_address": _clean(body.party_address), "vat_pan_no": _clean(body.vat_pan_no),
            "items": [i.model_dump() for i in body.items],
            "discount_amount": max(0.0, float(body.discount_amount or 0)), "vat_amount": max(0.0, float(body.vat_amount or 0)),
            "expense_category_id": body.expense_category_id or None, "payment_mode": mode, "bank_account_id": bank,
        }
        if _services_ready:
            doc.update({"service_charges": services, "installation_charge": round(sum(s["amount"] for s in services), 2)})
        elif services:
            # The columns are not there: say so rather than quietly saving the bill without its services.
            raise HTTPException(503, UPGRADE_MESSAGE)
        return doc

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

    # ── rent ───────────────────────────────────────────────────────────────
    async def _rental_doc(body: RentalBody, own_id: Optional[str] = None) -> dict:
        car = _clean(body.car)
        if not car:
            raise HTTPException(400, "Add the item that is rented out")
        start = _date(body.start_date, "The day it was rented", required=True)
        returned = _date(body.returned_on, "Returned on")
        if returned and returned < start:
            raise HTTPException(400, "It cannot come back before the day it was rented")
        party = await _party_or_404(body.customer_id) if body.customer_id else None
        if not returned:
            # A vehicle is out with one renter at a time: one still out cannot be rented again.
            for r in await _all(db.fin_rentals, "start_date"):
                if r["id"] != own_id and not r.get("returned_on") and car_key(r["car"]) == car_key(car):
                    with_whom = f" with {r['customer_name']}" if r.get("customer_name") else ""
                    raise HTTPException(409, f"{r['car']} is out{with_whom} since {r['start_date']}. "
                                             "Open that rental and set its Returned on date first.")
        return {"car": car, "model": _clean(body.model), "customer_id": party["id"] if party else None,
                "customer_name": party["name"] if party else None, "start_date": start, "returned_on": returned,
                "rate_per_day": _money(body.rate_per_day, "Rate per day"), "note": _clean(body.note)}

    @api_router.post("/fin/rentals")
    @_safe
    async def fin_create_rental(body: RentalBody, cu: dict = Depends(admin_only)):
        doc = await _rental_doc(body)
        now = _now()
        doc.update({"id": _id(), "end_date": _date(body.end_date, "Due back"), "created_at": now, "updated_at": now})
        await db.fin_rentals.insert_one(doc)
        doc.pop("_id", None)
        await _sync_rental_rent()
        return doc

    @api_router.put("/fin/rentals/{rid}")
    @_safe
    async def fin_update_rental(rid: str, body: RentalBody, cu: dict = Depends(admin_only)):
        existing = await db.fin_rentals.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Rental not found")
        doc = await _rental_doc(body, own_id=rid)
        doc["end_date"] = _date(body.end_date, "Due back") if body.end_date is not None else existing.get("end_date")
        doc["updated_at"] = _now()
        await db.fin_rentals.update_one({"id": rid}, {"$set": doc})
        await _sync_rental_rent()
        return {**existing, **doc}

    @api_router.delete("/fin/rentals/{rid}")
    @_safe
    async def fin_delete_rental(rid: str, cu: dict = Depends(admin_only)):
        """The renter's daily rent lines go with the rental; what they already paid stays."""
        if not await db.fin_rentals.find_one({"id": rid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Rental not found")
        await db.fin_rentals.delete_one({"id": rid})
        await _sync_rental_rent()
        return {"ok": True}

    # ── the Cash account's label and details ───────────────────────────────
    @api_router.put("/fin/cash-account")
    @_safe
    async def fin_save_cash_account(body: CashAccountBody, cu: dict = Depends(admin_only)):
        """Cash is never a bank account row (cash is bank_account_id = null), so its label and details are
        kept in one row of their own and shown on the Bank Accounts page like any other account."""
        doc = {"name": _clean(body.name), "bank_name": _clean(body.bank_name), "account_number": _clean(body.account_number),
               "account_holder_name": _clean(body.account_holder_name), "address": _clean(body.address),
               "updated_at": _now()}
        existing = await db.fin_cash_account.find_one({}, {"_id": 0})
        if existing:
            await db.fin_cash_account.update_one({"id": existing["id"]}, {"$set": doc})
            return {**existing, **doc}
        doc["id"] = _id()
        await db.fin_cash_account.insert_one(doc)
        doc.pop("_id", None)
        return doc
