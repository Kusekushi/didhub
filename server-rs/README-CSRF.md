CSRF cookie and testing

- Environment variable: `DIDHUB_DISABLE_SECURE`

  - Purpose: When set to any value, the server will not add the `Secure` flag to
    the `csrf_token` cookie. This is useful for local HTTP testing where secure
    cookies would be ignored by browsers.
  - Recommended usage in local dev/test: `export DIDHUB_DISABLE_SECURE=1` (or on
    Windows PowerShell: `$env:DIDHUB_DISABLE_SECURE=1`).

- Rotation behavior:

  - On successful `register` or `login` responses the server sets an internal
    header `X-Set-CSRF-Rotate`.
  - The CSRF middleware issues a fresh `csrf_token` cookie on the next safe
    request (GET/HEAD/OPTIONS/TRACE) or immediately after the login flow when
    appropriate.

- Cookie attributes:

  - `Path=/; SameSite=Strict; HttpOnly; Secure` (unless `DIDHUB_DISABLE_SECURE`
    is set).

- Tests:
  - See `tests/csrf_tests.rs` and `tests/csrf_rotation_test.rs` for behavior
    verification.
