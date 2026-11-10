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


def build_briefing(sales: list[dict], finance: dict, today: str, month: str, revenue_of) -> dict:
    """The owner's numbers. `finance` is what /finance/summary returns; `revenue_of(sale)` counts a
    returned sale at what was kept, the same way the rest of the app does."""
    def on(prefix: str) -> list[dict]:
        return [s for s in sales if str(s.get("sale_date") or "").startswith(prefix)]

    todays, months = on(today), on(month)
    owing = [s for s in sales if (s.get("due_amount") or 0) > 0]
    overdue = [s for s in owing if s.get("due_date") and str(s["due_date"])[:10] < today]
    return {
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
