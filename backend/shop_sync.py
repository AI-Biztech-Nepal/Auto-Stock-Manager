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
from typing import Optional

import httpx

logger = logging.getLogger(__name__)



def _env(name: str) -> str:
    # Read when used, not at import: server.py imports this module before it loads backend/.env.
    return os.environ.get(name, "").strip()


def company_id() -> str:
    return _env("SHOP_SYNC_COMPANY_ID")


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
