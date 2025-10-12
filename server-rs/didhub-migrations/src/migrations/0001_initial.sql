-- TODO: We should store boolean types as BIT/bool once there is support for BIT to bool in sqlx

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  avatar TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_approved INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT,
  roles TEXT NOT NULL DEFAULT '[]',
  settings TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  email_verified INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS alters (
  id TEXT PRIMARY KEY,
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
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  sigil TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subsystems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  subsystem_id TEXT NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, subsystem_id)
);

-- Partner relationships (undirected stored once with (low, high) ordering)
CREATE TABLE IF NOT EXISTS alter_partners (
  alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  partner_alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, partner_alter_id)
);

-- Parent relationships (directed parent -> child)
CREATE TABLE IF NOT EXISTS alter_parents (
  alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,           -- child id
  parent_alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,    -- parent id
  PRIMARY KEY (alter_id, parent_alter_id)
);

-- Affiliations (group membership)
CREATE TABLE IF NOT EXISTS alter_affiliations (
  affiliation_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  PRIMARY KEY (affiliation_id, alter_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  selector TEXT NOT NULL UNIQUE,
  verifier_hash TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied
  note TEXT NULL,
  decided_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id TEXT NULL,
  ip TEXT NULL,
  metadata TEXT NULL
);

CREATE TABLE IF NOT EXISTS housekeeping_runs (
    -- Use UUID primary key stored as TEXT
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running', -- running|success|error
    message TEXT, -- optional error or summary message
    rows_affected INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
    -- Use UUID primary key stored as TEXT
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    repost_of_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS oidc_identities (
    -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT,
    UNIQUE(provider, subject)
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  stored_name TEXT NOT NULL UNIQUE,
  original_name TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  mime TEXT,
  bytes INTEGER,
  hash TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS user_alter_relationships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  alter_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('partner', 'parent', 'child')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, alter_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_alters_owner ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alter_subsystems_subsystem ON alter_subsystems(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_alter_subsystems_alter ON alter_subsystems(alter_id);
CREATE INDEX IF NOT EXISTS idx_subsystems_name ON subsystems(name);
CREATE INDEX IF NOT EXISTS idx_subsystems_owner ON subsystems(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_used ON password_reset_tokens(used_at);
CREATE INDEX IF NOT EXISTS idx_system_requests_user ON system_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_system_requests_status ON system_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_job_started ON housekeeping_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of_post_id);
CREATE INDEX IF NOT EXISTS idx_oidc_user ON oidc_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_hash ON uploads(hash);
CREATE INDEX IF NOT EXISTS idx_uploads_user_created ON uploads(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_user_id ON user_alter_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_alter_id ON user_alter_relationships(alter_id);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_type ON user_alter_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_alters_owner_user_id ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);
CREATE INDEX IF NOT EXISTS idx_alters_created_at ON alters(created_at);
CREATE INDEX IF NOT EXISTS idx_alter_partners_alter_id ON alter_partners(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_partners_partner_alter_id ON alter_partners(partner_alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_parents_alter_id ON alter_parents(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_parents_parent_alter_id ON alter_parents(parent_alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_alter_id ON alter_affiliations(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_affiliation_id ON alter_affiliations(affiliation_id);
