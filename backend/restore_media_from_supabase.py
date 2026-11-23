"""Brings the vehicle photos, legal documents and website-lead photos back from Supabase Storage into the database,
so the app no longer needs Supabase at all (the reverse of migrate_media_to_supabase.py).

Run on the VPS from backend/, AFTER backend/.env points SUPABASE_DB_URL at the NEW Postgres on the VPS, and while
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are still in .env (they are only used to READ the files out of Storage):

    python restore_media_from_supabase.py plan     # how many files, how many MB; changes nothing
    python restore_media_from_supabase.py copy     # download each file into its database row (safe to stop and re-run)
    python restore_media_from_supabase.py verify   # every row has its file at the recorded size; every lead photo is inline

Without SUPABASE_URL the app serves photos and documents from the row's `data` column, which is what this fills in.
It never writes to Supabase and never deletes anything there. It refuses to run if SUPABASE_DB_URL still points at Supabase
(that would just put the files back into the database that is over its limit).
"""
import asyncio
import base64
import os
import sys
from pathlib import Path
from urllib.parse import unquote

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import media_storage  # noqa: E402  (reads the settings loaded just above)
from pgdb import PostgresDatabase  # noqa: E402

KINDS = (("vehicle_photos", media_storage.PHOTO_BUCKET), ("legal_documents", media_storage.DOC_BUCKET))
LEAD_PREFIX = f"{media_storage._url()}/storage/v1/object/public/{media_storage.PHOTO_BUCKET}/"


async def rows(db, table, fields, filt=None):
    return await getattr(db, table).find(filt or {}, {"_id": 0, **{f: 1 for f in fields}}).to_list(1000000)


async def in_storage(db, table):
    """The rows whose file lives in Storage. Only id / path / size are read here: a file's data is looked at one row at a time
    (has_data), so a re-run after a partial copy never pulls all the files into memory at once."""
    return [r for r in await rows(db, table, ("id", "storage_path", "size")) if r.get("storage_path")]


async def has_data(db, table, row_id):
    row = await getattr(db, table).find_one({"id": row_id}, {"_id": 0, "data": 1})
    return bool(row and row.get("data"))


def lead_urls(lead):
    return [(i, x) for i, x in enumerate(lead.get("images") or []) if isinstance(x, str) and x.startswith(LEAD_PREFIX)]


async def plan(db):
    for table, _ in KINDS:
        todo = [r for r in await in_storage(db, table) if not await has_data(db, table, r["id"])]
        print(f"{table}: {len(todo)} file(s) to bring back, about {sum(r.get('size') or 0 for r in todo) / 1e6:.1f} MB")
    leads = await rows(db, "leads", ("id", "images"))
    n = sum(len(lead_urls(l)) for l in leads)
    print(f"leads: {n} photo(s) in {sum(1 for l in leads if lead_urls(l))} lead(s) to bring back")


async def copy(db):
    for table, bucket in KINDS:
        todo = await in_storage(db, table)
        print(f"{table}: {len(todo)} in Storage; copying the ones not in the database yet")
        done = failed = 0
        for r in todo:
            try:
                if await has_data(db, table, r["id"]):
                    continue
                content = await media_storage.download(bucket, r["storage_path"])
                await getattr(db, table).update_one({"id": r["id"]}, {"$set": {"data": base64.b64encode(content).decode("ascii")}})
                done += 1
            except Exception as e:  # noqa: BLE001 - reported, and the next run tries again
                failed += 1
                print(f"  {r['id']}: {e}")
            if done and done % 50 == 0:
                print(f"  {done}/{len(todo)}")
        print(f"{table}: {done} copied, {failed} failed")
    # A lead's photos are stored as public Storage URLs; turn them back into inline images (how the app first stored them).
    done = failed = 0
    for lead in await rows(db, "leads", ("id", "images")):
        images = list(lead.get("images") or [])
        changed = False
        for i, url in lead_urls(lead):
            try:
                content = await media_storage.download(media_storage.PHOTO_BUCKET, unquote(url[len(LEAD_PREFIX):]))
                ext = url.rsplit(".", 1)[-1].lower()
                ctype = {v: k for k, v in media_storage._EXT.items()}.get(ext, "image/jpeg")
                images[i] = f"data:{ctype};base64,{base64.b64encode(content).decode('ascii')}"
                changed = True
                done += 1
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  lead {lead['id']} photo {i + 1}: {e}")
        if changed:
            await db.leads.update_one({"id": lead["id"]}, {"$set": {"images": images}})
    print(f"leads: {done} photo(s) copied, {failed} failed")


async def verify(db):
    bad = 0
    for table, _ in KINDS:
        for r in await in_storage(db, table):
            row = await getattr(db, table).find_one({"id": r["id"]}, {"_id": 0, "data": 1})
            data = (row or {}).get("data")
            if not data:
                bad += 1
                print(f"  MISSING {table} {r['id']}: no data in the database")
            elif r.get("size") and len(base64.b64decode(data)) != r["size"]:
                bad += 1
                print(f"  WRONG SIZE {table} {r['id']}")
    left = sum(len(lead_urls(l)) for l in await rows(db, "leads", ("id", "images")))
    if left:
        bad += left
        print(f"  {left} lead photo(s) still point at Supabase")
    print("All good: nothing needs Supabase Storage any more." if not bad else f"{bad} problem(s) - run copy again, then verify.")


async def main():
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    if step not in ("plan", "copy", "verify"):
        sys.exit(__doc__)
    if not media_storage.enabled():
        sys.exit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must still be in backend/.env: they are used to read the files out.")
    dsn = os.environ.get("SUPABASE_DB_URL", "")
    if "supabase.co" in dsn or "pooler.supabase" in dsn:
        sys.exit("SUPABASE_DB_URL still points at Supabase. Point it at the new Postgres on the VPS first.")
    db = PostgresDatabase()
    try:
        await {"plan": plan, "copy": copy, "verify": verify}[step](db)
    finally:
        closing = db.close()  # a coroutine for Postgres (it closes the connection pool)
        if closing is not None:
            await closing


if __name__ == "__main__":
    asyncio.run(main())
