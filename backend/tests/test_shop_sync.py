"""shop_sync: a company's website connection, which items go to the shop, and what is sent.

    python -m unittest backend/tests/test_shop_sync.py
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import shop_sync  # noqa: E402

ITEM = {"id": "11111111-1111-1111-1111-111111111111", "company_id": "C1", "name": "Grelac Set", "category": "Luggage",
        "price": 13000, "quantity": 4, "notes": "x" * 400}
ROW = {"business_type": "shop", "site_url": "https://shop.test/", "site_sync_key": "k" * 32, "site_key": "abc123"}


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        for k in ("SHOP_SYNC_URL", "SHOP_SYNC_KEY", "SHOP_SYNC_COMPANY_ID"):
            os.environ.pop(k, None)

    def test_settings_row_makes_the_connection(self):
        cfg = shop_sync.from_settings(ROW, "C1")
        self.assertEqual((cfg["site_url"], cfg["sync_url"]), ("https://shop.test", "https://shop.test/sync_product.php"))
        self.assertTrue(shop_sync.enabled(cfg) and shop_sync.is_shop(cfg))

    def test_a_company_with_no_settings_is_an_ordinary_dealership_with_no_sync(self):
        cfg = shop_sync.from_settings(None, "C2")
        self.assertFalse(shop_sync.enabled(cfg) or shop_sync.is_shop(cfg))

    def test_env_setup_still_works_for_its_one_company_until_settings_are_filled(self):
        os.environ.update(SHOP_SYNC_URL="https://old.test/sync_product.php", SHOP_SYNC_KEY="e" * 32, SHOP_SYNC_COMPANY_ID="C1")
        cfg = shop_sync.from_settings({}, "C1")
        self.assertTrue(shop_sync.enabled(cfg) and shop_sync.is_shop(cfg))
        self.assertEqual(cfg["site_url"], "https://old.test")
        self.assertFalse(shop_sync.enabled(shop_sync.from_settings({}, "C2")))  # other companies are not touched
        self.assertEqual(shop_sync.from_settings(ROW, "C1")["sync_url"], "https://shop.test/sync_product.php")  # settings win


class PayloadTests(unittest.TestCase):
    def test_payload(self):
        body = shop_sync.build_payload(ITEM, [("p1", b"abc")])
        self.assertEqual((body["category"], body["stock"], len(body["description"])), ("luggage", 4, 255))
        self.assertEqual(body["photos"][0], {"id": "p1", "data": "YWJj"})

    def test_cannot_list_without_a_photo_or_a_known_category(self):
        self.assertIsNone(shop_sync.build_payload(ITEM, []))
        self.assertIsNone(shop_sync.build_payload({**ITEM, "category": "toys"}, [("p1", b"a")]))


if __name__ == "__main__":
    unittest.main()
