-- Add indexes for better query performance on alters table
CREATE INDEX IF NOT EXISTS idx_alters_owner_user_id ON alters(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_alters_name ON alters(name);
CREATE INDEX IF NOT EXISTS idx_alters_created_at ON alters(created_at);

-- Indexes for relationship tables
CREATE INDEX IF NOT EXISTS idx_alter_partners_alter_id ON alter_partners(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_partners_partner_alter_id ON alter_partners(partner_alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_parents_alter_id ON alter_parents(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_parents_parent_alter_id ON alter_parents(parent_alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_alter_id ON alter_affiliations(alter_id);
CREATE INDEX IF NOT EXISTS idx_alter_affiliations_affiliation_id ON alter_affiliations(affiliation_id);

-- Index for user_alter_relationships
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_alter_id ON user_alter_relationships(alter_id);
CREATE INDEX IF NOT EXISTS idx_user_alter_relationships_user_id ON user_alter_relationships(user_id);