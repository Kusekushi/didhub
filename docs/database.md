# Database Guide

This guide covers DIDHub's database design, migrations, and data management.

## Supported Databases

DIDHub supports three database backends through SQLx:

### SQLite (Default)
- **File-based**: No server required
- **Zero configuration**: Works out of the box
- **Development**: Perfect for local development
- **Limitations**: Single-writer, file locking

### PostgreSQL
- **Production-ready**: Advanced features and performance
- **Concurrent**: Multi-user support
- **Extensions**: Full-text search, JSON, etc.
- **Replication**: High availability options

### MySQL
- **Widely supported**: Popular in enterprise environments
- **Performance**: Good for read-heavy workloads
- **Compatibility**: Broad ecosystem support

## Database Schema

### Core Tables

#### users
User accounts and authentication data.

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### systems
DID systems belonging to users.

```sql
CREATE TABLE systems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### alters
Individual alters within systems.

```sql
CREATE TABLE alters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
);
```

#### groups
Organize alters into groups.

```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7), -- Hex color code
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
);
```

#### subsystems
Sub-groups within systems.

```sql
CREATE TABLE subsystems (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (system_id) REFERENCES systems(id) ON DELETE CASCADE
);
```

#### uploads
File upload metadata.

```sql
CREATE TABLE uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    alt_text TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### audit_logs
Security and audit events.

```sql
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    details JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

#### settings
Application configuration.

```sql
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### system_requests
Account approval workflow.

```sql
CREATE TABLE system_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Relationship Tables

#### alter_groups
Many-to-many relationship between alters and groups.

```sql
CREATE TABLE alter_groups (
    alter_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (alter_id, group_id),
    FOREIGN KEY (alter_id) REFERENCES alters(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
```

#### subsystem_members
Many-to-many relationship between alters and subsystems with roles.

```sql
CREATE TABLE subsystem_members (
    subsystem_id INTEGER NOT NULL,
    alter_id INTEGER NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (subsystem_id, alter_id),
    FOREIGN KEY (subsystem_id) REFERENCES subsystems(id) ON DELETE CASCADE,
    FOREIGN KEY (alter_id) REFERENCES alters(id) ON DELETE CASCADE
);
```

## Migrations

### Migration Structure

Migrations are stored in driver-specific folders:

```
server-rs/migrations/
├── migrations.sqlite/     # SQLite migrations
├── migrations_postgres/   # PostgreSQL migrations
├── migrations_mysql/      # MySQL migrations
```

### Migration Files

Each migration is a SQL file with up/down scripts:

```sql
-- migrations.sqlite/001_initial_schema.up.sql
CREATE TABLE users (...);

-- migrations.sqlite/001_initial_schema.down.sql
DROP TABLE users;
```

### Running Migrations

Migrations run automatically on server startup. For manual control:

```bash
# Using the binary
./didhub-server

# The server applies any pending migrations on startup
```

## Data Management

### Seeding

For development and testing, you can seed initial data:

```bash
# Run the seed utility (if available)
cargo run --bin seed -- -c config.example.json
```

### Backup and Restore

#### SQLite
```bash
# Backup
sqlite3 data/didhub.sqlite ".backup 'backup.db'"

# Restore
sqlite3 data/didhub.sqlite ".restore 'backup.db'"
```

#### PostgreSQL
```bash
# Backup
pg_dump didhub > backup.sql

# Restore
psql didhub < backup.sql
```

#### MySQL
```bash
# Backup
mysqldump didhub > backup.sql

# Restore
mysql didhub < backup.sql
```

## Performance Considerations

### Indexing Strategy

Key indexes for performance:

```sql
-- Users
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_is_admin ON users(is_admin);

-- Systems
CREATE INDEX idx_systems_user_id ON systems(user_id);

-- Alters
CREATE INDEX idx_alters_system_id ON alters(system_id);
CREATE INDEX idx_alters_name ON alters(name);

-- Audit logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### Query Optimization

- Use prepared statements (SQLx handles this)
- Implement pagination for large result sets
- Use database-specific features (e.g., PostgreSQL JSON queries)
- Cache frequently accessed data

### Connection Pooling

SQLx provides connection pooling automatically. Configure pool size via environment:

```bash
export DATABASE_URL="postgres://user:pass@host:port/db?sslmode=require&max_connections=20"
```

## Development Tips

### Local Database Setup

For development with PostgreSQL:

```bash
# Create database
createdb didhub_dev

# Set environment
export DIDHUB_DB=postgres://postgres:password@localhost:5432/didhub_dev
```

### Database Debugging

Enable SQL logging:

```bash
export RUST_LOG=sqlx=debug,didhub=debug
```

### Schema Changes

When modifying the schema:

1. Create a new migration file
2. Test with all supported databases
3. Update any affected queries
4. Run tests to ensure compatibility

## Troubleshooting

### Common Issues

**Migration fails:**
- Check database permissions
- Verify SQL syntax for target database
- Ensure previous migrations completed

**Connection timeout:**
- Check database server status
- Verify connection string
- Increase timeout settings

**Performance issues:**
- Add missing indexes
- Check query plans
- Consider database tuning

### Database-Specific Notes

**SQLite:**
- Single-writer limitation
- Good for development and small deployments
- No concurrent schema changes

**PostgreSQL:**
- Best for production use
- Advanced features available
- Good concurrent performance

**MySQL:**
- Widely supported
- Good performance for reads
- Consider InnoDB storage engine