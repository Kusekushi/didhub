-- System requests: a user requests a 'system' (special status / approval)
CREATE TABLE IF NOT EXISTS system_requests (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied
  note TEXT NULL,
  decided_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_requests_user ON system_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_system_requests_status ON system_requests(status);