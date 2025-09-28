-- User-Alter relationships (users can be partners, parents, or children of alters) - PostgreSQL
CREATE TABLE IF NOT EXISTS user_alter_relationships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  alter_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('partner', 'parent', 'child')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, alter_id, relationship_type)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_user_id ON user_alter_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_alter_id ON user_alter_relationships(alter_id);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_type ON user_alter_relationships(relationship_type);