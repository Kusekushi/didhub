-- Add deleted_at column for soft deletes (postgres)
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
