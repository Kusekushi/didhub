-- MySQL alters core table
CREATE TABLE IF NOT EXISTS alters (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
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
  is_system_host TINYINT DEFAULT 0,
  is_dormant TINYINT DEFAULT 0,
  is_merged TINYINT DEFAULT 0,
  owner_user_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alter_partners (
  alter_id BIGINT NOT NULL,
  partner_alter_id BIGINT NOT NULL,
  PRIMARY KEY (alter_id, partner_alter_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alter_parents (
  alter_id BIGINT NOT NULL,
  parent_alter_id BIGINT NOT NULL,
  PRIMARY KEY (alter_id, parent_alter_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alter_affiliations (
  affiliation_id BIGINT NOT NULL,
  alter_id BIGINT NOT NULL,
  PRIMARY KEY (affiliation_id, alter_id)
) ENGINE=InnoDB;

CREATE INDEX idx_alters_owner ON alters(owner_user_id);
CREATE INDEX idx_alters_name ON alters(name);
