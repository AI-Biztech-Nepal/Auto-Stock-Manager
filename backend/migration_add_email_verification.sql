-- Adds email verification + password-reset support to an existing production MySQL
-- database (schema.sql already has both for fresh installs). Safe to run any time --
-- purely additive, no data touched. server.py's startup() backfills every existing
-- user's email_verified_at automatically on next boot, so this migration only needs to
-- create the column/table; it does not need to set any values itself.

ALTER TABLE users ADD COLUMN email_verified_at VARCHAR(40);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  purpose VARCHAR(20) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  INDEX idx_auth_tokens_hash (token_hash),
  INDEX idx_auth_tokens_user (user_id),
  expires_at VARCHAR(40) NOT NULL,
  used_at VARCHAR(40),
  created_at VARCHAR(40),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
