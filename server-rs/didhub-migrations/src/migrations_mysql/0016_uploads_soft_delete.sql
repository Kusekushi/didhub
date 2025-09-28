-- Add deleted_at column for soft deletes (mysql)
ALTER TABLE uploads ADD COLUMN deleted_at DATETIME NULL;
