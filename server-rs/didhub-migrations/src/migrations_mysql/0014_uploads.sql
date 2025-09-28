-- uploads table (mysql)
CREATE TABLE IF NOT EXISTS uploads (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stored_name VARCHAR(300) NOT NULL UNIQUE,
  original_name VARCHAR(300),
  user_id BIGINT,
  mime VARCHAR(150),
  bytes BIGINT,
  hash VARCHAR(128),
  created_at DATETIME NOT NULL
) ENGINE=InnoDB;
CREATE INDEX idx_uploads_hash ON uploads(hash);
