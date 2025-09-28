-- MySQL groups table
CREATE TABLE IF NOT EXISTS groups (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sigil TEXT,
  leaders TEXT,
  metadata TEXT,
  owner_user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_groups_name (name),
  INDEX idx_groups_owner (owner_user_id)
) ENGINE=InnoDB;
