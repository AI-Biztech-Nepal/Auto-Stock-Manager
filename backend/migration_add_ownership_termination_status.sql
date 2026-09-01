-- Adds the Sanaakhat (ownership-termination) flag column to an existing `vehicles` table.
-- The backend also applies this automatically on startup (see server.py's _run_startup_tasks),
-- so running it by hand is only needed if you want it in place before the next deploy.
--
--   mysql -u <user> -p <db>  < migration_add_ownership_termination_status.sql
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op if the column already exists
-- (MariaDB 10.5+ / MySQL 8+).

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ownership_termination_status VARCHAR(20) DEFAULT 'pending';

UPDATE vehicles SET ownership_termination_status = 'pending'
  WHERE ownership_termination_status IS NULL;
