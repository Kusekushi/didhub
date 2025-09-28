# DIDHub — Alters manager

This repository contains the Rust API server in `server-rs/` and the Vite +
React frontend in `packages/frontend/`.

## Documentation

- **[Getting Started](./docs/getting-started.md)** - Development setup and prerequisites
- **[Architecture](./docs/architecture.md)** - System overview and components
- **[API Reference](./docs/api.md)** - Complete REST API documentation
- **[Database Guide](./docs/database.md)** - Schema, migrations, and data models
- **[Configuration](./docs/configuration.md)** - Environment variables and settings
- **[Deployment](./docs/deployment.md)** - Docker, native binaries, and production setup
- **[Contributing](./docs/contributing.md)** - Development workflow and guidelines
- **[Troubleshooting](./docs/troubleshooting.md)** - Common issues and solutions

For the full documentation index, see **[docs/README.md](./docs/README.md)**.

## Prerequisites

- Node.js (recommended >= 20)
- pnpm (this repo uses pnpm workspace scripts)

## Quick start

Install all dependencies from the workspace root:

```powershell
pnpm install
```

Run the frontend in dev mode:

```powershell
pnpm -F @didhub/frontend dev
```

Run the Rust server in dev mode:

```powershell
cd server-rs
cargo run
```

Build frontend + API client:

```powershell
pnpm run build
```

## Database Seeding

For development, use the seed utility to populate the database with demo data:

```powershell
cd server-rs
cargo run --bin seed --release -- -c ./config.example.json
```

## Tests

- Server tests: `pnpm -F @didhub/server test`
- Frontend unit tests: `pnpm -F @didhub/frontend test` (or `pnpm -F @didhub/frontend test:frontend` for the Jest setup)
- Frontend E2E: `pnpm -F @didhub/frontend e2e`

## Notes & troubleshooting

- The frontend build output is written into `static/` (configured in `packages/frontend/package.json` build script). The server can serve that folder in production.
- If Playwright-based tests are used, install browser binaries: `npx playwright install` (the frontend package has a `postinstall` hook that tries to install browsers).

## Contributing

- Open a branch per feature or bugfix and include tests when you change server behavior.

## Prerequisites

- Node.js (recommended >= 20)
- pnpm (this repo uses pnpm workspace scripts)

## Quick start

Install all dependencies from the workspace root:

```powershell
pnpm install
```

Run the frontend in dev mode:

```powershell
pnpm -F @didhub/frontend dev
```

Run the Rust server in dev mode:

```powershell
cd server-rs
cargo run
```

Build frontend + API client:

```powershell
pnpm run build
```

## Database Seeding

For development, use the seed utility to populate the database with demo data:

```powershell
cd server-rs
cargo run --bin seed --release -- -c ./config.example.json
```

## Tests

- Server tests: pnpm -F @didhub/server test
- Frontend unit tests: pnpm -F @didhub/frontend test (or pnpm -F
  @didhub/frontend test:frontend for the Jest setup)
- Frontend E2E: pnpm -F @didhub/frontend e2e

## Notes & troubleshooting

- The frontend build output is written into `static/` (configured in
  `packages/frontend/package.json` build script). The server can serve that
  folder in production.
- If Playwright-based tests are used, install browser binaries:
  `npx playwright install` (the frontend package has a `postinstall` hook that
  tries to install browsers).

## Contributing

- Open a branch per feature or bugfix and include tests when you change server
  behavior.

## More

For more details on scripts and internal implementation, inspect `package.json`
files at the workspace root and `packages/frontend/package.json`.

## Environment variables & ports

Below are the most commonly used environment variables and the default ports the
apps listen on. These are pulled from the server code and workspace scripts;
adjust as needed for your environment.

- PORT (server): port the API server listens on (default: 6000 when not set).
- DIDHUB_DB: database URL (e.g. `sqlite://absolute/path/to.db`,
  `postgres://user:pass@host:5432/db`, `mysql://user:pass@host:3306/db`). If
  omitted defaults to a local SQLite file `data/didhub.sqlite`.
- DIDHUB_SECRET: secret used for JWT signing; set a strong value in production.
- REDIS_URL: if set, can be used for Redis-backed session store or other shared
  caches (format e.g. `redis://localhost:6379/0`). If unset the server falls
  back to in-memory session storage.
- FRONTEND_BASE_URL: a comma-separated list of allowed frontend origins for CORS
  (defaults to `http://localhost:5173,http://localhost:5174` in dev). You can
  set a single origin or multiple origins separated by commas.
- ALLOW_ALL_FRONTEND_ORIGINS: if set to `true` (case-insensitive), the server
  will allow requests from any origin — only for development convenience.
- NODE_ENV: standard Node env; affects things like secure cookies (when
  `production`).
- LOG_LEVEL: overrides logger level (server and browser shim). Defaults to `debug` in dev, `info` in prod.
- LOG_JSON: when set (or in production), structured JSON logs are emitted by the server logger.

## Auto-update configuration (Rust server)

The server includes auto-update functionality that can check for and install
updates from GitHub releases. All auto-update features are **disabled by
default** for safety.

**Build with updater support:**

```powershell
cd server-rs
cargo build --features updater --release
```

**Environment variables:**

- AUTO_UPDATE_ENABLED: set to `true` to enable auto-update functionality
  (default: `false`)
- AUTO_UPDATE_CHECK: set to `true` to enable periodic background checks
  (default: `false`)
- UPDATE_REPO: GitHub repository for updates (default: `Kusekushi/didhub`)
- UPDATE_CHECK_INTERVAL_HOURS: hours between background update checks (default:
  `24`)

**Admin API endpoints (requires admin authentication):**

- GET `/admin/update/check`: Check for available updates
- POST `/admin/update`: Perform update (or add `?check_only=true` for dry-run)

**Example usage:**

```powershell
# Enable updates and periodic checking
$env:AUTO_UPDATE_ENABLED = 'true'
$env:AUTO_UPDATE_CHECK = 'true'
$env:UPDATE_CHECK_INTERVAL_HOURS = '12'
cargo run --features updater --release
```

**Security notes:**

- Updates are downloaded from GitHub releases matching the binary name pattern
- On Windows, executable replacement may require service restart
- All update activities are logged to the audit trail
- Only admin users can trigger manual updates via API

## Common Ports

- Frontend dev server (Vite): 5173 (also sometimes 5174 if 5173 is in use)
- Rust server (dev/default): 6000 (controlled by `PORT` in `server-rs`)

## Examples (PowerShell)

Set a strong secret and run the Rust server (default 6000):

```powershell
$env:DIDHUB_SECRET = 'replace-with-strong-secret'
$env:PORT = '6000'
cd server-rs
cargo run
```

Allow a specific frontend origin and run frontend dev (Rust backend):

```powershell
$env:FRONTEND_BASE_URL = 'http://localhost:5173'
cd server-rs; cargo run
# in another shell
pnpm -F @didhub/frontend dev
```

Frontend `.env` (dev proxy target):

```bash
VITE_API_PROXY_TARGET=http://localhost:6000
```

## Database configuration file (Rust server)

Instead of crafting `DIDHUB_DB` manually you can point the server at a JSON file
via `DIDHUB_DB_CONFIG` (or legacy fallback `DIDHUB_CONFIG_FILE`).

**Interactive Configuration Generator**: Use the built-in config generator to create configuration files interactively:

```bash
cd server-rs
cargo run --bin config_generator
```

This tool will guide you through all configuration options and generate a complete `config.json` file.

Example `server-rs/config.example.json` (sqlite):

```json
{
  "database": {
    "driver": "sqlite",
    "path": "./data/didhub.sqlite"
  }
}
```

Postgres:

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
  }
}
```

MySQL:

```json
{
  "database": {
    "driver": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "didhub",
    "username": "didhub",
    "password": "secret"
  }
}
```

Resolution precedence:

- If `DIDHUB_DB` is set it overrides the file.
- If not set and the file parses successfully, the derived URL is exported as
  `DIDHUB_DB` before database initialization.

Supported drivers: `sqlite`, `postgres` (`postgresql`), `mysql`.

## Packaging & Deployment

This project can be distributed as a Docker image (recommended) or a standalone Rust binary bundle (with static assets).

### Release Bundling

Use the release bundler to create a complete distribution package:

```powershell
pnpm run bundle:release
```

This creates a `dist/release/` directory containing:
- `didhub-server` binary
- `seed` utility for database seeding
- `static/` frontend assets
- `config.example.json` configuration template
- `RUN.md` execution guide
- `VERSION` file
- SBOM files (if `syft` is available)

### Docker Image

Build the Rust server Docker image:

```powershell
docker build -f server-rs/Dockerfile.rust -t didhub/rust-app:latest .
```

Build versioned image:

```powershell
docker build -f server-rs/Dockerfile.rust -t didhub/rust-app:$(git rev-parse --short HEAD) .
```

Run:

```powershell
docker run --rm -p 6000:6000 \
  -e DIDHUB_SECRET=change-me \
  -e DIDHUB_DB=sqlite:///data/didhub.sqlite \
  -v didhub_uploads:/app/uploads \
  didhub/rust-app:latest
```

Compose snippet:

```yaml
services:
  redis:
    image: redis:7
  didhub:
    image: didhub/app:latest
    ports: ['6000:6000']
    environment:
      DIDHUB_SECRET: 'replace-me'
      REDIS_URL: 'redis://redis:6379/0'
    volumes:
      - didhub_uploads:/app/uploads
volumes:
  didhub_uploads: {}
```

### Release Process

1. Bump version in root `package.json`.
2. Create release bundle: `pnpm run bundle:release`
3. Build and push Docker image:

```powershell
docker build -f server-rs/Dockerfile.rust -t didhub/app:$(node -p "require('./package.json').version") .
docker push didhub/app:$(node -p "require('./package.json').version")
docker tag didhub/app:$(node -p "require('./package.json').version") didhub/app:latest
docker push didhub/app:latest
```

### Persistence

Mount `uploads/` to keep user-uploaded assets across container restarts.

### Health Checks

Rust server: `GET /health` (public) on port 6000 by default.

## Authentication & Token Refresh

The Rust backend issues a JWT (HS256) with a 7-day expiry on successful
`/api/auth/login`.

To keep sessions alive without forcing re-login, a sliding refresh endpoint
exists:

`POST /api/auth/refresh`

Behavior:

- Client sends existing (still-valid) JWT in `Authorization: Bearer <token>`.
- Server validates and returns `{ "token": "<new>" }` with a fresh 7-day window.
- Expired / invalid tokens result in HTTP 401.

Frontend integration:

- `@didhub/api-client` automatically attaches the bearer token from
  `localStorage` key `didhub_jwt`.
- Any 401 response dispatches a `didhub:unauthorized` event. A single
  opportunistic refresh attempt runs; on success the new token is stored; on
  failure the user is redirected to `/login`.
- The React `AuthContext` decodes the `exp` claim and schedules an automatic
  refresh 5 minutes prior to expiry.

Security notes:

- This is a sliding session model using only an access token. Consider
  introducing a distinct, HttpOnly refresh token with rotation & revocation
  lists for higher security.
- Protect `DIDHUB_SECRET` in production; rotating it invalidates all active
  sessions.
