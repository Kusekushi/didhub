-- Password reset tokens table using selector + verifier hash
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  selector TEXT NOT NULL UNIQUE,
  verifier_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_used ON password_reset_tokens(used_at);
