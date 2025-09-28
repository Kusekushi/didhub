-- MySQL shortlinks
CREATE TABLE IF NOT EXISTS shortlinks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(255) NOT NULL UNIQUE,
  target TEXT NOT NULL,
  created_by_user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shortlinks_creator (created_by_user_id)
) ENGINE=InnoDB;
