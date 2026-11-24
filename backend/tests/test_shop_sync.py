"""shop_sync: which items go to the shop, and what is sent.

    python -m unittest backend/tests/test_shop_sync.py
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import shop_sync  # noqa: E402

ITEM = {"id": "11111111-1111-1111-1111-111111111111", "company_id": "C1", "name": "Grelac Set", "category": "Luggage",
        "price": 13000, "quantity": 4, "notes": "x" * 400}


class ShopSyncTests(unittest.TestCase):
    def setUp(self):
        shop_sync.URL, shop_sync.KEY, shop_sync.COMPANY_ID = "https://shop.test/sync_product.php", "k" * 32, "C1"

    def test_only_the_shops_company_is_wanted(self):
        self.assertTrue(shop_sync.wanted(ITEM))
        self.assertFalse(shop_sync.wanted({**ITEM, "company_id": "OTHER"}))

    def test_off_when_not_configured(self):
        shop_sync.KEY = ""
        self.assertFalse(shop_sync.wanted(ITEM))

    def test_payload(self):
        body = shop_sync.build_payload(ITEM, [("p1", b"abc")])
        self.assertEqual((body["category"], body["stock"], len(body["description"])), ("luggage", 4, 255))
        self.assertEqual(body["photos"][0], {"id": "p1", "data": "YWJj"})

    def test_cannot_list_without_a_photo_or_a_known_category(self):
        self.assertIsNone(shop_sync.build_payload(ITEM, []))
        self.assertIsNone(shop_sync.build_payload({**ITEM, "category": "toys"}, [("p1", b"a")]))


if __name__ == "__main__":
    unittest.main()
