-- uploads table (sqlite)
CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT,
  user_id INTEGER,
  mime TEXT,
  bytes INTEGER,
  hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads(hash);
