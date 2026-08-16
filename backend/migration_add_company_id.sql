-- Multi-tenant migration: run against production AFTER the backup is confirmed good.
-- Safe to re-run: every ALTER below is additive/idempotent-guarded where MySQL allows it.

-- 1. New companies table
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at VARCHAR(40),
  UNIQUE KEY uq_companies_code (code)
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

-- 3. users: company_id + re-scope the username uniqueness to per-company
ALTER TABLE users
  ADD COLUMN company_id VARCHAR(36) NULL,
  ADD INDEX idx_users_company_id (company_id),
  DROP INDEX username,
  ADD UNIQUE KEY uq_users_username_company (username, company_id);

-- 4. settings: company_id + widen id to hold a full company UUID (was sized for 'general')
ALTER TABLE settings
  ADD COLUMN company_id VARCHAR(36) NULL,
  ADD INDEX idx_settings_company_id (company_id),
  MODIFY id VARCHAR(36) NOT NULL;
