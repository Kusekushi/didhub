-- Postgres system requests
CREATE TABLE IF NOT EXISTS system_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  decided_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_requests_user ON system_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_system_requests_status ON system_requests(status);
