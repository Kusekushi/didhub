# DIDHub Rust Server

DIDHub backend using Axum + SQLx.

## Documentation

- **API Documentation**: See `API.md` in the project root for detailed endpoint documentation
- **Rust API Docs**: Run `cargo doc --open` to view generated documentation
- **Audit Events**: See `AUDIT_EVENTS.md` for audit logging reference

## Building and Running

### Local Development

1. Ensure you have Rust installed (see [rustup](https://rustup.rs/))
2. Navigate to the server directory:
   ```
   cd server-rs
   ```
3. Build the project:
   ```
   cargo build
   ```
4. Run the server:
   ```
   cargo run
   ```

For development with embedded static assets (release-like):
```
cargo run --features embed_static
```

Once running, you can check:
- Health: `curl http://localhost:6000/health`
- Version: `curl http://localhost:6000/api/version`

### Docker

Build the Docker image for the Rust server:

```
# Using PowerShell script
.\scripts\build-docker.ps1

# Or directly
docker build -f server-rs/Dockerfile.rust -t didhub/rust-app:latest .
```

Run the server using Docker Compose:

```
docker compose up --build rust_server
```

The server listens on port 6000 by default.

## Next Work

### Uploads Count Cache

The server caches results of filtered upload count queries
(`count_uploads_filtered`) using the configured cache backend (Redis or
in-memory). TTL defaults to 30 seconds and can be configured via the setting key
`uploads.count_cache.ttl_secs` (integer seconds, capped at 3600). Any upload
insert, soft delete, hard delete, or purge triggers a prefix invalidation
(`uploads:count:`). Set the TTL higher to reduce database pressure for
frequently accessed admin pages, or lower (e.g. 5) for near real-time counts.

- Self-update (optional) feature

### Dynamic Upload Directory

The upload directory is now resolved dynamically via the setting key
`app.upload_dir` with a lightweight in-process cache (default TTL 10s). Changing
the setting through the admin settings endpoint automatically invalidates the
cache; the next upload/avatar request will read the new value and create the
directory if missing. An explicit admin endpoint `/api/admin/reload-upload-dir`
is also available to force early refresh. File serving, upload, avatar, and
purge/delete admin operations now all consult the dynamic cache instead of the
static startup config.

## Frontend embedding and local dev

The server can optionally embed the built frontend `static/` directory into the
binary (the default for release bundles). For local development you may prefer
to serve files from disk or run the Vite dev server separately.

- Build/run without embedding (dev):

```
cargo run --manifest-path ./server-rs/Cargo.toml
```

- Build/run with embedded static assets (release-like):

```
cargo run --manifest-path ./server-rs/Cargo.toml --features embed_static
```

You can also set the environment variable `DIDHUB_DIST_DIR` to point the server
at a different directory containing built frontend assets.

### Configuration Generator

Generate a JSON configuration file interactively:

```
cargo run --bin config_generator
```

This will prompt you for database settings, server configuration, logging, CORS, Redis, uploads, and auto-update options. The generated `config.json` can be used with `DIDHUB_DB_CONFIG=config.json`.
