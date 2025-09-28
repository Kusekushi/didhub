-- MySQL subsystems table
CREATE TABLE IF NOT EXISTS subsystems (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  leaders TEXT,
  metadata TEXT,
  owner_user_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subsystems_name (name),
  INDEX idx_subsystems_owner (owner_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alter_subsystems (
  alter_id BIGINT NOT NULL,
  subsystem_id BIGINT NOT NULL,
  PRIMARY KEY (alter_id, subsystem_id)
) ENGINE=InnoDB;

CREATE INDEX idx_alter_subsystems_subsystem ON alter_subsystems(subsystem_id);
CREATE INDEX idx_alter_subsystems_alter ON alter_subsystems(alter_id);
