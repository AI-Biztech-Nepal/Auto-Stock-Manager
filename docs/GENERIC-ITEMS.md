# Generic items (Prompt 4)

What was added so a shop that is not a vehicle dealer can use Stock. Vehicles are untouched.

## What exists now
- **`items` table**: name, SKU (unique per company), category, serial number, cost, price, quantity, status (`available`, `sold` = none left, `unlisted`), notes, vendor. One row per product with a count; an item with a serial number is one unit.
- **Sales**: `sales.item_id`, `sales.quantity`, `sales.cost_at_sale` (all nullable). A sale has a `vehicle_id` or an `item_id`, never both. `cost_at_sale` keeps what the units cost when sold, so editing an item's cost later does not change past profit.
- **Photos**: `vehicle_photos.item_id` (an item's photos live in the same table and are served by the same `/api/vehicle-photos/{id}/file`).
- **Endpoints**: `GET/POST /api/items`, `GET/PUT/DELETE /api/items/{id}`, `POST /api/items/{id}/sell`, `GET/POST /api/items/{id}/photos`, `DELETE /api/items/{id}/photos/{photo_id}`. Not feature-gated (core). Cost is admin-only. An item with sales cannot be deleted (mark it unlisted).
- **Reads**: Dashboard, Finance summary, the period report, the monthly closing export and the sales list/detail all include item sales and item stock (at cost). Sales > Reconcile ignores item sales.
- **`/api/features`** now also returns `terms` (see `backend/terms.py`): vehicle wording when `stock.vehicles` is on or unknown, generic wording when it is off.
- **Screens**: `/items` page (list, search, add/edit with photos, sell). In the side panel it replaces Inventory when `stock.vehicles` is off. In Repair / Scrap are hidden when `stock.job_cards` is off; the Parts Department and Sanakhat Desk roles are not offered when their feature is off (existing accounts keep working).

## Going live (needs you)
The new table and columns are created by the server at start-up (`ITEMS_DDL`, `_post_schema_cols`), exactly like the bookings table was. **Deploying this code to the live server therefore adds them to the live database on its first start.** They are additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, all nullable); no existing row is read, changed or moved. Take a backup first. For Supabase, run `backend/supabase/schema.sql` (regenerated, safe to re-run).

## Business type (not done)
The words come from the features today. The portal's `business_type` is not readable by Stock's read-only role. To use it, the portal would add a function like this (a portal migration, **not applied or written into the portal repo**):

```sql
create or replace function core.org_business_type(p_org uuid) returns text
language sql stable security definer set search_path = core, pg_temp
as $$ select business_type from core.organizations where id = p_org $$;
revoke all on function core.org_business_type(uuid) from public;
grant execute on function core.org_business_type(uuid) to stock_bridge;  -- the read-only role Stock connects as
```

Then `portal_bridge` would call it and pass the result to `terms.terms_for(features, business_type)`; list the dealership types in `terms.BY_BUSINESS_TYPE`.

## Not done
- **Warranty on sold items.** The warranty tracker is built on the vehicle row (`vehicles.warranty_days`, voiding, service history). Items need their own warranty record; this is a separate piece.
- Returns, edits of a recorded item sale (delete and re-enter instead), bookings, expenses and job cards on items.
- The `/reports/financial` monthly-profit chart still reads sold vehicles only.
- Android app screens for items.
