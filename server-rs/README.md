# DIDHub Rust server

Axum + SQLx backend that exposes the DIDHub REST API, serves embedded frontend
assets, and coordinates authentication, caching, and housekeeping tasks.

## Quick start

```bash
cd server-rs
cargo run
```

- Listens on `http://localhost:6000`
- Uses the bundled SQLite database at `data/didhub.sqlite` when no `DIDHUB_DB`
   is provided
- Runs migrations automatically on startup

Feature flags:

- `embed_static` — bundle the built frontend into the binary (enabled in release bundle)
- `updater` — enable auto-update jobs and related endpoints

To simulate production locally:

```bash
cargo run --features "embed_static,updater"
```

## Configuration essentials

Environment variables are parsed by `didhub-config::AppConfig`. Common keys:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIDHUB_SECRET` | HS256 signing key for JWTs | _required in prod_ |
| `DIDHUB_DB` | Database URL (`sqlite://`, `postgres://`, `mysql://`) | `sqlite://data/didhub.sqlite` |
| `DIDHUB_DB_CONFIG` | Path to JSON config merged with env overrides | unset |
| `PORT` | HTTP listen port | `6000` |
| `DIDHUB_REDIS_URL` | Redis for rate limiting + cache | disabled |
| `FRONTEND_BASE_URL` | Allowed CORS origins (comma-separated) | Dev defaults |
| `LOG_FORMAT` | `json` for structured logs | text |

Runtime settings (admin API) can be patched via `/api/settings/{key}`. See
[`docs/configuration.md`](../docs/configuration.md) for the full catalog.

Configuration helpers:

```bash
cargo run --bin config_generator           # interactive config file wizard
cargo run --bin seed -- -c config.example.json  # demo + optional bootstrap admin
```

## Observability & health

- `/health` — liveness check
- `/metrics` — Prometheus metrics (enable with `METRICS_ENABLED=true`)
- Structured logging controlled by `LOG_LEVEL`/`LOG_FORMAT`

Audit events and the logging model are documented in
[`docs/audit-events.md`](../docs/audit-events.md) and
[`docs/architecture.md`](../docs/architecture.md).

## Packaging & deployment

- Release bundles are produced with `pnpm bundle:release` and ship the
   `didhub-server`, `seed`, and `config_generator` binaries with embedded
   migrations and frontend assets. Details: [`docs/packaging.md`](../docs/packaging.md).
- Docker builds use `server-rs/Dockerfile.rust`. Compose and systemd examples
   live in [`docs/deployment.md`](../docs/deployment.md).

## Testing

```bash
# unit + integration tests
cargo test

# run a specific module
cargo test upload -- --nocapture
```

Database-backed integration tests in `server-rs/tests/` require `RUN_DB_INTEGRATION_TESTS=1`
and a configured `DIDHUB_DB`. Without those env vars, they auto-skip.

## Further reading

- REST endpoint reference: [`docs/api.md`](../docs/api.md)
- Architecture overview: [`docs/architecture.md`](../docs/architecture.md)
- Troubleshooting guide: [`docs/troubleshooting.md`](../docs/troubleshooting.md)

Generated Rust docs remain available via `cargo doc --open` if you want crate
level API details.
