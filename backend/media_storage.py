"""Vehicle photos and legal documents in Supabase Storage instead of MySQL.

Until now every photo and document lived in the database as base64 text, and every view of one read it
out of MySQL, decoded it and sent it through this server (with up to 300MB of them held in memory as a
cache). With Storage switched on, a new upload goes to a Supabase bucket and the row keeps only its path
(`storage_path`, `data` left empty); the /file endpoints answer with a redirect, so the image itself is
served by Supabase's CDN and never passes through the VPS. Rows still holding `data` keep working as before
until migrate_media_to_supabase.py has moved them.

  photos     -> a public bucket (SUPABASE_PHOTO_BUCKET, default "asm-photos"): the storefront shows them
  documents  -> a private bucket (SUPABASE_DOC_BUCKET, default "asm-documents"): reached only through a
                short-lived signed link, handed out by the same unguessable-id endpoint as before

Switched on by SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the backend's environment. Without them nothing
changes: uploads keep going into MySQL.
"""
import os
from typing import Optional
from urllib.parse import quote

import httpx

PHOTO_BUCKET = os.environ.get("SUPABASE_PHOTO_BUCKET", "asm-photos")
DOC_BUCKET = os.environ.get("SUPABASE_DOC_BUCKET", "asm-documents")
SIGNED_URL_SECONDS = 3600

_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
        "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf"}


def _url() -> str:
    return os.environ.get("SUPABASE_URL", "").rstrip("/")


def _key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def enabled() -> bool:
    return bool(_url() and _key())


def _headers(content_type: Optional[str] = None) -> dict:
    h = {"Authorization": f"Bearer {_key()}", "apikey": _key()}
    if content_type:
        h["Content-Type"] = content_type
    return h


def object_path(company_id: Optional[str], vehicle_id: Optional[str], file_id: str, content_type: str) -> str:
    """<company>/<vehicle>/<file id>.<ext> - one folder per business, then per vehicle."""
    ext = _EXT.get(content_type, "bin")
    return f"{company_id or 'no-company'}/{vehicle_id or 'no-vehicle'}/{file_id}.{ext}"


def _object(bucket: str, path: str) -> str:
    return f"{_url()}/storage/v1/object/{bucket}/{quote(path)}"


async def upload(bucket: str, path: str, content: bytes, content_type: str) -> None:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(_object(bucket, path), content=content,
                              headers={**_headers(content_type), "x-upsert": "true",
                                       "cache-control": "max-age=31536000"})
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase Storage upload failed ({r.status_code}): {r.text[:300]}")


async def download(bucket: str, path: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(_object(bucket, path), headers=_headers())
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase Storage download failed ({r.status_code}): {r.text[:300]}")
    return r.content


async def remove(bucket: str, path: str) -> None:
    """Best effort: a file left behind costs a little storage, a failed delete must not fail the request."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.request("DELETE", f"{_url()}/storage/v1/object/{bucket}",
                                 json={"prefixes": [path]}, headers=_headers("application/json"))
    except Exception:
        pass


def public_url(bucket: str, path: str) -> str:
    return f"{_url()}/storage/v1/object/public/{bucket}/{quote(path)}"


async def signed_url(bucket: str, path: str, seconds: int = SIGNED_URL_SECONDS) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{_url()}/storage/v1/object/sign/{bucket}/{quote(path)}",
                              json={"expiresIn": seconds}, headers=_headers("application/json"))
    if r.status_code >= 300:
        raise RuntimeError(f"Supabase Storage could not sign a link ({r.status_code}): {r.text[:300]}")
    signed = r.json().get("signedURL") or r.json().get("signedUrl")
    return f"{_url()}/storage/v1{signed}"
