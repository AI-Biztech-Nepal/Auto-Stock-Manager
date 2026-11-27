"""Staff & Access (Settings): each login's details and, per section of the app, No access / View / View & edit.

How it decides, once per signed-in request (called from server.py's get_current_user):
  * Admin is never restricted. A login with nothing set here behaves exactly as its role says (ROLE_PERMISSIONS).
  * Only the sections an admin changed for that person are stored ("overrides"). For a request that belongs to one of
    those sections: enough access -> allowed, even if the role alone would not allow it; too little everywhere -> 403.
    Sections that were not changed keep following the role.
  * Actions in RULES' admin-only list (deleting vehicles, returns, imports, accounts, settings ...) are never granted
    here: they stay with the role check.
  * A paused or removed login is refused outright, including on a token issued before.
"""
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("server")

SECTIONS = ("dashboard", "inventory", "spare_parts", "sales", "leads", "crm", "share", "offers", "visits", "ledger",
            "jobs", "finance", "reports", "warranty", "sanakhat", "ai")
LEVELS = {"none": 0, "view": 1, "edit": 2}

COLUMNS = {"id", "company_id", "phone", "address", "pan", "job_title", "work_start", "work_end", "access", "status", "updated_at"}

_DDL = ("CREATE TABLE IF NOT EXISTS staff_access (id VARCHAR(36) NOT NULL PRIMARY KEY, company_id VARCHAR(36) NOT NULL, "
        "phone VARCHAR(50), address VARCHAR(500), pan VARCHAR(50), job_title VARCHAR(100), work_start VARCHAR(5), "
        "work_end VARCHAR(5), access TEXT, status VARCHAR(10), updated_at VARCHAR(40))")

# False until start-up has confirmed the table exists: until then nothing is restricted and the screen says why.
ready = False
_CACHE_SECONDS = 20
_cache: dict = {}  # user_id -> (read at, record or None)

_ALL_VEHICLE_READERS = ("inventory", "sales", "jobs", "share", "leads", "crm", "warranty", "dashboard", "finance", "reports", "sanakhat")
_CUSTOMER_READERS = ("ledger", "sales", "crm", "leads", "finance", "jobs")

# (methods, path pattern, sections that open it, level needed). First match wins. None for sections = admin only /
# not part of any section: the role check alone decides.
_R, _W = "GET", "POST|PUT|PATCH|DELETE"
RULES = [
    # never granted from this screen
    ("DELETE", r"/vehicles/[^/]+(/legal-documents/[^/]+)?", None, None),
    ("DELETE", r"/(items|customers|expenses|crm/customers)/[^/]+", None, None),
    (_W, r"/vehicles/(import|[^/]+/return)", None, None),
    (_W, r"/sales/(import|[^/]+/(undo-return|resync-vehicle|review))", None, None),
    ("DELETE", r"/bookings/[^/]+", None, None),
    (_W, r"/bookings/[^/]+/cancel", None, None),
    (_W, r"/warranties/[^/]+/(length|restore)", None, None),
    # dashboard and reports
    (_R, r"/reports/(dashboard|accounting-summary|purchases)", ("dashboard", "reports"), "view"),
    (_R, r"/reports/vendor-dues", ("reports", "ledger"), "view"),
    (_R, r"/reports/inventory-pipeline-export", ("reports", "inventory"), "view"),
    (_R, r"/reports/.*", ("reports",), "view"),
    # finance
    (_R, r"/(fin/.*|finance/summary)", ("finance",), "view"),
    (_W, r"/fin/.*", ("finance",), "edit"),
    (_R, r"/settings", ("finance",), "view"),
    # job cards, warranty, sanakhat
    (_R, r"/jobs.*", ("jobs",), "view"),
    (_W, r"/jobs.*", ("jobs",), "edit"),
    (_R, r"/warranties", ("warranty",), "view"),
    (_W, r"/warranties/.*", ("warranty",), "edit"),
    ("PATCH", r"/vehicles/[^/]+/sale-statuses", ("sanakhat", "sales"), "edit"),
    (_R, r"/sanakhat/.*", ("sanakhat",), "view"),
    (_W, r"/sanakhat/.*", ("sanakhat",), "edit"),
    # spare parts
    (_R, r"/spare-parts.*", ("spare_parts", "jobs"), "view"),
    (_W, r"/spare-parts.*", ("spare_parts",), "edit"),
    # sales and bookings
    (_R, r"/(sales|bookings)(/.*)?", ("sales", "dashboard", "reports"), "view"),
    (_W, r"/(sales|bookings)(/.*)?", ("sales",), "edit"),
    (_W, r"/items/[^/]+/sell", ("sales", "inventory"), "edit"),
    (_R, r"/vehicles/[^/]+/active-sale", ("sales",), "view"),
    # inventory (vehicle and item reads are shared by the screens that pick a vehicle)
    ("PATCH", r"/vehicles/[^/]+/status", ("inventory", "jobs"), "edit"),
    (_R, r"/vehicles/[^/]+/expenses", ("inventory", "sales", "finance"), "view"),
    (_R, r"/vehicles/[^/]+/legal-documents", ("inventory", "sales", "sanakhat"), "view"),
    (_R, r"/vehicles(/.*)?", _ALL_VEHICLE_READERS, "view"),
    ("PUT", r"/vehicles/[^/]+", ("inventory", "sales"), "edit"),
    (_W, r"/vehicles(/.*)?", ("inventory",), "edit"),
    (_R, r"/items.*", ("inventory", "sales"), "view"),
    (_W, r"/items.*", ("inventory",), "edit"),
    (_W, r"/expenses.*", ("inventory",), "edit"),
    # marketing
    ("POST", r"/leads/seen", ("leads",), "view"),
    (_R, r"/leads.*", ("leads",), "view"),
    (_W, r"/leads.*", ("leads",), "edit"),
    (_R, r"/crm/.*", ("crm",), "view"),
    (_W, r"/crm/.*", ("crm",), "edit"),
    ("PUT", r"/customers/[^/]+/source", ("crm",), "edit"),
    ("POST", r"/share/captions", ("share",), "view"),
    (_R, r"/(share/.*|facebook/status)", ("share", "inventory"), "view"),
    ("POST", r"/facebook/post", ("share",), "edit"),
    (_R, r"/offers/.*", ("offers",), "view"),
    (_W, r"/offers/.*", ("offers",), "edit"),
    (_R, r"/visits/.*", ("visits",), "view"),
    # people: customers, vendors, staff
    (_R, r"/customers.*", _CUSTOMER_READERS, "view"),
    ("POST", r"/customers", ("ledger", "sales", "crm"), "edit"),
    (_W, r"/customers.*", ("ledger", "crm"), "edit"),
    (_R, r"/vendors/search", ("ledger", "inventory", "spare_parts"), "view"),
    ("POST", r"/vendors", ("ledger", "inventory", "spare_parts"), "edit"),
    (_R, r"/vendors.*", ("ledger", "finance"), "view"),
    (_W, r"/(vendors.*|vendor-payments.*)", ("ledger",), "edit"),
    (_R, r"/team.*", ("ledger", "sales", "jobs", "crm"), "view"),
    (_W, r"/team.*", ("ledger",), "edit"),
    # AI assistant
    (None, r"/ai/.*", ("ai",), "view"),
]


def rule_for(method: str, path: str):
    """(sections, level needed) for an API request, or None when this screen has no say over it. `path` starts after /api."""
    method = "GET" if method == "HEAD" else method
    path = path.rstrip("/") or "/"
    for methods, pattern, sections, need in RULES:
        if (methods is None or method in methods.split("|")) and re.fullmatch(pattern, path):
            return (sections, need) if sections else None
    return None


def decide(overrides: dict, method: str, path: str) -> Optional[bool]:
    """True = allow (even past the role check), False = refuse, None = leave it to the role."""
    rule = rule_for(method, path)
    if not rule or not overrides:
        return None
    sections, need = rule
    levels = [overrides.get(s) for s in sections]
    if any(lv in LEVELS and LEVELS[lv] >= LEVELS[need] for lv in levels):
        return True
    return False if all(lv in LEVELS for lv in levels) else None


def clean_access(raw) -> dict:
    return {k: v for k, v in (raw or {}).items() if k in SECTIONS and v in LEVELS} if isinstance(raw, dict) else {}


def _parse(row: Optional[dict]) -> Optional[dict]:
    if not row:
        return None
    try:
        access = json.loads(row.get("access") or "{}")
    except ValueError:
        access = {}
    return {**row, "access": clean_access(access), "status": row.get("status") or "active"}


def forget(user_id: Optional[str] = None) -> None:
    _cache.pop(user_id, None) if user_id else _cache.clear()


async def record_for(db, user_id: str) -> Optional[dict]:
    hit = _cache.get(user_id)
    if hit and time.monotonic() - hit[0] < _CACHE_SECONDS:
        return hit[1]
    rec = _parse(await db.staff_access.find_one({"id": user_id}, {"_id": 0}))
    _cache[user_id] = (time.monotonic(), rec)
    return rec


async def check(db, cu: dict, method: str, path: str) -> None:
    """Called for every request signed with this app's own login, after the company scope is set."""
    cu.pop("access_grant", None)  # only this function may set it
    if not ready or cu.get("role", "admin") in ("admin", "platform_owner") or not cu.get("user_id"):
        return
    try:
        rec = await record_for(db, cu["user_id"])
    except Exception:  # never guess when a restriction cannot be read
        logger.error("Could not read staff access", exc_info=True)
        raise HTTPException(503, "Could not check your access just now. Please try again.")
    if not rec:
        return
    if rec["status"] != "active":
        raise HTTPException(401, "Your access is paused. Ask your admin.")
    path = path[4:] if path.startswith("/api/") else path
    allowed = decide(rec["access"], method, path)
    if allowed is False:
        raise HTTPException(403, "Your account does not have access to this. Ask your admin.")
    if allowed:
        cu["access_grant"] = True


async def is_paused(db, user: dict) -> bool:
    """For the login form (no company scope yet, so the row is looked up by the user's own id and company)."""
    if not ready or user.get("role", "admin") in ("admin", "platform_owner") or not user.get("id"):
        return False
    try:
        row = await db.staff_access.find_one({"id": user["id"], "company_id": user.get("company_id")}, {"_id": 0})
    except Exception:  # the request check above still applies
        logger.warning("Could not check whether a login is paused", exc_info=True)
        return False
    return bool(row) and (row.get("status") or "active") != "active"


async def ensure_schema(db, backend: str) -> None:
    """Start-up: create the table (MariaDB or Supabase Postgres) and switch the feature on only if it is really there.
    Never raises."""
    global ready
    ready = False
    if backend not in ("mysql", "postgres"):
        ready = True  # the document backend needs no schema
        return
    try:
        await db.execute_raw(_DDL + (" ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" if backend == "mysql" else ""))
    except Exception:  # noqa: BLE001
        logger.warning("Could not create the staff_access table", exc_info=True)
    if backend == "postgres":  # like every other table: the public API key reads nothing, the backend connects directly
        try:
            await db.execute_raw("ALTER TABLE staff_access ENABLE ROW LEVEL SECURITY")
        except Exception:  # noqa: BLE001
            logger.warning("Could not enable row level security on staff_access", exc_info=True)
    try:
        await db.fetch_raw(f"SELECT {', '.join(sorted(COLUMNS))} FROM staff_access LIMIT 1")
        ready = True
    except Exception:  # noqa: BLE001
        logger.warning("Staff & Access is off: the staff_access table is not usable", exc_info=True)


class StaffBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    role: str
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=500)
    pan: Optional[str] = Field(default=None, max_length=50)
    job_title: Optional[str] = Field(default=None, max_length=100)
    work_start: Optional[str] = Field(default=None, max_length=5)
    work_end: Optional[str] = Field(default=None, max_length=5)
    access: dict = Field(default_factory=dict)
    status: str = "active"


def register(api_router, db, admin_only, company_scope, hash_password, roles: set):
    def _need_ready():
        if not ready:
            raise HTTPException(503, "Staff & Access needs a database update the server could not apply. Check the server log.")

    def _text(v):
        return (v or "").strip() or None

    @api_router.get("/staff")
    async def staff_list(cu: dict = Depends(admin_only)):
        users = await db.users.find(company_scope(cu), {"_id": 0, "password_hash": 0}).to_list(200)
        rows = {}
        if ready:
            rows = {r["id"]: _parse(r) for r in await db.staff_access.find({}, {"_id": 0}).to_list(500)}
        out = []
        for u in users:
            r = rows.get(u["id"]) or {}
            out.append({"id": u["id"], "name": u.get("name") or u["username"], "email": u["username"], "role": u.get("role", "admin"),
                        **{k: r.get(k) or "" for k in ("phone", "address", "pan", "job_title", "work_start", "work_end")},
                        "access": r.get("access") or {}, "status": r.get("status") or "active"})
        return {"ready": ready, "staff": sorted(out, key=lambda s: s["name"].lower())}

    @api_router.put("/staff/{uid}")
    async def staff_save(uid: str, body: StaffBody, cu: dict = Depends(admin_only)):
        """Everything on one person's card in one save: account name / role / new password, details and access."""
        _need_ready()
        target = await db.users.find_one({"id": uid, **company_scope(cu)})
        if not target:
            raise HTTPException(404, "Account not found")
        if body.role not in roles:
            raise HTTPException(422, "Unknown work role")
        if body.status not in ("active", "paused"):
            raise HTTPException(422, "Unknown status")
        for t in (body.work_start, body.work_end):
            if _text(t) and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t.strip()):
                raise HTTPException(422, "Write the work hours as HH:MM")
        if uid == cu.get("user_id") and (body.role != target.get("role", "admin") or body.status != "active"):
            raise HTTPException(400, "You cannot change your own role or pause yourself")
        if target.get("role", "admin") == "admin" and body.role != "admin":
            if await db.users.count_documents({"role": "admin", "id": {"$ne": uid}, **company_scope(cu)}) == 0:
                raise HTTPException(400, "Cannot change role: at least one Admin account must remain")
        admin = body.role == "admin"
        update = {"name": body.name.strip(), "role": body.role}
        if body.password:
            update["password_hash"] = await hash_password(body.password)
        record = {"phone": _text(body.phone), "address": _text(body.address), "pan": _text(body.pan), "job_title": _text(body.job_title),
                  "work_start": _text(body.work_start), "work_end": _text(body.work_end),
                  "access": json.dumps({} if admin else clean_access(body.access)),  # an Admin is never restricted
                  "status": "active" if admin else body.status, "updated_at": datetime.now(timezone.utc).isoformat()}
        # the restriction is written first: if it fails, the role has not been changed under the old restriction
        if await db.staff_access.find_one({"id": uid}, {"_id": 0, "id": 1}):
            await db.staff_access.update_one({"id": uid}, {"$set": record})
        else:
            await db.staff_access.insert_one({"id": uid, **record})
        await db.users.update_one({"id": uid, **company_scope(cu)}, {"$set": update})
        forget(uid)
        return {"ok": True}
