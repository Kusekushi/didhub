Debugging DidHub

Audience
- Backend Rust Axum, frontend React with Vite, build system Python (build.py).
- This guide focuses on project specific issues and practical steps to reproduce and fix.

Environment references
- DATABASE_URL: database connection string for the app.
- RUST_LOG: log level for Rust backends (example: info, debug, trace). Use module filters like didhub_backend=debug.
- RUST_BACKTRACE: enable backtraces on panic (1) or disable (0).
- Other variables may be used; set them as needed before starting services.
- Tip: keep a minimal, repeatable environment by exporting vars in your shell before starting services.

Backend debugging (Rust / Axum)
- Compilation errors
  - When you see compile errors, run python build.py build first to trigger codegen from schemas.
  - If issues persist, run python build.py codegen to refresh generated code, then run python build.py build again.
- Database connection errors (DATABASE_URL)
  - Check that DATABASE_URL is set in your environment.
  - Validate connectivity with a database client; example: export DATABASE_URL="postgres://user:pass@host/db" and test a connection.
- Migration errors
  - Ensure migrations exist under didhub-migrations and match your database.
  - Run migrations using the project’s tooling (as documented by the repo). Check SQL syntax and version compatibility.
- Logging and verbosity
  - Start with RUST_LOG=info (or more verbose as needed). You can prefix per-module filters: RUST_LOG=info,didhub_backend=debug.
  - When using the dev launcher, you can pass -L to increase verbosity: python build.py dev --rust -L "info,didhub_backend=debug".
- Verification
  - Confirm that the backend starts without errors and logs show expected initiation messages.
- Tips
  - Use tracing to locate issues; verify spans and event logs for the failing component.

Frontend debugging (Vite / React)
- Common issues
  - HMR not working
    * Symptom: changes do not hot-reload in the browser.
    * Fix: ensure dev server is running (python build.py dev --web). If still failing, run python build.py codegen and restart the dev server.
  - Type errors
    * Symptom: TypeScript errors block dev server.
    * Fix: ensure generated API client is up-to-date via codegen; restart the server. If needed, clean dependencies and reinstall.
  - Missing dependencies
    * Symptom: module not found or missing packages.
    * Fix: in repo root, run cd frontend/app && pnpm install (or npm install). Then re-run the frontend dev server.
- Build/run specifics
  - Start frontend via the repo orchestrator: python build.py dev --web
  - If you see type issues, re-run python build.py codegen to refresh generated API client.
- Verification
  - The app should compile cleanly with no type errors and the browser should show the app served with live reload.

Build system issues
- Missing codegen
  - Symptom: generated code is stale or absent.
  - Fix: run python build.py codegen and then re-run the build.
- Parallel build conflicts
  - Symptom: conflicting builds run concurrently.
  - Fix: do not run multiple build.py processes in parallel. Run a sequential flow: build, codegen, then dev servers.
- Environment setup (.venv)
  - Symptom: Python tooling not found or dependencies missing.
  - Fix: create and activate the venv, then install dependencies.
  - Commands:
    - python3 -m venv .venv
    - source .venv/bin/activate
    - pip install -r requirements.txt
- Verification
  - After environment setup, run a full build to verify nothing is broken.

Logging configuration and guidance
- Backend logs
  - Use RUST_LOG to set the log level. For example: export RUST_LOG=info
- Frontend logs
  - Logs appear in the browser console; supplement with React DevTools for deeper inspection.
- Consistent debugging
  - Start with minimal log levels; increase verbosity for targeted modules when you reproduce an issue.

Rust tracing tips
- Leverage tracing spans and events to trace requests through the middleware chain.
- Set RUST_LOG to include the backend module: export RUST_LOG=info,didhub_backend=debug
- When troubleshooting, enable trace level temporarily to capture detailed flow.

Frontend debugging tips
- Use React DevTools to inspect components and hooks.
- Use browser console for runtime errors and network requests to the API client.
- Inspect the generated API client at frontend/api/src/generated to ensure it matches server APIs.

Appendix: quick reference commands
- Build and codegen
  - python build.py codegen
  - python build.py build
- Run backend dev with verbose logs
  - export DATABASE_URL="postgres://..."
  - export RUST_LOG=info,didhub_backend=debug
  - python build.py dev --rust -L "info,didhub_backend=debug"
- Run frontend dev
  - cd frontend/app
  - pnpm install
  - python build.py dev --web
