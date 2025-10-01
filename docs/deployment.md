# Deployment Guide

This guide covers deploying DIDHub to production environments using Docker, native binaries, and various hosting platforms.

## Deployment Options

DIDHub can be deployed in several ways:

1. **Docker Container** (recommended)
2. **Native Binary** (Linux/Windows)
3. **Systemd Service**
4. **Cloud Platforms** (Railway, Render, etc.)

## Docker Deployment

### Using Pre-built Images

DIDHub provides official Docker images:

```bash
# Pull latest image
docker pull ghcr.io/kusekushi/didhub:latest

# Run with SQLite (simplest)
docker run -d \
  --name didhub \
  -p 8080:6000 \
  -e DIDHUB_SECRET=your-secret-key \
  -v didhub_data:/app/data \
  ghcr.io/kusekushi/didhub:latest

# Run with PostgreSQL
docker run -d \
  --name didhub \
  -p 8080:6000 \
  -e DIDHUB_SECRET=your-secret-key \
  -e DIDHUB_DB=postgres://user:pass@host:5432/didhub \
  -v didhub_uploads:/app/uploads \
  ghcr.io/kusekushi/didhub:latest
```

### Docker Compose (Recommended)

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  didhub:
    image: ghcr.io/kusekushi/didhub:latest
    ports:
      - "8080:6000"
    environment:
      - DIDHUB_SECRET=your-super-secret-key-here
      - DIDHUB_DB=postgres://didhub:password@postgres:5432/didhub
  - DIDHUB_REDIS_URL=redis://redis:6379/0
  - FRONTEND_BASE_URL=https://yourdomain.com
  - LOG_LEVEL=info
  - LOG_FORMAT=json
    volumes:
      - didhub_uploads:/app/uploads
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=didhub
      - POSTGRES_USER=didhub
      - POSTGRES_PASSWORD=strong-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  didhub_uploads:
  postgres_data:
  redis_data:
```

Deploy with:

```bash
docker-compose up -d
```

### Building Custom Images

Build from source:

```bash
# Clone repository
git clone https://github.com/Kusekushi/didhub.git
cd didhub

# Build image
docker build -f server-rs/Dockerfile.rust -t didhub:latest .

# Run
docker run -d \
  --name didhub \
  -p 8080:6000 \
  -e DIDHUB_SECRET=your-secret \
  didhub:latest
```

## Native Binary Deployment

### Linux Deployment

1. **Download or build the binary**

   ```bash
   # Download from releases (if available)
   wget https://github.com/Kusekushi/didhub/releases/download/v1.0.0/didhub-linux-x64.tar.gz
   tar -xzf didhub-linux-x64.tar.gz

   # Or build from source
   cargo build --release
   ```

2. **Create user and directories**

   ```bash
   # Create didhub user
   sudo useradd -r -s /bin/false didhub

   # Create directories
   sudo mkdir -p /var/lib/didhub/uploads
   sudo mkdir -p /var/lib/didhub/data
   sudo chown -R didhub:didhub /var/lib/didhub
   ```

3. **Install binary**

   ```bash
   sudo cp didhub-server /usr/local/bin/
   sudo chmod +x /usr/local/bin/didhub-server
   ```

4. **Create systemd service**

   ```bash
   sudo tee /etc/systemd/system/didhub.service > /dev/null <<EOF
   [Unit]
   Description=DIDHub Server
   After=network.target postgresql.service redis.service

   [Service]
   Type=simple
   User=didhub
   Group=didhub
   Environment=DIDHUB_SECRET=your-secret-key
   Environment=DIDHUB_DB=postgres://user:pass@localhost:5432/didhub
  Environment=DIDHUB_REDIS_URL=redis://localhost:6379/0
   Environment=UPLOAD_DIR=/var/lib/didhub/uploads
   Environment=PORT=8080
   Environment=LOG_LEVEL=info
  Environment=LOG_FORMAT=json
   WorkingDirectory=/var/lib/didhub
   ExecStart=/usr/local/bin/didhub-server
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   ```

5. **Start service**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable didhub
   sudo systemctl start didhub
   sudo systemctl status didhub
   ```

### Windows Deployment

1. **Download binary**

   ```powershell
   # Download from releases
   Invoke-WebRequest -Uri "https://github.com/Kusekushi/didhub/releases/download/v1.0.0/didhub-windows-x64.zip" -OutFile "didhub.zip"
   Expand-Archive -Path "didhub.zip" -DestinationPath "C:\Program Files\DIDHub"
   ```

2. **Create Windows service**

   Use NSSM (Non-Sucking Service Manager):

   ```powershell
   # Download NSSM
   Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "nssm.zip"
   Expand-Archive -Path "nssm.zip" -DestinationPath "nssm"

   # Install service
   .\nssm\win64\nssm.exe install DIDHub "C:\Program Files\DIDHub\didhub-server.exe"

   # Configure environment
   .\nssm\win64\nssm.exe set DIDHub AppEnvironmentExtra DIDHUB_SECRET=your-secret DIDHUB_DB=sqlite:///C:/ProgramData/DIDHub/data/didhub.sqlite

   # Start service
   .\nssm\win64\nssm.exe start DIDHub
   ```

## Cloud Platform Deployment

### Railway

1. **Connect repository**
2. **Set environment variables**:
   ```
   DIDHUB_SECRET=your-secret-key
   DIDHUB_DB=${{ DATABASE_URL }}
   FRONTEND_BASE_URL=${{ RAILWAY_STATIC_URL }}
   ```
3. **Deploy**

### Render

1. **Create web service**
2. **Set build command**: `cargo build --release`
3. **Set start command**: `./target/release/didhub-server`
4. **Configure environment variables**

### Fly.io

Create `fly.toml`:

```toml
app = "didhub"
primary_region = "iad"

[build]
  dockerfile = "server-rs/Dockerfile.rust"

[env]
  DIDHUB_SECRET = "your-secret"
  PORT = "8080"

[[mounts]]
  source = "didhub_data"
  destination = "/data"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
```

Deploy:

```bash
fly launch
fly deploy
```

## Reverse Proxy Configuration

### Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:8080/health;
        access_log off;
    }
}
```

### Caddy

```caddyfile
yourdomain.com {
    reverse_proxy 127.0.0.1:8080

    # Health checks
    health_uri /health

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

## Database Setup

### PostgreSQL Production

```sql
-- Create database and user
CREATE DATABASE didhub;
CREATE USER didhub WITH ENCRYPTED PASSWORD 'strong-password';
GRANT ALL PRIVILEGES ON DATABASE didhub TO didhub;

-- Connect to database and grant permissions
\c didhub
GRANT ALL ON SCHEMA public TO didhub;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO didhub;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO didhub;

-- Enable extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### Connection String

```bash
export DIDHUB_DB=postgres://didhub:strong-password@localhost:5432/didhub?sslmode=require
```

## Monitoring and Maintenance

### Health Checks

DIDHub provides health endpoints:

```bash
# Basic health
curl https://yourdomain.com/health

# Version info
curl https://yourdomain.com/api/version
```

### Logs

```bash
# Docker logs
docker logs didhub

# Systemd logs
journalctl -u didhub -f

# Application logs (if configured)
tail -f /var/log/didhub.log
```

### Backups

```bash
# Database backup (PostgreSQL)
pg_dump didhub > backup_$(date +%Y%m%d_%H%M%S).sql

# File backup
tar -czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz /var/lib/didhub/uploads
```

### Updates

```bash
# Docker
docker pull ghcr.io/kusekushi/didhub:latest
docker-compose up -d

# Systemd
sudo systemctl stop didhub
sudo cp new-binary /usr/local/bin/didhub-server
sudo systemctl start didhub
```

## Security Considerations

### Network Security

- Use HTTPS in production
- Restrict database access to application servers
- Use internal networks for service communication

### Application Security

- Keep `DIDHUB_SECRET` secure and rotate regularly
- Use strong database passwords
- Keep dependencies updated

### File Security

- Restrict upload directory permissions
- Scan uploaded files for malware
- Implement file type validation
- Use secure file serving

## Troubleshooting Deployment

### Common Issues

**Container won't start:**
```bash
docker logs didhub
# Check for missing environment variables or database connection issues
```

**Database connection fails:**
```bash
# Test connection
psql "postgres://user:pass@host:5432/didhub" -c "SELECT 1"
```

**High memory usage:**
- Check for memory leaks
- Adjust database connection pool size
- Monitor with `docker stats`

**Slow performance:**
- Check database indexes
- Enable Redis caching
- Optimize queries

### Performance Tuning

```bash
# Database connection pool
export DATABASE_URL="postgres://user:pass@host:port/db?max_connections=20"

# Redis for caching
export DIDHUB_REDIS_URL=redis://redis:6379/0

# Upload caching
# Set uploads.count_cache.ttl_secs to higher value
```

For more help, check the [Troubleshooting](./troubleshooting.md) guide.