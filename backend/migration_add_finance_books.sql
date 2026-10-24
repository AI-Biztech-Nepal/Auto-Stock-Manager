-- Finance books: the tables behind the Finance tab (parties, two ledgers, bills, bank accounts...).
--
-- RUN BY HAND, ONCE. Nothing in the app runs this file -- the backend never creates or alters these
-- tables on startup or deploy. Until it has been run, the Finance tab shows "not set up yet".
--
--   mysql -u <user> -p <db>  < migration_add_finance_books.sql
--
-- Safe to re-run: every statement is CREATE TABLE IF NOT EXISTS. It only ADDS tables (all named
-- fin_*); it does not touch any existing table. Dates are stored as YYYY-MM-DD text and timestamps
-- as ISO text, like the rest of this database. To undo it: DROP the nine fin_* tables.
--
-- Rules the app enforces in code (the original system used database triggers for these):
--   * a sale/purchase bill against a saved party books a debt in fin_customer_ledger / fin_vendor_ledger
--     (source = 'booking', source_type = 'business_transaction', source_id = the bill's id) and keeps it
--     in step when the bill is edited or deleted;
--   * cash in hand is bank_account_id = NULL -- there is no "cash" row in fin_bank_accounts.

-- Parties: customers AND vendors in one table. Which side someone is on is decided per entry.
CREATE TABLE IF NOT EXISTS fin_parties (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NULL,
  address VARCHAR(300) NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  INDEX idx_fin_parties_company (company_id, name),
  UNIQUE KEY uq_fin_parties_phone (company_id, phone),
  CONSTRAINT fk_fin_parties_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_bank_accounts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  bank_name VARCHAR(150) NULL,
  account_number VARCHAR(60) NULL,
  account_holder_name VARCHAR(150) NULL,
  address VARCHAR(300) NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  UNIQUE KEY uq_fin_accounts_name (company_id, name),
  CONSTRAINT fk_fin_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Moving your own money between your own accounts (NULL = cash in hand). Never changes the total.
CREATE TABLE IF NOT EXISTS fin_account_transfers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  from_account_id VARCHAR(36) NULL,
  to_account_id VARCHAR(36) NULL,
  amount DOUBLE NOT NULL,
  note VARCHAR(500) NULL,
  transfer_date VARCHAR(20) NOT NULL,
  created_at VARCHAR(40),
  INDEX idx_fin_transfers_company (company_id, transfer_date),
  CONSTRAINT fk_fin_transfers_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_expense_categories (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  UNIQUE KEY uq_fin_categories_name (company_id, name),
  CONSTRAINT fk_fin_categories_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Line-item names typed on a bill, remembered so the next bill can offer them.
CREATE TABLE IF NOT EXISTS fin_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(250) NOT NULL,
  rate DOUBLE NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  UNIQUE KEY uq_fin_items_name (company_id, name),
  CONSTRAINT fk_fin_items_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A sale or purchase BILL, or an expense. A bill books a debt (see header); an expense is cash out.
CREATE TABLE IF NOT EXISTS fin_transactions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,                 -- 'sale' | 'purchase' | 'expense'
  amount DOUBLE NOT NULL,                    -- grand total: subtotal - discount + VAT
  note TEXT NULL,
  party_name VARCHAR(200) NULL,
  customer_id VARCHAR(36) NULL,
  bill_no VARCHAR(60) NULL,
  bill_date VARCHAR(20) NULL,
  party_address VARCHAR(300) NULL,
  vat_pan_no VARCHAR(60) NULL,
  items LONGTEXT NULL,                       -- JSON: [{description, qty, rate, amount}, ...]
  discount_amount DOUBLE NOT NULL DEFAULT 0,
  vat_amount DOUBLE NOT NULL DEFAULT 0,
  expense_category_id VARCHAR(36) NULL,
  payment_mode VARCHAR(10) NOT NULL DEFAULT 'cash',
  bank_account_id VARCHAR(36) NULL,
  source_type VARCHAR(40) NULL,
  source_id VARCHAR(36) NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  INDEX idx_fin_tx_company (company_id, type, created_at),
  INDEX idx_fin_tx_party (customer_id),
  CONSTRAINT fk_fin_tx_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The two ledgers, opposite polarity, one party table.
--   customer: debit = they owe you more (a sale)   credit = they paid you
--   vendor:   debit = you owe them more (purchase) credit = you paid them
-- source 'manual' = typed by a person (editable); 'booking' = written from a bill (read-only).
CREATE TABLE IF NOT EXISTS fin_customer_ledger (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
  entry_type VARCHAR(10) NOT NULL,
  amount DOUBLE NOT NULL,
  note TEXT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'manual',
  source_type VARCHAR(40) NULL,
  source_id VARCHAR(36) NULL,
  bank_account_id VARCHAR(36) NULL,
  entry_date VARCHAR(20) NULL,
  receipt_no VARCHAR(40) NULL,
  created_at VARCHAR(40),
  INDEX idx_fin_cl_party (customer_id, created_at),
  INDEX idx_fin_cl_company (company_id),
  INDEX idx_fin_cl_source (source_type, source_id),
  CONSTRAINT fk_fin_cl_party FOREIGN KEY (customer_id) REFERENCES fin_parties(id) ON DELETE CASCADE,
  CONSTRAINT fk_fin_cl_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_vendor_ledger (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  vendor_id VARCHAR(36) NOT NULL,
  entry_type VARCHAR(10) NOT NULL,
  amount DOUBLE NOT NULL,
  note TEXT NULL,
  source VARCHAR(10) NOT NULL DEFAULT 'manual',
  source_type VARCHAR(40) NULL,
  source_id VARCHAR(36) NULL,
  bank_account_id VARCHAR(36) NULL,
  entry_date VARCHAR(20) NULL,
  receipt_no VARCHAR(40) NULL,
  created_at VARCHAR(40),
  INDEX idx_fin_vl_party (vendor_id, created_at),
  INDEX idx_fin_vl_company (company_id),
  INDEX idx_fin_vl_source (source_type, source_id),
  CONSTRAINT fk_fin_vl_party FOREIGN KEY (vendor_id) REFERENCES fin_parties(id) ON DELETE CASCADE,
  CONSTRAINT fk_fin_vl_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per bank-statement line already imported, keyed by the bank's own reference code, so
-- importing the same (or an overlapping) statement again skips what is already in.
CREATE TABLE IF NOT EXISTS fin_statement_imports (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  reference_code VARCHAR(120) NOT NULL,
  created_at VARCHAR(40),
  UNIQUE KEY uq_fin_imports_ref (company_id, reference_code),
  CONSTRAINT fk_fin_imports_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
