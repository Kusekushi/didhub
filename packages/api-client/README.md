# @didhub/api-client

Typed TypeScript bindings for the DIDHub REST API. This package powers the
frontend but can also be used independently in scripts, CLIs, or other web
apps.

## Install

This repository is a pnpm workspace. From the repo root run:

```bash
pnpm install
```

To build the client on its own:

```bash
pnpm --filter @didhub/api-client build
```

## Quick start

Instantiate the shared client (singleton):

```ts
import { apiClient } from '@didhub/api-client';

const alters = await apiClient.alters.list({ page: 1, per_page: 20 });
```

Or create an instance with custom configuration:

```ts
import { createApiClient } from '@didhub/api-client';

const client = createApiClient({
  baseUrl: 'https://didhub.example.com',
  storage: window.sessionStorage, // override token store
});

await client.users.login({ username: 'demo', password: 'demo1234' });
const me = await client.users.me();
```

Each module exposes typed helpers, for example:

- `alters`: CRUD, relationships, notes
- `files`: uploads, downloads, metadata
- `users`: auth, profile, approvals
- `admin`: audit logs, runtime settings, housekeeping
- `shortlinks`, `groups`, `subsystems`, `oidc`

`src/Types.ts` contains the shared entity shapes (`Alter`, `User`, etc.).

## Authentication helpers

The default `apiClient` automatically:

- Stores JWTs in `localStorage['didhub_jwt']`
- Refreshes tokens using `/api/auth/refresh` before expiry
- Dispatches a `didhub:unauthorized` event if refresh fails

You can swap the storage layer or hook into events via the `HttpClientConfig`
options.

## Error handling

All calls resolve to an `ApiFetchResult<T>` which wraps the HTTP status, JSON
payload, and `ok` flag:

```ts
const res = await apiClient.alters.create({ name: 'New alter' });
if (!res.ok) {
  console.error('Failed:', res.status, res.json?.message);
}
```

## Testing

```bash
pnpm --filter @didhub/api-client test
```

Vitest covers the HTTP client and selected modules. When adding endpoints,
please add or update the fixture-driven tests in `tests/`.

## Contributing

When extending the client:

1. Implement the endpoint in `src/modules/<Area>.ts`
2. Export new helpers through `src/index.ts`
3. Update the associated types and tests
4. Document the change in this README or the relevant package docs
