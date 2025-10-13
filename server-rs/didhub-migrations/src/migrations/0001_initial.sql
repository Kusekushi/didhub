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

-- Unified relationships between people (users) and alters.
-- Supports two relationship types only: 'parent' (directed: person_a -> person_b meaning parent -> child)
-- and 'spouse' (undirected; application should store a single row for a spouse pair).
-- Both sides may be either a user or an alter. Exactly one of the *_user_id / *_alter_id columns
-- must be non-null for each side. 'is_past_life' flags relationships that belong to a past life.
CREATE TABLE IF NOT EXISTS person_relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parent', 'spouse')),

  -- person A (for 'parent', person_a is the parent; for 'spouse' ordering is up to the application)
  person_a_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  person_a_alter_id TEXT REFERENCES alters(id) ON DELETE CASCADE,

  -- person B (for 'parent', person_b is the child)
  person_b_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  person_b_alter_id TEXT REFERENCES alters(id) ON DELETE CASCADE,

  -- Past-life flag: 0 = current life (default), 1 = past life
  is_past_life INTEGER NOT NULL DEFAULT 0,

  -- Canonical text representations used for ordering/indexing (prefix 'U:' for users, 'A:' for alters)
  canonical_a TEXT,
  canonical_b TEXT,

  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),

  -- Ensure exactly one identifier per side is provided
  CHECK (
    ((person_a_user_id IS NOT NULL AND person_a_alter_id IS NULL) OR (person_a_user_id IS NULL AND person_a_alter_id IS NOT NULL))
  ),
  CHECK (
    ((person_b_user_id IS NOT NULL AND person_b_alter_id IS NULL) OR (person_b_user_id IS NULL AND person_b_alter_id IS NOT NULL))
  ),

  -- Prevent reflexive relationships (same node on both sides)
  CHECK (
    NOT (
      (person_a_user_id IS NOT NULL AND person_b_user_id IS NOT NULL AND person_a_user_id = person_b_user_id)
      OR
      (person_a_alter_id IS NOT NULL AND person_b_alter_id IS NOT NULL AND person_a_alter_id = person_b_alter_id)
    )
  )
);

-- Trigger: maintain canonical_a/canonical_b and enforce canonical ordering for spouse pairs
CREATE TRIGGER IF NOT EXISTS trg_person_relationships_after_insert
AFTER INSERT ON person_relationships
FOR EACH ROW
WHEN NEW.type = 'spouse'
BEGIN
  -- Step 1: compute canonical_a / canonical_b from the NEW values and store them
  UPDATE person_relationships
  SET
    canonical_a = CASE WHEN NEW.person_a_user_id IS NOT NULL THEN 'U:' || NEW.person_a_user_id ELSE 'A:' || NEW.person_a_alter_id END,
    canonical_b = CASE WHEN NEW.person_b_user_id IS NOT NULL THEN 'U:' || NEW.person_b_user_id ELSE 'A:' || NEW.person_b_alter_id END
  WHERE id = NEW.id;

  -- Step 2: if canonical ordering is inverted, swap the stored person columns and canonical values
  UPDATE person_relationships
  SET
    person_a_user_id = person_b_user_id,
    person_a_alter_id = person_b_alter_id,
    person_b_user_id = person_a_user_id,
    person_b_alter_id = person_a_alter_id,
    canonical_a = CASE WHEN canonical_a > canonical_b THEN canonical_b ELSE canonical_a END,
    canonical_b = CASE WHEN canonical_a > canonical_b THEN canonical_a ELSE canonical_b END
  WHERE id = NEW.id AND canonical_a > canonical_b;
END;

-- Also canonicalize on updates
-- Also canonicalize on updates (AFTER UPDATE to avoid limitations assigning to NEW)
CREATE TRIGGER IF NOT EXISTS trg_person_relationships_after_update
AFTER UPDATE ON person_relationships
FOR EACH ROW
WHEN NEW.type = 'spouse'
BEGIN
  -- Step 1: compute canonical_a / canonical_b from the NEW values and store them
  UPDATE person_relationships
  SET
    canonical_a = CASE WHEN NEW.person_a_user_id IS NOT NULL THEN 'U:' || NEW.person_a_user_id ELSE 'A:' || NEW.person_a_alter_id END,
    canonical_b = CASE WHEN NEW.person_b_user_id IS NOT NULL THEN 'U:' || NEW.person_b_user_id ELSE 'A:' || NEW.person_b_alter_id END
  WHERE id = NEW.id;

  -- Step 2: if canonical ordering is inverted, swap the stored person columns and canonical values
  UPDATE person_relationships
  SET
    person_a_user_id = person_b_user_id,
    person_a_alter_id = person_b_alter_id,
    person_b_user_id = person_a_user_id,
    person_b_alter_id = person_a_alter_id,
    canonical_a = CASE WHEN canonical_a > canonical_b THEN canonical_b ELSE canonical_a END,
    canonical_b = CASE WHEN canonical_a > canonical_b THEN canonical_a ELSE canonical_b END
  WHERE id = NEW.id AND canonical_a > canonical_b;
END;

-- Note: SQLite's trigger semantics do not allow easy assignment to NEW.* via SET in all versions. The AFTER INSERT trigger above performs canonicalization
-- and swapping; updates should similarly ensure canonical_a/canonical_b are kept in sync at the application layer when necessary.

-- Unique index to prevent duplicate spouse pairs (same canonical_a, canonical_b, and past-life flag)
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_relationships_spouse_canonical
  ON person_relationships(type, canonical_a, canonical_b, is_past_life);

-- Note: seed data removed. Tests should insert any sample rows they need.

-- Indexes to speed up lookups from either side and by type
CREATE INDEX IF NOT EXISTS idx_person_relationships_type ON person_relationships(type);
CREATE INDEX IF NOT EXISTS idx_person_relationships_a_user ON person_relationships(person_a_user_id);
CREATE INDEX IF NOT EXISTS idx_person_relationships_b_user ON person_relationships(person_b_user_id);
CREATE INDEX IF NOT EXISTS idx_person_relationships_a_alter ON person_relationships(person_a_alter_id);
CREATE INDEX IF NOT EXISTS idx_person_relationships_b_alter ON person_relationships(person_b_alter_id);

-- Convenience view to list relationships for a given entity (either user or alter)
CREATE VIEW IF NOT EXISTS person_relationships_for_entity AS
SELECT
  id, type, is_past_life, created_by_user_id, created_at,
  person_a_user_id, person_a_alter_id, person_b_user_id, person_b_alter_id
FROM person_relationships;

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
-- Legacy user_alter_relationships indexes removed; use person_relationships where appropriate
CREATE INDEX IF NOT EXISTS idx_alters_owner_user_id ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);
CREATE INDEX IF NOT EXISTS idx_alters_created_at ON alters(created_at);
-- Legacy alter_partners and alter_parents indexes removed; see person_relationships
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_alter_id ON alter_affiliations(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_affiliation_id ON alter_affiliations(affiliation_id);
