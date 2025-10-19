DIDHub backend example configuration files

Files in this directory:
- config.example.yaml  - human-friendly example (recommended for editing)
- config.example.json  - JSON variant
- config.example.toml  - TOML variant

Notes:
- These examples mirror the `didhub-config::Config` shape used by the backend.
- Environment variables override file values. Common env vars:
  - DIDHUB_CONFIG_PATH  - path to config file (loader will infer format by extension)
  - DIDHUB_LOG_LEVEL, DIDHUB_LOG_JSON, DIDHUB_LOG_DIR
  - DIDHUB_SERVER_HOST, DIDHUB_SERVER_PORT
  - DIDHUB_DATABASE_* (DRIVER/PATH/HOST/PORT/NAME/USERNAME/PASSWORD/SSL_MODE)
  - DIDHUB_JWT_PEM, DIDHUB_JWT_PEM_PATH, DIDHUB_JWT_SECRET
  - DIDHUB_ADMIN_USERNAME, DIDHUB_ADMIN_PASSWORD, DIDHUB_ADMIN_DISPLAY_NAME (optional) — used to provision an initial admin user on first startup. See backend/ADMIN_PROVISIONING.md for details.

Runtime behavior:
- If `auth` is not configured (no PEM, PEM path or secret) the service starts in maintenance mode and responds with 503 for most endpoints.
- Changing `logging.level` at runtime will be applied by the reloader via tracing's reload handle.
- Changing `logging.log_dir` triggers swapping of the internal LogToolClient instance.

Validation:
- The backend exposes `didhub_config::load_config` and `didhub_config::validate_config` which you can call from a small Rust program or test to validate a file.

Quick local run (PowerShell):

```powershell
$env:DIDHUB_CONFIG_PATH = "C:\path\to\backend\didhub-backend\example\config.example.yaml"
cargo run -p didhub-backend
```

If you prefer, set explicit env vars to override secrets instead of committing them to disk.
