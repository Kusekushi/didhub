# Configuration Guide

This guide covers all configuration options available in DIDHub, including environment variables, settings, and configuration files.

## Configuration Methods

DIDHub supports multiple ways to configure the application:

1. **Environment Variables** (recommended for production)
2. **Configuration Files** (JSON format)
3. **Database Settings** (runtime configuration)

## Environment Variables

> ℹ️ **Precedence:** Environment variables override JSON config values, which override compiled defaults. When `AppConfig::from_env` resolves settings, it also normalizes a few related values (for example, promoting `LOG_LEVEL` into `RUST_LOG`).

### Core configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIDHUB_SECRET` | HMAC secret for JWT signing. **Set this in production.** | `dev-secret-change-me` (development only) |
| `DIDHUB_DB` | Database connection string (`sqlite://`, `postgres://`, `mysql://`). | `sqlite://data/didhub.sqlite` |
| `DIDHUB_DB_CONFIG` / `DIDHUB_CONFIG_FILE` | Path to a JSON config file merged into env defaults. | _unset_ |
| `HOST` | Host address to bind. | `0.0.0.0` |
| `PORT` | HTTP port. | `6000` |
| `UPLOAD_DIR` | Writable directory for uploaded files. | `uploads` |

Examples:

```bash
# SQLite (default)
export DIDHUB_DB=sqlite:///$(pwd)/server-rs/data/didhub.sqlite

# PostgreSQL
export DIDHUB_DB=postgres://user:pass@localhost:5432/didhub

# MySQL
export DIDHUB_DB=mysql://user:pass@localhost:3306/didhub

# Use JSON config for derived values
export DIDHUB_DB_CONFIG=./config.prod.json
```

### Logging & security headers

| Variable | Purpose | Notes |
| --- | --- | --- |
| `RUST_LOG` | Full tracing filter string (`info`, `didhub=debug,sqlx=warn`, …). | Highest precedence. |
| `LOG_LEVEL` | Shorthand log level. | Promoted into `RUST_LOG` when unset. |
| `LOG_FORMAT` | Set to `json` to enable structured logs. | Any other value keeps human-readable logs. |
| `DIDHUB_ENABLE_HSTS` | Enables the HSTS header. | Accepts `true/1/yes`. |
| `DIDHUB_CSP` | Overrides the Content-Security-Policy header. | Applied verbatim. |

### Frontend origin policy

| Variable | Purpose | Default |
| --- | --- | --- |
| `FRONTEND_BASE_URL` | Comma-separated list or JSON array of allowed origins. | `http://localhost:5173,http://localhost:5174` |
| `ALLOW_ALL_FRONTEND_ORIGINS` | When truthy, CORS allows any origin (development convenience). | `false` |

### Caching & rate limiting

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIDHUB_REDIS_URL` | Enables Redis-backed cache + rate-limit governor. | _unset_ (in-memory fallback) |

Examples:

```bash
export DIDHUB_REDIS_URL=redis://localhost:6379/0
export DIDHUB_REDIS_URL=redis://user:pass@cache.internal:6380/1
```

### Auto-update

| Variable | Purpose | Default |
| --- | --- | --- |
| `AUTO_UPDATE_ENABLED` | Allow the updater to download and stage releases. | `false` |
| `AUTO_UPDATE_CHECK` | Periodically check for updates in the background. | `false` |
| `UPDATE_REPO` | GitHub repository used for update manifests. | `Kusekushi/didhub` |
| `UPDATE_CHECK_INTERVAL_HOURS` | Interval between checks. | `24` |

> These flags are no-ops when the binary is compiled without the `updater` feature.

### Bootstrap admin

| Variable | Purpose | Notes |
| --- | --- | --- |
| `DIDHUB_BOOTSTRAP_ADMIN_USERNAME` | Username for a one-time admin account. | Only honoured on the first boot. |
| `DIDHUB_BOOTSTRAP_ADMIN_PASSWORD` | Password for the bootstrap admin. | Must be set with the username. |

```bash
export DIDHUB_BOOTSTRAP_ADMIN_USERNAME=admin
export DIDHUB_BOOTSTRAP_ADMIN_PASSWORD=mysecurepassword
# Run the server once, then unset these for security.
```

### Upload-related runtime settings

The following keys live in the settings table (see **Runtime Settings** below) and can be edited without restarting:

- `app.upload_dir`: Mirrors `UPLOAD_DIR` and controls where new uploads land.
- `uploads.count_cache.ttl_secs`: Cache TTL (seconds) for upload counters (default `30`).
- `uploads.max_file_size`: Maximum upload size in bytes.
- `uploads.allowed_types`: Comma-separated MIME allowlist.
- `security.rate_limit.requests_per_minute`: Default per-key rate limit budget.
- `housekeeping.audit_retention_days`: Audit log retention window.

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

Admin users can edit settings without restarting the server. Each key is exposed under `/api/settings/{key}` and accepts/returns JSON values.

```bash
# Update upload directory
curl -X PUT http://localhost:6000/api/settings/app.upload_dir \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"/var/uploads"}'

# Bump the upload count cache TTL to 60 seconds
curl -X PUT http://localhost:6000/api/settings/uploads.count_cache.ttl_secs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value":60}'
```

### Available keys

| Key | Description | Default | Type |
|-----|-------------|---------|------|
| `app.upload_dir` | Upload directory path | `./uploads` | string |
| `uploads.count_cache.ttl_secs` | Upload count cache TTL | `30` | number |
| `uploads.max_file_size` | Max file size in bytes | `10485760` | number |
| `uploads.allowed_types` | Allowed MIME types (comma-separated) | `image/*` | string |
| `security.rate_limit.requests_per_minute` | Default rate limit budget | `60` | number |
| `housekeeping.audit_retention_days` | Audit log retention window | `365` | number |

## Development Configuration

### Local Development (.env)

Create a `.env` file in the `server-rs/` directory:

```bash
# Development settings
DIDHUB_SECRET=dev-secret-key-change-in-production
PORT=6000
HOST=127.0.0.1
LOG_LEVEL=debug
LOG_FORMAT=text
FRONTEND_BASE_URL=http://localhost:5173
ALLOW_ALL_FRONTEND_ORIGINS=false

# Database (SQLite for development)
DIDHUB_DB=sqlite://../data/didhub.sqlite

# Optional: Redis for development
# DIDHUB_REDIS_URL=redis://localhost:6379/0
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
export LOG_FORMAT=json

# Database
export DIDHUB_DB=postgres://didhub:strong-password@db.internal:5432/didhub

# CORS
export FRONTEND_BASE_URL=https://myapp.com

# Redis
export DIDHUB_REDIS_URL=redis://redis.internal:6379/0

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