# DIDHub Middleware

This crate provides common middleware and utilities for the DIDHub web server. It includes CSRF protection, request logging, validation middleware, and utility functions.

## Modules

### `csrf`
Provides comprehensive CSRF (Cross-Site Request Forgery) protection middleware.

- `csrf_middleware`: Main CSRF protection middleware that validates tokens for non-safe HTTP methods
- `generate_token()`: Generates cryptographically secure CSRF tokens
- `build_cookie()`: Creates properly formatted CSRF token cookies
- `is_safe_method()`: Checks if an HTTP method is considered safe (read-only)
- `is_allowlisted()`: Checks if a path is exempt from CSRF validation

### `request_logger`
Logs incoming HTTP requests and records metrics.

- `request_logger`: Middleware that logs request details and records HTTP metrics

### `middleware_ext`
Extended middleware utilities.

- `error_logging_middleware`: Logs errors for requests that return 4xx/5xx status codes

### `validation`
Validation middleware for common request validations.

- `require_json_content_type`: Ensures requests have `application/json` content type
- `validate_api_version`: Validates API version from Accept header
- `default_security_headers`: Adds basic security headers to responses

### `utils`
Utility functions for middleware implementations.

- `is_safe_method()`: Checks if method is safe (GET, HEAD, OPTIONS, TRACE)
- `is_idempotent_method()`: Checks if method is idempotent
- `get_header_value()`: Safely extracts header values
- `path_matches_any()`: Checks if path matches any of given patterns
- `generate_cache_key()`: Creates cache keys from method and path
- `is_bot_user_agent()`: Detects bot/crawler user agents

### `types`
Re-exports common types from other crates.

- `CurrentUser`: Current authenticated user information
- `AdminFlag`: Marker for admin-only operations

## Usage

Add to your `Cargo.toml`:

```toml
[dependencies]
didhub-middleware = { path = "../didhub-middleware" }
```

Import and use in your Axum router:

```rust
use didhub_middleware::{csrf, request_logger, validation};

let app = Router::new()
    .layer(axum::middleware::from_fn(request_logger::request_logger))
    .layer(axum::middleware::from_fn(csrf::csrf_middleware))
    .layer(axum::middleware::from_fn(validation::require_json_content_type));
```

## Security Features

- **CSRF Protection**: Automatic token generation and validation
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Request Validation**: Content type and API version checking
- **Bot Detection**: User agent analysis utilities

## Integration

The middleware is integrated into the DIDHub server through the router builder:

- **JSON Content Type Validation**: Applied to all API routes (auth, protected, admin) to ensure POST/PUT/PATCH/DELETE requests have `application/json` content type
- **API Version Validation**: Applied to all API routes to validate Accept headers for supported API versions
- **File Upload Bypass**: Upload endpoints (`/api/upload`, `/api/me/avatar`) are allowlisted to bypass JSON content type validation

### Router Integration

```rust
// In router/builder.rs
let auth_routes = build_auth_routes(&auth_state)
    .layer(axum::middleware::from_fn(validation::require_json_content_type))
    .layer(axum::middleware::from_fn(validation::validate_api_version));

let protected_routes = build_protected_routes(&auth_state)
    .layer(from_fn_with_state(auth_state.clone(), auth::auth_middleware))
    .layer(axum::middleware::from_fn(validation::require_json_content_type))
    .layer(axum::middleware::from_fn(validation::validate_api_version));
```

## Testing

Run tests with:

```bash
cargo test --manifest-path didhub-middleware/Cargo.toml
```