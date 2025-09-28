-- composite index for uploads (mysql)
CREATE INDEX idx_uploads_user_created ON uploads(user_id, created_at);
