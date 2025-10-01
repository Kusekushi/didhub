# CSRF cookies & local testing

The DIDHub server enforces CSRF protection for browser sessions via a
`csrf_token` cookie and header pairing. This note captures the behavior that
isn't obvious from the main docs.

## Local development toggle

- **Environment variable:** `DIDHUB_DISABLE_SECURE`
- **Effect:** Removes the `Secure` attribute from the `csrf_token` cookie so it
  can be sent over plain HTTP during local testing.
- **Usage:**

  ```bash
  # Linux/macOS
  export DIDHUB_DISABLE_SECURE=1

  # Windows PowerShell
  $env:DIDHUB_DISABLE_SECURE = '1'
  ```

Leave this unset in any environment exposed over HTTPS—`Secure` is required for
production.

## Rotation model

1. `POST /api/auth/login` or `POST /api/auth/register` sets an internal header
   `X-Set-CSRF-Rotate`.
2. The middleware detects that flag and refreshes `csrf_token` on the next safe
   request (`GET`, `HEAD`, `OPTIONS`, `TRACE`) or immediately when the flow
   returns to the browser.
3. Subsequent state-changing requests must include the `csrf_token` in the
   `X-CSRF-Token` header (handled automatically in the frontend client).

Cookie attributes: `Path=/; SameSite=Strict; HttpOnly; Secure`. The `Secure`
flag is omitted only when `DIDHUB_DISABLE_SECURE` is set.

## Test suite references

- `tests/csrf_tests.rs` — verifies cookie issuance, header enforcement, and
  error responses.
- `tests/csrf_rotation_test.rs` — checks rotation after login/registration.

For a broader security overview, see the middleware section in
[`docs/architecture.md`](../docs/architecture.md) and the troubleshooting entry
for CSRF mismatches in [`docs/troubleshooting.md`](../docs/troubleshooting.md).
