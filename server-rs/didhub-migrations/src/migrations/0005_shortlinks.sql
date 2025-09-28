-- Shortlinks table
CREATE TABLE IF NOT EXISTS shortlinks (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  target TEXT NOT NULL,
  created_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shortlinks_creator ON shortlinks(created_by_user_id);