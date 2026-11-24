"""Pushes one company's stock items to its online shop (All In One Abroad), whose catalogue lives in the shop's own
MySQL on Hostinger. The shop side is sync_product.php, which accepts only this module's requests (bearer key).

Off unless all three are set in backend/.env:
    SHOP_SYNC_URL         https://allinoneabroad.com/sync_product.php
    SHOP_SYNC_KEY         the same text as SYNC_KEY in the shop's config.local.php
    SHOP_SYNC_COMPANY_ID  the company whose items belong in the shop; every other company's items are ignored

    python -m unittest backend/tests/test_shop_sync.py
"""
import base64
import logging
import os
import time
from typing import Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)



def _env(name: str) -> str:
    # Read when used, not at import: server.py imports this module before it loads backend/.env.
    return os.environ.get(name, "").strip()


def company_id() -> str:
    return _env("SHOP_SYNC_COMPANY_ID")


def site_url() -> str:
    """The shop's address (scheme and host of SHOP_SYNC_URL), or "" when sync is not set up."""
    u = urlparse(_env("SHOP_SYNC_URL"))
    return f"{u.scheme}://{u.netloc}" if u.scheme and u.netloc else ""


def is_shop_company(cid) -> bool:
    return bool(cid) and cid == company_id()


_names = {"at": 0.0, "by_id": {}}


async def product_names() -> dict:
    """{shop product id (text): name} from the shop's own public catalogue, kept 5 minutes. Empty when it cannot be
    reached: the Visits page then shows "Product 29" instead of the name."""
    if _names["by_id"] and time.monotonic() - _names["at"] < 300:
        return _names["by_id"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(site_url() + "/api.php", params={"action": "products"})
        _names.update(at=time.monotonic(), by_id={str(p["id"]): p["name"] for p in r.json().get("products", [])})
    except Exception:
        logger.warning("Could not read the shop's product names", exc_info=True)
    return _names["by_id"]


CATEGORIES = {"luggage", "kitchen", "appliances"}  # what the shop's pages filter on
MAX_PHOTOS = 8


def wanted(item: Optional[dict]) -> bool:
    """True when sync is configured and this item belongs to the shop's company."""
    return bool(_env("SHOP_SYNC_URL") and _env("SHOP_SYNC_KEY") and company_id() and item and item.get("company_id") == company_id())


def build_payload(item: dict, photos: list) -> Optional[dict]:
    """The upsert body for one item, or None when it cannot be listed (no photo, or a category the shop has no page for).
    `photos` is [(photo_id, raw_bytes)], cover first."""
    category = (item.get("category") or "").strip().lower()
    if category not in CATEGORIES:
        logger.warning("Shop sync skipped item %s: category %r must be one of %s", item.get("id"), item.get("category"), sorted(CATEGORIES))
        return None
    if not photos:
        logger.info("Shop sync skipped item %s: it has no photo yet", item.get("id"))
        return None
    return {
        "action": "upsert", "app_id": item["id"], "name": item["name"], "category": category,
        "price": item.get("price") or 0, "stock": max(int(item.get("quantity") or 0), 0),
        "description": (item.get("notes") or "")[:255],  # the shop's description column is 255 characters
        "photos": [{"id": pid, "data": base64.b64encode(raw).decode("ascii")} for pid, raw in photos[:MAX_PHOTOS]],
    }


async def _post(body: dict) -> None:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(_env("SHOP_SYNC_URL"), json=body, headers={"Authorization": f"Bearer {_env('SHOP_SYNC_KEY')}"})
    if r.status_code != 200:
        logger.warning("Shop sync of %s was refused (%s): %s", body.get("app_id"), r.status_code, r.text[:300])


async def push_item(item: dict, photos: list) -> None:
    body = build_payload(item, photos)
    if body:
        await _post(body)


async def remove_item(item_id: str) -> None:
    await _post({"action": "delete", "app_id": item_id})
