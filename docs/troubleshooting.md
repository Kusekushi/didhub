# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with DIDHub.

## Quick Diagnosis

### Health Check

First, check if the server is running and healthy:

```bash
# Basic health check
curl http://localhost:6000/health

# Should return:
{
  "status": "ok",
  "database": "ok",
  "version": "1.0.0"
}
```

### Logs

Check application logs for errors:

```bash
# Docker
docker logs didhub

# Systemd
journalctl -u didhub -f

# Development
cd server-rs && cargo run  # Check console output
```

## Common Issues

### Backend Won't Start

#### Missing DIDHUB_SECRET

**Error**: `DIDHUB_SECRET is required for production`

**Solution**:
```bash
export DIDHUB_SECRET=your-super-secure-random-key-here-at-least-32-chars
```

#### Database Connection Failed

**Error**: `Failed to connect to database`

**Solutions**:
```bash
# Check database URL
echo $DIDHUB_DB

# Test connection (PostgreSQL)
psql "$DIDHUB_DB" -c "SELECT 1"

# Test connection (MySQL)
mysql --defaults-extra-file=<(echo "[client]
host=$(parse_url "$DIDHUB_DB" host)
port=$(parse_url "$DIDHUB_DB" port)
user=$(parse_url "$DIDHUB_DB" user)
password=$(parse_url "$DIDHUB_DB" password)
database=$(parse_url "$DIDHUB_DB" path | sed 's|/||')") -e "SELECT 1"

# Check SQLite file permissions
ls -la data/didhub.sqlite
```

#### Port Already in Use

**Error**: `Address already in use`

**Solution**:
```bash
# Find process using port
lsof -i :6000

# Kill process or change port
export PORT=6001
```

### Frontend Issues

#### Build Fails

**Error**: `Module not found` or compilation errors

**Solutions**:
```bash
# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Clear build cache
rm -rf packages/frontend/node_modules/.vite
pnpm -F @didhub/frontend build
```

#### CORS Errors

**Error**: `Access-Control-Allow-Origin` header missing

**Solutions**:
```bash
# Allow all origins (development only)
export ALLOW_ALL_FRONTEND_ORIGINS=true

# Or specify allowed origins
export FRONTEND_BASE_URL=http://localhost:5173,https://yourdomain.com
```

#### API Connection Failed

**Error**: `Failed to fetch` or network errors

**Solutions**:
```bash
# Check backend is running
curl http://localhost:6000/health

# Check API proxy configuration
# In packages/frontend/.env
VITE_API_PROXY_TARGET=http://localhost:6000

# Check firewall
telnet localhost 6000
```

### Database Issues

#### Migration Errors

**Error**: `Migration failed`

**Solutions**:
```bash
# Check migration files
ls server-rs/migrations/

# Manual migration (SQLite)
sqlite3 data/didhub.sqlite ".schema"

# Reset database (development only)
rm data/didhub.sqlite
# Restart server to recreate
```

#### Performance Issues

**Symptoms**: Slow queries, high CPU usage

**Solutions**:
```bash
# Enable query logging
export RUST_LOG=sqlx=debug,didhub=debug

# Check indexes
# Connect to database and run:
# PostgreSQL: \d
# SQLite: .schema

# Add missing indexes (example)
# CREATE INDEX idx_alters_system_id ON alters(system_id);
```

#### Data Corruption

**Symptoms**: Inconsistent data, foreign key errors

**Solutions**:
```bash
# Backup current data
cp data/didhub.sqlite data/didhub.sqlite.backup

# Check database integrity (SQLite)
sqlite3 data/didhub.sqlite "PRAGMA integrity_check;"

# Repair if needed (SQLite)
sqlite3 data/didhub.sqlite ".recover" > recovered.sql
```

### Authentication Issues

#### Login Fails

**Error**: `Invalid credentials`

**Solutions**:
```bash
# Check user exists
# Query database directly

# Reset password (development)
# Use admin interface or direct database update

# Check JWT secret consistency
echo $DIDHUB_SECRET
```

#### Token Expired

**Error**: `401 Unauthorized`

**Solution**: Re-login through the UI (automatic refresh should handle this)

#### Admin Access

**Problem**: Can't access admin features

**Solution**: First user to register becomes admin, or grant admin rights:

```sql
-- PostgreSQL/MySQL
UPDATE users SET is_admin = true WHERE username = 'your_username';

-- SQLite
sqlite3 data/didhub.sqlite "UPDATE users SET is_admin = 1 WHERE username = 'your_username';"
```

### File Upload Issues

#### Upload Fails

**Error**: `Upload failed`

**Solutions**:
```bash
# Check upload directory permissions
ls -la uploads/

# Check disk space
df -h

# Check file size limits
# In database settings or environment
```

If the server logs include `falling back to writable upload directory`, the configured path was not writable and uploads are temporarily stored in the fallback location (`DIDHUB_UPLOAD_FALLBACK_DIR` or the system temp folder). Point `app.upload_dir` (or the `UPLOAD_DIR` env var) at a persistent writable directory and call the admin `reload-upload-dir` endpoint to apply the change.

#### Files Not Accessible

**Problem**: Uploaded files return 404

**Solutions**:
```bash
# Check upload directory setting
echo $DIDHUB_DIST_DIR

# Check file permissions
ls -la uploads/

# Check URL routing
# Files should be served from /uploads/ path
```

### Performance Issues

#### High Memory Usage

**Symptoms**: Container restarts, out of memory

**Solutions**:
```bash
# Check for memory leaks
# Monitor with docker stats

# Reduce connection pool size
export DATABASE_URL="postgres://...&max_connections=10"

# Enable garbage collection tuning (if applicable)
```

#### Slow Response Times

**Symptoms**: API calls take long time

**Solutions**:
```bash
# Enable caching
export REDIS_URL=redis://localhost:6379/0

# Check database performance
# Run EXPLAIN on slow queries

# Add database indexes
# See database.md for recommended indexes
```

### Docker Issues

#### Container Won't Start

```bash
# Check logs
docker logs didhub

# Check environment
docker exec didhub env

# Check disk space
docker system df
```

#### Database Connection in Docker

```yaml
# docker-compose.yml
services:
  didhub:
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:6000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Development Issues

#### Hot Reload Not Working

**Solutions**:
```bash
# Frontend
rm -rf packages/frontend/node_modules/.vite
pnpm -F @didhub/frontend dev

# Backend
cd server-rs && cargo clean && cargo run
```

#### Tests Failing

```bash
# Run specific test
pnpm -F @didhub/frontend test -- testName

# Debug test
pnpm -F @didhub/frontend test -- --reporter=verbose

# Update snapshots (if applicable)
pnpm -F @didhub/frontend test -- -u
```

## Advanced Debugging

### Enable Debug Logging

```bash
# All components
export RUST_LOG=debug
export LOG_LEVEL=debug

# Specific components
export RUST_LOG=didhub=debug,sqlx=info,axum=info

# JSON logging
export LOG_JSON=true
```

### Database Debugging

```bash
# Enable query logging
export RUST_LOG=sqlx=debug

# Monitor connections
# PostgreSQL: SELECT * FROM pg_stat_activity;

# Check locks
# PostgreSQL: SELECT * FROM pg_locks;
```

### Network Debugging

```bash
# Check connectivity
telnet localhost 6000

# Trace requests
curl -v http://localhost:6000/health

# Check firewall
iptables -L
ufw status
```

### Memory Profiling

```bash
# Use jemalloc (if enabled)
export MALLOC_CONF=prof:true,prof_prefix:/tmp/jeprof

# Generate flame graph
# Requires perf tools
perf record -F 99 -p $(pidof didhub-server) -g -- sleep 60
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

## Getting Help

### Information to Provide

When asking for help, include:

- **Environment**: OS, Docker version, database type
- **Configuration**: Relevant environment variables (redact secrets)
- **Logs**: Error messages and stack traces
- **Steps to reproduce**: Exact commands and sequence
- **Expected vs actual behavior**

### Support Channels

1. **GitHub Issues**: For bugs and feature requests
2. **GitHub Discussions**: For questions and general discussion
3. **Documentation**: Check docs/ folder first
4. **Community**: Join Discord/Slack if available

### Emergency Contacts

For security issues, contact maintainers directly (don't post publicly).

## Prevention

### Best Practices

- **Monitor regularly**: Set up health checks and alerts
- **Keep updated**: Update dependencies and DIDHub regularly
- **Backup data**: Regular database and file backups
- **Test deployments**: Use staging environment before production
- **Monitor logs**: Set up log aggregation and alerting

### Monitoring Setup

```bash
# Prometheus metrics (if enabled)
curl http://localhost:6000/metrics

# Health check script
#!/bin/bash
if curl -f http://localhost:6000/health > /dev/null; then
    echo "OK"
else
    echo "FAIL"
    # Send alert
fi
```

This guide covers the most common issues. If you encounter something not listed here, please check the GitHub repository for similar issues or create a new one with detailed information.