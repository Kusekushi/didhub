-- composite index for uploads (postgres)
CREATE INDEX IF NOT EXISTS idx_uploads_user_created ON uploads(user_id, created_at);
