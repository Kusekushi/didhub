-- MySQL audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BIGINT NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NULL,
  entity_id VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  metadata TEXT NULL,
  INDEX idx_audit_log_created_at (created_at),
  INDEX idx_audit_log_action (action),
  INDEX idx_audit_log_user (user_id)
) ENGINE=InnoDB;
