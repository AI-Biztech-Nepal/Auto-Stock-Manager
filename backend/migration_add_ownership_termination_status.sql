-- Adds the two per-vehicle status flags that post-date the original `vehicles` schema:
--   ownership_termination_status  -- Sanaakhat, edited from the inventory card
--   ownership_transfer_status     -- post-sale name transfer, edited on the Sold Stock screens
-- The backend also applies these automatically on startup (server.py's _run_startup_tasks),
-- so running this by hand is only needed to have them in place before the next deploy.
--
--   mysql -u <user> -p <db>  < migration_add_ownership_termination_status.sql
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op if the column already exists
-- (MariaDB 10.5+ / MySQL 8+).

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ownership_termination_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ownership_transfer_status VARCHAR(20) DEFAULT 'pending';

UPDATE vehicles SET ownership_termination_status = 'pending' WHERE ownership_termination_status IS NULL;
UPDATE vehicles SET ownership_transfer_status = 'pending' WHERE ownership_transfer_status IS NULL;
