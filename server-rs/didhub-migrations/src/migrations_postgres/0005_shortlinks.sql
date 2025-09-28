-- Postgres shortlinks
CREATE TABLE IF NOT EXISTS shortlinks (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  target TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shortlinks_creator ON shortlinks(created_by_user_id);
