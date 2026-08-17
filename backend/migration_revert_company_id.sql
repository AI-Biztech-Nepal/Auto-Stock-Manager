-- Down-migration: revert the multi-tenant schema. Run AFTER the backup is confirmed good.

-- 0. Remove the orphaned settings row left over from the deleted Garow Traders test
--    company (survived its cascade delete due to the now-fixed company_id corruption bug).
DELETE FROM settings WHERE id = 'ec7d0ee2-39e8-47ad-bea0-42da00f7107e';

-- 1. settings: rename the one real row's id back from the company UUID to the literal
--    'general', then narrow the column back to its original width.
UPDATE settings SET id = 'general' WHERE id = '52a13200-49e9-4be1-ad7d-8fe898c6c3c1';
ALTER TABLE settings DROP INDEX idx_settings_company_id, DROP COLUMN company_id, MODIFY id VARCHAR(20) NOT NULL;

-- 2. users: drop the composite unique key + company_id, restore the original
--    global-uniqueness constraint on username. Also drop the now-purposeless
--    superadmin account.
DELETE FROM users WHERE role = 'super_admin';
ALTER TABLE users
  DROP INDEX uq_users_username_company,
  DROP INDEX idx_users_company_id,
  DROP COLUMN company_id,
  ADD UNIQUE KEY username (username);

-- 3. company_id off every plain tenant table
ALTER TABLE customers DROP INDEX idx_customers_company_id, DROP COLUMN company_id;
ALTER TABLE emi_payments DROP INDEX idx_emi_payments_company_id, DROP COLUMN company_id;
ALTER TABLE emi_records DROP INDEX idx_emi_records_company_id, DROP COLUMN company_id;
ALTER TABLE expenses DROP INDEX idx_expenses_company_id, DROP COLUMN company_id;
ALTER TABLE job_cards DROP INDEX idx_job_cards_company_id, DROP COLUMN company_id;
ALTER TABLE kit_components DROP INDEX idx_kit_components_company_id, DROP COLUMN company_id;
ALTER TABLE leads DROP INDEX idx_leads_company_id, DROP COLUMN company_id;
ALTER TABLE legal_documents DROP INDEX idx_legal_documents_company_id, DROP COLUMN company_id;
ALTER TABLE part_transactions DROP INDEX idx_part_transactions_company_id, DROP COLUMN company_id;
ALTER TABLE partners DROP INDEX idx_partners_company_id, DROP COLUMN company_id;
ALTER TABLE sales DROP INDEX idx_sales_company_id, DROP COLUMN company_id;
ALTER TABLE spare_parts DROP INDEX idx_spare_parts_company_id, DROP COLUMN company_id;
ALTER TABLE sync_logs DROP INDEX idx_sync_logs_company_id, DROP COLUMN company_id;
ALTER TABLE team_members DROP INDEX idx_team_members_company_id, DROP COLUMN company_id;
ALTER TABLE vehicle_photos DROP INDEX idx_vehicle_photos_company_id, DROP COLUMN company_id;
ALTER TABLE vehicles DROP INDEX idx_vehicles_company_id, DROP COLUMN company_id;
ALTER TABLE vendor_payments DROP INDEX idx_vendor_payments_company_id, DROP COLUMN company_id;
ALTER TABLE vendors DROP INDEX idx_vendors_company_id, DROP COLUMN company_id;
ALTER TABLE audit_logs DROP INDEX idx_audit_logs_company_id, DROP COLUMN company_id;
ALTER TABLE ai_chat_sessions DROP INDEX idx_ai_chat_sessions_company_id, DROP COLUMN company_id;

-- 4. drop the companies table itself
DROP TABLE IF EXISTS companies;
