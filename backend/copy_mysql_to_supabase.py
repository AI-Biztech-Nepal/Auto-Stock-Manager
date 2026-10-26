"""Copies Auto Stock Manager's MySQL database into Supabase Postgres (the FINANCE project), table by table.

Read-only on the MySQL side: nothing on the VPS is changed or deleted, and the app keeps running on MySQL
as before. Run it as often as you like - each run brings Supabase up to date (rows are matched on their
primary key, so a second run updates rather than duplicates).

Run on the VPS from backend/, with the backend's .env (MySQL + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):

    venv/bin/python copy_mysql_to_supabase.py schema   # writes supabase_schema.sql: paste it into Supabase's SQL Editor
    venv/bin/python copy_mysql_to_supabase.py copy     # copies every row
    venv/bin/python copy_mysql_to_supabase.py check    # row counts, MySQL next to Supabase

Every table lands in Supabase's public schema as asm_<table> (asm_vehicles, asm_sales, ...), so nothing can
clash with the Finance app's own tables. Row Level Security is switched on with no policies: only the
service role key (this script, and later the backend) can read or write them - never the public API key.

Left out: the base64 `data` of vehicle_photos / legal_documents (the files go to Supabase Storage - see
migrate_media_to_supabase.py), and auth_tokens (one-time email links; they are not worth keeping).
"""
import asyncio
import datetime
import decimal
import json
import os
import sys
from pathlib import Path

import aiomysql
import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

PREFIX = "asm_"
SKIP_TABLES = {"auth_tokens"}
SKIP_COLUMNS = {"vehicle_photos": {"data"}, "legal_documents": {"data"}}
BATCH = 500
SCHEMA_FILE = Path(__file__).parent / "supabase_schema.sql"


def pg_type(data_type: str, column_type: str) -> str:
    t, ct = data_type.lower(), column_type.lower()
    if t == "tinyint" and ct.startswith("tinyint(1)"):
        return "boolean"
    return {
        "tinyint": "smallint", "smallint": "integer", "mediumint": "integer", "int": "integer", "integer": "integer",
        "bigint": "bigint", "double": "double precision", "float": "double precision", "real": "double precision",
        "decimal": "numeric", "numeric": "numeric", "json": "jsonb", "date": "date", "datetime": "timestamp",
        "timestamp": "timestamptz", "time": "time", "year": "integer", "bit": "integer",
        "blob": "bytea", "longblob": "bytea", "mediumblob": "bytea", "tinyblob": "bytea", "binary": "bytea", "varbinary": "bytea",
    }.get(t, "text")  # char, varchar, text, longtext, enum, set ...


async def connect():
    return await aiomysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"), port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
        db=os.environ.get("MYSQL_DB") or os.environ["DB_NAME"], charset="utf8mb4", autocommit=True)


async def tables(conn) -> dict:
    """{table: {"columns": [(name, pg_type)], "pk": [col, ...], "bools": {col}}} for every table in the database."""
    async with conn.cursor(aiomysql.DictCursor) as cur:
        await cur.execute(
            "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, COLUMN_KEY FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION")
        rows = await cur.fetchall()
    out = {}
    for r in rows:
        name = r["TABLE_NAME"]
        if name in SKIP_TABLES or r["COLUMN_NAME"] in SKIP_COLUMNS.get(name, set()):
            continue
        t = out.setdefault(name, {"columns": [], "pk": [], "bools": set(), "json": set()})
        typ = pg_type(r["DATA_TYPE"], r["COLUMN_TYPE"])
        t["columns"].append((r["COLUMN_NAME"], typ))
        if r["COLUMN_KEY"] == "PRI":
            t["pk"].append(r["COLUMN_NAME"])
        if typ == "boolean":
            t["bools"].add(r["COLUMN_NAME"])
        if typ == "jsonb":
            t["json"].add(r["COLUMN_NAME"])
    return out


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


async def schema():
    conn = await connect()
    try:
        meta = await tables(conn)
    finally:
        conn.close()
    lines = ["-- Auto Stock Manager's tables in Supabase, generated from the live MySQL database by",
             "-- copy_mysql_to_supabase.py. Safe to run again: a table already there is left as it is.", "begin;", ""]
    for name, t in sorted(meta.items()):
        cols = [f"  {q(c)} {typ}" for c, typ in t["columns"]]
        if t["pk"]:
            cols.append(f"  primary key ({', '.join(q(c) for c in t['pk'])})")
        lines.append(f"create table if not exists public.{q(PREFIX + name)} (\n" + ",\n".join(cols) + "\n);")
        lines.append(f"alter table public.{q(PREFIX + name)} enable row level security;")
        for c, typ in t["columns"]:  # a column added to MySQL after the first run
            lines.append(f"alter table public.{q(PREFIX + name)} add column if not exists {q(c)} {typ};")
        lines.append("")
    lines += ["commit;", "", "-- Lets Supabase's API see the new tables straight away.", "notify pgrst, 'reload schema';", ""]
    SCHEMA_FILE.write_text("\n".join(lines))
    missing_pk = [n for n, t in meta.items() if not t["pk"]]
    print(f"Wrote {SCHEMA_FILE} - {len(meta)} tables. Paste it into Supabase (FINANCE) -> SQL Editor -> Run.")
    if missing_pk:
        print(f"No primary key (copied fresh each run, see copy): {', '.join(sorted(missing_pk))}")


def clean(value, is_bool: bool, is_json: bool):
    if value is None:
        return None
    if is_bool:
        return bool(value)
    if is_json and isinstance(value, (str, bytes)):
        try:
            return json.loads(value)
        except ValueError:
            return value
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    if isinstance(value, datetime.timedelta):
        return str(value)
    if isinstance(value, (bytes, bytearray)):
        return "\\x" + bytes(value).hex()
    return value


class Supabase:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.client = httpx.AsyncClient(timeout=120)

    async def upsert(self, table: str, rows: list, pk: list):
        params = f"?on_conflict={','.join(pk)}" if pk else ""
        prefer = "resolution=merge-duplicates,return=minimal" if pk else "return=minimal"
        r = await self.client.post(f"{self.url}/rest/v1/{PREFIX}{table}{params}",
                                   content=json.dumps(rows, ensure_ascii=False), headers={**self.h, "Prefer": prefer})
        if r.status_code >= 300:
            raise RuntimeError(f"{table}: {r.status_code} {r.text[:400]}")

    async def count(self, table: str):
        r = await self.client.get(f"{self.url}/rest/v1/{PREFIX}{table}?select=*&limit=1",
                                  headers={**self.h, "Prefer": "count=exact", "Range": "0-0"})
        if r.status_code >= 300:
            return None
        total = (r.headers.get("content-range") or "").rpartition("/")[2]
        return int(total) if total.isdigit() else None


async def copy():
    conn = await connect()
    sb = Supabase()
    try:
        meta = await tables(conn)
        for name, t in sorted(meta.items()):
            if not t["pk"]:
                print(f"{name}: no primary key - skipped (tell the developer if you need it)")
                continue
            cols = [c for c, _ in t["columns"]]
            select = ", ".join(f"`{c}`" for c in cols)
            done = 0
            async with conn.cursor(aiomysql.SSDictCursor) as cur:  # streamed, never the whole table in memory
                await cur.execute(f"SELECT {select} FROM `{name}`")
                while True:
                    batch = await cur.fetchmany(BATCH)
                    if not batch:
                        break
                    rows = [{c: clean(r[c], c in t["bools"], c in t["json"]) for c in cols} for r in batch]
                    await sb.upsert(name, rows, t["pk"])
                    done += len(rows)
            print(f"{name}: {done} rows")
    finally:
        conn.close()
        await sb.client.aclose()
    print("Copy done. Run check to compare the counts.")


async def check():
    conn = await connect()
    sb = Supabase()
    try:
        meta = await tables(conn)
        bad = 0
        async with conn.cursor() as cur:
            for name in sorted(meta):
                await cur.execute(f"SELECT COUNT(*) FROM `{name}`")
                mysql_n = (await cur.fetchone())[0]
                supa_n = await sb.count(name)
                ok = supa_n == mysql_n
                bad += not ok
                print(f"{'ok ' if ok else 'DIFF'} {name:32s} MySQL {mysql_n:>8}   Supabase {supa_n if supa_n is not None else 'missing':>8}")
        print("Everything matches." if not bad else
              f"{bad} tables differ - run copy again (new rows since?), then check. A row deleted in MySQL after an "
              "earlier copy stays in Supabase, so Supabase can be a little ahead.")
    finally:
        conn.close()
        await sb.client.aclose()


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    if step not in ("schema", "copy", "check"):
        sys.exit(__doc__)
    if step != "schema" and not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY")):
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.")
    asyncio.run({"schema": schema, "copy": copy, "check": check}[step]())
