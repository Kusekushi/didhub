-- uploads table (postgres)
CREATE TABLE IF NOT EXISTS uploads (
  id BIGSERIAL PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  mime TEXT,
  bytes BIGINT,
  hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads(hash);
