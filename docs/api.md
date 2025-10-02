# DIDHub HTTP API Reference

The DIDHub server exposes a REST-style API backed by the Rust services under `server-rs/`. This document describes the routes that are currently wired in the router, who can call them, and the important parameters to expect.

## Base URL & Authentication

- JSON endpoints live under the `/api` prefix. Responses are UTF-8 JSON unless noted otherwise.
- Send `Authorization: Bearer <JWT>` for any endpoint marked `JWT` or `Admin` in the tables below.
- Pagination uses either `page`/`per_page` or `limit`/`offset` depending on the route; see **Pagination & Lists**.
- Browser clients also send the `x-csrf-token` header when a session cookie is present; API clients using bearer tokens do not need it.

## Authentication & Session

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | None | Create a username/password account. Body: `{ "username", "password", "is_system"? }`. Returns `{ token }` on success. |
| `POST` | `/api/auth/login` | None | Exchange credentials for a JWT. Returns `{ token }` or `{ error }`. |
| `POST` | `/api/auth/refresh` | JWT | Refresh an existing token. Requires the current token in the `Authorization` header. |
| `GET` | `/api/version` | None | Returns version/build metadata. |
| `GET` | `/api/oidc` | None | Enumerate configured OpenID Connect providers (`[{ id, name }]`). |
| `GET` | `/api/oidc/{id}/authorize` | None | Initiate the OIDC authorization code flow for provider `id`. Redirects to the provider. |
| `GET` | `/api/oidc/{id}/callback` | None | Callback endpoint for OIDC providers. Handles exchanging the authorization code. |

### Password reset workflow (unauthenticated)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/password-reset/request` | Body: `{ "username" }`. Creates a reset token (response includes masked token data even if the user does not exist). |
| `POST` | `/api/password-reset/verify` | Body: `{ "selector", "token" }`. Verifies a reset token and returns `{ valid, message? }`. |
| `POST` | `/api/password-reset/consume` | Body: `{ "selector", "token", "new_password" }`. Consumes a reset token and sets the new password. |

## Public endpoints outside `/api`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Basic liveness and database connectivity JSON (`{ status, database, version }`). |
| `GET` | `/metrics` | Prometheus metrics scrape (enabled when the metrics feature is active). |
| `GET` | `/uploads/{filename}` | Serve a stored upload by filename (requires the file to be public or the caller to have the right cookie). |
| `GET` | `/s/{token}` | Shortlink redirect to the target resource (public). |
| `GET` | `/assets/{path}` | Static asset serving for the frontend build. |

## Authenticated Endpoints (JWT required)

### Account & Session

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/me` | Returns the current user (`{ id, username, is_admin, is_system, is_approved, ... }`). |
| `POST` | `/api/me/password` | Body: `{ current_password, new_password }`. Changes the caller's password; returns `{ message? , error? }`. |
| `POST` | `/api/me/request-system` | Submit a system-account request. Returns `{ id, status, note? }` or validation errors. |
| `GET` | `/api/me/request-system` | Retrieve the most recent system-account request for the caller (or `404` if none). |
| `GET` | `/api/debug/whoami` | Debug helper echoing the authenticated principal. |

### Alters

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/alters` | List alters. Supports `q`, `fields`, `per_page`, `offset`, `user_id`. Returns `{ items, total?, per_page?, offset? }` with normalized records. |
| `POST` | `/api/alters` | Create an alter. Accepts JSON body with alter fields. |
| `GET` | `/api/alters/names` | Returns an array of lightweight `{ id, name, user_id?, username? }` records for autocomplete. Query params: `q`, `user_id`, supports pagination via `limit`/`offset`. |
| `GET` | `/api/alters/search` | Search alters by user. Query: `user_id` (required), `q`, `per_page`, `fields`. |
| `GET` | `/api/alters/family-tree` | Returns the full family tree graph structure (`{ nodes, edges, roots, owners? }`). |
| `GET` | `/api/alters/{id}` | Fetch a single alter (404 if missing). |
| `PUT` | `/api/alters/{id}` | Update an alter with JSON payload. |
| `DELETE` | `/api/alters/{id}` | Remove an alter (idempotent). |
| `DELETE` | `/api/alters/{id}/image` | Body: `{ url }`. Removes a single image reference from the alter. |

#### Alter relationships

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/alters/{id}/relationships` | Lists user<->alter relationships (partners/parents/children). |
| `POST` | `/api/alters/{id}/relationships` | Body: `{ user_id, relationship_type }` where `relationship_type` ∈ `partner|parent|child`. |
| `DELETE` | `/api/alters/{alter_id}/relationships/{user_id}/{relationship_type}` | Removes the relationship mapping. |

### Groups & Subsystems

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/groups` | List groups. Accepts `q`, `owner_user_id`, `fields=members`, or arbitrary query string via `rawQuery`. |
| `POST` | `/api/groups` | Create a group. |
| `GET` | `/api/groups/{id}` | Fetch a group. |
| `PUT` | `/api/groups/{id}` | Update group fields. |
| `DELETE` | `/api/groups/{id}` | Delete group. |
| `POST` | `/api/groups/{id}/leaders/toggle` | Body: `{ alter_id, add }`. Promote/demote a leader. |
| `GET` | `/api/groups/{id}/members` | Returns `{ group_id, alters: [] }` with member identifiers. |
| `GET` | `/api/subsystems` | List subsystems (supports `q`, `owner_user_id`, `fields=members`). |
| `POST` | `/api/subsystems` | Create a subsystem. |
| `GET` | `/api/subsystems/{id}` | Fetch subsystem details. |
| `PUT` | `/api/subsystems/{id}` | Update subsystem. |
| `DELETE` | `/api/subsystems/{id}` | Delete subsystem. |
| `POST` | `/api/subsystems/{id}/leaders/toggle` | Body: `{ alter_id, add }`. Adjust leader membership. |
| `GET` | `/api/subsystems/{id}/members` | Returns an array of members (`[{ alter_id, roles?, is_leader? }]`). |
| `POST` | `/api/subsystems/{id}/members` | Body: `{ alter_id, roles }` to update member roles. |

### Systems & Users

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/systems` | List system users (paginated, primarily for selectors). Supports `per_page`. |
| `GET` | `/api/systems/{id}` | Fetch a single system record. |

### Files & Uploads

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/upload` | Multipart upload (`file` field). 20 MiB limit enforced by middleware. Returns `{ filename/url/message/error? }`. |
| `POST` | `/api/me/avatar` | Multipart upload for the caller's avatar (10 MiB limit). Returns `{ url, message }` or `{ error }`. |
| `DELETE` | `/api/me/avatar` | Remove the caller's avatar. |

### Shortlinks & PDF exports

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/shortlink` | Body: `{ target }` (or use helpers for alters/groups/etc.). Returns `{ id, token, target }`. |
| `GET` | `/api/shortlink/{token}` | Resolve a shortlink token. Returns `{ id, token, target }` or `{ error }`. |
| `DELETE` | `/api/shortlink/id/{id}` | Delete a shortlink by numeric id. |
| `GET` | `/api/pdf/alter/{id}` | Download a PDF export for an alter. Response is `application/pdf`. |
| `GET` | `/api/pdf/group/{id}` | Download a group PDF. |
| `GET` | `/api/pdf/subsystem/{id}` | Download a subsystem PDF. |

### Posts

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/posts` | List posts. Supports `page`, `per_page`. Returns `{ items, meta }`. |
| `POST` | `/api/posts` | Create a post (body depends on post schema). |
| `POST` | `/api/posts/{id}/repost` | Repost an existing entry. |
| `DELETE` | `/api/posts/{id}` | Delete a post. |

## Admin Endpoints (JWT with admin flag)

### Users & System Requests

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/users` | Paginated list of users. Query: `page`, `per_page`, `q`, `is_admin`, `is_system`, `is_approved`, `sort_by`, `order`. Returns `{ meta, items }`. |
| `GET` | `/api/users/names` | Lightweight list of user ids and display names. Accepts `q`, `limit`, `offset`. |
| `GET` | `/api/users/{id}` | Fetch a specific user. |
| `PUT` | `/api/users/{id}` | Update admin/system/approval flags or avatar. Body mirrors `UpdateUserPayload`. |
| `DELETE` | `/api/users/{id}` | Delete a user. Accepts optional body `{ reassign_to }` to move ownership. |
| `GET` | `/api/system-requests` | List pending system account requests. |
| `POST` | `/api/system-requests/{id}/decide` | Body: `{ status, note? }` to approve/deny a request. |

### Settings & Platform Maintenance

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/settings` | Returns a map of all admin settings. |
| `PUT` | `/api/settings` | Bulk update settings. Body is key/value object. |
| `GET` | `/api/settings/{key}` | Fetch an individual setting (404 if missing). |
| `PUT` | `/api/settings/{key}` | Upsert a specific setting. |
| `POST` | `/api/admin/reload-upload-dir` | Re-scan the uploads directory cache. |
| `POST` | `/api/admin/migrate-upload-dir` | Run the upload directory migration job. |
| `GET` | `/api/admin/redis` | Returns `{ ok, error?, info? }` describing Redis status. |
| `GET` | `/api/admin/update/check` | Check updater status (`{ available, versions, message }`). |
| `POST` | `/api/admin/update` | Trigger an update run. Optional query `check_only=true` performs a dry-run check. |
| `POST` | `/api/admin/digest/custom` | Post a custom digest. Optional query `days_ahead=<int>`. |

### Audit & Housekeeping

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/audit` | List audit events. Query: `limit`, `offset`, `action`, `user_id`, `from`, `to`. Returns `{ items, total? }`. |
| `POST` | `/api/audit/purge` | Remove audit entries older than the configured retention. |
| `POST` | `/api/audit/clear` | Clear all audit entries. |
| `GET` | `/api/housekeeping/jobs` | Returns `{ jobs: [] }` describing registered housekeeping jobs. |
| `GET` | `/api/housekeeping/runs` | Query past job runs. Supports `limit`, `offset`. Returns `{ runs }`. |
| `POST` | `/api/housekeeping/runs` | Clear stored housekeeping run metadata. |
| `POST` | `/api/housekeeping/trigger/{name}` | Trigger a housekeeping job immediately. Body may include `{ dry: true }`. |

### Upload Administration

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/uploads` | Admin view of uploads. Accepts `limit`, `offset`, `user_id`, `purge_before`, etc. Returns paginated `{ items }`. |
| `DELETE` | `/api/uploads/{name}` | Delete an upload by filename. Optional query `force=1` to bypass soft checks. |
| `POST` | `/api/uploads/purge` | Bodyless request with optional query `purge_before` (ISO timestamp) and `force=1` to purge old uploads. Returns `{ deleted?, message? }`. |

### OIDC Administration

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/oidc/{id}/enabled` | Body: `{ enabled: bool }`. Enable/disable a provider. |
| `GET` | `/api/oidc/{id}/secret` | Fetch client credentials and metadata for provider `id`. |
| `POST` | `/api/oidc/{id}/secret` | Update client credentials. Body: `{ client_id?, client_secret?, enabled? }`. |

## Pagination & Lists

- User, upload, audit, and housekeeping listings return an envelope containing `items` plus pagination metadata (`meta` or `total`/`limit`/`offset`).
- Alter, group, and subsystem list responses normalize string arrays (for roles, interests, etc.) into arrays. Empty collections are returned as `[]`.
- Unless otherwise documented, `limit` defaults to 50 and is capped at 200.

## Error Model

- Errors follow a consistent JSON payload: `{ "error": "human_readable_code", "message"?: "details" }`.
- Validation problems return `400 Bad Request`; missing resources return `404 Not Found`; permission issues return `403 Forbidden`.
- All endpoints may also emit `429 Too Many Requests` if rate limiting is triggered; the response includes standard `Retry-After` headers when available.

## Content Types & Status Codes

- Successful `GET` requests return `200 OK`, creation endpoints use `201 Created` where applicable, and delete operations return `204 No Content` if no body is needed.
- File/PDF endpoints return binary content with the proper `Content-Type` header (`application/pdf` for exports, the stored MIME type for uploads).
