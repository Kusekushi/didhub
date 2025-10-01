# DIDHub Frontend

React + Vite application that powers the DIDHub user interface. It consumes the
typed `@didhub/api-client` package and renders a MUI-based dashboard for alters
and system management.

## Quick start

From the repository root:

```bash
pnpm install
pnpm -F @didhub/frontend dev
```

By default the dev server runs on `http://localhost:5173`. Point requests at the
Rust API by setting a proxy target (matches the root README):

```bash
echo "VITE_API_PROXY_TARGET=http://localhost:6000" > .env.local
```

The backend can run separately with `cargo run` from `server-rs/`.

## Available scripts

```bash
pnpm -F @didhub/frontend dev      # Vite dev server
pnpm -F @didhub/frontend build    # Production build (outputs to dist/)
pnpm -F @didhub/frontend preview  # Preview built assets
pnpm -F @didhub/frontend test     # Vitest unit tests
pnpm -F @didhub/frontend e2e      # Playwright end-to-end tests
pnpm -F @didhub/frontend lint     # ESLint (via workspace script)
```

Playwright downloads are triggered on `pnpm install`, but if you skip
postinstall run `pnpm -F @didhub/frontend exec npx playwright install` once.

## Project structure

```
src/
├── components/        reusable UI building blocks
├── contexts/          React context providers (auth, settings, theme)
├── hooks/             custom hooks (API, forms, feature flags)
├── pages/             router views
├── routes/            route definitions
├── system-tabs/       major dashboard tabs (e.g., AltersTab)
├── utils/             shared helpers
└── main.tsx           application entry point
```

Styling follows the central MUI theme defined in `src/theme/`. Components favor
the `@didhub/api-client` helpers instead of direct `fetch` calls.

## Environment & configuration

- `VITE_API_PROXY_TARGET` — development proxy target for API calls
- `VITE_APP_TITLE` (optional) — customize the document title
- `VITE_SENTRY_DSN` (optional) — enable error reporting when configured

Document new variables in [`README.md`](../../README.md) and
[`docs/configuration.md`](../../docs/configuration.md) when adding them.

## Testing notes

- Unit tests live alongside components (`*.test.tsx`) and use Vitest + Testing
  Library.
- E2E specs live in `e2e/` and expect the backend to be running with seeded
  data (`./seed -c config.example.json`). Use `pnpm -F @didhub/frontend e2e -- --ui`
  for interactive mode.

## Deployment

Production builds are emitted during the release bundle (`pnpm bundle:release`)
and embedded into the Rust server when the `embed_static` feature is enabled.
Standalone builds land in `packages/frontend/dist/`; the release script copies
them into `server-rs/static/` before embedding.

For deployment scenarios see [`docs/deployment.md`](../../docs/deployment.md)
and [`docs/packaging.md`](../../docs/packaging.md).
