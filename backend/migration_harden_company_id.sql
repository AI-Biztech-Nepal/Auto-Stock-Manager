-- Schema-level hardening for multi-tenant isolation: run against production AFTER the
-- backup is confirmed good. Companion to migration_add_company_id.sql (which only added
-- the column) -- this migration makes the isolation the app-layer already enforces
-- (_ScopedCollection in server.py) impossible to violate even if that app code regresses.
--
-- Background: on 2026-08-18/19, a session whose JWT had no company_id (a stale token
-- minted before the account was assigned one) caused _ScopedCollection to silently write
-- rows with company_id NULL -- invisible to every scoped read afterward, no error anywhere.
-- Two app-level fixes landed same day (401 at write time, then at auth time). This
-- migration adds the database-level backstop: NOT NULL + a FOREIGN KEY to companies(id) on
-- every tenant table, so a row with missing or invalid company_id can no longer be written
-- at all, regardless of what the app code does.
--
-- Prerequisite: every row in every tenant table must already have a valid company_id
-- before this runs, or the ALTER TABLE ... MODIFY ... NOT NULL statements below will fail.
-- Run this first to confirm zero rows would violate the new constraints:
--
--   SELECT 'customers' t, COUNT(*) FROM customers WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'emi_payments', COUNT(*) FROM emi_payments WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'emi_records', COUNT(*) FROM emi_records WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'expenses', COUNT(*) FROM expenses WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'job_cards', COUNT(*) FROM job_cards WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'kit_components', COUNT(*) FROM kit_components WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'leads', COUNT(*) FROM leads WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'legal_documents', COUNT(*) FROM legal_documents WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'part_transactions', COUNT(*) FROM part_transactions WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'partners', COUNT(*) FROM partners WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'sales', COUNT(*) FROM sales WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'spare_parts', COUNT(*) FROM spare_parts WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'sync_logs', COUNT(*) FROM sync_logs WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'team_members', COUNT(*) FROM team_members WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'vehicle_photos', COUNT(*) FROM vehicle_photos WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'vendor_payments', COUNT(*) FROM vendor_payments WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'vendors', COUNT(*) FROM vendors WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'ai_chat_sessions', COUNT(*) FROM ai_chat_sessions WHERE company_id IS NULL OR company_id=''
--   UNION ALL SELECT 'settings', COUNT(*) FROM settings WHERE company_id IS NULL OR company_id='';
--
-- If any row shows up NULL/empty here, backfill it (see migration_add_company_id.sql's
-- step 5 pattern) before running the ALTERs below -- do NOT relax the NOT NULL to work
-- around a leftover bad row.
--
-- ON DELETE behavior: deliberately left at the default (RESTRICT), not CASCADE.
-- platform_delete_company() in server.py already deletes every child row across all
-- TENANT_COLLECTIONS *before* deleting the companies row, so RESTRICT never fires on that
-- path -- but it does mean any other code that tries to delete a company while it still has
-- data gets stopped at the database level instead of silently orphaning rows.

-- Deliberately NOT disabling FOREIGN_KEY_CHECKS here (unlike schema.sql/migration_add_
-- company_id.sql, where it's used for CREATE TABLE ordering) -- for this migration, letting
-- each ADD CONSTRAINT actually validate against real data is the point: if any row was
-- missed by the manual audit, the specific ALTER TABLE statement fails loudly right there
-- instead of silently adding a toothless constraint.

-- 1. Fix settings.id: was VARCHAR(20), but server.py's signup path inserts a full
--    36-char uuid4() as the id -- MariaDB silently truncates anything over 20 chars
--    instead of erroring, which is how one company's settings row ended up with id
--    '89d977d9-2dcd-4fe0-8' (truncated from a real uuid4). Every other table's id is
--    VARCHAR(36) per schema.sql's stated convention; settings was the one outlier.
--    Nothing queries settings by id (every read/write goes through the company_id-scoped
--    empty-filter pattern in server.py), so repairing the corrupted row just needs a new
--    valid id, not a recovery of the original value.
ALTER TABLE settings MODIFY id VARCHAR(36) NOT NULL;
UPDATE settings SET id = UUID() WHERE CHAR_LENGTH(id) = 20 AND id <> 'general';

-- 2. NOT NULL + FK(company_id -> companies.id) on every table _ScopedCollection scopes.
ALTER TABLE customers          MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_customers_company          FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE emi_payments       MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_emi_payments_company       FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE emi_records        MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_emi_records_company        FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE expenses           MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_expenses_company           FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE job_cards          MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_job_cards_company          FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE kit_components     MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_kit_components_company     FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE leads              MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_leads_company              FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE legal_documents    MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_legal_documents_company    FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE part_transactions  MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_part_transactions_company  FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE partners           MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_partners_company           FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE sales              MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_sales_company              FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE spare_parts        MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_spare_parts_company        FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE sync_logs          MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_sync_logs_company          FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE team_members       MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_team_members_company       FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE vehicle_photos     MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_vehicle_photos_company     FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE vehicles           MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_vehicles_company           FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE vendor_payments    MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_vendor_payments_company    FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE vendors            MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_vendors_company            FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE audit_logs         MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_audit_logs_company         FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE ai_chat_sessions   MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_ai_chat_sessions_company   FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE settings           MODIFY company_id VARCHAR(36) NOT NULL, ADD CONSTRAINT fk_settings_company           FOREIGN KEY (company_id) REFERENCES companies(id);

-- 3. users: company_id stays NULLable (platform_owner legitimately has none -- see
--    get_current_user in server.py) but is now FK-checked when present, and a CHECK
--    enforces the same "platform_owner is the one exception" rule the auth-time guard
--    added on 2026-08-19 -- so a non-platform_owner user with no company_id can no longer
--    even be inserted, not just rejected at login.
ALTER TABLE users ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE users ADD CONSTRAINT chk_users_company_or_platform_owner CHECK (role = 'platform_owner' OR company_id IS NOT NULL);

-- Sanity check -- run after and confirm every constraint exists:
-- SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
--   WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME LIKE 'fk_%_company' OR CONSTRAINT_NAME LIKE 'chk_%';
