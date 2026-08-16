-- Hamro G&G Auto OS — MySQL schema (Hostinger), replacing MongoDB Atlas.
--
-- Conventions (deliberate, to keep backend/sqldb.py's shim simple and behavior-preserving):
--   * Every table's primary key column is named `id` (VARCHAR(36) UUID, except
--     audit_logs which never had an app-level id in Mongo and gets a plain
--     AUTO_INCREMENT int instead — still named `id` for uniformity).
--   * All date/datetime/timestamp fields are VARCHAR, storing the exact ISO-8601
--     string the app already produces via `datetime.now(timezone.utc).isoformat()`
--     or `.date().isoformat()`. ISO strings sort correctly with plain string
--     comparison, so $gte/$lte filters translate directly to `>=`/`<=` on the
--     VARCHAR column — no datetime<->string conversion, no round-trip drift.
--   * All money/float fields are DOUBLE (not DECIMAL) to exactly match the
--     Python `float` type the app already uses everywhere — DECIMAL would come
--     back from the driver as `decimal.Decimal`, which breaks on mixed
--     arithmetic with plain floats elsewhere in server.py.
--   * A handful of list/dict fields that are only ever read/written as a whole
--     blob (never filtered or sorted on) are MySQL JSON columns instead of being
--     normalized into child tables: ai_chat_sessions.messages,
--     sales.extra_expenses, job_cards.parts, leads.images.
--   * `vehicles.linked_contact_id` stays a single polymorphic VARCHAR (no FK
--     constraint) exactly as it behaved in Mongo — it resolves to either
--     customers.id or vendors.id depending on the sibling linked_contact_type
--     column. Mongo never enforced referential integrity here either, so this
--     isn't a regression, and it keeps every server.py call site unchanged.
--   * `spare_parts.set_components` (inline array, mutated element-by-element via
--     Mongo's positional `$` operator) becomes a real child table,
--     spare_parts_set_components — the one place with a genuinely different
--     shape, handled by a small special case inside sqldb.py.
--   * `company_id` (nullable VARCHAR(36), indexed) is on every tenant-scoped
--     table, mirroring the multi-tenant company_id field added on the Mongo
--     side — nullable and unconstrained (no FK to companies) rather than
--     NOT NULL, same reasoning as linked_contact_id above: Mongo enforces
--     nothing here either, server.py's company_scope(cu) is the actual
--     source of truth. The one child table without its own company_id is
--     spare_parts_set_components — it's scoped transitively through its
--     parent spare_parts row, same as kit_components' uniqueness needs no
--     company_id of its own since both part ids already belong to one.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Companies (platform tenants) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  active TINYINT(1) DEFAULT 1,
  created_at VARCHAR(40),
  UNIQUE KEY uq_companies_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Users / auth ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  company_id VARCHAR(36),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  created_at VARCHAR(40),
  UNIQUE KEY uq_users_username_company (username, company_id),
  INDEX idx_users_company_id (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vendors / customers / team ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  company_id VARCHAR(36),
  INDEX idx_vendors_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255),
  phone VARCHAR(50),
  address VARCHAR(500),
  notes TEXT,
  vendor_type VARCHAR(20) DEFAULT 'both',
  created_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  company_id VARCHAR(36),
  INDEX idx_customers_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255),
  contact_number VARCHAR(50),
  address VARCHAR(500),
  occupation VARCHAR(255),
  budget_min DOUBLE,
  budget_max DOUBLE,
  interested_brands VARCHAR(255),
  notes TEXT,
  created_at VARCHAR(40),
  last_purchase_date VARCHAR(20),
  INDEX idx_customers_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS team_members (
  company_id VARCHAR(36),
  INDEX idx_team_members_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255),
  role VARCHAR(50),
  contact VARCHAR(50),
  specialization VARCHAR(255),
  commission_rate DOUBLE,
  joining_date VARCHAR(20),
  is_active TINYINT(1) DEFAULT 1,
  created_at VARCHAR(40),
  INDEX idx_team_members_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS partners (
  company_id VARCHAR(36),
  INDEX idx_partners_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255),
  capital_contribution DOUBLE,
  stake_percentage DOUBLE,
  contact VARCHAR(100),
  created_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vehicles (largest / most heavily queried table) ─────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  company_id VARCHAR(36),
  INDEX idx_vehicles_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  brand VARCHAR(100),
  model VARCHAR(100),
  variant VARCHAR(100),
  year INT,
  engine_cc INT,
  fuel_type VARCHAR(50),
  vehicle_type VARCHAR(50),
  ownership_number INT,
  chassis_number VARCHAR(100),
  engine_number VARCHAR(100),
  kilometer_run INT,
  `condition` VARCHAR(50),
  condition_rating INT,
  color VARCHAR(50),
  registration_number VARCHAR(50),
  purchase_price DOUBLE,
  accessories_cost DOUBLE,
  purchase_date VARCHAR(20),
  purchase_source VARCHAR(255),
  vendor_id VARCHAR(36),
  purchase_from VARCHAR(255),
  linked_contact_type VARCHAR(20),
  linked_contact_id VARCHAR(36),
  linked_contact_name VARCHAR(255),
  selling_price DOUBLE,
  minimum_selling_price DOUBLE,
  notes TEXT,
  status VARCHAR(20),
  bluebook_status VARCHAR(20),
  insurance_status VARCHAR(20),
  tax_clearance_status VARCHAR(20),
  transfer_status VARCHAR(20),
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  sold_date VARCHAR(20),
  customer_id VARCHAR(36),
  salesperson_id VARCHAR(36),
  salesperson_name VARCHAR(255),
  discount DOUBLE,
  created_by VARCHAR(100),
  INDEX idx_vehicles_status (status),
  INDEX idx_vehicles_registration_number (registration_number),
  INDEX idx_vehicles_brand (brand),
  INDEX idx_vehicles_purchase_date (purchase_date),
  INDEX idx_vehicles_created_at (created_at),
  INDEX idx_vehicles_vendor_id (vendor_id),
  INDEX idx_vehicles_customer_id (customer_id),
  INDEX idx_vehicles_salesperson_id (salesperson_id),
  INDEX idx_vehicles_linked_contact (linked_contact_type, linked_contact_id),
  CONSTRAINT fk_vehicles_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_vehicles_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_vehicles_salesperson FOREIGN KEY (salesperson_id) REFERENCES team_members(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Sales ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  company_id VARCHAR(36),
  INDEX idx_sales_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id VARCHAR(36),
  customer_id VARCHAR(36),
  sale_price DOUBLE,
  extra_expenses JSON,
  expenses_total DOUBLE,
  total_amount DOUBLE,
  payment_method VARCHAR(50),
  paid_cash DOUBLE,
  paid_bank DOUBLE,
  due_amount DOUBLE,
  due_date VARCHAR(20),
  payment_status VARCHAR(20),
  sale_date VARCHAR(20),
  notes TEXT,
  created_by VARCHAR(100),
  created_at VARCHAR(40),
  updated_by VARCHAR(100),
  updated_at VARCHAR(40),
  returned TINYINT(1) DEFAULT 0,
  returned_at VARCHAR(40),
  returned_status VARCHAR(50),
  refund_amount DOUBLE,
  retained_amount DOUBLE,
  return_notes TEXT,
  INDEX idx_sales_vehicle_id (vehicle_id),
  INDEX idx_sales_customer_id (customer_id),
  INDEX idx_sales_returned (returned),
  INDEX idx_sales_sale_date (sale_date),
  INDEX idx_sales_created_at (created_at),
  CONSTRAINT fk_sales_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Spare parts + set components (was an inline array) + kits ───────────
CREATE TABLE IF NOT EXISTS spare_parts (
  company_id VARCHAR(36),
  INDEX idx_spare_parts_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100),
  brand_compatibility VARCHAR(255),
  part_number VARCHAR(100),
  quantity INT DEFAULT 0,
  unit_cost DOUBLE,
  selling_price DOUBLE,
  vendor_id VARCHAR(36),
  bill_no VARCHAR(100),
  entry_date VARCHAR(20),
  supplier VARCHAR(255),
  min_stock_alert INT,
  location VARCHAR(255),
  notes TEXT,
  is_kit TINYINT(1) DEFAULT 0,
  stock_type VARCHAR(20),
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  INDEX idx_spare_parts_category (category),
  INDEX idx_spare_parts_vendor_id (vendor_id),
  INDEX idx_spare_parts_created_at (created_at),
  CONSTRAINT fk_spare_parts_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS spare_parts_set_components (
  id INT AUTO_INCREMENT PRIMARY KEY,
  part_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  stock INT DEFAULT 0,
  rate DOUBLE DEFAULT 0,
  UNIQUE KEY uq_set_components (part_id, name),
  CONSTRAINT fk_set_components_part FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kit_components (
  company_id VARCHAR(36),
  INDEX idx_kit_components_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  kit_part_id VARCHAR(36) NOT NULL,
  component_part_id VARCHAR(36) NOT NULL,
  qty_per_kit INT,
  created_by VARCHAR(100),
  created_at VARCHAR(40),
  UNIQUE KEY uq_kit_components (kit_part_id, component_part_id),
  INDEX idx_kit_components_component (component_part_id),
  CONSTRAINT fk_kit_components_kit FOREIGN KEY (kit_part_id) REFERENCES spare_parts(id) ON DELETE CASCADE,
  CONSTRAINT fk_kit_components_component FOREIGN KEY (component_part_id) REFERENCES spare_parts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS part_transactions (
  company_id VARCHAR(36),
  INDEX idx_part_transactions_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  part_id VARCHAR(36),
  part_name VARCHAR(500),
  type VARCHAR(10),
  quantity INT,
  reason VARCHAR(255),
  date VARCHAR(20),
  job_id VARCHAR(36),
  notes TEXT,
  created_by VARCHAR(100),
  created_at VARCHAR(40),
  INDEX idx_part_transactions_part_id (part_id),
  INDEX idx_part_transactions_created_at (created_at),
  CONSTRAINT fk_part_transactions_part FOREIGN KEY (part_id) REFERENCES spare_parts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Job cards ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_cards (
  company_id VARCHAR(36),
  INDEX idx_job_cards_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id VARCHAR(36),
  is_external TINYINT(1) DEFAULT 0,
  vehicle_brand VARCHAR(100),
  vehicle_model VARCHAR(100),
  vehicle_year INT,
  registration_number VARCHAR(50),
  customer_name VARCHAR(255),
  customer_contact VARCHAR(50),
  work_description TEXT,
  mechanic_id VARCHAR(36),
  mechanic_name VARCHAR(255),
  estimated_cost DOUBLE,
  notes TEXT,
  coupon_no INT,
  job_date VARCHAR(20),
  parts JSON,
  job_number VARCHAR(50),
  status VARCHAR(20),
  actual_cost DOUBLE,
  created_at VARCHAR(40),
  completed_at VARCHAR(40),
  created_by VARCHAR(100),
  is_warranty TINYINT(1) DEFAULT 0,
  updated_at VARCHAR(40),
  INDEX idx_job_cards_status (status),
  INDEX idx_job_cards_vehicle_id (vehicle_id),
  INDEX idx_job_cards_mechanic_id (mechanic_id),
  INDEX idx_job_cards_created_at (created_at),
  CONSTRAINT fk_job_cards_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_cards_mechanic FOREIGN KEY (mechanic_id) REFERENCES team_members(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Expenses / vendor payments / EMI ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  company_id VARCHAR(36),
  INDEX idx_expenses_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id VARCHAR(36),
  category VARCHAR(100),
  amount DOUBLE,
  description VARCHAR(500),
  date VARCHAR(20),
  added_by VARCHAR(100),
  created_at VARCHAR(40),
  INDEX idx_expenses_vehicle_id (vehicle_id),
  CONSTRAINT fk_expenses_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vendor_payments (
  company_id VARCHAR(36),
  INDEX idx_vendor_payments_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vendor_id VARCHAR(36),
  amount DOUBLE,
  vehicle_id VARCHAR(36),
  payment_date VARCHAR(20),
  notes TEXT,
  recorded_by VARCHAR(100),
  created_at VARCHAR(40),
  INDEX idx_vendor_payments_vendor_id (vendor_id),
  INDEX idx_vendor_payments_payment_date (payment_date),
  CONSTRAINT fk_vendor_payments_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendor_payments_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emi_records (
  company_id VARCHAR(36),
  INDEX idx_emi_records_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  customer_id VARCHAR(36),
  vehicle_id VARCHAR(36),
  loan_amount DOUBLE,
  down_payment DOUBLE,
  interest_rate DOUBLE,
  tenure_months INT,
  start_date VARCHAR(20),
  financer_name VARCHAR(255),
  notes TEXT,
  monthly_installment DOUBLE,
  total_payable DOUBLE,
  total_interest DOUBLE,
  status VARCHAR(20) DEFAULT 'active',
  created_at VARCHAR(40),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  vehicle_name VARCHAR(255),
  INDEX idx_emi_records_status (status),
  CONSTRAINT fk_emi_records_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_emi_records_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS emi_payments (
  company_id VARCHAR(36),
  INDEX idx_emi_payments_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  emi_id VARCHAR(36),
  amount DOUBLE,
  payment_date VARCHAR(20),
  notes TEXT,
  recorded_by VARCHAR(100),
  created_at VARCHAR(40),
  INDEX idx_emi_payments_emi_id (emi_id),
  CONSTRAINT fk_emi_payments_emi FOREIGN KEY (emi_id) REFERENCES emi_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Media (base64, same reason it was in Mongo: Render's disk is ephemeral) ─
CREATE TABLE IF NOT EXISTS vehicle_photos (
  company_id VARCHAR(36),
  INDEX idx_vehicle_photos_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id VARCHAR(36),
  filename VARCHAR(500),
  content_type VARCHAR(100),
  data LONGTEXT,
  uploaded_at VARCHAR(40),
  size INT,
  INDEX idx_vehicle_photos_vehicle_id (vehicle_id),
  INDEX idx_vehicle_photos_uploaded_at (uploaded_at),
  CONSTRAINT fk_vehicle_photos_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS legal_documents (
  company_id VARCHAR(36),
  INDEX idx_legal_documents_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  vehicle_id VARCHAR(36),
  filename VARCHAR(500),
  content_type VARCHAR(100),
  data LONGTEXT,
  doc_type VARCHAR(30),
  original_name VARCHAR(500),
  uploaded_at VARCHAR(40),
  size INT,
  INDEX idx_legal_documents_vehicle_id (vehicle_id),
  INDEX idx_legal_documents_uploaded_at (uploaded_at),
  CONSTRAINT fk_legal_documents_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Storefront leads / settings / sync / audit / AI chat ────────────────
CREATE TABLE IF NOT EXISTS leads (
  company_id VARCHAR(36),
  INDEX idx_leads_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(20),
  name VARCHAR(255),
  phone VARCHAR(50),
  message TEXT,
  images JSON,
  requested_service VARCHAR(255),
  vehicle_type VARCHAR(100),
  preferred_date VARCHAR(20),
  status VARCHAR(20) DEFAULT 'new',
  created_at VARCHAR(40),
  INDEX idx_leads_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  company_id VARCHAR(36),
  INDEX idx_settings_company_id (company_id),
  -- Was VARCHAR(20) (fit the old single-tenant literal "general"); widened to match every
  -- other id column now that the multi-tenant migration renames it to a full company_id UUID.
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  logo_url VARCHAR(1000),
  business_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  address VARCHAR(500),
  hero_image_url VARCHAR(1000),
  service_image_url VARCHAR(1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_logs (
  company_id VARCHAR(36),
  INDEX idx_sync_logs_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  pushed_at VARCHAR(40),
  count INT,
  status VARCHAR(20),
  message VARCHAR(500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  company_id VARCHAR(36),
  INDEX idx_audit_logs_company_id (company_id),
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(100),
  vehicle_id VARCHAR(36),
  user VARCHAR(100),
  timestamp VARCHAR(40),
  details TEXT,
  INDEX idx_audit_logs_timestamp (timestamp),
  INDEX idx_audit_logs_vehicle_id (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  company_id VARCHAR(36),
  INDEX idx_ai_chat_sessions_company_id (company_id),
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  messages JSON,
  updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
