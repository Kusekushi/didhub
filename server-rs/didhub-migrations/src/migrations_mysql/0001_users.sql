-- MySQL users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    is_system TINYINT NOT NULL DEFAULT 0,
    is_admin TINYINT NOT NULL DEFAULT 0,
    is_approved TINYINT NOT NULL DEFAULT 0,
    must_change_password TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE INDEX idx_users_username ON users(username);
