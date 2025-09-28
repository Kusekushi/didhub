# DIDHub Copilot instructions

## Map & architecture
- The repo is a pnpm workspace plus a Rust workspace under `server-rs/`; backend crates live in `server-rs/*`, while `packages/frontend` and `packages/api-client` deliver the web UI and typed client.
- `server-rs/didhub-server` composes Axum routes, SQLx data access from `didhub-db`, auth from `didhub-auth`, caching from `didhub-cache`, metrics, updater, and middleware crates; static assets in `static/` can be embedded via the `embed_static` feature.
- `packages/api-client` is the single source of truth for REST calls; React code (see `packages/frontend/src/components/system-tabs/AltersTab.tsx`) imports typed helpers like `parseRoles` and `createShortLink` rather than hitting `fetch` directly.
- `docs/architecture.md`, `docs/database.md`, and `server-rs/README.md` capture the rationale behind service boundaries, migrations, and the updater pipeline—skim these before touching deep server code.

## Daily workflows
- Install once with `pnpm install` at the repo root; it hydrates all packages and triggers Playwright browser downloads required by frontend E2E tests.
- Local dev: run `cargo run` inside `server-rs/` (SQLite auto-config at `data/didhub.sqlite`, migrations execute on boot) and `pnpm -F @didhub/frontend dev` for the Vite app; set `VITE_API_PROXY_TARGET=http://localhost:6000` if you adjust ports.
- Generate config files or seeds via `cargo run --bin config_generator` and `cargo run --bin seed --release -c server-rs/config.example.json` to quickly bootstrap environments.
- The bundler writes built frontend assets to `static/`; the server serves that directory in production, so keep the folder in sync when altering build outputs.

## Backend specifics
- `didhub-config::AppConfig::from_env` merges env vars and optional JSON config (`DIDHUB_DB_CONFIG` or `--config` CLI) before server boot; prefer adding new settings there to keep env precedence consistent.
- Database access goes through `didhub_db::Db` (SQLx AnyPool with `sqlx::any::install_default_drivers()`); most operations live in module files like `didhub-db/src/alters.rs`—reuse those helpers instead of ad hoc queries.
- Middleware and extractors are defined in `didhub-middleware` and reused across routes; when adding endpoints, hook into `server::build_router` so logging, auth, and rate limiting stay consistent.
- Cached counters (e.g., uploads) respect TTLs defined in settings; if you add new cache keys, invalidate via the same prefix strategy described in `server-rs/README.md`.
- Feature flags: compile with `--features embed_static` to bundle assets and `--features updater` (default in release bundler) for auto-update jobs—ensure new code guards against the feature being disabled.

## Frontend & API patterns
- React code is MUI-heavy, using hooks and context providers; when creating views, follow existing layout patterns (Stack, List, Dialog) and respect accessibility props already set.
- Fetch logic lives in `@didhub/api-client`; components like `AltersTab` rely on typed entities (`Alter`) and helper utilities (`parseRoles`, `createShortLink`)—extend the client first, then consume the new function in the UI.
- Route declarations live under `packages/frontend/src/pages` with React Router; central navigation happens through hooks like `useNavigate`, so avoid window.location mutations.
- Frontend settings (dark mode, short links, etc.) come from server responses; update shared context/providers when introducing new settings so global state remains reactive.
- Dev server proxies depend on `VITE_API_PROXY_TARGET`; document any new env vars in `packages/frontend/README.md` and provide defaults that match backend expectations.

## Testing & QA
- Run backend tests with `cargo test --manifest-path server-rs/Cargo.toml`; integration suites in `server-rs/tests` auto-skip unless you set `RUN_DB_INTEGRATION_TESTS=1` and provide `DIDHUB_DB` for Postgres/MySQL cases.
- Frontend unit tests use Vitest: `pnpm -F @didhub/frontend test`; Playwright E2E lives in `packages/frontend/e2e` and expects `pnpm -F @didhub/frontend e2e` after browsers are installed.
- The API client has its own Vitest suite (`pnpm -F @didhub/api-client test`)—mirror new endpoints here to keep typings honest.
- Linting is centralized via `pnpm run lint`, and Prettier checks run with `pnpm run format:check`; follow workspace scripts instead of package-local binaries.
- Seeded data may be needed for UI/E2E runs; use the `seed` binary against SQLite before launching tests that assume existing systems or alters.

## Release & CI
- `pnpm bundle:release` (see `scripts/bundle-release.mjs`) builds the API client, frontend, copies assets into `server-rs/static`, and compiles Rust with `embed_static,updater`; Syft is invoked when present to generate SBOMs.
- Release bundles land in `dist/release/didhub-<version>-<timestamp>/` with binaries (`didhub-server`, `seed`, `config_generator`), `static/`, `RUN.md`, and license manifests—keep new artifacts inside that directory.
- GitHub `integration-tests.yml` runs `cargo build/test` plus frontend build, unit, and Playwright suites; keep new tests deterministic and headless-friendly so CI stays green.
- Releases trigger when a main-branch commit starts with `[release]`; the workflow (`release.yml`) infers the version from the commit message and packages artifacts for GitHub Releases.
- Dependabot and CI run on Node 20 and the stable Rust toolchain; align local toolchain versions with the workflows to avoid “works on my machine” drift.
