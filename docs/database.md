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

### Alter ↔ Subsystem membership

In a recent update the canonical source of truth for an alter's subsystem membership was moved to a join table named `alter_subsystems`.

Key points:

- The denormalized `subsystem` column was removed from the `alters` table for new installs. The membership is now represented by the `alter_subsystems` table which links `alter_id` to `subsystem_id`.
- Invariants enforced by the backend code and API:
    - An alter can belong to at most one subsystem. The server enforces this by deleting existing rows for an alter before inserting a new membership (or by removing rows when clearing membership).
    - Alter owner equality: when assigning an alter to a subsystem the subsystem's `owner_user_id` must match the alter's `owner_user_id`, unless the caller has admin privileges. This prevents cross-owner assignments.

API endpoints (examples):

- GET /api/alters/{id}/subsystems — returns the single subsystem id for the given alter or null
- PUT /api/alters/{id}/subsystems — replace the alter's subsystem membership (payload: { "subsystem_id": "<id>" } or null to clear)
- DELETE /api/alters/{id}/subsystems — remove the alter's subsystem membership (equivalent to setting `subsystem_id` to null)

Migration guidance for existing installs:

- New installations (fresh DB) will not have the old `alters.subsystem` column; the `alter_subsystems` join table is created in the initial migrations and is canonical.
- Existing installations that still have a `subsystem` column should migrate data carefully. Recommended safe approach:
    1. Backup your database (required). For SQLite, copy the file; for Postgres/MySQL, use pg_dump/mysqldump.
    2. Create migration scripts (or a one-off maintenance script) that, for each row in `alters` with a non-null `subsystem` value, inserts a row into `alter_subsystems` if one doesn't already exist. Example (pseudo-SQL):

```sql
-- copy existing denormalized membership into the join table (Postgres/MySQL example)
INSERT INTO alter_subsystems (alter_id, subsystem_id)
SELECT id AS alter_id, subsystem AS subsystem_id
FROM alters
WHERE subsystem IS NOT NULL
ON CONFLICT DO NOTHING; -- or use INSERT IGNORE for MySQL
```

3. Verify application behavior with a staging environment and tests.
4. Once the join table is populated and verified, you may remove the `subsystem` column from `alters` using a safe, dialect-appropriate ALTER TABLE operation. Note that SQLite has limited ALTER support; for SQLite you may need to recreate the table or provide an offline migration path.

If you need help generating safe per-dialect migrations, see the project's migration guidance or open an issue/PR describing your target DB platform and version.

## Person relationships

We represent relationships in a single table named `person_relationships`.

Key points:

- Nodes may be either `users` or `alters`. Each side of the relationship has two columns: `person_a_user_id` / `person_a_alter_id` and `person_b_user_id` / `person_b_alter_id`. Exactly one of the pair must be non-null for each side.
- Two relationship kinds are supported: `parent` (directed: A -> B means A is parent of B) and `spouse` (undirected). The `type` column stores the kind.
- Past-life relationships are supported via an `is_past_life` flag (0 = current, 1 = past). Spouse relationships in different lives are allowed for the same canonical pair.
- To enable fast, collision-free lookups and deduplication, the DB stores `canonical_a` and `canonical_b` text columns. These are computed as `U:<user_id>` or `A:<alter_id>` and compared lexicographically to produce a canonical ordering for symmetric relationships (spouses).
- Database triggers keep `canonical_a`/`canonical_b` in sync and canonicalize spouse rows so a couple is stored only once. For SQLite we use AFTER triggers; for Postgres we use BEFORE triggers + plpgsql functions; for MySQL we use BEFORE triggers. Application logic may also enforce canonical ordering to avoid DB-dependent behavior.
- A unique index on `(type, canonical_a, canonical_b, is_past_life)` prevents duplicate spouse rows for the same life.
- Reflexive relationships (same node on both sides) are prevented by a CHECK constraint.

Common queries:

- Find all relationships for an entity (user or alter):

    SELECT * FROM person_relationships WHERE person_a_user_id = <id> OR person_b_user_id = <id>;

- Find parents of an alter:

    SELECT * FROM person_relationships WHERE type = 'parent' AND person_b_alter_id = <alter_id>;

- Current spouses (exclude past-life rows):

    SELECT * FROM person_relationships WHERE type = 'spouse' AND is_past_life = 0 AND (person_a_user_id = <id> OR person_b_user_id = <id> OR person_a_alter_id = <id> OR person_b_alter_id = <id>);

Notes:

- When adding new database backends, implement triggers or application-level canonicalization so spouse rows remain deduplicated.

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