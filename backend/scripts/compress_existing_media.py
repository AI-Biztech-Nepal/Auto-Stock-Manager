"""
One-time cleanup: re-compresses photos/legal-documents already sitting in MongoDB
so old, never-compressed uploads (from before upload-time compression was added,
or that fell back to storing the original on a compression failure) shrink in place.
New uploads are already compressed at upload time (see _compress_photo in server.py);
this script only touches what's already stored.

Safe by default: runs as a DRY RUN (reports savings, changes nothing) unless you
pass --apply. PDFs in legal_documents are never touched — recompressing a scanned
legal document risks making chassis numbers/signatures unreadable, and Pillow can't
losslessly shrink a PDF anyway.

Usage (from backend/):
    python scripts/compress_existing_media.py                # dry run, both collections
    python scripts/compress_existing_media.py --apply         # actually writes changes
    python scripts/compress_existing_media.py --apply --collection vehicle_photos

Point MONGO_URL / DB_NAME (in backend/.env or the shell environment) at the
database you want to clean up — for the production Atlas cluster, copy the real
connection string from Render's Environment tab or Atlas's Connect button first.
"""
import argparse
import asyncio
import base64
import io
import os
from pathlib import Path

import certifi
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, ImageOps
from pymongo.server_api import ServerApi
import pillow_heif

pillow_heif.register_heif_opener()

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

MIN_SAVINGS_PCT = 15  # skip the update if recompressing doesn't save at least this much


def _compress(content: bytes, max_dimension: int, quality: int) -> tuple[bytes, str]:
    img = Image.open(io.BytesIO(content))
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=quality, optimize=True)
    return out.getvalue(), "image/jpeg"


async def _process_collection(db, name: str, *, max_dimension: int, quality: int, apply: bool) -> None:
    coll = db[name]
    total = await coll.count_documents({})
    processed = updated = skipped_pdf = skipped_small_gain = failed = 0
    bytes_before = bytes_after = 0

    print(f"\n=== {name} ({total} documents) ===")
    cursor = coll.find({})
    async for doc in cursor:
        processed += 1
        content_type = doc.get("content_type", "")
        if content_type == "application/pdf":
            skipped_pdf += 1
            continue
        try:
            raw = base64.b64decode(doc["data"])
        except Exception as e:
            print(f"  [FAIL] {doc.get('id')}: could not decode stored data ({e})")
            failed += 1
            continue

        try:
            new_bytes, new_type = _compress(raw, max_dimension, quality)
        except Exception as e:
            print(f"  [FAIL] {doc.get('id')} ({doc.get('filename')}): {e}")
            failed += 1
            continue

        old_size = len(raw)
        new_size = len(new_bytes)
        savings_pct = 100 * (old_size - new_size) / old_size if old_size else 0

        if new_size >= old_size or savings_pct < MIN_SAVINGS_PCT:
            skipped_small_gain += 1
            continue

        bytes_before += old_size
        bytes_after += new_size
        updated += 1
        print(f"  {doc.get('filename', doc.get('id'))}: {old_size/1024:.0f}KB -> {new_size/1024:.0f}KB "
              f"(-{savings_pct:.0f}%){'' if apply else '  [dry run, not saved]'}")

        if apply:
            await coll.update_one(
                {"_id": doc["_id"]},
                {"$set": {
                    "data": base64.b64encode(new_bytes).decode("ascii"),
                    "content_type": new_type,
                    "size": new_size,
                }},
            )

    print(f"\n{name} summary: {processed} scanned, {updated} {'compressed' if apply else 'would compress'}, "
          f"{skipped_pdf} PDFs skipped, {skipped_small_gain} already efficient, {failed} failed")
    if bytes_before:
        print(f"  {bytes_before/1024/1024:.1f}MB -> {bytes_after/1024/1024:.1f}MB "
              f"({(bytes_before-bytes_after)/1024/1024:.1f}MB {'freed' if apply else 'would be freed'})")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually write changes (default: dry run)")
    parser.add_argument("--collection", choices=["vehicle_photos", "legal_documents", "both"], default="both")
    args = parser.parse_args()

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    is_atlas = "mongodb+srv" in mongo_url or "mongodb.net" in mongo_url
    client = AsyncIOMotorClient(
        mongo_url, tls=True, tlsCAFile=certifi.where(), server_api=ServerApi("1")
    ) if is_atlas else AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Connected to database '{db_name}' on {'Atlas' if is_atlas else mongo_url}")
    print("Mode: " + ("APPLY (writing changes)" if args.apply else "DRY RUN (no changes will be saved)"))
    if args.apply:
        confirm = input(f"\nThis will permanently overwrite photo/document data in '{db_name}'. Type 'yes' to continue: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return

    if args.collection in ("vehicle_photos", "both"):
        # Matches the app's own upload-time settings (PHOTO_MAX_DIMENSION / PHOTO_JPEG_QUALITY
        # in server.py) so re-compressed photos look identical to freshly uploaded ones.
        await _process_collection(db, "vehicle_photos", max_dimension=1600, quality=80, apply=args.apply)
    if args.collection in ("legal_documents", "both"):
        # Slightly higher quality/resolution than photos — these need to stay legible
        # (chassis numbers, signatures), so we trade less space savings for that.
        await _process_collection(db, "legal_documents", max_dimension=1800, quality=85, apply=args.apply)

    client.close()
    if not args.apply:
        print("\nDry run complete. Re-run with --apply to actually save these changes.")


if __name__ == "__main__":
    asyncio.run(main())
