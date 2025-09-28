-- Alters core table
CREATE TABLE IF NOT EXISTS alters (
  -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  age TEXT,
  gender TEXT,
  pronouns TEXT,
  birthday TEXT,
  sexuality TEXT,
  species TEXT,
  alter_type TEXT,
  job TEXT,
  weapon TEXT,
  triggers TEXT,
  metadata TEXT,
  soul_songs TEXT,
  interests TEXT,
  notes TEXT,
  images TEXT,
  subsystem TEXT,
  system_roles TEXT,
  is_system_host INTEGER DEFAULT 0,
  is_dormant INTEGER DEFAULT 0,
  is_merged INTEGER DEFAULT 0,
  owner_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Partner relationships (undirected stored once with (low, high) ordering)
CREATE TABLE IF NOT EXISTS alter_partners (
  alter_id INTEGER NOT NULL,
  partner_alter_id INTEGER NOT NULL,
  PRIMARY KEY (alter_id, partner_alter_id)
);

-- Parent relationships (directed parent -> child)
CREATE TABLE IF NOT EXISTS alter_parents (
  alter_id INTEGER NOT NULL,           -- child id
  parent_alter_id INTEGER NOT NULL,    -- parent id
  PRIMARY KEY (alter_id, parent_alter_id)
);

-- Affiliations (group membership)
CREATE TABLE IF NOT EXISTS alter_affiliations (
  affiliation_id INTEGER NOT NULL,
  alter_id INTEGER NOT NULL,
  PRIMARY KEY (affiliation_id, alter_id)
);

CREATE INDEX IF NOT EXISTS idx_alters_owner ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);