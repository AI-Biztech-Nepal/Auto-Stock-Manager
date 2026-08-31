"""A thin MySQL-backed stand-in for the subset of motor's (MongoDB async
driver) API that server.py actually calls, so the ~96 existing endpoints
don't need to be rewritten to move off MongoDB Atlas onto Hostinger MySQL.

Only two things about server.py's Mongo usage don't fit a generic
"filter-dict -> SQL WHERE" translation and get special-cased below:
  1. spare_parts.set_components — was an inline array mutated element-by-
     element via Mongo's positional `$` operator; here it's a real child
     table (spare_parts_set_components), joined in/out transparently.
  2. find_one_and_update's atomic `{"quantity": {"$gte": n}}` stock guard —
     translated to a single atomic `UPDATE ... WHERE quantity >= %s` (InnoDB
     row-locks the single statement, same race-safety as the Mongo version)
     followed by a re-SELECT, instead of Mongo's built-in find-and-modify.

See schema.sql for the table definitions and the conventions this module
assumes (VARCHAR timestamps, DOUBLE money fields, JSON blob columns, etc).
"""
import asyncio
import json
import os
import re
from types import SimpleNamespace
from typing import Optional

import aiomysql
from pymysql.constants import CLIENT


class ReturnDocument:
    """Mirrors pymongo.ReturnDocument so server.py's import keeps working
    unchanged regardless of which backend is active."""
    BEFORE = False
    AFTER = True


# ── Table metadata ──────────────────────────────────────────────────────
# columns: every real column in that table (schema.sql is the source of truth)
# bool_cols: columns stored as TINYINT(1) that must round-trip as Python bool
# json_cols: columns stored as MySQL JSON that must round-trip as list/dict
TABLES = {
    "companies": {"columns": {"id", "name", "created_at"}},
    "users": {"columns": {"id", "company_id", "username", "password_hash", "name", "role", "email_verified_at", "created_at"}},
    "auth_tokens": {"columns": {"id", "user_id", "purpose", "token_hash", "expires_at", "used_at", "created_at"}},
    "vendors": {"columns": {"id", "company_id", "name", "phone", "address", "notes", "vendor_type", "created_at"}},
    "customers": {"columns": {"id", "company_id", "name", "contact_number", "address", "occupation", "budget_min",
                               "budget_max", "interested_brands", "notes", "created_at", "last_purchase_date"}},
    "team_members": {"columns": {"id", "company_id", "name", "role", "contact", "specialization", "commission_rate",
                                  "joining_date", "is_active", "created_at"}, "bool_cols": {"is_active"}},
    "partners": {"columns": {"id", "company_id", "name", "capital_contribution", "stake_percentage", "contact", "created_at"}},
    "vehicles": {"columns": {"id", "company_id", "brand", "model", "variant", "year", "engine_cc", "fuel_type", "vehicle_type",
                              "ownership_number", "chassis_number", "engine_number", "kilometer_run", "condition",
                              "condition_rating", "color", "registration_number", "purchase_price",
                              "accessories_cost", "purchase_date", "purchase_source", "vendor_id", "purchase_from",
                              "linked_contact_type", "linked_contact_id", "linked_contact_name", "selling_price",
                              "minimum_selling_price", "notes", "status", "bluebook_status", "insurance_status",
                              "tax_clearance_status", "transfer_status", "created_at", "updated_at", "sold_date",
                              "customer_id", "salesperson_id", "salesperson_name", "discount", "created_by"}},
    "sales": {"columns": {"id", "company_id", "vehicle_id", "customer_id", "sale_price", "extra_expenses", "expenses_total",
                           "total_amount", "payment_method", "paid_cash", "paid_bank", "due_amount", "due_date",
                           "payment_status", "sale_date", "notes", "created_by", "created_at",
                           "updated_by", "updated_at", "returned", "returned_at", "returned_status",
                           "refund_amount", "retained_amount", "return_notes"},
              "bool_cols": {"returned"}, "json_cols": {"extra_expenses"}},
    "spare_parts": {"columns": {"id", "company_id", "name", "category", "brand_compatibility", "part_number", "quantity",
                                 "unit_cost", "selling_price", "vendor_id", "bill_no", "entry_date", "supplier",
                                 "min_stock_alert", "location", "notes", "is_kit", "stock_type", "created_at",
                                 "updated_at"}, "bool_cols": {"is_kit"}},
    "kit_components": {"columns": {"id", "company_id", "kit_part_id", "component_part_id", "qty_per_kit", "created_by",
                                    "created_at"}},
    "part_transactions": {"columns": {"id", "company_id", "part_id", "part_name", "type", "quantity", "reason", "date",
                                       "job_id", "notes", "created_by", "created_at"}},
    "job_cards": {"columns": {"id", "company_id", "vehicle_id", "is_external", "vehicle_brand", "vehicle_model", "vehicle_year",
                               "registration_number", "customer_name", "customer_contact", "work_description",
                               "mechanic_id", "mechanic_name", "estimated_cost", "notes", "coupon_no", "job_date",
                               "parts", "job_number", "status", "actual_cost", "created_at", "completed_at",
                               "created_by", "is_warranty", "updated_at"},
                  "bool_cols": {"is_external", "is_warranty"}, "json_cols": {"parts"}},
    "expenses": {"columns": {"id", "company_id", "vehicle_id", "category", "amount", "description", "date", "added_by",
                              "created_at"}},
    "vendor_payments": {"columns": {"id", "company_id", "vendor_id", "amount", "vehicle_id", "payment_date", "notes",
                                     "recorded_by", "created_at"}},
    "emi_records": {"columns": {"id", "company_id", "customer_id", "vehicle_id", "loan_amount", "down_payment", "interest_rate",
                                 "tenure_months", "start_date", "financer_name", "notes", "monthly_installment",
                                 "total_payable", "total_interest", "status", "created_at", "customer_name",
                                 "customer_phone", "vehicle_name"}},
    "emi_payments": {"columns": {"id", "company_id", "emi_id", "amount", "payment_date", "notes", "recorded_by", "created_at"}},
    "vehicle_photos": {"columns": {"id", "company_id", "vehicle_id", "filename", "content_type", "data", "uploaded_at", "size"}},
    "legal_documents": {"columns": {"id", "company_id", "vehicle_id", "filename", "content_type", "data", "doc_type",
                                     "original_name", "uploaded_at", "size"}},
    "leads": {"columns": {"id", "company_id", "type", "name", "phone", "message", "images", "requested_service", "vehicle_type",
                           "preferred_date", "status", "created_at"}, "json_cols": {"images"}},
    "settings": {"columns": {"id", "company_id", "logo_url", "business_name", "contact_phone", "contact_email", "address",
                              "hero_image_url", "service_image_url"}},
    "sync_logs": {"columns": {"id", "company_id", "pushed_at", "count", "status", "message"}},
    "audit_logs": {"columns": {"id", "company_id", "action", "vehicle_id", "user", "timestamp", "details"}},
    "ai_chat_sessions": {"columns": {"id", "company_id", "messages", "updated_at"}, "json_cols": {"messages"}},
}


def _quote(col: str) -> str:
    return f"`{col}`"


# Mongo's $regex is only ever used here as an anchored, case-insensitive exact
# match (`^literal$` + $options:"i") for dedup checks — never a real substring
# search. Rather than translate general PCRE into MySQL's regex dialect (a
# needless source of subtle bugs), detect that one shape and turn it into a
# plain case-insensitive equality, unescaping re.escape() if it was applied.
_ANCHORED = re.compile(r"^\^(.*)\$$")
_ESCAPED_CHAR = re.compile(r"\\(.)")


def _unescape_anchored_literal(pattern: str) -> Optional[str]:
    m = _ANCHORED.match(pattern)
    if not m:
        return None
    return _ESCAPED_CHAR.sub(r"\1", m.group(1))


def build_where(filt: dict):
    """Translates a Mongo-style filter dict into a SQL WHERE fragment + params.
    Supports exactly the operators server.py uses: equality, $gte, $lte, $ne,
    $in, $or, $exists, and the anchored $regex/$options case described above."""
    if not filt:
        return "1=1", []
    clauses, params = [], []
    for key, val in filt.items():
        if key == "$or":
            sub_sql = []
            for sub in val:
                c, p = build_where(sub)
                sub_sql.append(c)
                params.extend(p)
            clauses.append("(" + " OR ".join(f"({c})" for c in sub_sql) + ")")
        elif isinstance(val, dict):
            options = val.get("$options", "")
            for op, opval in val.items():
                if op == "$options":
                    continue
                if op == "$gte":
                    clauses.append(f"{_quote(key)} >= %s"); params.append(opval)
                elif op == "$lte":
                    clauses.append(f"{_quote(key)} <= %s"); params.append(opval)
                elif op == "$ne":
                    # SQL's three-valued logic means `col != %s` is NULL (not true) when col
                    # IS NULL, silently excluding those rows — but Mongo's $ne treats a
                    # missing/null field as satisfying the condition. Match that explicitly,
                    # or every row where this field was never set gets wrongly filtered out.
                    clauses.append(f"({_quote(key)} != %s OR {_quote(key)} IS NULL)"); params.append(opval)
                elif op == "$in":
                    items = list(opval)
                    if not items:
                        clauses.append("1=0")
                    else:
                        clauses.append(f"{_quote(key)} IN ({','.join(['%s'] * len(items))})")
                        params.extend(items)
                elif op == "$exists":
                    # Mongo's $exists on a field that's never had a default in SQL means
                    # "is this column NULL" — server.py only ever uses this for the
                    # company_id backfill migration (update_many({"company_id": {"$exists":
                    # False}}, ...)), never on a column that could legitimately be NULL for
                    # another reason, so the IS (NOT) NULL translation is exact here.
                    clauses.append(f"{_quote(key)} IS {'NOT ' if opval else ''}NULL")
                elif op == "$regex":
                    literal = _unescape_anchored_literal(opval)
                    if literal is not None and "i" in options:
                        clauses.append(f"LOWER({_quote(key)}) = LOWER(%s)")
                        params.append(literal)
                    else:
                        clauses.append(f"{_quote(key)} REGEXP %s")
                        params.append(opval)
                else:
                    raise ValueError(f"Unsupported Mongo operator translated to SQL: {op}")
        else:
            clauses.append(f"{_quote(key)} = %s")
            params.append(val)
    return (" AND ".join(clauses) if clauses else "1=1"), params


class MySQLDatabase:
    """Stands in for motor's AsyncIOMotorDatabase. Connects lazily (mirrors
    motor's own non-blocking constructor) so it's safe to instantiate at
    module import time, before any event loop is running."""

    def __init__(self):
        self._pool = None
        self._lock = asyncio.Lock()
        self.host = os.environ.get("MYSQL_HOST", "localhost")
        self.port = int(os.environ.get("MYSQL_PORT", "3306"))
        self.user = os.environ["MYSQL_USER"]
        self.password = os.environ["MYSQL_PASSWORD"]
        self.db_name = os.environ.get("MYSQL_DB") or os.environ["DB_NAME"]

    async def get_pool(self):
        if self._pool is None:
            async with self._lock:
                if self._pool is None:
                    self._pool = await aiomysql.create_pool(
                        host=self.host, port=self.port, user=self.user, password=self.password,
                        db=self.db_name, autocommit=True, minsize=1, maxsize=5, charset="utf8mb4",
                        # Recycle any pooled connection older than this before handing it out.
                        # MySQL (especially shared hosting) closes idle connections server-side
                        # after its wait_timeout; without recycling the pool serves a dead
                        # socket and the request fails with "MySQL server has gone away" /
                        # "Lost connection" until a fresh connection happens to be made. 180s
                        # sits safely under any realistic wait_timeout.
                        pool_recycle=int(os.environ.get("MYSQL_POOL_RECYCLE", "180")),
                        # Don't let a network/DNS problem hang a request forever on connect.
                        connect_timeout=10,
                        # matched_count (below) must reflect matched rows, not changed rows —
                        # without this flag MySQL reports 0 for a matching no-op update, which
                        # server.py reads as "not found" and would wrongly 404.
                        client_flag=CLIENT.FOUND_ROWS,
                    )
        return self._pool

    def __getattr__(self, name):
        if name not in TABLES:
            raise AttributeError(f"No such collection/table: {name}")
        return MySQLCollection(self, name)

    def close(self):
        if self._pool is not None:
            self._pool.close()


class MySQLCollection:
    def __init__(self, db: MySQLDatabase, name: str):
        self._db = db
        self.name = name
        meta = TABLES[name]
        self._columns = meta["columns"]
        self._bool_cols = meta.get("bool_cols", set())
        self._json_cols = meta.get("json_cols", set())

    async def _pool(self):
        return await self._db.get_pool()

    # ── doc <-> row conversion ───────────────────────────────────────────
    def _row_to_doc(self, row: dict) -> dict:
        doc = dict(row)
        for c in self._bool_cols:
            if doc.get(c) is not None:
                doc[c] = bool(doc[c])
        for c in self._json_cols:
            if doc.get(c) is not None and isinstance(doc[c], str):
                doc[c] = json.loads(doc[c])
        return doc

    def _doc_to_row(self, doc: dict) -> dict:
        row = {}
        for k, v in doc.items():
            if k not in self._columns:
                continue
            if k in self._bool_cols:
                v = 1 if v else 0
            elif k in self._json_cols and v is not None:
                v = json.dumps(v)
            row[k] = v
        return row

    def _resolve_projection(self, projection: Optional[dict]):
        """Returns (sql_columns, strip_id_after). `id` is always fetched
        internally (needed to join spare_parts_set_components) even under an
        include-projection that didn't ask for it — in that case strip_id_after
        tells the caller to drop it again before returning, to match Mongo's
        exact projection semantics."""
        if not projection:
            return list(self._columns), False
        include = [k for k, v in projection.items() if v == 1 and k != "_id"]
        exclude = [k for k, v in projection.items() if v == 0 and k != "_id"]
        if include:
            wanted = [c for c in include if c in self._columns]
            strip_id = "id" not in wanted
            if strip_id:
                wanted = ["id"] + wanted
            return wanted, strip_id
        if exclude:
            return [c for c in self._columns if c not in exclude], False
        return list(self._columns), False

    def _wants_set_components(self, projection: Optional[dict]) -> bool:
        if self.name != "spare_parts":
            return False
        if not projection:
            return True
        has_include = any(v == 1 for k, v in projection.items() if k != "_id")
        if has_include:
            return projection.get("set_components") == 1
        return projection.get("set_components") != 0

    async def _fetch_set_components(self, part_ids: list) -> dict:
        if not part_ids:
            return {}
        pool = await self._pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                ph = ",".join(["%s"] * len(part_ids))
                await cur.execute(
                    f"SELECT part_id, name, stock, rate FROM spare_parts_set_components WHERE part_id IN ({ph})",
                    part_ids,
                )
                rows = await cur.fetchall()
        by_part: dict = {}
        for r in rows:
            by_part.setdefault(r["part_id"], []).append({"name": r["name"], "stock": r["stock"], "rate": r["rate"]})
        return by_part

    async def _attach_set_components(self, docs: list, projection):
        if not self._wants_set_components(projection) or not docs:
            return
        by_part = await self._fetch_set_components([d["id"] for d in docs])
        for d in docs:
            d["set_components"] = by_part.get(d["id"], [])

    # ── reads ─────────────────────────────────────────────────────────
    async def find_one(self, filt: Optional[dict] = None, projection: Optional[dict] = None, sort=None):
        pool = await self._pool()
        where, params = build_where(filt or {})
        cols, strip_id = self._resolve_projection(projection)
        order_sql = self._order_sql(sort)
        sql = f"SELECT {', '.join(_quote(c) for c in cols)} FROM {self.name} WHERE {where}{order_sql} LIMIT 1"
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                row = await cur.fetchone()
        if row is None:
            return None
        doc = self._row_to_doc(row)
        await self._attach_set_components([doc], projection)
        if strip_id:
            doc.pop("id", None)
        return doc

    def find(self, filt: Optional[dict] = None, projection: Optional[dict] = None):
        return _Cursor(self, filt, projection)

    async def _execute_find(self, filt, projection, sort, limit):
        pool = await self._pool()
        where, params = build_where(filt or {})
        cols, strip_id = self._resolve_projection(projection)
        order_sql = self._order_sql(sort)
        limit_sql = f" LIMIT {int(limit)}" if limit else ""
        sql = f"SELECT {', '.join(_quote(c) for c in cols)} FROM {self.name} WHERE {where}{order_sql}{limit_sql}"
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(sql, params)
                rows = await cur.fetchall()
        docs = [self._row_to_doc(r) for r in rows]
        await self._attach_set_components(docs, projection)
        if strip_id:
            for d in docs:
                d.pop("id", None)
        return docs

    @staticmethod
    def _order_sql(sort) -> str:
        if not sort:
            return ""
        return " ORDER BY " + ", ".join(f"{_quote(f)} {'DESC' if d < 0 else 'ASC'}" for f, d in sort)

    async def count_documents(self, filt: Optional[dict] = None) -> int:
        pool = await self._pool()
        where, params = build_where(filt or {})
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"SELECT COUNT(*) FROM {self.name} WHERE {where}", params)
                (n,) = await cur.fetchone()
        return n

    async def distinct(self, field: str, filt: Optional[dict] = None) -> list:
        pool = await self._pool()
        where, params = build_where(filt or {})
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"SELECT DISTINCT {_quote(field)} FROM {self.name} WHERE {where}", params)
                rows = await cur.fetchall()
        return [r[0] for r in rows]

    # ── writes ────────────────────────────────────────────────────────
    async def _insert(self, cur, doc: dict):
        doc = dict(doc)
        doc.pop("_id", None)
        set_components = doc.pop("set_components", None) if self.name == "spare_parts" else None
        row = self._doc_to_row(doc)
        cols = list(row.keys())
        sql = f"INSERT INTO {self.name} ({', '.join(_quote(c) for c in cols)}) VALUES ({', '.join(['%s'] * len(cols))})"
        await cur.execute(sql, [row[c] for c in cols])
        if set_components:
            for comp in set_components:
                await cur.execute(
                    "INSERT INTO spare_parts_set_components (part_id, name, stock, rate) VALUES (%s,%s,%s,%s)",
                    (doc["id"], comp["name"], comp.get("stock", 0), comp.get("rate", 0)),
                )

    async def insert_one(self, doc: dict):
        pool = await self._pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await self._insert(cur, doc)
        return SimpleNamespace(inserted_id=doc.get("id"))

    async def insert_many(self, docs: list):
        pool = await self._pool()
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                for doc in docs:
                    await self._insert(cur, doc)
        return SimpleNamespace(inserted_ids=[d.get("id") for d in docs])

    def _is_set_component_op(self, filt: dict, update: dict) -> bool:
        keys = set(filt) | set(update.get("$set", {})) | set(update.get("$inc", {}))
        return self.name == "spare_parts" and any(k.startswith("set_components.") for k in keys)

    async def update_one(self, filt: dict, update: dict, upsert: bool = False):
        if self._is_set_component_op(filt, update):
            return await self._update_set_component(filt, update)
        pool = await self._pool()
        where, where_params = build_where(filt)
        assignments, aparams = [], []
        # A whole-list replacement of spare_parts.set_components (the PUT edit
        # endpoint) — as opposed to the single-element positional-`$` case
        # handled above — isn't a real column; it re-seeds the child table.
        set_components_replace = None
        for k, v in update.get("$set", {}).items():
            if self.name == "spare_parts" and k == "set_components":
                set_components_replace = v
                continue
            if k not in self._columns:
                continue
            if k in self._json_cols and v is not None:
                v = json.dumps(v)
            elif k in self._bool_cols:
                v = 1 if v else 0
            assignments.append(f"{_quote(k)} = %s"); aparams.append(v)
        for k, v in update.get("$inc", {}).items():
            if k not in self._columns:
                continue
            assignments.append(f"{_quote(k)} = {_quote(k)} + %s"); aparams.append(v)
        if not assignments:
            # Still need an accurate matched_count (server.py 404s on 0), and a
            # bare "WHERE ... " with nothing to SET isn't valid SQL — issue a
            # harmless self-assignment so FOUND_ROWS still reports correctly.
            assignments, aparams = [f"{_quote('id')} = {_quote('id')}"], []
        matched = 0
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                sql = f"UPDATE {self.name} SET {', '.join(assignments)} WHERE {where}"
                await cur.execute(sql, (*aparams, *where_params))
                matched = cur.rowcount
                if matched == 0 and upsert:
                    doc = {k: v for k, v in filt.items() if k != "$or" and not isinstance(v, dict)}
                    doc.update(update.get("$set", {}))
                    await self._insert(cur, doc)
                    matched = 1
                elif matched > 0 and set_components_replace is not None:
                    part_id = filt.get("id")
                    await cur.execute("DELETE FROM spare_parts_set_components WHERE part_id = %s", (part_id,))
                    for comp in set_components_replace:
                        await cur.execute(
                            "INSERT INTO spare_parts_set_components (part_id, name, stock, rate) VALUES (%s,%s,%s,%s)",
                            (part_id, comp["name"], comp.get("stock", 0), comp.get("rate", 0)),
                        )
        return SimpleNamespace(matched_count=matched)

    async def update_many(self, filt: dict, update: dict):
        """Only used for the multi-tenant company_id backfill migration in server.py's
        startup() — a plain $set over whatever $exists/equality filter matches, no upsert
        and no spare_parts.set_components special-casing (Mongo's update_many doesn't
        support either here). MySQL's UPDATE with no LIMIT already affects every matching
        row, same as update_one's own SQL above minus the single-row assumption, so this
        is a lean version of that rather than a call to it."""
        pool = await self._pool()
        where, where_params = build_where(filt)
        assignments, aparams = [], []
        for k, v in update.get("$set", {}).items():
            if k not in self._columns:
                continue
            if k in self._json_cols and v is not None:
                v = json.dumps(v)
            elif k in self._bool_cols:
                v = 1 if v else 0
            assignments.append(f"{_quote(k)} = %s"); aparams.append(v)
        if not assignments:
            return SimpleNamespace(matched_count=0)
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                sql = f"UPDATE {self.name} SET {', '.join(assignments)} WHERE {where}"
                await cur.execute(sql, (*aparams, *where_params))
                matched = cur.rowcount
        return SimpleNamespace(matched_count=matched)

    async def find_one_and_update(self, filt: dict, update: dict, return_document=ReturnDocument.AFTER,
                                   projection: Optional[dict] = None):
        # projection is accepted for signature parity with motor but otherwise unused here —
        # every caller only ever passes {"_id": 0}, which is already a no-op for MySQL rows
        # (there's no _id column to strip in the first place).
        if self._is_set_component_op(filt, update):
            return await self._find_one_and_update_set_component(filt, update)
        assert "id" in filt, "find_one_and_update requires an 'id' filter in this adapter"
        pool = await self._pool()
        where, where_params = build_where(filt)
        assignments, aparams = [], []
        for k, v in update.get("$inc", {}).items():
            if k in self._columns:
                assignments.append(f"{_quote(k)} = {_quote(k)} + %s"); aparams.append(v)
        for k, v in update.get("$set", {}).items():
            if k in self._columns:
                assignments.append(f"{_quote(k)} = %s"); aparams.append(v)
        if not assignments:
            return None
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(f"UPDATE {self.name} SET {', '.join(assignments)} WHERE {where}",
                                   (*aparams, *where_params))
                if cur.rowcount != 1:
                    return None
                await cur.execute(f"SELECT * FROM {self.name} WHERE id = %s", (filt["id"],))
                row = await cur.fetchone()
        doc = self._row_to_doc(row)
        if self.name == "spare_parts":
            by_part = await self._fetch_set_components([doc["id"]])
            doc["set_components"] = by_part.get(doc["id"], [])
        return doc

    async def _update_set_component(self, filt: dict, update: dict):
        pool = await self._pool()
        part_id = filt["id"]
        comp_name = filt["set_components.name"]
        guard = filt.get("set_components.stock")
        set_val = update.get("$set", {}).get("set_components.$.stock")
        inc_val = update.get("$inc", {}).get("set_components.$.stock")
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                if set_val is not None:
                    await cur.execute(
                        "UPDATE spare_parts_set_components SET stock = %s WHERE part_id = %s AND name = %s",
                        (set_val, part_id, comp_name),
                    )
                elif guard is not None and "$gte" in guard:
                    await cur.execute(
                        "UPDATE spare_parts_set_components SET stock = stock + %s "
                        "WHERE part_id = %s AND name = %s AND stock >= %s",
                        (inc_val, part_id, comp_name, guard["$gte"]),
                    )
                else:
                    await cur.execute(
                        "UPDATE spare_parts_set_components SET stock = stock + %s WHERE part_id = %s AND name = %s",
                        (inc_val, part_id, comp_name),
                    )
                matched = cur.rowcount
        return SimpleNamespace(matched_count=matched)

    async def _find_one_and_update_set_component(self, filt: dict, update: dict):
        r = await self._update_set_component(filt, update)
        if r.matched_count != 1:
            return None
        part_id = filt["id"]
        pool = await self._pool()
        async with pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute("SELECT * FROM spare_parts WHERE id = %s", (part_id,))
                row = await cur.fetchone()
        doc = self._row_to_doc(row)
        by_part = await self._fetch_set_components([part_id])
        doc["set_components"] = by_part.get(part_id, [])
        return doc

    async def delete_one(self, filt: dict):
        pool = await self._pool()
        where, params = build_where(filt)
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"DELETE FROM {self.name} WHERE {where} LIMIT 1", params)
                n = cur.rowcount
        return SimpleNamespace(deleted_count=n)

    async def delete_many(self, filt: dict):
        pool = await self._pool()
        where, params = build_where(filt)
        async with pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(f"DELETE FROM {self.name} WHERE {where}", params)
                n = cur.rowcount
        return SimpleNamespace(deleted_count=n)

    async def create_index(self, *args, **kwargs):
        """No-op: schema.sql already defines every index/unique constraint
        server.py creates at startup against Mongo."""
        return None


class _Cursor:
    def __init__(self, collection: MySQLCollection, filt, projection):
        self._collection = collection
        self._filt = filt
        self._projection = projection
        self._sort = None

    def sort(self, *args):
        # motor supports both .sort("field", -1) and .sort([("field", -1), ...])
        self._sort = args[0] if len(args) == 1 else [(args[0], args[1])]
        return self

    async def to_list(self, length=None):
        return await self._collection._execute_find(self._filt, self._projection, self._sort, length)
