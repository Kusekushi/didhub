-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  sigil TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Basic index for search by name
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_user_id);
