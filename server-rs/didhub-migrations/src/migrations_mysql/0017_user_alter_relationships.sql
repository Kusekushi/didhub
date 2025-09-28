-- User-Alter relationships (users can be partners, parents, or children of alters) - MySQL
CREATE TABLE IF NOT EXISTS user_alter_relationships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  alter_id INT NOT NULL,
  relationship_type ENUM('partner', 'parent', 'child') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_alter_relationship (user_id, alter_id, relationship_type)
);

-- Indexes for efficient queries
CREATE INDEX idx_user_alter_relationships_user_id ON user_alter_relationships(user_id);
CREATE INDEX idx_user_alter_relationships_alter_id ON user_alter_relationships(alter_id);
CREATE INDEX idx_user_alter_relationships_type ON user_alter_relationships(relationship_type);