-- Postgres subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  leaders TEXT,
  metadata TEXT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subsystems_name ON subsystems(name);
CREATE INDEX IF NOT EXISTS idx_subsystems_owner ON subsystems(owner_user_id);

CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id INTEGER NOT NULL REFERENCES alters(id) ON DELETE CASCADE,
  subsystem_id INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
  PRIMARY KEY (alter_id, subsystem_id)
);

CREATE INDEX IF NOT EXISTS idx_alter_subsystems_subsystem ON alter_subsystems(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_alter_subsystems_alter ON alter_subsystems(alter_id);
