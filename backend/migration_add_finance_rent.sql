-- Finance books, second half: Rent, services on bills and the Cash account's details.
-- Ported from the FINANCE-NEPAL project (its migrations 0009-0025), rewritten for MySQL.
--
-- YOU NORMALLY DO NOT NEED TO RUN THIS. The backend applies these same statements itself when it starts
-- (finance_books.ensure_schema, the same way server.py adds its other post-schema columns), and until they
-- are in the database Finance keeps working without Rent and bill services. Run this file by hand only if
-- the server logs "Could not ensure the Rent tables" (a database user that may not create or alter tables):
--
--   mysql -u <user> -p <db>  < migration_add_finance_rent.sql
--
-- Safe to re-run: tables are CREATE TABLE IF NOT EXISTS and the two new fin_transactions columns are
-- only added when missing. Nothing existing is changed or dropped. To undo it: DROP fin_rentals and
-- fin_cash_account, and drop the two columns below.

-- Rent: a vehicle given out on rent. One row per rental. It is billed by the day (the day it went out
-- and the day it came back both count). The renter owes rate_per_day for every day it is out: the
-- backend keeps one "Daily rent" debit per day on the renter's customer ledger
-- (source = 'booking', source_type = 'rental_rent') and the renter pays it as Received entries.
-- Kept apart from Sale and Purchase bills on purpose: a vehicle on rent comes back.
CREATE TABLE IF NOT EXISTS fin_rentals (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  car VARCHAR(250) NOT NULL,
  model VARCHAR(150) NULL,
  customer_id VARCHAR(36) NULL,
  customer_name VARCHAR(200) NULL,
  start_date VARCHAR(20) NOT NULL,
  end_date VARCHAR(20) NULL,                 -- the day it is due back, if one was agreed
  returned_on VARCHAR(20) NULL,              -- the day it actually came back; rent stops here
  rate_per_day DOUBLE NOT NULL DEFAULT 0,
  note VARCHAR(500) NULL,
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  INDEX idx_fin_rentals_company (company_id, start_date),
  CONSTRAINT fk_fin_rentals_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fin_rentals_party FOREIGN KEY (customer_id) REFERENCES fin_parties(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cash in hand is never a row of fin_bank_accounts (it is bank_account_id = NULL), so its label and
-- details (bank, holder, address ...) live here, one row per company, and the Bank Accounts page shows
-- and edits them like any other account.
CREATE TABLE IF NOT EXISTS fin_cash_account (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(150) NULL,
  bank_name VARCHAR(150) NULL,
  account_number VARCHAR(60) NULL,
  account_holder_name VARCHAR(150) NULL,
  address VARCHAR(300) NULL,
  updated_at VARCHAR(40),
  UNIQUE KEY uq_fin_cash_company (company_id),
  CONSTRAINT fk_fin_cash_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Services on Sale and Purchase bills (installation, repair, labour ... on a sale; outsourced work on a
-- purchase). They are part of the bill: the bill's amount already includes them, so both ledgers and
-- every total that reads amount follow without any other change.
--   installation_charge  the total of the service lines
--   service_charges      the lines: [{"name": "Installation", "amount": 500}, ...]
-- MySQL has no ADD COLUMN IF NOT EXISTS, so each column is added only when information_schema says it
-- is missing (this also runs on MariaDB).
SET @has_installation := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fin_transactions' AND COLUMN_NAME = 'installation_charge');
SET @ddl := IF(@has_installation = 0,
  'ALTER TABLE fin_transactions ADD COLUMN installation_charge DOUBLE NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_services := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fin_transactions' AND COLUMN_NAME = 'service_charges');
SET @ddl := IF(@has_services = 0,
  'ALTER TABLE fin_transactions ADD COLUMN service_charges LONGTEXT NULL',
  'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
