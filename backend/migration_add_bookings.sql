-- Adds the bookings table (customer deposits taken before a sale).
-- The backend also creates it automatically on startup (server.py's _run_startup_tasks,
-- BOOKINGS_DDL), so running this by hand is only needed to have it in place before the next deploy.
--
--   mysql -u <user> -p <db>  < migration_add_bookings.sql
--
-- Idempotent: CREATE TABLE IF NOT EXISTS is a no-op if the table already exists.
CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  vehicle_id VARCHAR(36),
  customer_id VARCHAR(36),
  booking_amount DOUBLE,
  payment_method VARCHAR(50),
  booking_date VARCHAR(20),
  expected_sale_date VARCHAR(20),
  agreed_price DOUBLE,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  sale_id VARCHAR(36),
  cancelled_at VARCHAR(40),
  refund_amount DOUBLE,
  retained_amount DOUBLE,
  cancel_notes TEXT,
  created_by VARCHAR(100),
  created_at VARCHAR(40),
  updated_at VARCHAR(40),
  INDEX idx_bookings_company_id (company_id),
  INDEX idx_bookings_vehicle_id (vehicle_id),
  INDEX idx_bookings_status (status),
  CONSTRAINT fk_bookings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
