"""Pushes a company's stock items to its online shop, whose catalogue lives in the shop's own database. The shop side is a
small receiver (sync_product.php for All In One Abroad) that accepts only this module's requests, with a bearer key.

Everything is per company, from its settings row (Settings > Website): business_type, site_url, the sync key and, optionally,
the receiver's address (default <site_url>/sync_product.php). The original shop was set up with SHOP_SYNC_* in backend/.env;
those are still read for that one company while its settings are empty.

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

CATEGORIES = {"luggage", "kitchen", "appliances"}  # shortcut: the categories of the first shop's pages; make them a setting for the next shop
MAX_PHOTOS = 8


def _env(name: str) -> str:
    # Read when used, not at import: server.py imports this module before it loads backend/.env.
    return os.environ.get(name, "").strip()


def company_id() -> str:
    """The company set up through backend/.env before per-company settings existed (see the module note)."""
    return _env("SHOP_SYNC_COMPANY_ID")


def site_of(url: str) -> str:
    u = urlparse(url or "")
    return f"{u.scheme}://{u.netloc}" if u.scheme and u.netloc else ""


def from_settings(row: Optional[dict], cid=None) -> dict:
    """One company's website connection: {business_type, site_url, sync_url, sync_key, site_key}. Always a dict; enabled() says
    whether it can sync."""
    row = row or {}
    cfg = {"business_type": row.get("business_type") or "dealership", "site_url": (row.get("site_url") or "").rstrip("/"),
           "sync_url": row.get("site_sync_url") or "", "sync_key": row.get("site_sync_key") or "", "site_key": row.get("site_key") or ""}
    if cid and cid == company_id():  # the .env-configured shop, until its settings are filled in
        if not row.get("business_type"):
            cfg["business_type"] = "shop"
        if not cfg["sync_url"] and not cfg["site_url"]:  # a site address in the settings beats the old receiver address
            cfg["sync_url"] = _env("SHOP_SYNC_URL")
        cfg["sync_key"] = cfg["sync_key"] or _env("SHOP_SYNC_KEY")
        cfg["site_url"] = cfg["site_url"] or site_of(cfg["sync_url"])
    if not cfg["sync_url"] and cfg["site_url"]:
        cfg["sync_url"] = cfg["site_url"] + "/sync_product.php"
    return cfg


def enabled(cfg: Optional[dict]) -> bool:
    return bool(cfg and cfg.get("sync_url") and cfg.get("sync_key"))


def is_shop(cfg: Optional[dict]) -> bool:
    """A company that sells goods, not vehicles: it gets the Items screens and its product pages in Visits."""
    return bool(cfg) and cfg.get("business_type") == "shop"


_names: dict = {}  # site_url -> (fetched at, {product id: name})


async def product_names(cfg: dict) -> dict:
    """{shop product id (text): name} from the shop's public catalogue, kept 5 minutes. Empty when it cannot be reached: the
    Visits page then shows "Product 29" instead of the name. shortcut: assumes <site>/api.php?action=products, as the first shop has."""
    site = cfg.get("site_url") or ""
    at, names = _names.get(site, (0.0, {}))
    if names and time.monotonic() - at < 300:
        return names
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(site + "/api.php", params={"action": "products"})
        names = {str(p["id"]): p["name"] for p in r.json().get("products", [])}
        _names[site] = (time.monotonic(), names)
    except Exception:
        logger.warning("Could not read the shop's product names from %s", site, exc_info=True)
    return names


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


async def _post(cfg: dict, body: dict) -> None:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(cfg["sync_url"], json=body, headers={"Authorization": f"Bearer {cfg['sync_key']}"})
    if r.status_code != 200:
        logger.warning("Shop sync of %s was refused (%s): %s", body.get("app_id"), r.status_code, r.text[:300])


async def push_item(cfg: dict, item: dict, photos: list) -> None:
    body = build_payload(item, photos)
    if body:
        await _post(cfg, body)


async def remove_item(cfg: dict, item_id: str) -> None:
    await _post(cfg, {"action": "delete", "app_id": item_id})
