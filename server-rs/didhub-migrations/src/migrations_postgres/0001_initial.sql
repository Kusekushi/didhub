-- PostgreSQL consolidated migration with UUID support
-- All entity IDs are stored as TEXT (UUID strings)

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    about_me TEXT,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_approved INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE,
    roles TEXT NOT NULL DEFAULT '[]',
    settings TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    email_verified INTEGER NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE
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
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  sigil TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subsystems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  leaders TEXT NULL, -- JSON array of alter ids
  metadata TEXT NULL,
  owner_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id TEXT NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  subsystem_id TEXT NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, subsystem_id)
);


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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|denied
  note TEXT NULL,
  decided_at TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id TEXT NULL,
  ip TEXT NULL,
  metadata TEXT NULL
);

CREATE TABLE IF NOT EXISTS housekeeping_runs (
    id TEXT PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    finished_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'running', -- running|success|error
    message TEXT, -- optional error or summary message
    rows_affected INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    repost_of_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oidc_identities (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE,
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
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
CREATE INDEX IF NOT EXISTS idx_alters_owner_user_id ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);
CREATE INDEX IF NOT EXISTS idx_alters_created_at ON alters(created_at);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_alter_id ON alter_affiliations(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_affiliation_id ON alter_affiliations(affiliation_id);

-- person_relationships table (Postgres variant)
CREATE TABLE IF NOT EXISTS person_relationships (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('parent', 'spouse')),
  person_a_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  person_a_alter_id TEXT REFERENCES alters(id) ON DELETE CASCADE,
  person_b_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  person_b_alter_id TEXT REFERENCES alters(id) ON DELETE CASCADE,
  is_past_life INTEGER NOT NULL DEFAULT 0,
  canonical_a TEXT,
  canonical_b TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT person_one_identifier_a CHECK ((person_a_user_id IS NOT NULL)::int + (person_a_alter_id IS NOT NULL)::int = 1),
  CONSTRAINT person_one_identifier_b CHECK ((person_b_user_id IS NOT NULL)::int + (person_b_alter_id IS NOT NULL)::int = 1),
  CONSTRAINT no_reflexive CHECK (NOT (
      (person_a_user_id IS NOT NULL AND person_b_user_id IS NOT NULL AND person_a_user_id = person_b_user_id)
      OR
      (person_a_alter_id IS NOT NULL AND person_b_alter_id IS NOT NULL AND person_a_alter_id = person_b_alter_id)
    ))
);

-- Function to compute canonical strings
CREATE OR REPLACE FUNCTION person_relationships_compute_canonical() RETURNS trigger AS $$
BEGIN
  NEW.canonical_a := CASE WHEN NEW.person_a_user_id IS NOT NULL THEN 'U:' || NEW.person_a_user_id ELSE 'A:' || NEW.person_a_alter_id END;
  NEW.canonical_b := CASE WHEN NEW.person_b_user_id IS NOT NULL THEN 'U:' || NEW.person_b_user_id ELSE 'A:' || NEW.person_b_alter_id END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to reorder if canonical_a > canonical_b
CREATE OR REPLACE FUNCTION person_relationships_ensure_order() RETURNS trigger AS $$
DECLARE tmp TEXT;
BEGIN
  IF NEW.canonical_a > NEW.canonical_b THEN
    -- swap person ids
    tmp := NEW.person_a_user_id; NEW.person_a_user_id := NEW.person_b_user_id; NEW.person_b_user_id := tmp; tmp := NULL;
    tmp := NEW.person_a_alter_id; NEW.person_a_alter_id := NEW.person_b_alter_id; NEW.person_b_alter_id := tmp; tmp := NULL;
    -- swap canonical
    tmp := NEW.canonical_a; NEW.canonical_a := NEW.canonical_b; NEW.canonical_b := tmp; tmp := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for INSERT and UPDATE
CREATE TRIGGER trg_person_relationships_before_insert
BEFORE INSERT ON person_relationships
FOR EACH ROW
WHEN (NEW.type = 'spouse')
EXECUTE FUNCTION person_relationships_compute_canonical();

CREATE TRIGGER trg_person_relationships_before_insert_order
BEFORE INSERT ON person_relationships
FOR EACH ROW
WHEN (NEW.type = 'spouse')
EXECUTE FUNCTION person_relationships_ensure_order();

CREATE TRIGGER trg_person_relationships_before_update
BEFORE UPDATE ON person_relationships
FOR EACH ROW
WHEN (NEW.type = 'spouse')
EXECUTE FUNCTION person_relationships_compute_canonical();

CREATE TRIGGER trg_person_relationships_before_update_order
BEFORE UPDATE ON person_relationships
FOR EACH ROW
WHEN (NEW.type = 'spouse')
EXECUTE FUNCTION person_relationships_ensure_order();

-- Unique index for spouse pairs
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_relationships_spouse_canonical
  ON person_relationships(type, canonical_a, canonical_b, is_past_life);