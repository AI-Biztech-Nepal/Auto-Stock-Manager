"""Copies Auto Stock Manager's MariaDB/MySQL data into its Supabase (Postgres) database, table by table.

Read-only on the MariaDB side: nothing on the VPS is changed or deleted, and the app keeps running on MariaDB as
before. Run it as often as you like - rows are matched on their primary key, so a second run updates rather than
duplicates (a row deleted from MariaDB after an earlier copy stays in Supabase until you clear it by hand). The
whole copy is one transaction: it either all lands or none of it does.

Run on the VPS from backend/, with the backend's .env (MariaDB settings + SUPABASE_DB_URL):

    venv/bin/python copy_mysql_to_supabase.py prepare  # creates/updates Supabase's tables and photo buckets (copy does this too)
    venv/bin/python copy_mysql_to_supabase.py copy     # copies every row
    venv/bin/python copy_mysql_to_supabase.py check    # row counts and money totals, MariaDB next to Supabase

Order: prepare, then migrate_media_to_supabase.py copy (moves the photos and documents into Storage), then copy, check.
No SQL needs pasting into Supabase's SQL Editor: prepare applies backend/supabase/0001_media_buckets.sql and schema.sql.

Left out, on purpose: the base64 `data` of vehicle_photos / legal_documents (those files live in Supabase Storage -
copy stops with a message if any file has not been moved there yet), and auth_tokens (one-time email links that expire).
A table or column that exists only in your live MariaDB (added by hand, or by a newer version than schema.sql) is created
in Supabase from MariaDB's own definition and copied as it is, so nothing is left behind.
"""
import asyncio
import datetime
import decimal
import json
import os
import re
import sys
from pathlib import Path

import aiomysql
import psycopg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SKIP_TABLES = {"auth_tokens"}
SKIP_COLUMNS = {"vehicle_photos": {"data"}, "legal_documents": {"data"}}
MEDIA_TABLES = ("vehicle_photos", "legal_documents")
BATCH = 500
SCHEMA_FILE = Path(__file__).parent / "supabase" / "schema.sql"


def pg_type(data_type: str, column_type: str) -> str:
    """Postgres type for a MariaDB column - only used for tables that schema.sql does not define."""
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


def q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


# ── MariaDB side ────────────────────────────────────────────────────────────
async def mysql_connect():
    return await aiomysql.connect(
        host=os.environ.get("MYSQL_HOST", "localhost"), port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
        db=os.environ.get("MYSQL_DB") or os.environ["DB_NAME"], charset="utf8mb4", autocommit=True)


async def tables(conn) -> dict:
    """{table: {"columns": [(name, pg_type)], "pk": [col, ...]}} for every table in the MariaDB database."""
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
        t = out.setdefault(name, {"columns": [], "pk": []})
        t["columns"].append((r["COLUMN_NAME"], pg_type(r["DATA_TYPE"], r["COLUMN_TYPE"])))
        if r["COLUMN_KEY"] == "PRI":
            t["pk"].append(r["COLUMN_NAME"])
    return out


def mysql_fetch(conn):
    """fetch(table, columns) -> async iterator of row batches (tuples), streamed so a big table never sits in memory."""
    async def fetch(name, cols):
        async with conn.cursor(aiomysql.SSCursor) as cur:
            await cur.execute(f"SELECT {', '.join('`' + c + '`' for c in cols)} FROM `{name}`")
            while True:
                batch = await cur.fetchmany(BATCH)
                if not batch:
                    break
                yield batch
    return fetch


async def check_media_moved(conn):
    """The files themselves are not copied (they live in Storage), so refuse to go on if one is only in MariaDB."""
    stuck = {}
    async with conn.cursor() as cur:
        for table in MEDIA_TABLES:
            await cur.execute(f"SELECT COUNT(*) FROM `{table}` WHERE (storage_path IS NULL OR storage_path = '') "
                              "AND `data` IS NOT NULL AND `data` <> ''")
            (n,) = await cur.fetchone()
            if n:
                stuck[table] = n
    if stuck:
        sys.exit("Stopped: these files are still only in MariaDB, so a copy would lose them: "
                 + ", ".join(f"{t} ({n})" for t, n in stuck.items())
                 + ".\nRun  migrate_media_to_supabase.py copy  and  verify  first, then run this again.")


# ── Postgres side ───────────────────────────────────────────────────────────
def pg_connect():
    kwargs = {"autocommit": True, "prepare_threshold": None}  # explicit transaction below; fine behind Supabase's pooler
    if os.environ.get("PG_SCHEMA"):  # tests only
        kwargs["options"] = f"-c search_path={os.environ['PG_SCHEMA']},public"
    return psycopg.connect(os.environ["SUPABASE_DB_URL"], **kwargs)


def pg_tables(pg) -> dict:
    """{table: {column: (data_type, is_identity)}} for the schema the connection points at."""
    rows = pg.execute(
        "select table_name, column_name, data_type, is_identity from information_schema.columns "
        "where table_schema = current_schema() order by table_name, ordinal_position").fetchall()
    out = {}
    for t, c, d, ident in rows:
        out.setdefault(t, {})[c] = (d, ident == "YES")
    return out


def schema_tables() -> set:
    """Tables that backend/supabase/schema.sql defines."""
    return set(re.findall(r'create table if not exists "[^"]+"\."(\w+)"', SCHEMA_FILE.read_text(encoding="utf-8")))


SQL_FILES = (Path(__file__).parent / "supabase" / "0001_media_buckets.sql", SCHEMA_FILE)


def apply_sql_files(pg, files=None):
    """Runs the photo-bucket SQL and schema.sql. Both are additive and safe to run again (create ... if not exists,
    add column if not exists), so this creates what is missing and brings an older copy of the schema up to date."""
    for f in (files or SQL_FILES):
        pg.execute(Path(f).read_text(encoding="utf-8"))
        print(f"applied {Path(f).name}")


def prepare():
    with pg_connect() as pg:
        apply_sql_files(pg)
        n = pg.execute("select count(*) from information_schema.tables where table_schema = current_schema() "
                       "and table_type = 'BASE TABLE'").fetchone()[0]
    print(f"Supabase is ready: {n} tables, photo buckets in place.")


def create_generic(pg, name, t):
    cols = [f"{q(c)} {typ}" for c, typ in t["columns"]]
    if t["pk"]:
        cols.append(f"primary key ({', '.join(q(c) for c in t['pk'])})")
    pg.execute(f"create table {q(name)} (\n  " + ",\n  ".join(cols) + "\n)")
    pg.execute(f"alter table {q(name)} enable row level security")


def fk_order(pg, names) -> list:
    """The tables in an order where every table comes after the ones it has a foreign key to."""
    deps = {n: set() for n in names}
    for child, parent in pg.execute(
            "select cl.relname, rl.relname from pg_constraint c join pg_class cl on cl.oid = c.conrelid "
            "join pg_class rl on rl.oid = c.confrelid where c.contype = 'f' "
            "and cl.relnamespace = (select oid from pg_namespace where nspname = current_schema())").fetchall():
        if child in deps and parent in deps and child != parent:
            deps[child].add(parent)
    order, left = [], dict(deps)
    while left:
        ready = sorted(n for n, d in left.items() if not (d & set(left)))
        if not ready:  # a cycle: copy what is left in name order
            ready = sorted(left)
        for n in ready:
            order.append(n)
            del left[n]
    return order


def convert(v, typ: str):
    """A MariaDB value -> what the Postgres column of this type wants."""
    if v is None:
        return None
    if typ == "boolean":
        return bool(v)
    if typ == "jsonb":
        if isinstance(v, (bytes, bytearray)):
            v = v.decode("utf-8")
        return v if isinstance(v, str) else json.dumps(v)
    if isinstance(v, decimal.Decimal):
        return float(v) if typ == "double precision" else int(v) if typ in ("integer", "bigint", "smallint") else v
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, (bytes, bytearray)):
        return bytes(v)
    if isinstance(v, str) and "\x00" in v:  # Postgres text cannot hold NUL
        return v.replace("\x00", "")
    return v


def upsert_sql(name, cols, pk) -> str:
    sql = f"insert into {q(name)} ({', '.join(q(c) for c in cols)}) values ({', '.join(['%s'] * len(cols))})"
    if not pk:
        return sql
    update = [c for c in cols if c not in pk]
    tail = ("do update set " + ", ".join(f"{q(c)} = excluded.{q(c)}" for c in update)) if update else "do nothing"
    return f"{sql} on conflict ({', '.join(q(c) for c in pk)}) {tail}"


async def load_into_pg(pg, meta: dict, fetch, defined: set):
    """The whole copy, in one transaction. `fetch(table, columns)` yields row batches from MariaDB."""
    have = pg_tables(pg)
    absent = sorted(n for n in meta if n not in have and n in defined)
    if absent:
        sys.exit("These tables are not in Supabase yet: " + ", ".join(absent)
                 + "\nRun backend/supabase/schema.sql in Supabase's SQL Editor first, then run this again.")
    totals = {}
    with pg.transaction():
        for name in sorted(n for n in meta if n not in have):
            create_generic(pg, name, meta[name])
            print(f"{name}: not in schema.sql - created in Supabase from MariaDB's own definition")
        have = pg_tables(pg)
        for name in fk_order(pg, list(meta)):
            t, pgcols = meta[name], have[name]
            extra = [(c, typ) for c, typ in t["columns"] if c not in pgcols]
            for c, typ in extra:  # a column only MariaDB has: add it, so none of its data is left behind
                pg.execute(f"alter table {q(name)} add column if not exists {q(c)} {typ}")
                pgcols[c] = (typ, False)
            if extra:
                print(f"{name}: columns MariaDB has but schema.sql did not - added to Supabase so nothing is left behind: "
                      + ", ".join(c for c, _ in extra))
            cols = [(c, pgcols[c][0]) for c, _ in t["columns"]]
            if not t["pk"]:  # no key to match rows on: replace the table's rows rather than duplicate them
                pg.execute(f"delete from {q(name)}")
            sql, done = upsert_sql(name, [c for c, _ in cols], t["pk"]), 0
            async for batch in fetch(name, [c for c, _ in cols]):
                rows = [[convert(v, typ) for v, (_, typ) in zip(r, cols)] for r in batch]
                with pg.cursor() as cur:
                    cur.executemany(sql, rows)
                done += len(rows)
            totals[name] = done
            print(f"{name}: {done} rows")
        # Rows came in with their own ids; make the auto-number counters carry on after the highest one.
        for name in totals:
            for c, (_, ident) in have[name].items():
                if ident:
                    pg.execute(f"select setval(pg_get_serial_sequence(%s, %s), "
                               f"coalesce((select max({q(c)}) from {q(name)}), 0) + 1, false)", (q(name), c))
    return totals


async def copy():
    conn = await mysql_connect()
    try:
        await check_media_moved(conn)
        meta = await tables(conn)
        with pg_connect() as pg:
            apply_sql_files(pg)  # tables and buckets: created or brought up to date first, so no SQL has to be pasted by hand
            await load_into_pg(pg, meta, mysql_fetch(conn), schema_tables())
    finally:
        conn.close()
    print("Copy done. Run check to compare the numbers.")


async def check():
    conn = await mysql_connect()
    try:
        meta = await tables(conn)
        bad = 0
        with pg_connect() as pg:
            have = pg_tables(pg)
            async with conn.cursor() as cur:
                for name in sorted(meta):
                    cols = [c for c, typ in meta[name]["columns"] if typ == "double precision" and c in have.get(name, {})]
                    agg = "".join(f", COALESCE(SUM(`{c}`), 0)" for c in cols)
                    await cur.execute(f"SELECT COUNT(*){agg} FROM `{name}`")
                    mine = await cur.fetchone()
                    if name not in have:
                        print(f"MISSING {name:32s} not in Supabase"); bad += 1; continue
                    theirs = pg.execute(f"select count(*){''.join(f', coalesce(sum({q(c)}), 0)' for c in cols)} from {q(name)}").fetchone()
                    diffs = []
                    if mine[0] != theirs[0]:
                        diffs.append(f"rows {mine[0]} vs {theirs[0]}")
                    for c, a, b in zip(cols, mine[1:], theirs[1:]):
                        if abs(float(a) - float(b)) > 1e-6 * max(1.0, abs(float(a))):
                            diffs.append(f"sum of {c}: {a} vs {b}")
                    bad += bool(diffs)
                    print(f"{'DIFF' if diffs else 'ok  '} {name:32s} {mine[0]:>8} rows" + (f"   <- {'; '.join(diffs)}" if diffs else ""))
        print("Everything matches (row counts and every money/number total)." if not bad else
              f"{bad} tables differ - run copy again (new rows since?), then check. A row deleted in MariaDB after an "
              "earlier copy stays in Supabase, so Supabase can be a little ahead.")
    finally:
        conn.close()


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    if step not in ("prepare", "copy", "check"):
        sys.exit(__doc__)
    if not os.environ.get("SUPABASE_DB_URL"):
        sys.exit("Set SUPABASE_DB_URL in backend/.env first (Supabase -> Connect -> connection string, with your database password).")
    if step == "prepare":
        prepare()
    else:
        asyncio.run({"copy": copy, "check": check}[step]())
