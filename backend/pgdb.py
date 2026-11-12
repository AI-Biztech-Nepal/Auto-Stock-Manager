"""Postgres (Supabase) version of sqldb.py: the same stand-in for the bits of motor's API that server.py calls
(db.<table>.find_one / find / insert_one / update_one / ... with Mongo-style filter dicts), talking to Postgres
through psycopg 3. Selected with DB_BACKEND=postgres and SUPABASE_DB_URL; sqldb.py (MariaDB) is left as it was so
switching back is just changing DB_BACKEND.

Differences from MariaDB that this file smooths over, so server.py needs no changes:
  * identifiers are double-quoted (reserved words like "user" and "condition" are column names);
  * booleans are real booleans, JSON columns are jsonb (psycopg hands them back already parsed);
  * Postgres puts NULLs last when sorting ascending and first when descending, MariaDB the opposite -
    ORDER BY says NULLS FIRST / NULLS LAST so the order stays what it was;
  * integers are sent untyped, so comparing a VARCHAR column with a number works the way it did in MariaDB;
  * DELETE ... LIMIT 1 is not Postgres, UPDATE ... RETURNING replaces the update-then-SELECT pair, and an UPDATE's
    row count is already the number of rows matched (no FOUND_ROWS flag).
Text comparison is case-sensitive here, like MongoDB; MariaDB's was not. users.username is the one column that
needs the old behaviour (people log in as "Admin" and "admin"), and it is a citext column for that reason.
Tables are in schema.sql under backend/supabase/. PG_SCHEMA (optional) sets the search_path, for tests.
"""
import asyncio
import json
import os
from types import SimpleNamespace
from typing import Optional

from psycopg.adapt import Dumper
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from sqldb import TABLES, ReturnDocument, _Cursor, _unescape_anchored_literal

__all__ = ["PostgresDatabase", "ReturnDocument"]


class _IntAsUnknown(Dumper):
    """Send Python ints as untyped literals: the server then reads them as whatever the other side of the
    comparison is (text, integer, double...), which is the leniency MariaDB had and server.py relies on."""

    def dump(self, obj):
        return str(obj).encode()


async def _configure(conn):
    conn.adapters.register_dumper(int, _IntAsUnknown)


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def build_where(filt: dict, bool_cols=frozenset()):
    """Mongo-style filter dict -> (SQL WHERE fragment with %s placeholders, params). Supports exactly the operators
    server.py uses: equality, $gt, $gte, $lt, $lte, $ne, $in, $or, $exists and the anchored/unanchored $regex."""
    if not filt:
        return "TRUE", []

    def val(col, v):
        # a boolean column compared with 0/1 (MariaDB stored them as TINYINT)
        return bool(v) if col in bool_cols and isinstance(v, int) else v

    clauses, params = [], []
    for key, v in filt.items():
        q = _quote(key)
        if key == "$or":
            subs = []
            for sub in v:
                c, p = build_where(sub, bool_cols)
                subs.append(f"({c})")
                params.extend(p)
            clauses.append("(" + " OR ".join(subs) + ")")
        elif isinstance(v, dict):
            options = v.get("$options", "")
            for op, opval in v.items():
                if op == "$options":
                    continue
                if op in ("$gte", "$lte", "$gt", "$lt"):
                    sym = {"$gte": ">=", "$lte": "<=", "$gt": ">", "$lt": "<"}[op]
                    clauses.append(f"{q} {sym} %s"); params.append(val(key, opval))
                elif op == "$ne":
                    # SQL's NULL != x is NULL, not true; Mongo's $ne (and the MariaDB layer) counts a missing value.
                    clauses.append(f"({q} != %s OR {q} IS NULL)"); params.append(val(key, opval))
                elif op == "$in":
                    items = list(opval)
                    if not items:
                        clauses.append("FALSE")
                    else:
                        clauses.append(f"{q} IN ({','.join(['%s'] * len(items))})")
                        params.extend(val(key, i) for i in items)
                elif op == "$exists":
                    clauses.append(f"{q} IS {'NOT ' if opval else ''}NULL")
                elif op == "$regex":
                    literal = _unescape_anchored_literal(opval)
                    if literal is not None and "i" in options:
                        clauses.append(f"LOWER({q}) = LOWER(%s)"); params.append(literal)
                    else:
                        clauses.append(f"{q} ~* %s"); params.append(opval)
                else:
                    raise ValueError(f"Unsupported Mongo operator translated to SQL: {op}")
        else:
            clauses.append(f"{q} = %s"); params.append(val(key, v))
    return (" AND ".join(clauses) if clauses else "TRUE"), params


class PostgresDatabase:
    """Stands in for motor's AsyncIOMotorDatabase. Connects lazily, so it is safe to create at import time."""

    def __init__(self):
        self._pool = None
        self._lock = asyncio.Lock()
        self.dsn = os.environ["SUPABASE_DB_URL"]
        self.schema = os.environ.get("PG_SCHEMA")

    async def get_pool(self):
        if self._pool is None:
            async with self._lock:
                if self._pool is None:
                    kwargs = {
                        "autocommit": True,          # one statement, one transaction - as with the MariaDB layer
                        "prepare_threshold": None,   # no server-side prepared statements: works behind Supabase's pooler
                        "connect_timeout": 10,
                    }
                    if self.schema:
                        kwargs["options"] = f"-c search_path={self.schema},public"
                    pool = AsyncConnectionPool(
                        self.dsn, min_size=1, max_size=int(os.environ.get("PG_POOL_MAX", "5")), kwargs=kwargs,
                        configure=_configure, open=False,
                        check=AsyncConnectionPool.check_connection,  # drop a connection the server closed while idle
                        max_lifetime=int(os.environ.get("PG_POOL_RECYCLE", "600")),
                    )
                    try:
                        await pool.open(wait=True, timeout=15)
                    except BaseException:
                        await pool.close()  # don't leave a half-open pool retrying in the background
                        raise
                    self._pool = pool
        return self._pool

    async def execute_raw(self, sql: str):
        """One literal SQL statement (schema changes only, no user data)."""
        pool = await self.get_pool()
        async with pool.connection() as conn:
            await conn.execute(sql)

    def __getattr__(self, name):
        if name.startswith("_") or name not in TABLES:
            raise AttributeError(f"No such collection/table: {name}")
        return PostgresCollection(self, name)

    def close(self):
        """Returns a coroutine (server.py's shutdown awaits it)."""
        if self._pool is not None:
            return self._pool.close()


class PostgresCollection:
    def __init__(self, db: PostgresDatabase, name: str):
        self._db = db
        self.name = name
        self._table = _quote(name)
        meta = TABLES[name]
        self._columns = meta["columns"]
        self._bool_cols = meta.get("bool_cols", set())
        self._json_cols = meta.get("json_cols", set())

    # ── plumbing ──────────────────────────────────────────────────────────
    async def _run(self, sql: str, params=(), fetch: str = "none"):
        """One statement on one pooled connection. fetch: 'all' | 'one' | 'none'. Returns (rows, rowcount)."""
        pool = await self._db.get_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(sql, params)
                rows = await cur.fetchall() if fetch == "all" else await cur.fetchone() if fetch == "one" else None
                return rows, cur.rowcount

    def _where(self, filt):
        return build_where(filt or {}, self._bool_cols)

    def _write_value(self, k, v):
        if k in self._bool_cols:
            return bool(v)
        if k in self._json_cols and v is not None:
            return json.dumps(v)
        return v

    # ── doc <-> row conversion ────────────────────────────────────────────
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
        return {k: self._write_value(k, v) for k, v in doc.items() if k in self._columns}

    def _resolve_projection(self, projection: Optional[dict]):
        """(columns to select, whether to drop `id` again afterwards). `id` is always fetched (it joins in a
        spare part's set components) and removed afterwards when the projection did not ask for it."""
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
        if any(v == 1 for k, v in projection.items() if k != "_id"):
            return projection.get("set_components") == 1
        return projection.get("set_components") != 0

    async def _fetch_set_components(self, part_ids: list) -> dict:
        if not part_ids:
            return {}
        ph = ",".join(["%s"] * len(part_ids))
        rows, _ = await self._run(
            f"SELECT part_id, name, stock, rate FROM spare_parts_set_components WHERE part_id IN ({ph})", part_ids, "all")
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

    @staticmethod
    def _order_sql(sort) -> str:
        if not sort:
            return ""
        # MariaDB: NULLs first when ascending, last when descending. Say so, because Postgres does the reverse.
        return " ORDER BY " + ", ".join(
            f"{_quote(f)} {'DESC NULLS LAST' if d < 0 else 'ASC NULLS FIRST'}" for f, d in sort)

    # ── reads ─────────────────────────────────────────────────────────────
    async def find_one(self, filt: Optional[dict] = None, projection: Optional[dict] = None, sort=None):
        where, params = self._where(filt)
        cols, strip_id = self._resolve_projection(projection)
        sql = f"SELECT {', '.join(_quote(c) for c in cols)} FROM {self._table} WHERE {where}{self._order_sql(sort)} LIMIT 1"
        row, _ = await self._run(sql, params, "one")
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
        where, params = self._where(filt)
        cols, strip_id = self._resolve_projection(projection)
        limit_sql = f" LIMIT {int(limit)}" if limit else ""
        sql = (f"SELECT {', '.join(_quote(c) for c in cols)} FROM {self._table} WHERE {where}"
               f"{self._order_sql(sort)}{limit_sql}")
        rows, _ = await self._run(sql, params, "all")
        docs = [self._row_to_doc(r) for r in rows]
        await self._attach_set_components(docs, projection)
        if strip_id:
            for d in docs:
                d.pop("id", None)
        return docs

    async def count_documents(self, filt: Optional[dict] = None) -> int:
        where, params = self._where(filt)
        row, _ = await self._run(f"SELECT COUNT(*) AS n FROM {self._table} WHERE {where}", params, "one")
        return row["n"]

    async def distinct(self, field: str, filt: Optional[dict] = None) -> list:
        where, params = self._where(filt)
        rows, _ = await self._run(f"SELECT DISTINCT {_quote(field)} AS v FROM {self._table} WHERE {where}", params, "all")
        return [r["v"] for r in rows]

    # ── writes ────────────────────────────────────────────────────────────
    async def _insert(self, doc: dict):
        doc = dict(doc)
        doc.pop("_id", None)
        set_components = doc.pop("set_components", None) if self.name == "spare_parts" else None
        row = self._doc_to_row(doc)
        cols = list(row.keys())
        await self._run(
            f"INSERT INTO {self._table} ({', '.join(_quote(c) for c in cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
            [row[c] for c in cols])
        for comp in set_components or []:
            await self._run(
                "INSERT INTO spare_parts_set_components (part_id, name, stock, rate) VALUES (%s,%s,%s,%s)",
                (doc["id"], comp["name"], comp.get("stock", 0), comp.get("rate", 0)))

    async def insert_one(self, doc: dict):
        await self._insert(doc)
        return SimpleNamespace(inserted_id=doc.get("id"))

    async def insert_many(self, docs: list):
        for doc in docs:
            await self._insert(doc)
        return SimpleNamespace(inserted_ids=[d.get("id") for d in docs])

    def _is_set_component_op(self, filt: dict, update: dict) -> bool:
        keys = set(filt) | set(update.get("$set", {})) | set(update.get("$inc", {}))
        return self.name == "spare_parts" and any(k.startswith("set_components.") for k in keys)

    def _assignments(self, update: dict, skip_set_components: bool = False):
        """($inc first, then $set) -> (['"col" = %s', ...], params, replacement set_components list or None)."""
        assignments, params, replace = [], [], None
        for k, v in update.get("$inc", {}).items():
            if k in self._columns:
                assignments.append(f"{_quote(k)} = {_quote(k)} + %s"); params.append(v)
        for k, v in update.get("$set", {}).items():
            if skip_set_components and self.name == "spare_parts" and k == "set_components":
                replace = v   # a whole-list replacement re-seeds the child table; it is not a column
                continue
            if k in self._columns:
                assignments.append(f"{_quote(k)} = %s"); params.append(self._write_value(k, v))
        return assignments, params, replace

    async def update_one(self, filt: dict, update: dict, upsert: bool = False):
        if self._is_set_component_op(filt, update):
            return await self._update_set_component(filt, update)
        where, where_params = self._where(filt)
        assignments, aparams, set_components_replace = self._assignments(update, skip_set_components=True)
        if not assignments:
            # Still need an accurate matched_count (server.py 404s on 0); a self-assignment is harmless.
            assignments, aparams = [f"{_quote('id')} = {_quote('id')}"], []
        _, matched = await self._run(
            f"UPDATE {self._table} SET {', '.join(assignments)} WHERE {where}", (*aparams, *where_params))
        if matched == 0 and upsert:
            doc = {k: v for k, v in filt.items() if k != "$or" and not isinstance(v, dict)}
            doc.update(update.get("$set", {}))
            await self._insert(doc)
            matched = 1
        elif matched > 0 and set_components_replace is not None:
            part_id = filt.get("id")
            await self._run("DELETE FROM spare_parts_set_components WHERE part_id = %s", (part_id,))
            for comp in set_components_replace:
                await self._run(
                    "INSERT INTO spare_parts_set_components (part_id, name, stock, rate) VALUES (%s,%s,%s,%s)",
                    (part_id, comp["name"], comp.get("stock", 0), comp.get("rate", 0)))
        return SimpleNamespace(matched_count=matched)

    async def update_many(self, filt: dict, update: dict):
        """A plain $set over whatever the filter matches (the startup backfills in server.py)."""
        where, where_params = self._where(filt)
        assignments, aparams, _ = self._assignments({"$set": update.get("$set", {})})
        if not assignments:
            return SimpleNamespace(matched_count=0)
        _, matched = await self._run(
            f"UPDATE {self._table} SET {', '.join(assignments)} WHERE {where}", (*aparams, *where_params))
        return SimpleNamespace(matched_count=matched)

    async def find_one_and_update(self, filt: dict, update: dict, return_document=ReturnDocument.AFTER,
                                   projection: Optional[dict] = None):
        # projection is accepted for signature parity with motor; every caller passes {"_id": 0}.
        if self._is_set_component_op(filt, update):
            return await self._find_one_and_update_set_component(filt, update)
        assert "id" in filt, "find_one_and_update requires an 'id' filter in this adapter"
        where, where_params = self._where(filt)
        assignments, aparams, _ = self._assignments(update)
        if not assignments:
            return None
        # One atomic statement: the stock guard in the filter and the new row come back together.
        rows, n = await self._run(
            f"UPDATE {self._table} SET {', '.join(assignments)} WHERE {where} RETURNING *",
            (*aparams, *where_params), "all")
        if n != 1:
            return None
        doc = self._row_to_doc(rows[0])
        if self.name == "spare_parts":
            doc["set_components"] = (await self._fetch_set_components([doc["id"]])).get(doc["id"], [])
        return doc

    async def _update_set_component(self, filt: dict, update: dict):
        part_id = filt["id"]
        comp_name = filt["set_components.name"]
        guard = filt.get("set_components.stock")
        set_val = update.get("$set", {}).get("set_components.$.stock")
        inc_val = update.get("$inc", {}).get("set_components.$.stock")
        if set_val is not None:
            sql, params = ("UPDATE spare_parts_set_components SET stock = %s WHERE part_id = %s AND name = %s",
                           (set_val, part_id, comp_name))
        elif guard is not None and "$gte" in guard:
            sql, params = ("UPDATE spare_parts_set_components SET stock = stock + %s "
                           "WHERE part_id = %s AND name = %s AND stock >= %s",
                           (inc_val, part_id, comp_name, guard["$gte"]))
        else:
            sql, params = ("UPDATE spare_parts_set_components SET stock = stock + %s WHERE part_id = %s AND name = %s",
                           (inc_val, part_id, comp_name))
        _, matched = await self._run(sql, params)
        return SimpleNamespace(matched_count=matched)

    async def _find_one_and_update_set_component(self, filt: dict, update: dict):
        r = await self._update_set_component(filt, update)
        if r.matched_count != 1:
            return None
        part_id = filt["id"]
        row, _ = await self._run(f"SELECT * FROM {self._table} WHERE id = %s", (part_id,), "one")
        doc = self._row_to_doc(row)
        doc["set_components"] = (await self._fetch_set_components([part_id])).get(part_id, [])
        return doc

    async def delete_one(self, filt: dict):
        where, params = self._where(filt)
        # Postgres has no DELETE ... LIMIT: pick one row by its physical address.
        _, n = await self._run(
            f"DELETE FROM {self._table} WHERE ctid IN (SELECT ctid FROM {self._table} WHERE {where} LIMIT 1)", params)
        return SimpleNamespace(deleted_count=n)

    async def delete_many(self, filt: dict):
        where, params = self._where(filt)
        _, n = await self._run(f"DELETE FROM {self._table} WHERE {where}", params)
        return SimpleNamespace(deleted_count=n)

    async def create_index(self, *args, **kwargs):
        """No-op: the indexes and unique constraints are in backend/supabase/schema.sql."""
        return None
