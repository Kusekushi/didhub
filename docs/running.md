# Running DIDHub

This guide covers how to run DIDHub in different environments and configurations.

## Prerequisites

Before running DIDHub, ensure you have:

- **For development**: Node.js 20+, pnpm, Rust 1.70+
- **For production**: The compiled binary or Docker image
- **Database**: SQLite (default), PostgreSQL, or MySQL

## Development Mode

### Quick SQLite Setup

DIDHub works out of the box with SQLite for development:

1. **Clone and setup**

   ```bash
   git clone https://github.com/Kusekushi/didhub.git
   cd didhub
   pnpm install
   ```

2. **Start the backend**

   ```bash
   cd server-rs
   cargo run
   ```

   The server starts on `http://localhost:6000`.

3. **Start the frontend** (in another terminal)

   ```bash
   pnpm -F @didhub/frontend dev
   ```

   The frontend runs on `http://localhost:5173`.

4. **Access the application**

   Open `http://localhost:5173` in your browser.

### With External Database

#### PostgreSQL

1. **Install PostgreSQL**

   ```bash
   # Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib

   # macOS
   brew install postgresql
   brew services start postgresql

   # Or use Docker
   docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15
   ```

2. **Create database**

   ```bash
   createdb didhub_dev
   ```

3. **Configure environment**

   ```bash
   export DIDHUB_DB=postgres://postgres:password@localhost:5432/didhub_dev
   export DIDHUB_SECRET=dev-secret-key-change-in-production
   ```

4. **Run the server**

   ```bash
   cd server-rs
   cargo run
   ```

#### MySQL

1. **Install MySQL**

   ```bash
   # Ubuntu/Debian
   sudo apt install mysql-server

   # macOS
   brew install mysql
   brew services start mysql

   # Or use Docker
   docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password mysql:8
   ```

2. **Create database**

   ```sql
   CREATE DATABASE didhub_dev;
   CREATE USER 'didhub'@'localhost' IDENTIFIED BY 'password';
   GRANT ALL PRIVILEGES ON didhub_dev.* TO 'didhub'@'localhost';
   ```

3. **Configure environment**

   ```bash
   export DIDHUB_DB=mysql://didhub:password@localhost:3306/didhub_dev
   export DIDHUB_SECRET=dev-secret-key-change-in-production
   ```

## Production Mode

### Using Docker (Recommended)

#### Docker Run

```bash
# SQLite (simplest)
docker run -d \
  --name didhub \
  -p 8080:6000 \
  -e DIDHUB_SECRET=your-secret-key \
  -v didhub_data:/app/data \
  ghcr.io/kusekushi/didhub:latest

# PostgreSQL
docker run -d \
  --name didhub \
  -p 8080:6000 \
  -e DIDHUB_SECRET=your-secret-key \
  -e DIDHUB_DB=postgres://user:pass@host:5432/didhub \
  -v didhub_uploads:/app/uploads \
  ghcr.io/kusekushi/didhub:latest
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  didhub:
    image: ghcr.io/kusekushi/didhub:latest
    ports:
      - "8080:6000"
    environment:
      - DIDHUB_SECRET=your-secret-key
      - DIDHUB_DB=postgres://didhub:password@postgres:5432/didhub
      - REDIS_URL=redis://redis:6379/0
    volumes:
      - didhub_uploads:/app/uploads
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=didhub
      - POSTGRES_USER=didhub
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  didhub_uploads:
  postgres_data:
  redis_data:
```

Run with:

```bash
docker-compose up -d
```

### Native Binary

#### Download Release

```bash
# Download from GitHub releases
wget https://github.com/Kusekushi/didhub/releases/download/v1.0.0/didhub-linux-x64.tar.gz
tar -xzf didhub-linux-x64.tar.gz
```

#### Build from Source

```bash
# Clone repository
git clone https://github.com/Kusekushi/didhub.git
cd didhub

# Build release binary
cd server-rs
cargo build --release

# Binary is in target/release/didhub-server
```

#### Run Binary

```bash
# With SQLite
export DIDHUB_SECRET=your-secret-key
./didhub-server

# With PostgreSQL
export DIDHUB_DB=postgres://user:pass@localhost:5432/didhub
export DIDHUB_SECRET=your-secret-key
./didhub-server

# With configuration file
./didhub-server --config config.json
```

### Systemd Service

For production Linux deployments:

1. **Create service file**

   ```bash
   sudo tee /etc/systemd/system/didhub.service > /dev/null <<EOF
   [Unit]
   Description=DIDHub Server
   After=network.target

   [Service]
   Type=simple
   User=didhub
   Group=didhub
   Environment=DIDHUB_SECRET=your-secret-key
   Environment=DIDHUB_DB=postgres://didhub:password@localhost:5432/didhub
   ExecStart=/usr/local/bin/didhub-server
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   EOF
   ```

2. **Create user and directories**

   ```bash
   sudo useradd -r -s /bin/false didhub
   sudo mkdir -p /var/lib/didhub/uploads /var/lib/didhub/data
   sudo chown -R didhub:didhub /var/lib/didhub
   ```

3. **Install and start**

   ```bash
   sudo cp didhub-server /usr/local/bin/
   sudo systemctl daemon-reload
   sudo systemctl enable didhub
   sudo systemctl start didhub
   ```

## Configuration

### Environment Variables

See [Configuration](./configuration.md) for all available options.

### Configuration File

Create `config.json`:

```json
{
  "database": {
    "driver": "postgres",
    "host": "localhost",
    "port": 5432,
    "database": "didhub",
    "username": "didhub",
    "password": "password"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 6000
  },
  "logging": {
    "level": "info",
    "json": true
  }
}
```

Run with:

```bash
./didhub-server --config config.json
```

## Health Checks

### Basic Health Check

```bash
curl http://localhost:6000/health
```

Response:
```json
{
  "status": "ok",
  "database": "ok",
  "version": "1.0.0"
}
```

### Readiness Check

```bash
curl http://localhost:6000/api/version
```

## Logging

### Development

```bash
# Enable debug logging
export RUST_LOG=debug
export LOG_LEVEL=debug

cd server-rs
cargo run
```

### Production

```bash
# Structured JSON logging
export LOG_JSON=true
export LOG_LEVEL=info
```

## Troubleshooting

### Server Won't Start

- Check `DIDHUB_SECRET` is set
- Verify database connection
- Check port availability
- Review logs: `docker logs didhub` or `journalctl -u didhub`

### Database Connection Issues

- Test connection manually
- Check firewall settings
- Verify credentials
- Ensure database server is running

### Frontend Connection Issues

- Check API proxy configuration
- Verify CORS settings
- Test backend health endpoint

For more troubleshooting, see [Troubleshooting](./troubleshooting.md).

## Next Steps

- Configure your deployment in [Configuration](./configuration.md)
- Set up monitoring and backups
- Review security settings for production
- Check [Deployment](./deployment.md) for advanced options
