# Testing in DidHub

This document covers how to run tests, where tests live, and best practices for both the Rust backend and TypeScript frontend.

All test commands go through `build.py` — the project's single entry point for builds, tests, and linting.

## Running Tests

### Via build.py (Recommended)

```bash
# Run all tests (backend + frontend)
python build.py test

# Backend tests only
python build.py test --backend

# Frontend tests only
python build.py test --frontend

# All tests with coverage report
python build.py test --coverage

# Backend with coverage
python build.py test --backend --coverage

# Frontend with coverage
python build.py test --frontend --coverage
```

### Running Specific Tests Directly

Sometimes you need to run a single test or file without the full orchestrator.

#### Backend (cargo test)

From the `backend/` workspace root:

```bash
# Run all backend tests
cargo test

# Run a specific test by name
cargo test test_function_name

# Run tests in a specific crate
cargo test -p didhub-backend

# Run a specific integration test file (e.g., tests/api.rs)
cargo test --test api

# Run a single test within an integration file
cargo test --test api test_function_name

# Show stdout/stderr during tests
cargo test -- --nocapture

# Run only unit tests (skip integration tests)
cargo test --lib

# Run only integration tests
cargo test --tests
```

#### Frontend (Vitest / Bun)

From `frontend/app/`:

```bash
# Run all frontend tests
bun test
# or
npx vitest run

# Run a specific test file
bun test src/components/Button.test.tsx
# or
npx vitest run src/components/Button.test.tsx

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "should render"

# Run with coverage
npx vitest run --coverage
```

## Test Organization

### Backend (Rust)

| Location | Type | Purpose |
|---|---|---|
| `src/**/*.rs` (inside `#[cfg(test)]` modules) | Unit tests | Test internal logic close to the source |
| `tests/*.rs` (crate root) | Integration tests | Test public APIs and cross-module behavior |

Example unit test placement:

```rust
// src/services/auth.rs

pub fn validate_token(token: &str) -> Result<Claims, AuthError> {
    // ...
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_validate_token_rejects_expired() {
        let result = validate_token("expired.jwt.token");
        assert!(result.is_err());
    }
}
```

### Frontend (TypeScript)

| Location | Type | Purpose |
|---|---|---|
| `src/components/__tests__/` | Component tests | Test React components |
| `src/components/Foo.test.tsx` | Colocated tests | Test alongside the component file |
| `src/utils/*.test.ts` | Utility tests | Test helper functions |

Either colocated files (`Button.test.tsx` next to `Button.tsx`) or `__tests__/` directories are acceptable — follow the pattern already used in the module you're working in.

## Code Coverage

### Generating Coverage Reports

```bash
# All tests with coverage
python build.py test --coverage

# Backend only with coverage
python build.py test --backend --coverage

# Frontend only with coverage
python build.py test --frontend --coverage
```

### Backend Coverage Tools

If you need more control over Rust coverage:

```bash
# Using cargo-tarpaulin
cargo tarpaulin --out Html

# Using cargo-llvm-cov
cargo llvm-cov --html
```

### Frontend Coverage Tools

Vitest integrates with `c8` or `istanbul` for coverage:

```bash
npx vitest run --coverage
```

## Best Practices

### General

- **Run tests before pushing.** Use `python build.py test` to catch regressions early.
- **Add a test when fixing a bug.** This prevents the same bug from recurring.
- **Keep tests fast and deterministic.** Avoid real network calls, timers, or filesystem side effects.
- **Name tests descriptively.** A failing test name should tell you what broke without reading the test body.
- **Test error paths explicitly.** Don't only test the happy path — verify that invalid inputs, missing data, and edge cases produce the correct errors.

### Rust-Specific

- Place unit tests in `#[cfg(test)]` modules inside the source file they test.
- Use `#[tokio::test]` for async test functions.
- Prefer `assert_eq!` and `assert_matches!` over plain `assert!` for better failure messages.
- Use `--nocapture` when debugging test output: `cargo test -- --nocapture`.
- Avoid `unwrap()` in non-test code, but it's acceptable in tests for brevity when the test should panic on failure.

### TypeScript-Specific

- Use `describe` / `it` blocks to group related assertions.
- Mock external dependencies (API calls, browser APIs) to keep tests isolated.
- Prefer `screen.getByRole` and accessible queries over `getByTestId` when testing React components.
- Keep component tests focused on user-visible behavior, not implementation details.
- Avoid snapshot tests for complex components — they break on every style change and provide little signal.

## Troubleshooting

| Problem | Solution |
|---|---|
| Backend tests fail with compilation errors | Run `python build.py build` first to regenerate code |
| Tests can't connect to database | Check `DATABASE_URL` env var and ensure PostgreSQL is running |
| Frontend tests fail on missing modules | Run `pnpm install` in `frontend/app/` |
| Flaky tests | Look for timing dependencies, shared state, or network calls — mock them |
| Coverage report not generated | Ensure the coverage tool is installed (`cargo-tarpaulin`, `c8`, etc.) |
