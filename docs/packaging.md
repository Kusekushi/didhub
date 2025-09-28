## DIDHub Packaging (Rust + Frontend)

The project ships a Rust backend binary and a Vite-built frontend. A release
bundle aggregates:

- `didhub-server` (Rust release binary)
- `static/` (built frontend assets)
- `migrations/`, `migrations_postgres/`, `migrations_mysql/` (SQLx migrations)
- `config.example.json` (database config example)
- `RUN.md` (quick usage)
- `VERSION`
- SBOM files (`SBOM.syft.json`, `SBOM.spdx.json` when Syft available)

### Creating a Release Bundle (Local)

```powershell
pnpm bundle:release
```

Output directory (example):

```
dist/release/didhub-1.0.0-20250101123000/
  didhub-server
  static/
  migrations*/
  config.example.json
  RUN.md
  VERSION
  SBOM.syft.json
  SBOM.spdx.json
```

An archive (`.zip` on Windows or `.tar.gz` on Unix) is also created if the
system tools are present.

### SBOM Generation

The bundler attempts to run `syft` to produce a software bill of materials in
two formats. If `syft` is not installed, it logs a warning and continues.

Install Syft manually (optional):

```bash
curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
```

### Continuous Integration

GitHub Actions workflow (`.github/workflows/ci.yml`) performs:

1. Install Node & pnpm
2. Install Rust toolchain & cache
3. Lint / run tests
4. Build bundle with SBOM
5. Upload artifact
6. (Main branch) Build and push multi-arch container image for the Rust server
   (`server-rs/Dockerfile.rust`)
7. (Tag starting with `v`) Publish a GitHub Release attaching all bundle files

### Container Image

Current image: single-stage release for Rust binary (multi-arch). A future
enhancement will create a unified image that also builds and copies frontend
assets during the Docker build, reducing the need to mount `static/` externally.

### Database Migrations

Migrations are run automatically at startup by the server code using SQLx. If
you need an explicit migration-only action, consider adding a `--migrate-only`
flag or a dedicated small binary (not yet implemented).

### Seeding

Use the included seed binary:

```bash
cargo run --bin seed --release -- -c server-rs/config.example.json
```

This creates a demo user and a bootstrap admin (if bootstrap credentials are
provided via env/config).

### Adding Vulnerability Scanning & Signing (Planned)

Optional future steps:

- Integrate Trivy or Grype to scan the bundle or container image.
- Sign container image with Cosign (keyless GitHub OIDC) and attach attestations
  (including SBOM provenance).
- Add SLSA provenance via `cosign attest` or GitHub’s provenance features.

### Customizing the Bundle

Edit `scripts/bundle-release.mjs` to:

- Skip frontend build (add a guard around the call)
- Exclude optional assets
- Add additional SBOM formats
- Include a LICENSE file or sample env file

### Example Quick Run (SQLite)

```bash
./didhub-server --config ./config.example.json
```

Postgres:

```bash
export DIDHUB_DB=postgres://user:pass@host:5432/didhub
./didhub-server
```

### Structure Rationale

Keeping migrations with the binary ensures upgrades are self-contained. Shipping
SBOMs alongside artifacts supports downstream compliance workflows without
additional scanning steps at deploy time.

### Future Enhancements

- Unified multi-stage Dockerfile that builds frontend + Rust in one image
- Optional dynamic config templating (e.g., environment substitution for
  config.example.json)
- Automatic provenance generation and signature verification instructions
- Makefile wrapper for common packaging targets

### Logging

- **Environment variables:**

  - `RUST_LOG` — full `tracing`-style filter (e.g. `info`, `debug`,
    `mycrate=debug,hyper=info`). This has the highest precedence.
  - `LOG_LEVEL` — shorthand for the top-level log level (e.g. `info`, `debug`).
    If `RUST_LOG` is not set, `LOG_LEVEL` will be promoted into `RUST_LOG` at
    startup.
  - `LOG_FORMAT` — set to `json` to enable JSON-formatted logs. Any other value
    yields human-readable text logs.

- **Config file:** the JSON config file supports a `logging` section. Example:

```json
{
  "logging": {
    "level": "info",
    "json": true
  }
}
```

- **Precedence:** `RUST_LOG` > `LOG_LEVEL` > config file `logging.level` >
  built-in default (`info`). The `LOG_FORMAT` env var overrides the file
  `logging.json` setting.

At startup the server logs the resolved `RUST_LOG` value and whether JSON
formatting is enabled so operators can confirm the effective log configuration.
