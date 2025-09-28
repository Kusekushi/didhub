-- Add deleted_at column for soft deletes (sqlite)
ALTER TABLE uploads ADD COLUMN deleted_at TEXT;
-- No backfill needed; null means active.
