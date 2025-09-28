-- composite index for uploads (sqlite)
CREATE INDEX IF NOT EXISTS idx_uploads_user_created ON uploads(user_id, created_at);
