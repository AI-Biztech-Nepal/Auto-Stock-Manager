"""One-off: load the existing sales / expenses / vendor data into the new Finance books (fin_* tables).

DRY RUN BY DEFAULT -- it reads, prints what it WOULD create, and writes nothing. Pass --apply to write.
Safe to re-run: every row it creates carries source_type 'imported_*' + the old record's id, and a
record that is already imported is skipped, so running --apply twice does not double anything.

    cd ~/auto-stock-manager/backend
    venv/bin/python import_old_finance_data.py                 # preview
    venv/bin/python import_old_finance_data.py --apply         # write
    venv/bin/python import_old_finance_data.py --company <id>  # when there is more than one company

What goes where (the new books treat a BILL as a debt and a PAYMENT as the cash, so the import follows suit):
  customers / vendors / vehicle sellers  -> fin_parties (matched by phone, then exact name)
  sales                                  -> sale bill + customer-ledger debit, plus one credit for what was paid
                                            (total - still due). Returned sales are skipped and listed.
  vehicle purchases (purchase_price)     -> purchase bill + vendor-ledger debit (only when the seller is a saved party).
                                            Bought from an individual = paid on the spot (a matching payment), as the
                                            old app only ever treated VENDORS as owed money.
  vendor payments                        -> vendor-ledger credit
  vehicle expenses (expenses table)      -> expense (paid on the spot), category kept
NOT imported: spare-part purchase bills and job-card costs. Cash vs bank is not recorded on the old data
reliably, so every payment lands in cash in hand (bank_account_id = null); move them if you need to.
"""
import argparse
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
from sqldb import MySQLDatabase  # noqa: E402


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return str(uuid.uuid4())


def digits(s):
    return re.sub(r"\D", "", s or "") or None


def day(s):
    return (s or "")[:10] or None


def ts(d, fallback=None):
    """created_at for an imported row: the original date, so the books sort the way the business happened."""
    d = day(d)
    return f"{d}T00:00:00+00:00" if d else (fallback or now())


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write to the database (default: preview only)")
    ap.add_argument("--company", help="company id (needed only if there is more than one)")
    args = ap.parse_args()
    apply = args.apply

    db = MySQLDatabase()
    companies = await db.companies.find({}, {"_id": 0}).to_list(1000)
    if args.company:
        companies = [c for c in companies if c["id"] == args.company]
    if len(companies) != 1:
        print("Companies found:", [(c["id"], c.get("name")) for c in companies])
        sys.exit("Pass --company <id> to pick exactly one.")
    cid = companies[0]["id"]
    print(f"Company: {companies[0].get('name')} ({cid})   mode: {'APPLY' if apply else 'PREVIEW (nothing is written)'}\n")

    try:
        await db.fin_parties.find_one({"company_id": cid}, {"_id": 0, "id": 1})
    except Exception as e:  # noqa: BLE001
        sys.exit(f"Finance tables are not set up ({e}). Run migration_add_finance_books.sql first.")

    def F(**kw):
        return {"company_id": cid, **kw}

    customers = {c["id"]: c for c in await db.customers.find(F(), {"_id": 0}).to_list(100000)}
    vendors = {v["id"]: v for v in await db.vendors.find(F(), {"_id": 0}).to_list(100000)}
    sales = await db.sales.find(F(), {"_id": 0}).to_list(100000)
    vehicles = {v["id"]: v for v in await db.vehicles.find(F(), {"_id": 0}).to_list(100000)}
    expenses = await db.expenses.find(F(), {"_id": 0}).to_list(100000)
    vpay = await db.vendor_payments.find(F(), {"_id": 0}).to_list(100000)

    # ── parties ─────────────────────────────────────────────────────────
    parties = await db.fin_parties.find(F(), {"_id": 0}).to_list(100000)
    by_phone = {digits(p.get("phone")): p["id"] for p in parties if digits(p.get("phone"))}
    by_name = {(p.get("name") or "").strip().lower(): p["id"] for p in parties}
    party_for = {}      # ("customer"|"vendor", old id) -> fin_parties id
    new_parties = 0

    async def party(kind, old):
        nonlocal new_parties
        key = (kind, old["id"])
        if key in party_for:
            return party_for[key]
        phone = digits(old.get("contact_number") if kind == "customer" else old.get("phone"))
        name = (old.get("name") or "").strip()
        pid = (by_phone.get(phone) if phone else None) or by_name.get(name.lower())
        if not pid:
            pid = uid()
            new_parties += 1
            by_name[name.lower()] = pid
            if phone:
                by_phone[phone] = pid
            if apply:
                await db.fin_parties.insert_one({"id": pid, "company_id": cid, "name": name or "Unnamed", "phone": phone,
                                                 "address": old.get("address"), "created_at": now(), "updated_at": now()})
        party_for[key] = pid
        return pid

    async def exists(coll, source_type, source_id):
        return await coll.find_one(F(source_type=source_type, source_id=source_id), {"_id": 0, "id": 1})

    stats = {k: [0, 0.0] for k in ("sales", "sale_payments", "purchases", "paid_at_purchase", "vendor_payments", "expenses")}
    skipped = []

    async def bill(kind, source_type, source_id, amount, date, party_id, party_name, note, category_id=None):
        tid = uid()
        if apply:
            await db.fin_transactions.insert_one({
                "id": tid, "company_id": cid, "type": kind, "amount": round(amount, 2), "note": note, "party_name": party_name,
                "customer_id": party_id, "bill_no": None, "bill_date": day(date), "party_address": None, "vat_pan_no": None,
                "items": [], "discount_amount": 0, "vat_amount": 0, "expense_category_id": category_id,
                "payment_mode": "cash", "bank_account_id": None, "source_type": source_type, "source_id": source_id,
                "created_at": ts(date), "updated_at": now()})
            if party_id and kind in ("sale", "purchase"):
                coll = db.fin_customer_ledger if kind == "sale" else db.fin_vendor_ledger
                field = "customer_id" if kind == "sale" else "vendor_id"
                await coll.insert_one({"id": uid(), "company_id": cid, field: party_id, "entry_type": "debit",
                                       "amount": round(amount, 2), "note": note, "source": "booking",
                                       "source_type": "business_transaction", "source_id": tid, "bank_account_id": None,
                                       "entry_date": day(date), "receipt_no": None, "created_at": ts(date)})
        return tid

    async def credit(side, party_id, source_type, source_id, amount, date, note):
        if apply:
            coll = db.fin_customer_ledger if side == "customer" else db.fin_vendor_ledger
            field = "customer_id" if side == "customer" else "vendor_id"
            await coll.insert_one({"id": uid(), "company_id": cid, field: party_id, "entry_type": "credit",
                                   "amount": round(amount, 2), "note": note, "source": "manual",
                                   "source_type": source_type, "source_id": source_id, "bank_account_id": None,
                                   "entry_date": day(date), "receipt_no": None, "created_at": ts(date)})

    # ── sales ───────────────────────────────────────────────────────────
    for s in sales:
        if s.get("returned"):
            skipped.append(f"returned sale {s['id'][:8]} ({s.get('sale_date')}, Rs {s.get('total_amount')}) -- review by hand")
            continue
        total = float(s.get("total_amount") or 0)
        if total <= 0:
            continue
        if await exists(db.fin_transactions, "imported_sale", s["id"]):
            continue
        cust = customers.get(s.get("customer_id"))
        pid = await party("customer", cust) if cust else None
        v = vehicles.get(s.get("vehicle_id")) or {}
        label = " ".join(str(x) for x in (v.get("brand"), v.get("model"), v.get("registration_number")) if x) or "Vehicle sale"
        await bill("sale", "imported_sale", s["id"], total, s.get("sale_date"), pid, cust.get("name") if cust else None, label)
        stats["sales"][0] += 1
        stats["sales"][1] += total
        paid = round(total - float(s.get("due_amount") or 0), 2)
        if pid and paid > 0:
            await credit("customer", pid, "imported_sale", s["id"], paid, s.get("sale_date"), f"Paid at sale · {label}")
            stats["sale_payments"][0] += 1
            stats["sale_payments"][1] += paid

    # ── vehicle purchases from a saved seller ───────────────────────────
    for v in vehicles.values():
        price = float(v.get("purchase_price") or 0)
        if price <= 0:
            continue
        seller, kind = None, None
        if v.get("linked_contact_id"):
            if v.get("linked_contact_type") == "customer":
                seller, kind = customers.get(v["linked_contact_id"]), "customer"
            else:
                seller, kind = vendors.get(v["linked_contact_id"]), "vendor"
        if not seller and v.get("vendor_id"):
            seller, kind = vendors.get(v["vendor_id"]), "vendor"
        if not seller:
            continue  # no saved seller -> no ledger to book a debt on
        if await exists(db.fin_transactions, "imported_purchase", v["id"]):
            continue
        pid = await party(kind, seller)
        label = " ".join(str(x) for x in (v.get("brand"), v.get("model"), v.get("registration_number")) if x) or "Vehicle"
        await bill("purchase", "imported_purchase", v["id"], price, v.get("purchase_date") or v.get("created_at"), pid,
                   seller.get("name"), f"Purchase · {label}")
        stats["purchases"][0] += 1
        stats["purchases"][1] += price
        if kind == "customer":
            # Bought from an individual: the old app never treated that as a debt (only vendors have a
            # payable), so book it as paid on the spot -- the bill and its payment cancel out.
            await credit("vendor", pid, "imported_purchase", v["id"], price, v.get("purchase_date") or v.get("created_at"),
                         f"Paid at purchase · {label}")
            stats["paid_at_purchase"][0] += 1
            stats["paid_at_purchase"][1] += price

    # ── vendor payments ─────────────────────────────────────────────────
    for p in vpay:
        amt = float(p.get("amount") or 0)
        ven = vendors.get(p.get("vendor_id"))
        if amt <= 0 or not ven:
            continue
        if await exists(db.fin_vendor_ledger, "imported_vendor_payment", p["id"]):
            continue
        pid = await party("vendor", ven)
        await credit("vendor", pid, "imported_vendor_payment", p["id"], amt, p.get("payment_date"), p.get("notes") or "Vendor payment")
        stats["vendor_payments"][0] += 1
        stats["vendor_payments"][1] += amt

    # ── vehicle expenses ────────────────────────────────────────────────
    cats = {c["name"].lower(): c["id"] for c in await db.fin_expense_categories.find(F(), {"_id": 0}).to_list(10000)}
    for e in expenses:
        amt = float(e.get("amount") or 0)
        if amt <= 0:
            continue
        if await exists(db.fin_transactions, "imported_expense", e["id"]):
            continue
        name = (e.get("category") or "Vehicle expense").strip() or "Vehicle expense"
        cat_id = cats.get(name.lower())
        if not cat_id:
            cat_id = uid()
            cats[name.lower()] = cat_id
            if apply:
                await db.fin_expense_categories.insert_one({"id": cat_id, "company_id": cid, "name": name,
                                                            "created_at": now(), "updated_at": now()})
        v = vehicles.get(e.get("vehicle_id")) or {}
        label = " ".join(str(x) for x in (v.get("brand"), v.get("model"), v.get("registration_number")) if x)
        note = " · ".join(x for x in (e.get("description"), label) if x) or name
        await bill("expense", "imported_expense", e["id"], amt, e.get("date") or e.get("created_at"), None, None, note, cat_id)
        stats["expenses"][0] += 1
        stats["expenses"][1] += amt

    # ── report ──────────────────────────────────────────────────────────
    print(f"{'would create' if not apply else 'created'}:")
    print(f"  parties (new):          {new_parties}")
    for k, label in (("sales", "sale bills"), ("sale_payments", "customer payments"), ("purchases", "purchase bills"), ("paid_at_purchase", "  of which paid at buy"),
                     ("vendor_payments", "vendor payments"), ("expenses", "expenses")):
        n, amt = stats[k]
        print(f"  {label:<22} {n:>5}   Rs {amt:,.2f}")
    print("\nNot imported: spare-part purchase bills and job-card costs.")
    if skipped:
        print(f"\nSkipped ({len(skipped)}):")
        for line in skipped[:50]:
            print("  -", line)
        if len(skipped) > 50:
            print(f"  ... and {len(skipped) - 50} more")
    if not apply:
        print("\nNothing was written. Re-run with --apply to import.")


if __name__ == "__main__":
    asyncio.run(main())
