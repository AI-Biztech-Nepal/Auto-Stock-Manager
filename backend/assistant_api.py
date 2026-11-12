"""Read-only business briefing for the Hanuman voice assistant.

Hanuman (the AI phone agent) answers the owner's questions by phone: today's sales, what is owed,
profit. It must not hold an admin password, so it gets one key per company that can read ONE
summary and nothing else.

Keys live in the ASSISTANT_KEYS environment variable, a JSON object of company id to the SHA-256
hex of that company's key:

    ASSISTANT_KEYS='{"<company_id>": "<sha256 of the key>"}'

The key itself is handed to Hanuman once and never stored here. The functions are pure (no
database, no web framework) so they can be tested on their own; the route that uses them is
`/api/assistant/briefing` in server.py.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

NEPAL = timezone(timedelta(hours=5, minutes=45))


def hash_key(key: str) -> str:
    return hashlib.sha256((key or "").encode()).hexdigest()


def company_for_key(presented: str, keys_json: str) -> str | None:
    """The company a presented key belongs to, or None. Every entry is compared in constant time."""
    if not presented or not keys_json:
        return None
    try:
        keys = json.loads(keys_json)
    except (ValueError, TypeError):
        return None
    if not isinstance(keys, dict):
        return None
    digest = hash_key(presented)
    found = None
    for company_id, stored in keys.items():
        if isinstance(stored, str) and hmac.compare_digest(digest, stored.strip().lower()):
            found = company_id
    return found


def derive_key(secret: str, company_id: str) -> str:
    """The assistant key for one company, worked out from the server's own secret (JWT_SECRET).

    Nothing is stored: the key is "<company id>.<HMAC of the company id>", so the server can check any
    presented key by recomputing it. An admin fetches it from /api/assistant/key; it can only read the
    briefing, and knowing it does not reveal the secret.
    """
    mac = hmac.new(secret.encode(), f"assistant:{company_id}".encode(), hashlib.sha256).hexdigest()
    return f"{company_id}.{mac}"


def company_for_derived_key(presented: str, secret: str) -> str | None:
    """The company a derived key belongs to, or None when it does not verify."""
    if not presented or not secret or "." not in presented:
        return None
    company_id = presented.rsplit(".", 1)[0]
    if not company_id or not hmac.compare_digest(presented, derive_key(secret, company_id)):
        return None
    return company_id


def nepal_today(now: datetime | None = None) -> tuple[str, str]:
    """(today's date, this month) as ISO strings, in Nepal time: "2026-11-10", "2026-11"."""
    local = (now or datetime.now(timezone.utc)).astimezone(NEPAL)
    return local.date().isoformat(), local.strftime("%Y-%m")


LEAD_STATUSES = ("new", "contacted", "interested", "converted", "lost")


def people_briefing(customers: list[dict], sales: list[dict], followups: list[dict], team: list[dict],
                    today, status_of, date_of) -> dict:
    """Customers, the CRM's lead stages, follow-ups due and the team, counted the way the CRM page counts them.

    `status_of(stored, purchases)` and `date_of(value)` are the CRM's own helpers (crm.effective_status and
    crm.npt_date), passed in so this stays testable without the app. A customer who has bought is Converted;
    a returned sale does not count as a purchase. Staff are counted, never their pay or commission."""
    from collections import Counter
    bought = Counter(s.get("customer_id") for s in sales if s.get("customer_id") and not s.get("returned"))
    stages = Counter(status_of(c.get("lead_status"), bought.get(c.get("id"), 0)) for c in customers)
    month = today.strftime("%Y-%m")
    added = [d for d in (date_of(c.get("created_at")) for c in customers) if d is not None]
    overdue = due_today = 0
    for f in followups:
        due = date_of(f.get("due_at"))
        if due is None:
            continue
        if due < today:
            overdue += 1
        elif due == today:
            due_today += 1
    active = [m for m in team if m.get("is_active", 1) not in (0, False)]
    roles = Counter(str(m.get("role") or "other") for m in active)
    return {
        "customers": {
            "total": len(customers),
            "new_this_month": sum(1 for d in added if d.strftime("%Y-%m") == month),
            "by_stage": {k: stages.get(k, 0) for k in LEAD_STATUSES},
            "followups_overdue": overdue,
            "followups_today": due_today,
        },
        "team": {"active": len(active), "by_role": dict(sorted(roles.items()))},
    }


def build_briefing(sales: list[dict], finance: dict, today: str, month: str, revenue_of,
                   people: dict | None = None) -> dict:
    """The owner's numbers. `finance` is what /finance/summary returns; `revenue_of(sale)` counts a
    returned sale at what was kept, the same way the rest of the app does."""
    def on(prefix: str) -> list[dict]:
        return [s for s in sales if str(s.get("sale_date") or "").startswith(prefix)]

    todays, months = on(today), on(month)
    owing = [s for s in sales if (s.get("due_amount") or 0) > 0]
    overdue = [s for s in owing if s.get("due_date") and str(s["due_date"])[:10] < today]
    out = {
        "as_of": today,
        "today": {"sales": len(todays), "revenue": round(sum(revenue_of(s) for s in todays), 2)},
        "this_month": {"sales": len(months), "revenue": round(sum(revenue_of(s) for s in months), 2)},
        "dues": {
            "total": round(sum(s.get("due_amount") or 0 for s in owing), 2),
            "customers_owing": len(owing),
            "overdue": len(overdue),
        },
        "finance": {
            "inventory_value": finance.get("inventory_value", 0),
            "gross_profit": finance.get("gross_profit", 0),
            "profit_margin_pct": finance.get("profit_margin_pct", 0),
            "vendor_payables": finance.get("vendor_payables", 0),
            "emi_receivables": finance.get("emi_receivables", 0),
            "total_revenue": finance.get("total_revenue", 0),
        },
        "stock": {
            "vehicles_in_stock": finance.get("vehicles_in_stock", 0),
            "vehicles_sold": finance.get("vehicles_sold", 0),
        },
    }
    out.update(people or {})
    return out


# ------------------------------------------------------------------ lookups (slice 1)
#
# The owner can ask Hanuman for details the briefing does not hold. Each question is one of these named,
# read-only lookups with a few options: never free-form access to the database. Every result is small
# (at most MAX_ROWS rows) and every money field is named *_rs, so the phone assistant can say it in words.

from datetime import date  # noqa: E402

MAX_ROWS = 5
LOOKUPS = ("customer", "dues", "sales", "vehicle")


def _digits(text) -> str:
    return "".join(ch for ch in str(text or "") if ch.isdigit())


def _plate_key(text) -> str:
    return "".join(ch for ch in str(text or "").lower() if ch.isalnum())


def _day(value) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def period_range(period: str, today: date) -> tuple[date, date] | None:
    """A named period as (first day, last day), both included: "today", "this_month", "2026-10", "2026-11-03"..."""
    p = (period or "").strip().lower()
    if p == "today":
        return today, today
    if p == "yesterday":
        y = today - timedelta(days=1)
        return y, y
    if p in ("this_week", "last_7_days"):
        return today - timedelta(days=6), today
    if p == "this_month":
        return today.replace(day=1), today
    if p == "last_month":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end
    if p == "this_year":
        return today.replace(month=1, day=1), today
    if len(p) == 7 and p[4] == "-":                                   # "2026-10"
        try:
            first = date(int(p[:4]), int(p[5:]), 1)
        except ValueError:
            return None
        nxt = date(first.year + (first.month == 12), first.month % 12 + 1, 1)
        return first, nxt - timedelta(days=1)
    d = _day(p) if len(p) == 10 else None
    return (d, d) if d else None


def lookup_customer(query: str, customers: list[dict], sales: list[dict], today: date) -> dict:
    """A customer by name or phone: what they bought, what they owe, when they last bought."""
    q = (query or "").strip().lower()
    if not q:
        return {"error": "say a name or a phone number"}
    phone = _digits(q)[-10:] if len(_digits(q)) >= 7 else ""
    hits = [c for c in customers
            if (phone and _digits(c.get("contact_number"))[-10:] == phone) or (not phone and q in str(c.get("name") or "").lower())]
    rows = []
    for c in hits[:MAX_ROWS]:
        mine = [s for s in sales if s.get("customer_id") == c.get("id")]
        kept = [s for s in mine if not s.get("returned")]
        last = max((d for d in (_day(s.get("sale_date")) for s in kept) if d), default=None)
        rows.append({
            "name": c.get("name") or "",
            "bought": len(kept),
            "bought_total_rs": round(sum(s.get("sale_price") or 0 for s in kept), 2),
            "owes_rs": round(sum(s.get("due_amount") or 0 for s in kept), 2),
            "last_purchase_days_ago": (today - last).days if last else None,
        })
    return {"matches": len(hits), "customers": rows[:3]}


def lookup_dues(top: int, customers: list[dict], sales: list[dict], today: date) -> dict:
    """Who owes the most, and how much is overdue."""
    names = {c.get("id"): c.get("name") or "" for c in customers}
    owed: dict = {}
    for s in sales:
        if s.get("returned") or (s.get("due_amount") or 0) <= 0:
            continue
        row = owed.setdefault(s.get("customer_id"), {"owes_rs": 0.0, "overdue_rs": 0.0, "oldest_due_days_ago": None})
        row["owes_rs"] += s["due_amount"]
        due = _day(s.get("due_date"))
        if due and due < today:
            row["overdue_rs"] += s["due_amount"]
            late = (today - due).days
            row["oldest_due_days_ago"] = max(late, row["oldest_due_days_ago"] or 0)
    ranked = sorted(owed.items(), key=lambda kv: -kv[1]["owes_rs"])
    n = max(1, min(int(top or 3), MAX_ROWS))
    return {
        "customers_owing": len(owed),
        "total_owed_rs": round(sum(v["owes_rs"] for v in owed.values()), 2),
        "total_overdue_rs": round(sum(v["overdue_rs"] for v in owed.values()), 2),
        "top": [{"name": names.get(cid) or "(no name)", "owes_rs": round(v["owes_rs"], 2),
                 "overdue_rs": round(v["overdue_rs"], 2), "oldest_due_days_ago": v["oldest_due_days_ago"]}
                for cid, v in ranked[:n]],
    }


def lookup_sales(period: str, by: str, sales: list[dict], vehicles: list[dict], today: date, revenue_of) -> dict:
    """Sales in a period: how many, how much, and the best groups by seller, brand or model."""
    rng = period_range(period, today)
    if rng is None:
        return {"error": "period must be today, yesterday, this_week, this_month, last_month, this_year, YYYY-MM or YYYY-MM-DD"}
    inside = [s for s in sales if (d := _day(s.get("sale_date"))) and rng[0] <= d <= rng[1]]
    out = {"period": period, "sales": len(inside), "revenue_rs": round(sum(revenue_of(s) for s in inside), 2)}
    if by in ("seller", "brand", "model") and inside:
        car = {v.get("id"): v for v in vehicles}

        def key(s):
            if by == "seller":
                return s.get("sold_by_name") or "(not recorded)"
            v = car.get(s.get("vehicle_id")) or {}
            return (v.get("brand") or "?") if by == "brand" else f"{v.get('brand') or '?'} {v.get('model') or ''}".strip()

        groups: dict = {}
        for s in inside:
            g = groups.setdefault(key(s), {"sales": 0, "revenue_rs": 0.0})
            g["sales"] += 1
            g["revenue_rs"] += revenue_of(s)
        best = sorted(groups.items(), key=lambda kv: (-kv[1]["sales"], -kv[1]["revenue_rs"]))[:MAX_ROWS]
        out["by"] = by
        out["groups"] = [{"name": k, "sales": g["sales"], "revenue_rs": round(g["revenue_rs"], 2)} for k, g in best]
    return out


def lookup_vehicle(query: str, status: str, vehicles: list[dict]) -> dict:
    """A vehicle by number plate or by words from its brand, model, year or colour."""
    q = (query or "").strip().lower()
    if not q:
        return {"error": "say a number plate, or a brand and model"}
    plate = _plate_key(q)
    hits = []
    for v in vehicles:
        if status and str(v.get("status") or "").lower() != status.lower():
            continue
        text = " ".join(str(v.get(k) or "") for k in ("brand", "model", "variant", "year", "color")).lower()
        if (plate and plate == _plate_key(v.get("registration_number"))) or all(t in text for t in q.split()):
            hits.append(v)
    rows = [{
        "name": " ".join(str(v.get(k) or "") for k in ("brand", "model", "variant")).strip(),
        "year": v.get("year") if isinstance(v.get("year"), int) and 1980 <= v["year"] <= 2100 else None,
        "colour": v.get("color") or None,
        "plate": v.get("registration_number") or None,
        "status": v.get("status") or None,
        "selling_price_rs": v.get("selling_price") or None,
        "purchase_price_rs": v.get("purchase_price") or None,
        "kilometers": int(v["kilometer_run"]) if v.get("kilometer_run") else None,
    } for v in hits[:MAX_ROWS]]
    return {"matches": len(hits), "vehicles": rows[:3]}


def run_lookup(name: str, args: dict, data: dict, today: date, revenue_of) -> dict:
    """One of the named lookups. `data` holds the lists it needs (customers, sales, vehicles)."""
    args = args if isinstance(args, dict) else {}
    if name == "customer":
        return lookup_customer(str(args.get("query") or ""), data.get("customers", []), data.get("sales", []), today)
    if name == "dues":
        return lookup_dues(args.get("top") or 3, data.get("customers", []), data.get("sales", []), today)
    if name == "sales":
        return lookup_sales(str(args.get("period") or "this_month"), str(args.get("by") or ""),
                            data.get("sales", []), data.get("vehicles", []), today, revenue_of)
    if name == "vehicle":
        return lookup_vehicle(str(args.get("query") or ""), str(args.get("status") or ""), data.get("vehicles", []))
    return {"error": f"unknown lookup; choose one of: {', '.join(LOOKUPS)}"}
