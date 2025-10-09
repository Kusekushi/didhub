-- MySQL consolidated migration with UUID support
-- All entity IDs are stored as CHAR(36) (UUID strings)

CREATE TABLE IF NOT EXISTS users (
    -- Use UUID primary key stored as CHAR(36)
    id CHAR(36) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    password_hash TEXT NOT NULL,
    avatar TEXT,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    is_approved TINYINT(1) NOT NULL DEFAULT 0,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL,
    roles TEXT NOT NULL DEFAULT '[]',
    settings TEXT NOT NULL DEFAULT '{}',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    email_verified TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS alters (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  age VARCHAR(255),
  gender VARCHAR(255),
  pronouns VARCHAR(255),
  birthday VARCHAR(255),
  sexuality VARCHAR(255),
  species VARCHAR(255),
  alter_type VARCHAR(255),
  job VARCHAR(255),
  weapon VARCHAR(255),
  triggers TEXT,
  metadata TEXT,
  soul_songs TEXT,
  interests TEXT,
  notes TEXT,
  images TEXT,
  subsystem VARCHAR(255),
  system_roles TEXT,
  is_system_host TINYINT(1) DEFAULT 0,
  is_dormant TINYINT(1) DEFAULT 0,
  is_merged TINYINT(1) DEFAULT 0,
  owner_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  sigil TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id CHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subsystems (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id CHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  subsystem_id CHAR(36) NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, subsystem_id)
);

-- Partner relationships (undirected stored once with (low, high) ordering)
CREATE TABLE IF NOT EXISTS alter_partners (
  alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  partner_alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, partner_alter_id)
);

-- Parent relationships (directed parent -> child)
CREATE TABLE IF NOT EXISTS alter_parents (
  alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,           -- child id
  parent_alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,    -- parent id
  PRIMARY KEY (alter_id, parent_alter_id)
);

-- Affiliations (group membership)
CREATE TABLE IF NOT EXISTS alter_affiliations (
  affiliation_id CHAR(36) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  alter_id CHAR(36) NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  PRIMARY KEY (affiliation_id, alter_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  selector VARCHAR(255) NOT NULL UNIQUE,
  verifier_hash TEXT NOT NULL,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at VARCHAR(255) NOT NULL,
  used_at VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_requests (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(255) NOT NULL DEFAULT 'pending', -- pending|approved|denied
  note TEXT NULL,
  decided_at VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  -- Use UUID primary key stored as CHAR(36)
  id CHAR(36) PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id CHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(255) NULL,
  entity_id VARCHAR(255) NULL,
  ip VARCHAR(255) NULL,
  metadata TEXT NULL
);

CREATE TABLE IF NOT EXISTS housekeeping_runs (
    -- Use UUID primary key stored as CHAR(36)
    id CHAR(36) PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP,
    status VARCHAR(255) NOT NULL DEFAULT 'running', -- running|success|error
    message TEXT, -- optional error or summary message
    rows_affected INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
    -- Use UUID primary key stored as CHAR(36)
    id CHAR(36) PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    repost_of_post_id CHAR(36) REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oidc_identities (
    -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
    id INT PRIMARY KEY AUTO_INCREMENT,
    provider VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP,
    UNIQUE(provider, subject)
);

CREATE TABLE IF NOT EXISTS uploads (
  id CHAR(36) PRIMARY KEY,
  stored_name VARCHAR(255) NOT NULL UNIQUE,
  original_name VARCHAR(255),
  user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  mime VARCHAR(255),
  bytes BIGINT,
  hash VARCHAR(255),
  created_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_alter_relationships (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  alter_id CHAR(36) NOT NULL,
  relationship_type VARCHAR(255) NOT NULL CHECK (relationship_type IN ('partner', 'parent', 'child')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, alter_id, relationship_type)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_alters_owner ON alters(owner_user_id);
CREATE INDEX idx_alters_name ON alters(name);
CREATE INDEX idx_groups_name ON groups(name);
CREATE INDEX idx_groups_owner ON groups(owner_user_id);
CREATE INDEX idx_alter_subsystems_subsystem ON alter_subsystems(subsystem_id);
CREATE INDEX idx_alter_subsystems_alter ON alter_subsystems(alter_id);
CREATE INDEX idx_subsystems_name ON subsystems(name);
CREATE INDEX idx_subsystems_owner ON subsystems(owner_user_id);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_used ON password_reset_tokens(used_at);
CREATE INDEX idx_system_requests_user ON system_requests(user_id);
CREATE INDEX idx_system_requests_status ON system_requests(status);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_housekeeping_runs_job_started ON housekeeping_runs(job_name, started_at DESC);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_author ON posts(created_by_user_id, created_at DESC);
CREATE INDEX idx_posts_repost_of ON posts(repost_of_post_id);
CREATE INDEX idx_oidc_user ON oidc_identities(user_id);
CREATE INDEX idx_uploads_hash ON uploads(hash);
CREATE INDEX idx_uploads_user_created ON uploads(user_id, created_at);
CREATE INDEX idx_user_alter_relationships_user_id ON user_alter_relationships(user_id);
CREATE INDEX idx_user_alter_relationships_alter_id ON user_alter_relationships(alter_id);
CREATE INDEX idx_user_alter_relationships_type ON user_alter_relationships(relationship_type);
CREATE INDEX idx_alters_owner_user_id ON alters(owner_user_id);
CREATE INDEX idx_alters_name ON alters(name);
CREATE INDEX idx_alters_created_at ON alters(created_at);
CREATE INDEX idx_alter_partners_alter_id ON alter_partners(alter_id);
CREATE INDEX idx_alter_partners_partner_alter_id ON alter_partners(partner_alter_id);
CREATE INDEX idx_alter_parents_alter_id ON alter_parents(alter_id);
CREATE INDEX idx_alter_parents_parent_alter_id ON alter_parents(parent_alter_id);
CREATE INDEX idx_alter_affiliations_alter_id ON alter_affiliations(alter_id);
CREATE INDEX idx_alter_affiliations_affiliation_id ON alter_affiliations(affiliation_id);