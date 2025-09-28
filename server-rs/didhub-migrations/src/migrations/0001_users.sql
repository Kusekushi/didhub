-- Users table mirrors Sequelize definition (simplified)
CREATE TABLE IF NOT EXISTS users (
    -- Use dialect-neutral primary key; platform-specific autoincrement handled per-backend migrations if needed
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_approved INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
