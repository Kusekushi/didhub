## CI maintenance notes (E2E, builds, and coverage)

A short reference for CI maintainers who need to understand how the repository's integration pipeline runs, where artifacts land, and common tweaks.

### Purpose

This repository runs a multi-job GitHub Actions pipeline which:
- builds backend, frontend, and the typed API client
- runs unit tests for backend/frontend/api-client
- runs backend-side feature-gated E2E tests and frontend Playwright E2E tests via a Node orchestrator
- collects test logs, coverage, Playwright reports, and build outputs as artifacts

Keep this page short — the canonical workflow is `.github/workflows/integration-tests.yml`.

### Important artifact names & paths

Build outputs (retained for 1 day):
- `backend-target` — `server-rs/target`
- `api-client-dist` — `packages/api-client/dist`
- `frontend-static` — `static`

Test/log artifacts (default retention unless otherwise configured):
- `backend-test-results` — includes `artifacts/backend-tests/**`, `artifacts/coverage/**`, and `server-rs/target/debug/deps/`
- `server-e2e-logs` — includes `artifacts/server-e2e/**`, `artifacts/coverage/**`, and `server-rs/target/debug/deps/`
- `playwright-report` and `playwright-traces` — copied from `packages/frontend/playwright-report` and `packages/frontend/test-results`

Note: retention for build artifacts is set to 1 day in the workflow to keep storage low while retaining fast rebuild capability.

### Caching

- Node/pnpm: the jobs use `actions/cache@v4` to cache `~/.pnpm-store` keyed by `pnpm-lock.yaml`. This significantly reduces `pnpm install` time.
- Rust: the pipeline uses `Swatinem/rust-cache@v2` (or similar) to cache Rust build dependencies between runs. Adjust cache keys if you change toolchain versions.

If caches become stale after an ecosystem change, bump keys (for pnpm, update the `hashFiles(...)` globs; for rust-cache, follow the action's docs).

### Coverage (tarpaulin) behavior

- `cargo tarpaulin` runs in two jobs: unit tests and server-side E2E tests. These coverage steps are gated to run only on pushes to the primary branch to avoid doing expensive coverage work for every PR.
- The gating condition used in the workflow is:

```yaml
if: ${{ github.event_name == 'push' && startsWith(github.ref, 'refs/heads/master') }}
```

To change the branch (for example, if your primary branch is `main`), update the condition to check `refs/heads/main` or include both branches in the condition.

If you prefer a dedicated coverage job (simpler to reason about and easier to scale), move the tarpaulin steps into their own job and gate that job with the same condition.

### Orchestrator & Playwright

- Preferred CI entrypoint for frontend E2E is the Node orchestrator: `scripts/e2e-run.js` run via the workspace script:

```bash
pnpm -w -s run e2e:run
```

- The orchestrator performs:
  - cleaning the e2e SQLite DB (path `server-rs/data/didhub-e2e.sqlite`)
  - starting the server helper (`scripts/e2e-start.js --config server-rs/config.e2e.json`)
  - starting the frontend dev server (pinned port) and waiting for readiness
  - running Playwright tests from `packages/frontend/e2e`
  - copying `packages/frontend/playwright-report` into `artifacts/` for upload

Environment variables commonly used in CI/orchestrated runs:
- `E2E_USER` / `E2E_PASS` — credentials forwarded to the server and Playwright (defaults used in scripts: `admin` / `adminpw`).
- `PLAYWRIGHT_BASE_URL` — set by the orchestrator to the pinned frontend URL (e.g., `http://localhost:5173`).

CI jobs install Playwright browsers with:

```bash
npx playwright install --with-deps
```

### JUnit and workflow summary

- Test logs are converted to JUnit XML (when available) using `cargo2junit` for Rust test logs.
- A small helper, `scripts/publish_junit_summary.py`, is invoked by the workflow to append a short JUnit summary to the workflow UI when a JUnit XML is present.

### Quick troubleshooting

- If coverage doesn't appear in CI: confirm the run was a push to the primary branch (see gating condition), or change the branch check.
- If `unable to open database file` appears on server startup: ensure `server-rs/data` exists and the runner has write permissions. CI runs download `backend-target` and the orchestrator attempts to create parent directories; verify job checkout path and permissions.
- If Playwright tests can't find the frontend: ensure `static` (frontend build) was downloaded or the orchestrator started the dev server and that `PLAYWRIGHT_BASE_URL` points to the expected host:port.

### Where to look in the repo

- Workflow: `.github/workflows/integration-tests.yml`
- Orchestrator: `scripts/e2e-run.js`
- Server helper: `scripts/e2e-start.js`
- JUnit summary script: `scripts/publish_junit_summary.py`
- E2E docs: `server-rs/README.e2e.md`
