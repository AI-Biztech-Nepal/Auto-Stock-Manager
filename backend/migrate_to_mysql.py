"""One-off migration: copies every collection from MongoDB Atlas into the
Hostinger MySQL schema defined by schema.sql.

Re-runnable by design (TRUNCATEs each table before reloading it) so it's
safe to point at a scratch Hostinger schema first for a dry run, fix
anything the verification report at the end flags, then run again for the
real production cutover.

Streams each Mongo collection (async cursor, batched inserts) rather than
loading it fully into memory first — vehicle_photos/legal_documents store
multi-MB base64 blobs per document, so a naive `.to_list(None)` over the
whole collection could be sizeable.

Usage:
    python migrate_to_mysql.py

Env vars:
  MONGO_URL, DB_NAME                                          — source (existing .env)
  MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB — destination (new)
"""
import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import aiomysql
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.server_api import ServerApi

from sqldb import TABLES

BATCH_SIZE = 200
# vehicle_photos/legal_documents rows carry multi-MB base64 blobs — batching
# 200 of those in one executemany() can be 100MB+ in a single round trip,
# which is exactly what dropped the connection on a first attempt against
# Hostinger. Small batches keep each round trip light and cheap to retry.
BATCH_SIZE_OVERRIDES = {"vehicle_photos": 5, "legal_documents": 2}
MAX_ATTEMPTS = 3

# audit_logs never had an app-level `id` in Mongo — MySQL generates one via
# AUTO_INCREMENT instead, so that column is dropped from the row, not copied.
NO_ID_COLLECTIONS = {"audit_logs"}

# Order is cosmetic only (foreign key checks are disabled for the whole
# load, see main() — real Mongo data can have dangling references, e.g. a
# vehicle.vendor_id pointing at a since-deleted vendor, since Mongo never
# enforced referential integrity either); kept parent-before-child for
# readability while watching the migration run.
COLLECTIONS = [
    "users", "vendors", "customers", "team_members", "partners",
    "vehicles", "sales", "spare_parts", "kit_components", "part_transactions",
    "job_cards", "expenses", "vendor_payments", "emi_records", "emi_payments",
    "vehicle_photos", "legal_documents", "leads", "settings", "sync_logs",
    "audit_logs", "ai_chat_sessions",
]


def _mongo_client() -> AsyncIOMotorClient:
    mongo_url = os.environ["MONGO_URL"]
    is_atlas = "mongodb+srv" in mongo_url or "mongodb.net" in mongo_url
    if is_atlas:
        return AsyncIOMotorClient(mongo_url, tls=True, tlsCAFile=certifi.where(), server_api=ServerApi("1"))
    return AsyncIOMotorClient(mongo_url)


def _doc_to_row(name: str, doc: dict, columns: list) -> list:
    """Every row gets a value (possibly None) for every column, in a fixed
    order, so a batch of rows from schemaless Mongo documents (which don't
    all carry the same keys) can still be sent through one executemany()."""
    meta = TABLES[name]
    bool_cols, json_cols = meta.get("bool_cols", ()), meta.get("json_cols", ())
    row = []
    for col in columns:
        v = doc.get(col)
        if col in bool_cols and v is not None:
            v = 1 if v else 0
        elif col in json_cols and v is not None:
            v = json.dumps(v)
        row.append(v)
    return row


async def migrate_collection(mongo_db, pool, name: str) -> tuple:
    excluded = {"id"} if name in NO_ID_COLLECTIONS else set()
    columns = sorted(TABLES[name]["columns"] - excluded)
    col_sql = ", ".join(f"`{c}`" for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f"INSERT INTO `{name}` ({col_sql}) VALUES ({placeholders})"
    batch_size = BATCH_SIZE_OVERRIDES.get(name, BATCH_SIZE)

    # A fresh connection per collection (rather than one shared for the whole
    # run) means a dropped connection on one large collection doesn't force
    # redoing everything already loaded — just that collection, via retry below.
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SET FOREIGN_KEY_CHECKS=0")
            await cur.execute(f"TRUNCATE TABLE `{name}`")
            if name == "spare_parts":
                # Child table is derived from this collection, not its own
                # entry in COLLECTIONS — truncate it here too so retries and
                # re-runs of spare_parts stay idempotent.
                await cur.execute("TRUNCATE TABLE spare_parts_set_components")

            total = inserted = 0
            batch = []
            set_components_seen = {}  # (part_id, name) -> row — spare_parts only, deduped
            async for doc in mongo_db[name].find({}, {"_id": 0}):
                total += 1
                batch.append(_doc_to_row(name, doc, columns))
                if name == "spare_parts":
                    for comp in (doc.get("set_components") or []):
                        key = (doc["id"], comp["name"])
                        # Mongo's inline array never enforced uniqueness on
                        # (part_id, name) the way the new child table does —
                        # the app itself only ever reads the *first* match for
                        # a given name (see _job_part_get_stock's next(...)),
                        # so later duplicates were already unreachable data.
                        # Keep the first occurrence to match existing behavior.
                        if key not in set_components_seen:
                            set_components_seen[key] = (doc["id"], comp["name"], comp.get("stock", 0), comp.get("rate", 0))
                if len(batch) >= batch_size:
                    await cur.executemany(insert_sql, batch)
                    inserted += len(batch)
                    batch = []
            if batch:
                await cur.executemany(insert_sql, batch)
                inserted += len(batch)

            set_component_rows = list(set_components_seen.values())
            if set_component_rows:
                await cur.executemany(
                    "INSERT INTO spare_parts_set_components (part_id, name, stock, rate) VALUES (%s,%s,%s,%s)",
                    set_component_rows,
                )
    return total, inserted


async def migrate_collection_with_retry(mongo_db, pool, name: str) -> tuple:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return await migrate_collection(mongo_db, pool, name)
        except Exception as e:
            if attempt == MAX_ATTEMPTS:
                raise
            print(f"  {name:<22} attempt {attempt} failed ({e!r}), retrying...")


async def verify_collection(mongo_db, pool, name: str) -> str:
    mongo_count = await mongo_db[name].count_documents({})
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(f"SELECT COUNT(*) FROM `{name}`")
            (mysql_count,) = await cur.fetchone()
    ok = "OK" if mongo_count == mysql_count else "MISMATCH"
    return f"  {name:<22} mongo={mongo_count:<6} mysql={mysql_count:<6} {ok}"


async def main():
    mongo_client = _mongo_client()
    mongo_db = mongo_client[os.environ["DB_NAME"]]

    pool = await aiomysql.create_pool(
        host=os.environ.get("MYSQL_HOST", "localhost"),
        port=int(os.environ.get("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"],
        password=os.environ["MYSQL_PASSWORD"],
        db=os.environ.get("MYSQL_DB") or os.environ["DB_NAME"],
        autocommit=True, charset="utf8mb4",
        # Keep the pool from handing out a connection that's gone stale/idle
        # long enough for Hostinger's side to have quietly dropped it.
        pool_recycle=60,
    )

    print("Migrating MongoDB -> MySQL ...")
    for name in COLLECTIONS:
        total, inserted = await migrate_collection_with_retry(mongo_db, pool, name)
        print(f"  {name:<22} {inserted}/{total} rows")

    print("\nVerification (document count vs row count):")
    for name in COLLECTIONS:
        print(await verify_collection(mongo_db, pool, name))
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT COUNT(*) FROM spare_parts_set_components")
            (n,) = await cur.fetchone()
    print(f"  {'spare_parts_set_components':<22} mysql={n:<6} (child rows, no direct Mongo count to compare)")

    pool.close()
    await pool.wait_closed()
    mongo_client.close()


if __name__ == "__main__":
    asyncio.run(main())
