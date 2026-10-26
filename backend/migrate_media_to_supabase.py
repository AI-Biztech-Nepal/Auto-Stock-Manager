"""Moves the vehicle photos and legal documents already in MySQL into Supabase Storage (see media_storage.py).

Run on the VPS from backend/, with the backend's own .env (MySQL + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):

    python migrate_media_to_supabase.py copy     # upload each file; the database copy is kept
    python migrate_media_to_supabase.py verify   # check every moved file is really in Storage
    python migrate_media_to_supabase.py purge    # empty the database copies of verified files

`copy` is safe to stop and run again: a file already moved is skipped. The moment a file is copied its row
points at Storage, so the app starts serving it from there straight away. Nothing is lost until `purge`,
and `purge` only empties rows that `verify` would pass. Afterwards `OPTIMIZE TABLE vehicle_photos,
legal_documents;` gives the freed space back to the disk.
"""
import asyncio
import base64
import os
import sys
from pathlib import Path
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import media_storage  # noqa: E402  (reads the settings loaded just above)
from sqldb import MySQLDatabase  # noqa: E402

KINDS = (("vehicle_photos", media_storage.PHOTO_BUCKET), ("legal_documents", media_storage.DOC_BUCKET))


async def rows(db, table, fields):
    return await getattr(db, table).find({}, {"_id": 0, **{f: 1 for f in fields}}).to_list(1000000)


async def copy(db):
    for table, bucket in KINDS:
        todo = [r for r in await rows(db, table, ("id", "storage_path")) if not r.get("storage_path")]
        print(f"{table}: {len(todo)} to copy")
        done = failed = 0
        for r in todo:
            row = await getattr(db, table).find_one({"id": r["id"]})
            if not row or not row.get("data"):
                continue
            content = base64.b64decode(row["data"])
            content_type = row.get("content_type") or "application/octet-stream"
            path = media_storage.object_path(row.get("company_id"), row.get("vehicle_id"), row["id"], content_type)
            try:
                await media_storage.upload(bucket, path, content, content_type)
            except Exception as e:
                failed += 1
                print(f"  {row['id']}: {e}")
                continue
            await getattr(db, table).update_one({"id": row["id"]}, {"$set": {"storage_path": path}})
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)}")
        print(f"{table}: {done} copied, {failed} failed")


async def check(db):
    """Rows whose file is in Storage at the recorded size, and the ones that are not."""
    good, bad = {}, []
    async with httpx.AsyncClient(timeout=60) as client:
        for table, bucket in KINDS:
            good[table] = []
            for r in await rows(db, table, ("id", "storage_path", "size")):
                if not r.get("storage_path"):
                    continue
                # The first byte only: the answer's Content-Range carries the whole file's size.
                res = await client.get(f"{media_storage._url()}/storage/v1/object/{bucket}/{quote(r['storage_path'])}",
                                       headers={**media_storage._headers(), "Range": "bytes=0-0"})
                total = (res.headers.get("content-range") or "").rpartition("/")[2]
                size = int(total) if total.isdigit() else int(res.headers.get("content-length") or -1)
                if res.status_code < 300 and (not r.get("size") or size in (-1, r["size"])):
                    good[table].append(r["id"])
                else:
                    bad.append((table, r["id"], res.status_code, size, r.get("size")))
    return good, bad


async def verify(db):
    good, bad = await check(db)
    for table in good:
        print(f"{table}: {len(good[table])} in Storage")
    for b in bad:
        print(f"  MISSING {b[0]} {b[1]}: status {b[2]}, {b[3]} bytes (expected {b[4]})")
    print("All good." if not bad else f"{len(bad)} not right - run copy again, then verify.")


async def purge(db):
    good, bad = await check(db)
    if bad:
        sys.exit(f"{len(bad)} files are not right in Storage - run verify, fix, then purge. Nothing emptied.")
    for table, ids in good.items():
        for row_id in ids:
            await getattr(db, table).update_one({"id": row_id}, {"$set": {"data": None}})
        print(f"{table}: emptied {len(ids)} database copies")
    print("Now run in MySQL: OPTIMIZE TABLE vehicle_photos, legal_documents;")


async def main():
    if not media_storage.enabled():
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.")
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    if step not in ("copy", "verify", "purge"):
        sys.exit(__doc__)
    db = MySQLDatabase()
    try:
        await {"copy": copy, "verify": verify, "purge": purge}[step](db)
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
