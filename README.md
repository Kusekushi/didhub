# DIDHub

## What is DIDHub?

DIDHub is a web application we've designed to help people with Dissociative Identity Disorder (DID) and other plural systems manage their alters. It provides a platform for organizing information about your system.

With DIDHub, you can:

- **Create Alter Profiles**: Build detailed profiles for each alter, including names, descriptions, roles, and avatars
- **Record affiliations/subsystems**: Note down further details for systems, such as fractions or subsystems that might develop
- **Record relationships between your friend circle**
- **Share profiles/information about your system with others**

With that said, this application is designed to run in a private instance as of right now. This requires you having a server (and ideally a web domain) on your own.
We've tried to make this process of setting up as streamlined as possible, but if you have any questions, suggestions or just need help with the setup, feel free to open an issue or contact us directly.

Also please keep in mind that we've developed this application to the best of our knowledge about that entire topic of DID/OSDD/...
Concepts being applied in this application might not reflect the current state of medicine, and might not be accurate whatsoever.
If you feel that we've worked with incorrect assumptions, please let us know.

Thanks alot, and please take care of yourselves.

## Quick start

### Requirements

- Node.js ≥ 20 and pnpm (workspace tooling)
- Rust stable toolchain (see `rust-toolchain.toml`)
- SQLite (bundled by default). Postgres/MySQL are optional.

### 1. Install dependencies

```powershell
pnpm install
```

### 2. Run the app locally

```powershell
# frontend (Vite dev server)
pnpm dev:frontend

# backend (Axum server)
cd server-rs
cargo run
```

Point the dev UI at your API by exporting:

```powershell
$env:VITE_API_PROXY_TARGET = 'http://localhost:6000'
```

### 3. Seed demo data (optional)

```powershell
# bundled binary after running the release bundle
./seed -c ./config.example.json

# or during development
cargo run --bin seed -- -c server-rs/config.example.json
```

Setting `DIDHUB_BOOTSTRAP_ADMIN_USERNAME` and
`DIDHUB_BOOTSTRAP_ADMIN_PASSWORD` creates an initial admin account.
Unset both environment variables after the first run, since it's no longer needed after that.

## Configuration essentials

Common server environment variables (full list in
[`docs/configuration.md`](./docs/configuration.md)):

| Name | Purpose | Default |
| --- | --- | --- |
| `DIDHUB_SECRET` | JWT signing secret | _required in production_ |
| `DIDHUB_DB` | Database URL (`sqlite://`, `postgres://`, `mysql://`) | `sqlite://data/didhub.sqlite` |
| `DIDHUB_DB_CONFIG` | Path to JSON config merged by `AppConfig` | unset |
| `DIDHUB_REDIS_URL` | Redis connection for rate limiting & cache | disabled |
| `FRONTEND_BASE_URL` | Comma-separated allowed origins | Dev defaults |
| `LOG_FORMAT` | `json` for structured logs, otherwise text | text |

The Rust server listens on port `6000` by default (`PORT` overrides it). Vite
serves the frontend on `5173`.

## Documentation

- **[Getting Started](./docs/getting-started.md)** — complete developer setup
- **[Architecture](./docs/architecture.md)** — services, middleware, feature flags
- **[API Reference](./docs/api.md)** — REST endpoints and request/response types
- **[Database](./docs/database.md)** — migrations and schema overview
- **[Configuration](./docs/configuration.md)** — environment and runtime settings
- **[Deployment](./docs/deployment.md)** — Docker, systemd, TLS, and scaling
- **[Packaging](./docs/packaging.md)** — release bundles & SBOMs
- **[Troubleshooting](./docs/troubleshooting.md)** — common fixes

See the full index in [`docs/README.md`](./docs/README.md).

## Tests

```powershell
# backend
cargo test --manifest-path server-rs/Cargo.toml

# frontend unit tests
pnpm -F @didhub/frontend test

# frontend E2E (Playwright)
pnpm -F @didhub/frontend e2e

# API client unit tests
pnpm -F @didhub/api-client test
```

Ensure Playwright browsers are installed once via `pnpm -F @didhub/frontend
exec npx playwright install`.

Orchestrated E2E (recommended)

For full end-to-end runs (server + frontend + Playwright) prefer the repository orchestrator which starts the server, the frontend on a stable port, runs Playwright, and exports artifacts for CI:

```bash
pnpm -w -s run e2e:run
```

Environment variables used during orchestrated runs:
- `E2E_USER` / `E2E_PASS` — credentials the orchestrator (and Playwright) uses; defaults are `admin` / `adminpw`.
- `PLAYWRIGHT_BASE_URL` — base URL Playwright will use; the orchestrator sets this to the pinned frontend URL (http://localhost:5173) when running locally.

CI notes
- CI reuses build artifacts between jobs (backend/frontend/api-client) to speed runs and restores pnpm and Rust caches when available.
- Coverage generation with `cargo tarpaulin` is gated to primary-branch pushes (master) to avoid running expensive coverage on every PR; CI still uploads test logs and Playwright artifacts for debugging.

## Packaging & deployment

- Build a release bundle with embedded frontend assets and helper binaries:

  ```powershell
  pnpm bundle:release
  ```

  Outputs land in `dist/release/<name>/` with `didhub-server`, `seed`,
  `config_generator`, `RUN.md`, and optional SBOMs. Details live in
  [`docs/packaging.md`](./docs/packaging.md).

- Containerize via `server-rs/Dockerfile.rust` or run `cargo run` directly with
  your preferred process manager. Deployment recipes are covered in
  [`docs/deployment.md`](./docs/deployment.md).

## Contributing & support

We welcome issues and pull requests. Review
[`docs/contributing.md`](./docs/contributing.md) for coding standards and local
workflow tips, then open a branch per change with accompanying tests. For help,
check the troubleshooting guide or open a discussion.

## License

DIDHub is distributed under the terms of the [MIT License](./LICENSE).

