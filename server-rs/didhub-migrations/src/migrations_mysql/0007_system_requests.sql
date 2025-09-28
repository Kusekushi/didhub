-- MySQL system requests
CREATE TABLE IF NOT EXISTS system_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_system_requests_user (user_id),
  INDEX idx_system_requests_status (status),
  CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
