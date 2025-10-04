# E2E setup for didhub-server

This file documents how to run end-to-end tests against the real Rust server using the repository's Node-based orchestrator and the default e2e SQLite database (`server-rs/config.e2e.json`).

Quick facts
- Default e2e DB path (relative to repo root): `server-rs/data/didhub-e2e.sqlite`
- Orchestrator (preferred local/CI entrypoint): `scripts/e2e-run.js`
- Server helper used by the orchestrator: `scripts/e2e-start.js`
- Playwright report output (orchestrator copies to): `artifacts/playwright-<timestamp>` and `packages/frontend/playwright-report`

Additional CI artifact locations and names
- Build artifacts uploaded by CI (retained for 1 day):
	- backend build outputs: artifact name `backend-target` (path: `server-rs/target`)
	- api-client build outputs: artifact name `api-client-dist` (path: `packages/api-client/dist`)
	- frontend static build: artifact name `frontend-static` (path: `static`)
- Test/log artifacts (default retention):
	- backend unit test results + coverage: uploaded as `backend-test-results` (contains `artifacts/backend-tests/**`, `artifacts/coverage/**`, and `server-rs/target/debug/deps/`)
	- server-side e2e logs & coverage: uploaded as `server-e2e-logs` (contains `artifacts/server-e2e/**`, `artifacts/coverage/**`, and `server-rs/target/debug/deps/`)
	- Playwright artifacts: `playwright-report` and `playwright-traces` (copied from `packages/frontend/playwright-report` and `packages/frontend/test-results`)

Prerequisites
- pnpm installed and workspace dependencies installed (`pnpm install` at repo root).
- Playwright browsers installed for the frontend package (the workspace install typically installs them), or run `pnpm -w -s exec playwright install --with-deps` in CI if needed.

Preferred: run the full orchestrator (local or CI)

The orchestrator starts the server and the frontend, waits for readiness, runs Playwright, then exports the Playwright report into `artifacts/` for CI uploads.

```bash
pnpm -w -s run e2e:run
```

What the orchestrator does
- Removes any prior e2e DB (to ensure tests start clean).
- Starts the Rust server using `scripts/e2e-start.js --config server-rs/config.e2e.json` (the helper forwards the config to the server binary).
- Starts the frontend dev server (pinned to a stable port so Playwright can target it).
- Waits for the server `/health` endpoint and the frontend root URL to respond.
- Runs Playwright tests from `packages/frontend/e2e` using the `test:e2e` script.
- Copies/moves `packages/frontend/playwright-report` into `artifacts/playwright-<timestamp>` so CI can upload artifacts.

Notes about CI behavior
- CI reuses build outputs between jobs by uploading/downloading the build artifacts listed above; this speeds up tests and avoids rebuilding in dependent jobs.
- CI restores pnpm and Rust caches to speed up installs/compiles (cache keys are based on `pnpm-lock.yaml` and the Rust cache action).
- Code coverage with `cargo tarpaulin` is intentionally gated in CI: it only runs for pushes to the primary branch (master in this repo). This avoids expensive coverage runs on every PR while keeping coverage on mainline commits.
- JUnit and coverage outputs produced by the jobs live under `artifacts/` in the CI workspace; the workflow publishes a short JUnit summary into the workflow UI using `scripts/publish_junit_summary.py` when a JUnit XML is available.

Seeding an admin user

The only step required to seed a deterministic admin user for E2E runs is to provide the bootstrap env vars. The orchestrator sets `E2E_USER` and
`E2E_PASS` (defaults: `admin` / `adminpw`) and forwards them to the server as `DIDHUB_BOOTSTRAP_ADMIN_USERNAME` and `DIDHUB_BOOTSTRAP_ADMIN_PASSWORD`.

If you run the server with those env vars set and the server's config allows bootstrapping, the server will create the admin user on startup.

Examples:

```pwsh
# Orchestrator-driven (recommended)
$env:E2E_USER = 'admin'; $env:E2E_PASS = 'adminpw'; pnpm -w -s run e2e:run
```

```bash
# Direct override (set bootstrap vars explicitly, then start server helper)
DIDHUB_BOOTSTRAP_ADMIN_USERNAME=admin DIDHUB_BOOTSTRAP_ADMIN_PASSWORD=adminpw node ./scripts/e2e-start.js --config server-rs/config.e2e.json
```

Environment variables used by orchestrator/tests
- `E2E_USER` / `E2E_PASS` — credentials the orchestrator passes to Playwright (defaults: `admin` / `adminpw`).
- `PLAYWRIGHT_BASE_URL` — base URL Playwright will use to run tests; the orchestrator sets this to the frontend dev server URL.

Quick debug & commands
- Install deps and Playwright browsers (CI-like):

```bash
pnpm install
pnpm -w -s exec playwright install --with-deps
```

- Run only the server helper (for manual debugging):

```bash
# start server helper (for a configured e2e config file)
node ./scripts/e2e-start.js --config server-rs/config.e2e.json
```

- Run orchestrator locally (recommended):

```bash
pnpm -w -s run e2e:run
```

DB behavior and Windows notes
- The Rust server will create the parent directory and pre-create the sqlite file if needed when the DB URL points to a file-based sqlite URL. The code also normalizes Windows-style `sqlite:///E:/...` paths so the server can open the database reliably on Windows.
- The orchestrator intentionally removes any previous e2e DB before runs (clean slate). The orchestrator may also create the file/directory for compatibility on some platforms.

Troubleshooting
- If you see `unable to open database file` on server startup, ensure the parent directory exists and the process has write permissions. Running the orchestrator will create the necessary path. The server now also attempts to create the parent directory/file during `Db::connect()`.
- If Playwright login fails, verify `E2E_USER` / `E2E_PASS` match a user in the e2e DB (or use the `seed` binary to create the admin user first).
- If tests fail in CI, collect the Playwright artifacts (`artifacts/playwright-*`, `packages/frontend/playwright-report`, and `packages/frontend/test-results`) for debugging. The orchestrator copies the report into `artifacts/`.

CI hints
- Ensure the CI runner does `pnpm install` at repo root and installs Playwright browsers for the frontend package.
- Run the orchestrator as a single step and then upload `artifacts/` and `packages/frontend/playwright-report` as CI artifacts for later inspection.
