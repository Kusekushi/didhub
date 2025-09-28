-- Subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subsystems_name ON subsystems(name);
CREATE INDEX IF NOT EXISTS idx_subsystems_owner ON subsystems(owner_user_id);

-- Junction table for subsystem membership
CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id INTEGER NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  subsystem_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, subsystem_id)
);

CREATE INDEX IF NOT EXISTS idx_alter_subsystems_subsystem ON alter_subsystems(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_alter_subsystems_alter ON alter_subsystems(alter_id);