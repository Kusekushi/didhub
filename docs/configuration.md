# Configuration Guide

This guide covers all configuration options available in DIDHub, including environment variables, settings, and configuration files.

## Configuration Methods

DIDHub supports multiple ways to configure the application:

1. **Environment Variables** (recommended for production)
2. **Configuration Files** (JSON format)
3. **Database Settings** (runtime configuration)

## Environment Variables

### Core Configuration

#### `DIDHUB_DB`
Database connection URL.

**Default**: `sqlite:///data/didhub.sqlite`

**Examples**:
```bash
# SQLite
export DIDHUB_DB=sqlite:///absolute/path/to/didhub.sqlite

# PostgreSQL
export DIDHUB_DB=postgres://user:pass@localhost:5432/didhub

# MySQL
export DIDHUB_DB=mysql://user:pass@localhost:3306/didhub
```

#### `DIDHUB_SECRET`
Secret key for JWT token signing. **Required for production**.

**Default**: None (development only)

**Example**:
```bash
export DIDHUB_SECRET=your-super-secure-random-key-here-at-least-32-chars
```

#### `DIDHUB_DB_CONFIG` / `DIDHUB_CONFIG_FILE`
Path to JSON configuration file.

**Default**: None

**Example**:
```bash
export DIDHUB_DB_CONFIG=./config.json
```

### Server Configuration

#### `PORT`
Port for the server to listen on.

**Default**: `6000`

#### `HOST`
Host address to bind to.

**Default**: `0.0.0.0`

#### `LOG_LEVEL`
Logging level (error, warn, info, debug, trace).

**Default**: `debug` (dev), `info` (prod)

#### `LOG_JSON`
Enable structured JSON logging.

**Default**: `false` (dev), `true` (prod)

### CORS Configuration

#### `FRONTEND_BASE_URL`
Comma-separated list of allowed frontend origins.

**Default**: `http://localhost:5173,http://localhost:5174`

**Example**:
```bash
export FRONTEND_BASE_URL=https://myapp.com,https://app.myapp.com
```

#### `ALLOW_ALL_FRONTEND_ORIGINS`
Allow requests from any origin (development only).

**Default**: `false`

**Example**:
```bash
export ALLOW_ALL_FRONTEND_ORIGINS=true
```

### Caching and Performance

#### `REDIS_URL`
Redis URL for caching and sessions.

**Default**: None (in-memory cache)

**Examples**:
```bash
export REDIS_URL=redis://localhost:6379/0
export REDIS_URL=redis://user:pass@host:port/db
```

### File Upload Configuration

#### `DIDHUB_DIST_DIR`
Directory containing built frontend assets.

**Default**: `./static`

#### Upload Settings (Database)

These settings are stored in the database and can be changed at runtime:

- `app.upload_dir`: Upload directory path
- `uploads.count_cache.ttl_secs`: Cache TTL for upload counts (default: 30)
- `uploads.max_file_size`: Maximum file size in bytes
- `uploads.allowed_types`: Comma-separated allowed MIME types

### Auto-Update Configuration

#### `AUTO_UPDATE_ENABLED`
Enable auto-update functionality.

**Default**: `false`

#### `AUTO_UPDATE_CHECK`
Enable periodic update checks.

**Default**: `false`

#### `UPDATE_ENABLED`
Enable or disable the update functionality entirely.

**Default**: `true`

**Examples**:
```bash
export UPDATE_ENABLED=false  # Disable updates completely
export UPDATE_ENABLED=true   # Enable updates (default)
```

#### `UPDATE_REPO`
GitHub repository for updates.

**Default**: `Kusekushi/didhub`

#### `UPDATE_CHECK_INTERVAL_HOURS`
Hours between update checks.

**Default**: `24`

### Bootstrap Configuration

#### `DIDHUB_BOOTSTRAP_ADMIN_USERNAME`
Username for bootstrap admin user creation.

**Default**: None

**Important**: When both `DIDHUB_BOOTSTRAP_ADMIN_USERNAME` and `DIDHUB_BOOTSTRAP_ADMIN_PASSWORD` are set, the server will create an admin user account on startup if one doesn't already exist with that username. This only happens once - subsequent server restarts will not recreate the user.

#### `DIDHUB_BOOTSTRAP_ADMIN_PASSWORD`
Password for bootstrap admin user creation.

**Default**: None

**Important**: Must be set together with `DIDHUB_BOOTSTRAP_ADMIN_USERNAME`. The server creates an admin user account on first startup when both variables are provided.

**Example**:
```bash
export DIDHUB_BOOTSTRAP_ADMIN_USERNAME=admin
export DIDHUB_BOOTSTRAP_ADMIN_PASSWORD=mysecurepassword
# Run server once to create admin user, then remove these env vars for security
```

## Configuration Files

### JSON Configuration Format

Instead of environment variables, you can use a JSON configuration file:

```json
{
  "database": {
    "driver": "postgres",
    "host": "localhost",
    "port": 5432,
    "database": "didhub",
    "username": "didhub",
    "password": "secret",
    "ssl_mode": "disable"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 6000
  },
  "logging": {
    "level": "info",
    "json": true
  },
  "cors": {
    "allowed_origins": ["https://myapp.com"],
    "allow_all_origins": false
  },
  "redis": {
    "url": "redis://localhost:6379/0"
  },
  "uploads": {
    "directory": "./uploads",
    "max_file_size": 10485760,
    "allowed_types": ["image/jpeg", "image/png", "image/gif"]
  },
  "auto_update": {
    "enabled": false,
    "check_enabled": false,
    "repo": "Kusekushi/didhub",
    "check_interval_hours": 24
  }
}
```

### Configuration Precedence

1. **Environment variables** override configuration file
2. **Configuration file** overrides defaults
3. **Database settings** override environment/file for runtime config

## Runtime Settings

Some settings can be changed while the server is running via the admin API:

### Upload Settings

```bash
# Set upload directory
curl -X PUT http://localhost:6000/api/admin/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "app.upload_dir", "value": "/var/uploads"}'

# Set cache TTL
curl -X PUT http://localhost:6000/api/admin/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "uploads.count_cache.ttl_secs", "value": "60"}'
```

### Available Runtime Settings

| Key | Description | Default | Type |
|-----|-------------|---------|------|
| `app.upload_dir` | Upload directory path | `./uploads` | string |
| `uploads.count_cache.ttl_secs` | Upload count cache TTL | `30` | number |
| `uploads.max_file_size` | Max file size in bytes | `10485760` | number |
| `uploads.allowed_types` | Allowed MIME types (comma-separated) | `image/*` | string |
| `security.rate_limit.requests_per_minute` | Rate limit | `60` | number |
| `housekeeping.audit_retention_days` | Audit log retention | `365` | number |

## Development Configuration

### Local Development (.env)

Create a `.env` file in the `server-rs/` directory:

```bash
# Development settings
DIDHUB_SECRET=dev-secret-key-change-in-production
PORT=6000
HOST=127.0.0.1
LOG_LEVEL=debug
LOG_JSON=false
FRONTEND_BASE_URL=http://localhost:5173
ALLOW_ALL_FRONTEND_ORIGINS=false

# Database (SQLite for development)
DIDHUB_DB=sqlite://../data/didhub.sqlite

# Optional: Redis for development
# REDIS_URL=redis://localhost:6379/0
```

### Docker Development

```yaml
version: '3.8'
services:
  didhub:
    image: didhub/dev:latest
    ports:
      - "6000:6000"
    environment:
      - DIDHUB_SECRET=dev-secret
      - DIDHUB_DB=postgres://didhub:password@postgres:5432/didhub
      - FRONTEND_BASE_URL=http://localhost:5173
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=didhub
      - POSTGRES_USER=didhub
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
```

## Production Configuration

### Security Considerations

1. **Strong secrets**: Use cryptographically secure random keys
2. **Network security**: Bind to specific interfaces, not 0.0.0.0
3. **TLS**: Use reverse proxy (nginx/caddy) for SSL termination
4. **Database security**: Use strong passwords, SSL connections
5. **File permissions**: Restrict upload directory access

### Example Production Setup

```bash
# Server
export DIDHUB_SECRET=very-long-random-secret-key-32-chars-minimum
export PORT=8080
export HOST=127.0.0.1
export LOG_LEVEL=info
export LOG_JSON=true

# Database
export DIDHUB_DB=postgres://didhub:strong-password@db.internal:5432/didhub

# CORS
export FRONTEND_BASE_URL=https://myapp.com

# Redis
export REDIS_URL=redis://redis.internal:6379/0

# Auto-updates (optional)
export AUTO_UPDATE_ENABLED=true
export AUTO_UPDATE_CHECK=true
```

### Health Checks

Configure health check endpoints for load balancers:

```bash
# Health check
curl http://localhost:8080/health

# Readiness check (database connectivity)
curl http://localhost:8080/api/version
```

## Troubleshooting Configuration

### Common Issues

**Server won't start:**
- Check `DIDHUB_SECRET` is set (required for non-dev)
- Verify database connection string
- Check port availability

**CORS errors:**
- Verify `FRONTEND_BASE_URL` matches your frontend
- Check for trailing slashes in URLs

**Database connection fails:**
- Test connection manually with database client
- Check firewall rules
- Verify SSL settings

**File uploads fail:**
- Check upload directory permissions
- Verify `app.upload_dir` setting
- Check file size limits

### Debugging Configuration

Enable debug logging to see configuration loading:

```bash
export RUST_LOG=didhub=debug,didhub_config=debug
```

Check loaded configuration at startup - the server logs resolved settings on startup.