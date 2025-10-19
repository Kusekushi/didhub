didhub-config
==============

Small configuration helper crate for didhub-backend.

Loader API
----------

- load_raw_from_file(path) -> RawConfigFile
  - Reads a file (TOML/YAML/JSON inferred by extension or tried in order) and returns the raw deserialized structure.

- load_config(path: Option<P>) -> Config
  - Returns a concrete `Config` with defaults, file values applied (if path provided), and environment variables applied last (env vars override file and defaults).

Environment variables (examples)
-------------------------------

Top-level:
- DIDHUB_CONFIG_PATH - optional path to configuration file (toml/yaml/json)
- DIDHUB_SERVER_HOST
- DIDHUB_SERVER_PORT
- DIDHUB_LOG_LEVEL
- DIDHUB_LOG_JSON
- DIDHUB_CORS_ALLOWED_ORIGINS (comma-separated list)
- DIDHUB_CORS_ALLOW_ALL_ORIGINS
- DIDHUB_REDIS_URL

Database:
- DIDHUB_DATABASE_DRIVER
- DIDHUB_DATABASE_PATH (sqlite file or DSN)
- DIDHUB_DATABASE_HOST
- DIDHUB_DATABASE_PORT
- DIDHUB_DATABASE_NAME
- DIDHUB_DATABASE_USERNAME
- DIDHUB_DATABASE_PASSWORD
- DIDHUB_DATABASE_SSL_MODE
- DIDHUB_DATABASE_URL (alias to path)

Uploads:
- DIDHUB_UPLOADS_DIRECTORY

Auto-update:
- DIDHUB_AUTO_UPDATE_ENABLED
- DIDHUB_AUTO_UPDATE_CHECK_ENABLED
- DIDHUB_AUTO_UPDATE_REPO
- DIDHUB_AUTO_UPDATE_CHECK_INTERVAL_HOURS

Notes
-----
- Environment variables take precedence over file values and defaults.
- The crate currently provides basic validation used by `didhub-backend`:
  - non-sqlite database drivers must have `host` and `database` set (via file or env).

Usage
-----
In `didhub-backend` main startup, call:

    let cfg = didhub_config::load_config(opt_path)?;

Then use `cfg` to configure the application.
