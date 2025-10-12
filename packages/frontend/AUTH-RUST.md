# Frontend Auth (Rust Backend Integration)

## Summary of Changes

- Auth flow uses a JWT returned by `POST /api/auth/login` (JSON body
  `{ username, password }`).
- Token is stored in `localStorage` under the key `didhub_jwt`.
- All `apiFetch` calls to paths beginning with `/api` automatically attach
  `Authorization: Bearer <token>` if present.
- Legacy endpoints (`/api/auth/csrf`, `/api/auth/session`, `/api/auth/signout`)
  are no longer used; related code has been removed or stubbed.
- Admin endpoints previously under `/api/admin/...` have been remapped to Rust
  routes (e.g. `/api/audit`, `/api/system-requests`).

## Development Setup

1. Start the Rust server:

   ```powershell
   cd server-rs
   cargo run
   ```

   Default host/port: `0.0.0.0:6000` (override via `HOST` / `PORT`).

2. Ensure CORS allows the frontend. Either set:

   ```powershell
   $env:ALLOW_ALL_FRONTEND_ORIGINS = 'true'
   # or
   $env:FRONTEND_BASE_URL = 'http://localhost:5173'
   ```

3. Start the frontend (root directory):
   ```powershell
   pnpm -F @didhub/frontend dev
   ```
   The Vite dev proxy uses `VITE_API_PROXY_TARGET` (`.env` / `.env.local`)
   falling back to `http://localhost:6000`.

## Logging In

```ts
import { loginUser, fetchMe } from '@didhub/api-client';

async function doLogin(u: string, p: string) {
  const r = await loginUser(u, p);
  if (r.status === 200) {
    const me = await fetchMe();
    console.log('Logged in as', me?.username);
  } else {
    console.error('Login failed', r.status, r.json);
  }
}
```

## Logging Out

```ts
import { logoutUser } from '@didhub/api-client';
logoutUser(); // clears stored token
```

## Token Refresh / Expiry

Tokens currently expire after 7 days (see `auth.rs`). There is no refresh
endpoint yet; users must log in again after expiry. A future enhancement could
add a short-lived access + refresh token pair.

## Housekeeping / Admin APIs

Updated mappings:

- Audit: `/api/audit`, purge `/api/audit/purge` (omit body.before to clear all).
- System Requests: list `/api/system-requests`, decide `/api/system-requests` (POST with body { id, approve, note? }).
- Settings: `/api/settings` / `/api/settings/:key`.
- Housekeeping jobs: `/api/housekeeping/jobs`, trigger
  `/api/housekeeping/trigger/:name`.
- Housekeeping runs: list & clear `/api/housekeeping/runs` (GET / POST).
- Posts: `/api/posts`, repost `/api/posts/:id/repost`.

## Environment Variables

Frontend dev proxy:

```
VITE_API_PROXY_TARGET=http://localhost:6000
```

Rust server relevant vars:

```
PORT=6000
HOST=0.0.0.0
ALLOW_ALL_FRONTEND_ORIGINS=true
# or FRONTEND_BASE_URL=http://localhost:5173
DIDHUB_SECRET=change-me
```

## Migration Notes

Front-end components relying on NextAuth session objects should now consult the
result of `fetchMe()` (or application state you set after successful login).
Remove any code expecting `user` within an `auth/session` response.

## Pending Gaps / TODO

- Add logout invalidation endpoint (server-side) if needed.
- Add refresh token rotation.
- Graceful handling of token expiry (global 401 interceptor to redirect to
  login).
