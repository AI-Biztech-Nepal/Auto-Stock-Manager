"""CRM: customers as leads -- how they found the shop, where they stand, who handles them, what was said and
what is due next.

Everything here is read from, and written to, the records the rest of the app already keeps (customers, sales,
bookings, team members), plus two small tables of its own: crm_interactions (calls, WhatsApp chats, visits and
notes) and crm_followups (what to do next, and when).

* A customer's *lead status* is New, Contacted, Interested, Converted or Lost. Converted is never typed in: it
  is what a customer is the moment they have a sale that still stands. A logged call, WhatsApp or visit moves a
  New lead to Contacted on its own.
* *Assigned To* is the Team member handling the customer. Recording a sale for them fills the sale's Sold By from
  it, and changing it later keeps the sale's Sold By in step (unless someone set Sold By to somebody else).
* Times are stored in UTC like the rest of the app; "today" is the shop's day in Nepal (UTC+5:45).

The analysis is plain functions over lists of rows, so it can be checked without a database; the endpoints only
fetch rows and call them (see register() at the bottom).
"""
import csv
import io
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

CRM_SOURCES = ("walk_in", "website", "facebook", "referral", "other")
CUSTOMER_SOURCE_FIELDS = {"source", "source_note", "referred_by_id"}
CUSTOMER_CRM_FIELDS = {"lead_status", "interested_vehicle", "assigned_to_id"}
LEAD_STATUSES = ("new", "contacted", "interested", "converted", "lost")
INTERACTION_KINDS = ("call", "whatsapp", "visit", "note", "followup", "other")
CONTACT_KINDS = ("call", "whatsapp", "visit", "followup")  # a real conversation: a New lead has now been Contacted
NPT = timezone(timedelta(hours=5, minutes=45))
UPCOMING_DAYS = 7
IMPORT_MAX_ROWS = 2000
IMPORT_MAX_BYTES = 5 * 1024 * 1024

db = None  # the company-scoped database, handed over by register()
_sale_revenue = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── small pure helpers ───────────────────────────────────────────────

def phone_key(phone) -> str:
    """Digits only, last 10: '+977 98-4123 4567' and '9841234567' are the same number."""
    digits = re.sub(r"\D", "", str(phone or ""))
    return digits[-10:] if len(digits) >= 10 else digits


def valid_phone(phone) -> bool:
    s = str(phone or "").strip()
    return bool(re.fullmatch(r"\+?[\d\s\-()]{7,20}", s)) and 7 <= len(re.sub(r"\D", "", s)) <= 15


def source_of(customer: Optional[dict]) -> Optional[str]:
    s = (customer or {}).get("source")
    return s if s in CRM_SOURCES else None


def latest_sale(sales: list) -> Optional[dict]:
    """A customer's most recent sale that still stands (not returned)."""
    live = [s for s in sales if not s.get("returned")]
    return max(live, key=lambda s: (s.get("sale_date") or "", s.get("created_at") or "")) if live else None


def vehicle_label(v: Optional[dict]) -> str:
    if not v: return ""
    return " ".join(str(x) for x in (v.get("brand"), v.get("model"), v.get("year")) if x).strip()


def effective_status(stored: Optional[str], purchases: int) -> str:
    """Converted follows the sales; every other status is whatever was last set (New if never set)."""
    if purchases > 0: return "converted"
    return stored if stored in LEAD_STATUSES and stored != "converted" else "new"


def parse_dt(value) -> str:
    """Any ISO date-time (a bare one is taken as Nepal time) -> normalised UTC ISO string."""
    s = str(value or "").strip()
    if not s: raise ValueError("empty")
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None: dt = dt.replace(tzinfo=NPT)
    return dt.astimezone(timezone.utc).isoformat()


def _dt(value) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def npt_date(value) -> Optional[date]:
    d = _dt(value)
    if d is None: return None
    if d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(NPT).date()


def day_bounds(d: date):
    lo = datetime(d.year, d.month, d.day, tzinfo=NPT).astimezone(timezone.utc)
    return lo, lo + timedelta(days=1)


def _as_date(s) -> Optional[date]:
    try:
        return date.fromisoformat(str(s)[:10]) if s else None
    except ValueError:
        return None


# ── the table of customers ───────────────────────────────────────────

def customer_rows(customers: list, sales: list, bookings: list, interactions=(), followups=(), vehicles=None) -> list:
    """The CRM table: every customer with how they found the shop, where they stand and what they have given it.

    `amount` is read the way the Dashboard reads revenue (a returned sale counts only what was retained), so the
    two pages agree. `purchases` is the vehicles they currently have from us; `booked` the deposit on one they
    have reserved but not bought. `followups` are the open ones: `next_followup` is the earliest per customer."""
    vehicles = vehicles or {}
    names = {c["id"]: c.get("name") or "" for c in customers}
    amount, purchases, booked, referred, theirs = {}, {}, {}, {}, {}
    for s in sales:
        cid = s.get("customer_id")
        if cid not in names: continue
        theirs.setdefault(cid, []).append(s)
        amount[cid] = amount.get(cid, 0) + (_sale_revenue(s) or 0)
        if not s.get("returned"): purchases[cid] = purchases.get(cid, 0) + 1
    for b in bookings:
        cid = b.get("customer_id")
        if cid in names and b.get("status") == "active": booked[cid] = booked.get(cid, 0) + (b.get("booking_amount") or 0)
    for c in customers:
        if c.get("referred_by_id") in names: referred[c["referred_by_id"]] = referred.get(c["referred_by_id"], 0) + 1
    last_contact = {}
    for i in interactions:
        cid, at = i.get("customer_id"), i.get("occurred_at")
        if cid in names and at and (cid not in last_contact or at > last_contact[cid]): last_contact[cid] = at
    next_fu = {}
    for f in followups:
        cid = f.get("customer_id")
        if cid not in names or f.get("status") == "done": continue
        if cid not in next_fu or (f.get("due_at") or "") < (next_fu[cid].get("due_at") or ""): next_fu[cid] = f

    rows = []
    for c in customers:
        cid = c["id"]
        ref = c.get("referred_by_id") if c.get("referred_by_id") in names else None
        mine = theirs.get(cid, [])
        latest = latest_sale(mine) or {}
        live_dates = [s.get("sale_date") for s in mine if not s.get("returned") and s.get("sale_date")]
        n = purchases.get(cid, 0)
        fu = next_fu.get(cid)
        rows.append({
            "id": cid, "name": c.get("name") or "", "contact_number": c.get("contact_number") or "", "address": c.get("address") or "", "notes": c.get("notes") or "",
            "source": source_of(c), "source_note": c.get("source_note"),
            "referred_by_id": ref, "referred_by_name": names[ref] if ref else None,
            "lead_status": effective_status(c.get("lead_status"), n), "status_locked": n > 0,
            "interested_vehicle": c.get("interested_vehicle") or "",
            "purchased_vehicle": vehicle_label(vehicles.get(latest.get("vehicle_id"))) if latest else "",
            "assigned_to_id": c.get("assigned_to_id") or latest.get("sold_by_id"),
            "assigned_to_name": c.get("assigned_to_name") or latest.get("sold_by_name"),
            "amount": round(amount.get(cid, 0), 2), "purchases": n,
            "booked": round(booked.get(cid, 0), 2), "referral_count": referred.get(cid, 0),
            "last_contact_at": last_contact.get(cid),
            "next_followup": {"id": fu["id"], "due_at": fu.get("due_at"), "purpose": fu.get("purpose") or ""} if fu else None,
            "first_sale_date": min(live_dates) if live_dates else None,
            "created_at": c.get("created_at"),
        })
    return rows


# ── follow-ups panel and the four summary cards ──────────────────────

def bucket_followups(open_items: list, done_today: list, names: dict, now: datetime) -> dict:
    """Today's panel: what is overdue, what is on today (done or not), and what is coming in the next week."""
    today = now.astimezone(NPT).date()
    lo, hi = day_bounds(today)
    soon = hi + timedelta(days=UPCOMING_DAYS)
    out = {"overdue": [], "today": [], "upcoming": []}

    def shape(f, overdue=False):
        cid = f.get("customer_id")
        return {"id": f["id"], "customer_id": cid, "customer_name": names.get(cid, {}).get("name", ""), "customer_phone": names.get(cid, {}).get("phone", ""),
                "due_at": f.get("due_at"), "purpose": f.get("purpose") or "", "notes": f.get("notes") or "", "status": f.get("status") or "pending",
                "completed_at": f.get("completed_at"), "overdue": overdue}

    for f in sorted(open_items, key=lambda f: f.get("due_at") or ""):
        if f.get("customer_id") not in names: continue
        due = _dt(f.get("due_at"))
        if due is None: continue
        if due.tzinfo is None: due = due.replace(tzinfo=timezone.utc)
        if due < lo: out["overdue"].append(shape(f, True))
        elif due < hi: out["today"].append(shape(f))
        elif due < soon: out["upcoming"].append(shape(f))
    for f in sorted(done_today, key=lambda f: f.get("due_at") or ""):
        if f.get("customer_id") in names: out["today"].append(shape(f))
    out["today"].sort(key=lambda f: (f["status"] == "done", f["due_at"] or ""))
    return out


def summary_stats(rows: list, open_followups: list, now: datetime, month: Optional[tuple], prev: Optional[tuple]) -> dict:
    """Total customers, new this month, follow-ups due, converted %, each with the little series drawn under it.
    `month` / `prev` are (start, end) dates, both ends included: this month and the one before it."""
    today = now.astimezone(NPT).date()
    lo, hi = day_bounds(today)
    created = [npt_date(r.get("created_at")) for r in rows]
    total = len(rows)

    def within(d, rng): return d is not None and rng is not None and rng[0] <= d <= rng[1]
    new_month = sum(1 for d in created if within(d, month))
    new_prev = sum(1 for d in created if within(d, prev))
    converted = sum(1 for r in rows if r["lead_status"] == "converted")

    # follow-ups: due = overdue + due today (still open)
    overdue = due_today = 0
    per_day = [0] * UPCOMING_DAYS
    for f in open_followups:
        d = _dt(f.get("due_at"))
        if d is None: continue
        if d.tzinfo is None: d = d.replace(tzinfo=timezone.utc)
        if d < lo: overdue += 1; per_day[0] += 1
        elif d < hi: due_today += 1; per_day[0] += 1
        else:
            idx = (d.astimezone(NPT).date() - today).days
            if 0 <= idx < UPCOMING_DAYS: per_day[idx] += 1

    # eight weekly points ending today: customers on file, and how many of them had bought by then
    ends = [today - timedelta(days=7 * i) for i in range(7, -1, -1)]
    first_sale = [_as_date(r.get("first_sale_date")) for r in rows]
    total_series, conv_series = [], []
    for e in ends:
        base = sum(1 for d in created if d is not None and d <= e)
        conv = sum(1 for d, s in zip(created, first_sale) if d is not None and s is not None and max(d, s) <= e)
        total_series.append(base)
        conv_series.append(round(conv / base * 100) if base else 0)

    # new customers per day over this month (at most the last 31 days of it)
    new_series = []
    if month:
        span = min((month[1] - month[0]).days + 1, 31)
        first = month[1] - timedelta(days=span - 1)
        by_day = {}
        for d in created:
            if within(d, (first, month[1])): by_day[d] = by_day.get(d, 0) + 1
        new_series = [by_day.get(first + timedelta(days=i), 0) for i in range(span)]

    pct = round(converted / total * 100) if total else 0
    return {
        "total": {"value": total, "added_this_month": new_month, "series": total_series},
        "new_this_month": {"value": new_month, "previous": new_prev, "delta_pct": round((new_month - new_prev) / new_prev * 100) if new_prev else None, "series": new_series},
        "followups_due": {"value": overdue + due_today, "overdue": overdue, "today": due_today, "series": per_day},
        "converted": {"value": pct, "count": converted, "change_pts": pct - conv_series[-5] if total else 0, "series": conv_series},
    }


# ── import: read a sheet and say what would happen to each row ───────

def _norm(s) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_\-]+", " ", str(s or "").strip().lower())).strip()


IMPORT_HEADERS = {
    "name": ("name", "customer", "customer name", "full name"),
    "phone": ("phone", "phone number", "contact", "contact number", "contact no", "mobile", "mobile number"),
    "address": ("address", "location", "city"),
    "vehicle": ("interested vehicle", "vehicle", "interested in", "bike", "interested bike"),
    "source": ("lead source", "source"),
    "referred_by": ("referred by", "referrer", "referral"),
    "status": ("lead status", "status"),
    "assigned": ("assigned to", "salesperson", "sales person", "assigned", "seller", "sold by"),
    "notes": ("notes", "note", "remarks", "remark"),
    "followup": ("next follow up", "follow up", "followup", "follow up date", "next followup"),
}
SOURCE_WORDS = {
    "walk in": "walk_in", "walkin": "walk_in", "showroom": "walk_in", "visit": "walk_in", "website": "website", "web": "website", "online": "website",
    "facebook": "facebook", "fb": "facebook", "referral": "referral", "referred": "referral", "refer": "referral", "other": "other",
}
_DATE_FORMATS = ["%Y-%m-%d", "%Y/%m/%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y", "%d %b %Y", "%b %d, %Y", "%B %d, %Y", "%d-%m-%y", "%d/%m/%y"]


def read_sheet(content: bytes, filename: str) -> list:
    """The raw rows of an .xlsx or .csv (first row = headers)."""
    name = (filename or "").lower()
    if name.endswith(".csv"):
        text = content.decode("utf-8-sig", errors="ignore")
        first = text.split("\n", 1)[0]
        delim = max([",", "\t", ";"], key=first.count)  # sheets saved from Excel/Google are often tab or ; separated
        rows = [list(r) for r in csv.reader(io.StringIO(text), delimiter=delim)]
    elif name.endswith(".xlsx"):
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        except Exception:
            raise HTTPException(400, "Could not read that file. Make sure it is a valid .xlsx sheet.")
        rows = [list(r) for r in wb.active.iter_rows(values_only=True)]
    else:
        raise HTTPException(400, "Unsupported file type. Use .xlsx or .csv")
    if len(rows) < 2: raise HTTPException(400, "The sheet needs a header row plus at least one customer.")
    if len(rows) - 1 > IMPORT_MAX_ROWS: raise HTTPException(400, f"That is more than {IMPORT_MAX_ROWS} rows. Split it into smaller files.")
    return rows


def _cell(v) -> str:
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): return str(int(v))  # Excel stores 9841234567 as 9841234567.0
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    return str(v).strip()


def _date_cell(v) -> Optional[str]:
    if isinstance(v, datetime): return v.date().isoformat()
    if isinstance(v, date): return v.isoformat()
    s = _cell(v)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_import(rows: list, team: list, existing_phone_keys: set, customers_by_name: dict) -> dict:
    """Check every row of an uploaded sheet. `team` = [{id, name}], `customers_by_name` = {lower name: id}.
    Each row comes back ok (will be added), duplicate (that phone is already a customer, or earlier in the file:
    skipped) or error (says why). Nothing is written here."""
    headers = [_norm(h) for h in rows[0]]
    col = {}
    for key, names in IMPORT_HEADERS.items():
        for i, h in enumerate(headers):
            if h in {_norm(n) for n in names} and key not in col: col[key] = i
    missing = [k for k in ("name", "phone") if k not in col]
    if missing:
        raise HTTPException(400, "The first row must have a Name and a Phone column. Download the template to see the layout.")
    team_by_name = {_norm(m["name"]): m for m in team}
    seen, out = {}, []
    for n, raw in enumerate(rows[1:], start=2):
        def get(key): return raw[col[key]] if key in col and col[key] < len(raw) else None
        if not any(_cell(x) for x in raw): continue
        name, phone = _cell(get("name")), _cell(get("phone"))
        res = {"row": n, "status": "ok", "reason": "", "warnings": [], "name": name, "phone": phone}
        if len(name) < 2:
            res.update(status="error", reason="Name is missing")
        elif not valid_phone(phone):
            res.update(status="error", reason="Phone number is missing or not valid")
        else:
            key = phone_key(phone)
            if key in existing_phone_keys:
                res.update(status="duplicate", reason="A customer with this phone already exists")
            elif key in seen:
                res.update(status="duplicate", reason=f"Same phone as row {seen[key]} in this file")
            else:
                seen[key] = n
                doc = {"name": name, "contact_number": phone, "address": _cell(get("address")) or None,
                       "interested_vehicle": (_cell(get("vehicle")) or None), "notes": _cell(get("notes")) or None,
                       "source": None, "source_note": None, "referred_by_id": None, "lead_status": None,
                       "assigned_to_id": None, "assigned_to_name": None}
                src_text = _cell(get("source"))
                if src_text:
                    k = SOURCE_WORDS.get(_norm(src_text))
                    if k: doc["source"] = k
                    else: doc["source"], doc["source_note"] = "other", src_text[:255]
                ref_text = _cell(get("referred_by"))
                if ref_text:
                    doc["source"] = "referral"
                    rid = customers_by_name.get(_norm(ref_text))
                    if rid: doc["referred_by_id"] = rid
                    else: doc["source_note"] = ref_text[:255]
                if doc["source"] == "referral" and not doc["referred_by_id"] and not doc["source_note"]:
                    doc["source"] = None; res["warnings"].append("Referral without a name was left untagged")
                st = _norm(_cell(get("status")))
                if st:
                    if st == "converted":
                        doc["lead_status"] = "interested"; res["warnings"].append("Converted is set when a sale is recorded; imported as Interested")
                    elif st in LEAD_STATUSES: doc["lead_status"] = st
                    else: res["warnings"].append(f"Unknown status '{st}' ignored")
                who = _cell(get("assigned"))
                if who:
                    m = team_by_name.get(_norm(who))
                    if m: doc["assigned_to_id"], doc["assigned_to_name"] = m["id"], m["name"]
                    else: res["warnings"].append(f"No team member named '{who}'; left unassigned")
                fu_raw = get("followup")
                if _cell(fu_raw):
                    fd = _date_cell(fu_raw)
                    if fd and _as_date(fd) > date.today() + timedelta(days=730):
                        res["warnings"].append("Follow-up date is years ahead (use English AD dates, e.g. 2026-11-15); no follow-up added")
                    elif fd: doc["_followup_date"] = fd
                    else: res["warnings"].append("Follow-up date not understood; no follow-up added")
                res["doc"] = doc
        out.append(res)
    return {"rows": out,
            "ok": sum(1 for r in out if r["status"] == "ok"), "duplicates": sum(1 for r in out if r["status"] == "duplicate"),
            "errors": sum(1 for r in out if r["status"] == "error")}


# ── request bodies ───────────────────────────────────────────────────

class CustomerSourceUpdate(BaseModel):
    source: Optional[str] = None  # None clears the tag
    source_note: Optional[str] = Field(None, max_length=255)
    referred_by_id: Optional[str] = None


class LeadStatusUpdate(BaseModel):
    status: str


class AssignUpdate(BaseModel):
    assigned_to_id: Optional[str] = None  # None un-assigns


class InteractionCreate(BaseModel):
    kind: str = "note"
    summary: str = Field("", max_length=2000)
    occurred_at: Optional[str] = None


class FollowupCreate(BaseModel):
    due_at: str
    purpose: str = Field("Follow-up", max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)


class FollowupUpdate(BaseModel):
    due_at: Optional[str] = None
    purpose: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)
    status: Optional[str] = None  # pending | done
    outcome: Optional[str] = Field(None, max_length=2000)


# ── checks that need the database ────────────────────────────────────

async def clean_customer_source(data: dict, own_id: Optional[str]) -> dict:
    """Checks and tidies the source fields of a customer payload. The note is kept only where it means something
    (a referral not in the list, or "other"), the referrer only for referrals, and a referral may never loop back
    to the customer being saved."""
    source = (data.get("source") or "").strip().lower() or None
    if source and source not in CRM_SOURCES:
        raise HTTPException(422, "Unknown source")
    note = (data.get("source_note") or "").strip()[:255] or None
    ref = (data.get("referred_by_id") or None) if source == "referral" else None
    if source not in ("referral", "other"): note = None
    cur, hops = ref, 0
    while cur and hops < 50:  # walk up the chain of who referred whom
        if own_id and cur == own_id:
            raise HTTPException(422, "A customer can't be referred by themselves or by someone they referred")
        row = await db.customers.find_one({"id": cur}, {"_id": 0, "id": 1, "referred_by_id": 1})
        if not row:
            if cur == ref: raise HTTPException(422, "The customer who referred them wasn't found")
            break
        cur, hops = row.get("referred_by_id"), hops + 1
    return {"source": source, "source_note": note, "referred_by_id": ref}


async def team_member(member_id: Optional[str]) -> Optional[dict]:
    member_id = (member_id or "").strip()
    if not member_id: return None
    m = await db.team_members.find_one({"id": member_id}, {"_id": 0, "id": 1, "name": 1})
    if not m: raise HTTPException(422, "That team member was not found")
    return {"id": m["id"], "name": (m.get("name") or "").strip() or None}


async def resolve_sold_by(member_id: Optional[str]) -> dict:
    """The seller fields to store on a sale. The name comes from the Team list, never from the client, and stays
    on the sale if the member is removed later."""
    m = await team_member(member_id)
    return {"sold_by_id": m["id"], "sold_by_name": m["name"]} if m else {"sold_by_id": None, "sold_by_name": None}


async def seller_for_sale(explicit_id: Optional[str], customer_id: Optional[str]) -> dict:
    """Who a new sale is credited to: the seller picked on the form, else the salesperson assigned to the customer.
    Never blocks a sale: a stale assignment (or the columns not being there yet) simply means no seller."""
    if (explicit_id or "").strip(): return await resolve_sold_by(explicit_id)
    if not customer_id: return {}
    try:
        c = await db.customers.find_one({"id": customer_id}, {"_id": 0, "assigned_to_id": 1})
        if c and c.get("assigned_to_id"): return await resolve_sold_by(c["assigned_to_id"])
    except Exception:
        pass
    return {}


async def clean_customer_crm(data: dict) -> dict:
    """Validates lead_status / interested_vehicle / assigned_to_id and names the assignee."""
    status = (data.get("lead_status") or "").strip().lower() or None
    if status and status not in LEAD_STATUSES: raise HTTPException(422, "Unknown lead status")
    vehicle = (data.get("interested_vehicle") or "").strip()[:255] or None
    m = await team_member(data.get("assigned_to_id"))
    return {"lead_status": status, "interested_vehicle": vehicle,
            "assigned_to_id": m["id"] if m else None, "assigned_to_name": m["name"] if m else None}


async def check_phone(phone, own_id: Optional[str]) -> None:
    """Strict mode (the CRM forms): the phone must look like a phone and must not belong to another customer.
    Editing someone whose phone you are not changing is never blocked (older forms allowed duplicates and odd numbers)."""
    key = phone_key(phone)
    if own_id:
        cur = await db.customers.find_one({"id": own_id}, {"_id": 0, "contact_number": 1})
        if cur and (str(cur.get("contact_number") or "").strip() == str(phone or "").strip() or phone_key(cur.get("contact_number")) == key): return
    if not valid_phone(phone): raise HTTPException(422, "Enter a valid phone number (7 to 15 digits)")
    if len(key) < 7: return
    for c in await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "contact_number": 1}).to_list(50000):
        if c["id"] != own_id and phone_key(c.get("contact_number")) == key:
            raise HTTPException(409, {"message": f"{c.get('name') or 'A customer'} already has this phone number", "existing_id": c["id"], "existing_name": c.get("name") or ""})


async def cleanup_customer(cid: str) -> None:
    """A customer is going: so are their follow-ups and history (the database cascades too; the other backend does not)."""
    for coll in (db.crm_followups, db.crm_interactions):
        try: await coll.delete_many({"customer_id": cid})
        except Exception: pass


async def _bump_contacted(customer_id: str) -> None:
    """A real conversation moves a New lead (no sale, nothing set) to Contacted."""
    c = await db.customers.find_one({"id": customer_id}, {"_id": 0, "lead_status": 1})
    if not c: return
    if effective_status(c.get("lead_status"), 0) == "new" and not await _live_sales(customer_id):
        await db.customers.update_one({"id": customer_id}, {"$set": {"lead_status": "contacted"}})


async def _live_sales(customer_id: str) -> list:
    return [s for s in await db.sales.find({"customer_id": customer_id}, {"_id": 0, "id": 1, "returned": 1, "sale_date": 1, "created_at": 1, "sold_by_id": 1}).to_list(500) if not s.get("returned")]


# ── the endpoints ────────────────────────────────────────────────────

def register(api_router, database, admin_only, sale_revenue):
    global db, _sale_revenue
    db, _sale_revenue = database, sale_revenue

    async def _vehicles_for(sales: list) -> dict:
        ids = list({s["vehicle_id"] for s in sales if s.get("vehicle_id")})
        if not ids: return {}
        vs = await db.vehicles.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "brand": 1, "model": 1, "year": 1, "registration_number": 1}).to_list(len(ids) + 10)
        return {v["id"]: v for v in vs}

    def _range(a, b):
        da, dbb = _as_date(a), _as_date(b)
        return (da, dbb) if da and dbb and da <= dbb else None

    @api_router.get("/crm/overview")
    async def crm_overview(month_start: Optional[str] = None, month_end: Optional[str] = None, prev_start: Optional[str] = None, prev_end: Optional[str] = None,
                           cu: dict = Depends(admin_only)):
        """Everything the CRM page shows, read live from what has already been posted: the table, the four
        summary cards and the follow-up panel."""
        now = datetime.now(timezone.utc)
        today = now.astimezone(NPT).date()
        customers = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "contact_number": 1, "address": 1, "source": 1, "source_note": 1, "referred_by_id": 1,
                                                 "created_at": 1, "lead_status": 1, "interested_vehicle": 1, "assigned_to_id": 1, "assigned_to_name": 1, "notes": 1}).sort("created_at", -1).to_list(50000)
        sales = await db.sales.find({}, {"_id": 0, "customer_id": 1, "vehicle_id": 1, "returned": 1, "retained_amount": 1, "sale_price": 1,
                                         "sale_date": 1, "created_at": 1, "sold_by_id": 1, "sold_by_name": 1}).to_list(50000)
        bookings = await db.bookings.find({"status": "active"}, {"_id": 0, "customer_id": 1, "booking_amount": 1, "status": 1}).to_list(50000)
        interactions = await db.crm_interactions.find({}, {"_id": 0, "customer_id": 1, "occurred_at": 1}).to_list(200000)
        open_followups = await db.crm_followups.find({"status": "pending"}, {"_id": 0}).to_list(50000)
        lo, _ = day_bounds(today)
        done_today = await db.crm_followups.find({"status": "done", "completed_at": {"$gte": lo.isoformat()}}, {"_id": 0}).to_list(5000)
        latest_ids = {}
        for s in sales:
            cur = latest_ids.get(s.get("customer_id"))
            if not s.get("returned") and (cur is None or (s.get("sale_date") or "", s.get("created_at") or "") > (cur.get("sale_date") or "", cur.get("created_at") or "")): latest_ids[s.get("customer_id")] = s
        vehicles = await _vehicles_for(list(latest_ids.values()))
        rows = customer_rows(customers, sales, bookings, interactions, open_followups, vehicles)
        if not (month_start and month_end):  # default: this calendar month, and the one before
            first = today.replace(day=1)
            month_start, month_end = first.isoformat(), today.isoformat()
            pm_end = first - timedelta(days=1)
            prev_start, prev_end = pm_end.replace(day=1).isoformat(), pm_end.isoformat()
        info = {c["id"]: {"name": c.get("name") or "", "phone": c.get("contact_number") or ""} for c in customers}
        return {
            "customers": rows,
            "summary": summary_stats(rows, open_followups, now, _range(month_start, month_end), _range(prev_start, prev_end)),
            "followups": bucket_followups(open_followups, done_today, info, now),
        }

    @api_router.get("/crm/vehicle-options")
    async def crm_vehicle_options(cu: dict = Depends(admin_only)):
        """Stock that can still be asked about, for the 'Interested vehicle' suggestions."""
        vs = await db.vehicles.find({"status": {"$in": ["available", "reserved", "in_repair"]}}, {"_id": 0, "id": 1, "brand": 1, "model": 1, "year": 1, "registration_number": 1}).to_list(5000)
        out = []
        for v in vs:
            label = vehicle_label(v)
            if label: out.append({"id": v["id"], "label": label, "registration_number": v.get("registration_number") or ""})
        return sorted(out, key=lambda o: o["label"].lower())

    @api_router.get("/crm/customers/{cid}")
    async def crm_profile(cid: str, cu: dict = Depends(admin_only)):
        """One customer in full: details, purchases, bookings, what was said, what is due, and who they referred."""
        c = await db.customers.find_one({"id": cid}, {"_id": 0})
        if not c: raise HTTPException(404, "Customer not found")
        sales = await db.sales.find({"customer_id": cid}, {"_id": 0}).sort("sale_date", -1).to_list(500)
        bookings = await db.bookings.find({"customer_id": cid}, {"_id": 0}).sort("booking_date", -1).to_list(200)
        interactions = await db.crm_interactions.find({"customer_id": cid}, {"_id": 0}).sort("occurred_at", -1).to_list(2000)
        followups = await db.crm_followups.find({"customer_id": cid}, {"_id": 0}).sort("due_at", -1).to_list(2000)
        referred = await db.customers.find({"referred_by_id": cid}, {"_id": 0, "id": 1, "name": 1, "contact_number": 1, "source": 1}).to_list(500)
        referrer = await db.customers.find_one({"id": c.get("referred_by_id")}, {"_id": 0, "id": 1, "name": 1}) if c.get("referred_by_id") else None
        veh_ids = [s for s in sales] + [{"vehicle_id": b.get("vehicle_id")} for b in bookings]
        vehicles = await _vehicles_for(veh_ids)
        row = customer_rows([c] + ([referrer] if referrer else []), sales, bookings, interactions, [f for f in followups if f.get("status") != "done"], vehicles)[0]
        row["referral_count"] = len(referred)
        sale_list = [{"id": s["id"], "sale_date": s.get("sale_date"), "vehicle": vehicle_label(vehicles.get(s.get("vehicle_id"))) or "Vehicle removed",
                      "registration_number": (vehicles.get(s.get("vehicle_id")) or {}).get("registration_number") or "",
                      "sale_price": s.get("sale_price") or 0, "amount": _sale_revenue(s) or 0, "payment_status": s.get("payment_status"),
                      "due_amount": s.get("due_amount") or 0, "returned": bool(s.get("returned")), "sold_by_name": s.get("sold_by_name")} for s in sales]
        booking_list = [{"id": b["id"], "booking_date": b.get("booking_date"), "vehicle": vehicle_label(vehicles.get(b.get("vehicle_id"))) or "Vehicle removed",
                         "booking_amount": b.get("booking_amount") or 0, "status": b.get("status")} for b in bookings]
        return {"customer": row, "details": {"id_number": c.get("id_number") or "", "occupation": c.get("occupation") or "", "notes": c.get("notes") or ""},
                "sales": sale_list, "bookings": booking_list, "interactions": interactions, "followups": followups, "referred": referred}

    @api_router.put("/customers/{cid}/source")
    async def set_customer_source(cid: str, body: CustomerSourceUpdate, cu: dict = Depends(admin_only)):
        """Tag (or re-tag) how a customer found the shop, without touching their other details."""
        clean = await clean_customer_source(body.model_dump(), cid)
        r = await db.customers.update_one({"id": cid}, {"$set": clean})
        if r.matched_count == 0: raise HTTPException(404, "Not found")
        return await db.customers.find_one({"id": cid}, {"_id": 0})

    @api_router.put("/crm/customers/{cid}/lead-status")
    async def set_lead_status(cid: str, body: LeadStatusUpdate, cu: dict = Depends(admin_only)):
        status = (body.status or "").strip().lower()
        if status not in LEAD_STATUSES: raise HTTPException(422, "Unknown lead status")
        if not await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1}): raise HTTPException(404, "Customer not found")
        if await _live_sales(cid): raise HTTPException(409, "This customer has bought a vehicle, so they are Converted.")
        if status == "converted": raise HTTPException(409, "A lead becomes Converted when a sale is recorded for them.")
        await db.customers.update_one({"id": cid}, {"$set": {"lead_status": status}})
        return {"lead_status": status}

    @api_router.put("/crm/customers/{cid}/assign")
    async def assign_customer(cid: str, body: AssignUpdate, cu: dict = Depends(admin_only)):
        """Assign a salesperson. If the customer has bought, their latest sale's Sold By follows (unless it was set to someone else)."""
        c = await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1, "assigned_to_id": 1})
        if not c: raise HTTPException(404, "Customer not found")
        m = await team_member(body.assigned_to_id)
        await db.customers.update_one({"id": cid}, {"$set": {"assigned_to_id": m["id"] if m else None, "assigned_to_name": m["name"] if m else None}})
        sale = latest_sale(await db.sales.find({"customer_id": cid}, {"_id": 0, "id": 1, "returned": 1, "sale_date": 1, "created_at": 1, "sold_by_id": 1}).to_list(500))
        if sale and (not sale.get("sold_by_id") or sale.get("sold_by_id") == c.get("assigned_to_id")):
            await db.sales.update_one({"id": sale["id"]}, {"$set": {"sold_by_id": m["id"] if m else None, "sold_by_name": m["name"] if m else None}})
        return {"assigned_to_id": m["id"] if m else None, "assigned_to_name": m["name"] if m else None}

    @api_router.delete("/crm/customers/{cid}")
    async def delete_crm_customer(cid: str, cu: dict = Depends(admin_only)):
        if not await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1}): raise HTTPException(404, "Customer not found")
        n_sales = len(await db.sales.find({"customer_id": cid}, {"_id": 0, "id": 1}).to_list(500))
        n_book = len(await db.bookings.find({"customer_id": cid}, {"_id": 0, "id": 1}).to_list(500))
        if n_sales or n_book:
            raise HTTPException(409, f"This customer has {n_sales} sale(s) and {n_book} booking(s) on record, so they can't be deleted. Mark them Lost instead.")
        await cleanup_customer(cid)
        await db.customers.delete_one({"id": cid})
        await db.customers.update_many({"referred_by_id": cid}, {"$set": {"referred_by_id": None}})
        return {"message": "Deleted"}

    @api_router.post("/crm/customers/{cid}/interactions")
    async def add_interaction(cid: str, body: InteractionCreate, cu: dict = Depends(admin_only)):
        kind = (body.kind or "").strip().lower()
        if kind not in INTERACTION_KINDS: raise HTTPException(422, "Unknown kind of contact")
        if not await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1}): raise HTTPException(404, "Customer not found")
        summary = (body.summary or "").strip()
        if not summary:
            if kind in ("call", "whatsapp"): summary = "Call" if kind == "call" else "WhatsApp message"
            else: raise HTTPException(422, "Write a short note about it")
        try: at = parse_dt(body.occurred_at) if body.occurred_at else now_iso()
        except ValueError: raise HTTPException(422, "That date and time is not valid")
        doc = {"id": str(uuid.uuid4()), "customer_id": cid, "kind": kind, "summary": summary, "occurred_at": at, "created_by": cu.get("username"), "created_at": now_iso()}
        await db.crm_interactions.insert_one(doc)
        if kind in CONTACT_KINDS: await _bump_contacted(cid)
        doc.pop("_id", None)
        return doc

    @api_router.delete("/crm/interactions/{iid}")
    async def delete_interaction(iid: str, cu: dict = Depends(admin_only)):
        r = await db.crm_interactions.delete_one({"id": iid})
        if r.deleted_count == 0: raise HTTPException(404, "Not found")
        return {"message": "Deleted"}

    @api_router.post("/crm/customers/{cid}/followups")
    async def add_followup(cid: str, body: FollowupCreate, cu: dict = Depends(admin_only)):
        if not await db.customers.find_one({"id": cid}, {"_id": 0, "id": 1}): raise HTTPException(404, "Customer not found")
        try: due = parse_dt(body.due_at)
        except ValueError: raise HTTPException(422, "Pick a valid date and time for the follow-up")
        doc = {"id": str(uuid.uuid4()), "customer_id": cid, "due_at": due, "purpose": (body.purpose or "").strip() or "Follow-up",
               "notes": (body.notes or "").strip() or None, "status": "pending", "completed_at": None, "outcome": None,
               "created_by": cu.get("username"), "created_at": now_iso(), "updated_at": now_iso()}
        await db.crm_followups.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api_router.put("/crm/followups/{fid}")
    async def update_followup(fid: str, body: FollowupUpdate, cu: dict = Depends(admin_only)):
        """Reschedule, edit the note or purpose, complete (with an optional outcome) or reopen a follow-up."""
        f = await db.crm_followups.find_one({"id": fid}, {"_id": 0})
        if not f: raise HTTPException(404, "Follow-up not found")
        sent, upd = body.model_fields_set, {"updated_at": now_iso()}
        if "due_at" in sent:
            try: upd["due_at"] = parse_dt(body.due_at)
            except ValueError: raise HTTPException(422, "Pick a valid date and time")
        if "purpose" in sent: upd["purpose"] = (body.purpose or "").strip() or "Follow-up"
        if "notes" in sent: upd["notes"] = (body.notes or "").strip() or None
        completing = False
        if "status" in sent:
            if body.status not in ("pending", "done"): raise HTTPException(422, "Status must be pending or done")
            if body.status == "done" and f.get("status") != "done":
                completing = True
                upd.update(status="done", completed_at=now_iso(), outcome=(body.outcome or "").strip() or None)
            elif body.status == "pending":
                upd.update(status="pending", completed_at=None, outcome=None)
        await db.crm_followups.update_one({"id": fid}, {"$set": upd})
        if completing:  # finishing a follow-up is a conversation: it goes in the history and counts as the last contact
            purpose = upd.get("purpose") or f.get("purpose") or "Follow-up"
            text = f"Follow-up done: {purpose}" + (f". {upd['outcome']}" if upd.get("outcome") else "")
            await db.crm_interactions.insert_one({"id": str(uuid.uuid4()), "customer_id": f["customer_id"], "kind": "followup", "summary": text[:2000],
                                                  "occurred_at": upd["completed_at"], "created_by": cu.get("username"), "created_at": now_iso()})
            await _bump_contacted(f["customer_id"])
        return await db.crm_followups.find_one({"id": fid}, {"_id": 0})

    @api_router.delete("/crm/followups/{fid}")
    async def delete_followup(fid: str, cu: dict = Depends(admin_only)):
        r = await db.crm_followups.delete_one({"id": fid})
        if r.deleted_count == 0: raise HTTPException(404, "Not found")
        return {"message": "Deleted"}

    @api_router.post("/crm/import")
    async def import_customers(file: UploadFile = File(...), confirm: bool = False, cu: dict = Depends(admin_only)):
        """Add customers from a .csv/.xlsx. Without confirm it only checks the file and reports row by row; with it
        the rows that are fine are added. A phone that already belongs to a customer is skipped, never doubled."""
        content = await file.read()
        if len(content) > IMPORT_MAX_BYTES: raise HTTPException(400, "That file is over 5 MB.")
        existing = await db.customers.find({}, {"_id": 0, "id": 1, "name": 1, "contact_number": 1}).to_list(50000)
        keys = {phone_key(c.get("contact_number")) for c in existing if len(phone_key(c.get("contact_number"))) >= 7}
        by_name = {}
        for c in existing: by_name.setdefault(_norm(c.get("name")), c["id"])
        team = [{"id": m["id"], "name": (m.get("name") or "").strip()} for m in await db.team_members.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(500)]
        result = parse_import(read_sheet(content, file.filename), team, keys, by_name)
        ok = [r for r in result["rows"] if r["status"] == "ok"]
        out = {"committed": False, "inserted": 0, "ok": result["ok"], "duplicates": result["duplicates"], "errors": result["errors"], "total": len(result["rows"]),
               "rows": [{k: v for k, v in r.items() if k != "doc"} for r in result["rows"]][:300]}
        if not confirm:
            out["message"] = f"{result['ok']} customer(s) ready to import" + (f", {result['duplicates']} duplicate(s) will be skipped" if result["duplicates"] else "") + (f", {result['errors']} row(s) have problems and will be left out" if result["errors"] else "") + "."
            return out
        customers, followups = [], []
        for r in ok:
            d = dict(r["doc"]); fu = d.pop("_followup_date", None)
            d["id"], d["created_at"] = str(uuid.uuid4()), now_iso()
            customers.append(d)
            if fu:
                due = datetime(*map(int, fu.split("-")), 10, 0, tzinfo=NPT).astimezone(timezone.utc).isoformat()
                followups.append({"id": str(uuid.uuid4()), "customer_id": d["id"], "due_at": due, "purpose": "Follow-up", "notes": None, "status": "pending",
                                  "completed_at": None, "outcome": None, "created_by": cu.get("username"), "created_at": now_iso(), "updated_at": now_iso()})
        if customers: await db.customers.insert_many(customers)
        if followups: await db.crm_followups.insert_many(followups)
        out.update(committed=True, inserted=len(customers), message=f"Imported {len(customers)} customer(s)" + (f"; skipped {result['duplicates']} duplicate(s)" if result["duplicates"] else "") + (f" and {result['errors']} row(s) with problems" if result["errors"] else "") + ".")
        return out
