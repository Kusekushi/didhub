# Admin Provisioning

The didhub backend supports bootstrapping a single admin user automatically on first startup using environment variables. This is intended for initial deployments and development convenience. Use secrets manager or Kubernetes Secrets to provide password values in production.

## Environment variables

- `DIDHUB_ADMIN_USERNAME` (string) — If set and non-empty, triggers provisioning.
- `DIDHUB_ADMIN_PASSWORD` (string, secret) — Plaintext password for the initial admin. Required if `DIDHUB_ADMIN_USERNAME` is set. The password is hashed with Argon2 before it is stored in the database.
- `DIDHUB_ADMIN_DISPLAY_NAME` (string, optional) — Optional human-readable display name.

Notes:
- The provisioning is idempotent: the server will check whether any user with `is_admin = 1` exists; if so, the provisioning step does nothing.
- The password is never logged. Only the `username` (and optional `display_name`) is logged on success.
- After successful provisioning the server will leave the admin account enabled. It sets a `must_change_password` flag so first sign-in can force password rotation.

## Behavior

1. On startup, after the DB connection and application state are initialised, the server checks for `DIDHUB_ADMIN_USERNAME`.
2. If present, it requires `DIDHUB_ADMIN_PASSWORD` to be present as well; otherwise provisioning is skipped and a warning is logged.
3. If no admin user exists yet (query `SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1`), a new user row is inserted with:
   - `is_admin = 1`
   - `is_system = 1`
   - `is_approved = 1`
   - `must_change_password = 1`
   - `is_active = 1`
   - `email_verified = 1`
   - `roles = ["admin"]`
4. The password is hashed using Argon2 with the same parameters as regular user registration.

## Security recommendations

- Use a secrets store (Kubernetes Secrets, HashiCorp Vault, AWS Secrets Manager, etc.) to inject `DIDHUB_ADMIN_PASSWORD` into your environment at deployment time. Avoid embedding secrets in plain environment variables in CI logs or source code.
- Remove or rotate the provisioning environment variables after initial deployment.
- If you prefer out-of-band provisioning, create an admin via a migration or by running an admin-creation SQL script against the database.

## Troubleshooting

- If provisioning doesn't happen, check the startup logs: the server logs a message when it attempts provisioning and when it skips because `is_admin` already exists.
- If you accidentally provisioned an admin with an insecure password, change it immediately via the API or reset it in the DB.

