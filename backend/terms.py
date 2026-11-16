"""The words the screens use for what a business keeps in stock (Prompt 4): one map per kind of shop, so a bakery
never sees "Vehicle". Chosen from the organization's features today: stock.vehicles on (or unknown) means a dealership.
When the portal can say business_type (core.org_business_type, a portal migration), pass it to terms_for and add its
kinds to BY_BUSINESS_TYPE below; nothing else changes."""
from typing import Optional

VEHICLE = {"kind": "vehicle", "item": "Vehicle", "items": "Vehicles", "inventory": "Inventory", "sold": "Sold",
           "sold_stock": "Sold Stock", "add": "Add Vehicle", "sell": "Sell Vehicle"}
GENERIC = {"kind": "item", "item": "Item", "items": "Items", "inventory": "Inventory", "sold": "Sold",
           "sold_stock": "Sold Items", "add": "Add Item", "sell": "Sell Item"}

# business_type id (as the portal's Builder stores it) -> a map. Anything not listed gets GENERIC.
BY_BUSINESS_TYPE: dict = {"vehicle_dealership": VEHICLE, "auto_dealer": VEHICLE}


def terms_for(features: Optional[dict], business_type: Optional[str] = None) -> dict:
    """features is the /features map (None = the portal cannot say, so behave as before: vehicles)."""
    if business_type in BY_BUSINESS_TYPE:
        return dict(BY_BUSINESS_TYPE[business_type])
    if features is None or features.get("stock.vehicles"):
        return dict(VEHICLE)
    return dict(GENERIC)
