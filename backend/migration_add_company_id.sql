-- Multi-tenant migration: run against production AFTER the backup is confirmed good.
-- Companion to backend/migration_revert_company_id.sql (the down-migration already run once).
--
-- Design note: usernames stay GLOBALLY unique (not scoped per-company) so plain
-- username/password login keeps working unchanged -- no "company code" field, which is
-- exactly the UX that confused people in the previous multi-tenant attempt. Every business
-- that signs up via POST /auth/signup gets its own company_id; all of ITS data is isolated
-- automatically at the app's db-access layer (see _ScopedCollection in server.py), not by
-- per-table SQL constraints -- these ALTERs only add the column + index each table needs.

-- 1. New companies table (id/name/created_at only -- no "code"/"active": those were for the
--    old Super Admin console, which this implementation doesn't have).
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. company_id on every plain tenant table
ALTER TABLE customers ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_customers_company_id (company_id);
ALTER TABLE emi_payments ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_emi_payments_company_id (company_id);
ALTER TABLE emi_records ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_emi_records_company_id (company_id);
ALTER TABLE expenses ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_expenses_company_id (company_id);
ALTER TABLE job_cards ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_job_cards_company_id (company_id);
ALTER TABLE kit_components ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_kit_components_company_id (company_id);
ALTER TABLE leads ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_leads_company_id (company_id);
ALTER TABLE legal_documents ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_legal_documents_company_id (company_id);
ALTER TABLE part_transactions ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_part_transactions_company_id (company_id);
ALTER TABLE partners ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_partners_company_id (company_id);
ALTER TABLE sales ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_sales_company_id (company_id);
ALTER TABLE spare_parts ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_spare_parts_company_id (company_id);
ALTER TABLE sync_logs ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_sync_logs_company_id (company_id);
ALTER TABLE team_members ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_team_members_company_id (company_id);
ALTER TABLE vehicle_photos ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_vehicle_photos_company_id (company_id);
ALTER TABLE vehicles ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_vehicles_company_id (company_id);
ALTER TABLE vendor_payments ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_vendor_payments_company_id (company_id);
ALTER TABLE vendors ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_vendors_company_id (company_id);
ALTER TABLE audit_logs ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_audit_logs_company_id (company_id);
ALTER TABLE ai_chat_sessions ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_ai_chat_sessions_company_id (company_id);

-- 3. users: company_id only -- username stays globally unique, no constraint change.
ALTER TABLE users ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_users_company_id (company_id);

-- 4. settings: company_id only -- "id" keeps whatever value it already has ('general'),
--    it's just a row identifier now, not a lookup key (the app looks rows up by company_id).
ALTER TABLE settings ADD COLUMN company_id VARCHAR(36) NULL, ADD INDEX idx_settings_company_id (company_id);

-- 5. One-time backfill: everything that already exists belongs to your original business.
--    Run this LAST, and only once -- re-running is harmless (it only touches NULL rows) but
--    unnecessary after the first run.
SET @default_company_id = UUID();
INSERT INTO companies (id, name, created_at)
  VALUES (@default_company_id, 'Hamro G&G Auto', NOW());

UPDATE customers SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE emi_payments SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE emi_records SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE expenses SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE job_cards SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE kit_components SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE leads SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE legal_documents SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE part_transactions SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE partners SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE sales SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE spare_parts SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE sync_logs SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE team_members SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE vehicle_photos SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE vehicles SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE vendor_payments SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE vendors SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE audit_logs SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE ai_chat_sessions SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE users SET company_id = @default_company_id WHERE company_id IS NULL;
UPDATE settings SET company_id = @default_company_id WHERE company_id IS NULL;

-- Sanity check -- run this after and confirm it returns your one company with sensible counts:
-- SELECT c.name, c.id,
--   (SELECT COUNT(*) FROM vehicles WHERE company_id = c.id) AS vehicles,
--   (SELECT COUNT(*) FROM users WHERE company_id = c.id) AS users
-- FROM companies c;
