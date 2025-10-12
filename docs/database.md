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

## Migrations

### Migration Structure

Migrations live in the `didhub-migrations` crate and are bundled per driver:

```
server-rs/didhub-migrations/
└── src/
    ├── migrations/           # SQLite migrations (default)
    ├── migrations_postgres/  # PostgreSQL migrations
    └── migrations_mysql/     # MySQL migrations
```

### Migration Files

Each migration is a SQL file containing the forward (`.up.sql`) and rollback (`.down.sql`) statements inside the driver-specific folder. SQLx loads them at runtime via the `didhub-migrations` crate, so new migrations should be added there.

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
# Run the seed utility
cargo run --bin seed --release -c server-rs/config.example.json
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