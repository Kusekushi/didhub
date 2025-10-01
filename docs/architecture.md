# DIDHub Architecture

This document provides an overview of DIDHub's system architecture, components, and design decisions.

## System Overview

DIDHub is a web application for managing alters and systems in Dissociative Identity Disorder (DID) communities. It consists of a Rust backend API server and a React frontend, designed for scalability, security, and ease of use.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌──────────────────────┐
│   Web Browser   │────│   React App     │────│   @didhub/api-client │
│                 │    │   (Frontend)    │    │   (TypeScript)       │
└─────────────────┘    └─────────────────┘    └──────────────────────┘
        │
        ▼
      ┌────────────────────┐
      │ Rust Server (Axum) │
      └────────────────────┘
        │
   ┌──────────────────────┼───────────────────────────────┐
   ▼                      ▼                               ▼
  Uploads File System     Redis Cache (optional)        SQL Database (SQLx)
   │                      │                               │
   ▼                      ▼                               ▼
 Housekeeping Jobs      Metrics & Rate Limiters      SQLite / PostgreSQL / MySQL
```

## Components

### Backend (Rust)

#### Core Server (`didhub-server`)

- **Framework**: Axum (async web framework)
- **Database layer**: SQLx with adapters for SQLite (default), PostgreSQL, and MySQL
- **Authentication**: JWT-based with HS256 signing and an auth middleware that hydrates the request context
- **Middleware**: CORS, CSRF protection, request logging, rate limiting, security headers, request IDs, compression
- **Features**:
  - Optional auto-update support (guarded behind the `updater` feature flag)
  - Static asset embedding/serving (via the `embed_static` feature flag)
  - Housekeeping job runner (audit retention, cache maintenance, etc.)
  - Upload directory cache with runtime reload

#### Supporting Crates

- **`didhub-db`**: Database models and queries
- **`didhub-auth`**: Authentication and authorization logic
- **`didhub-middleware`**: Custom middleware components
- **`didhub-cache`**: Caching abstraction (Redis/in-memory)
- **`didhub-migrations`**: Database schema migrations
- **`didhub-config`**: Configuration management
- **`didhub-error`**: Error handling utilities
- **`didhub-metrics`**: Prometheus metrics
- **`didhub-housekeeping`**: Background maintenance jobs
- **`didhub-updater`**: Self-update functionality
- **`didhub-oidc`**: OpenID Connect integration

### Frontend (React/TypeScript)

#### Core Application (`@didhub/frontend`)

- **Framework**: React 18 with TypeScript
- **Build Tooling**: Vite + pnpm workspace scripts
- **UI Library**: Material UI (MUI)
- **Routing**: React Router with code-split route modules
- **State Management**: React Context and hook-based data stores consuming the API client
- **Notable capabilities**:
  - Responsive layout with theme toggles
  - Rich alter/system management flows (roles, relationships, short links, PDFs)
  - Drag-and-drop uploads with progress tracking
  - Short-link generation and sharing

#### API Client (`@didhub/api-client`)

- **Purpose**: TypeScript client for backend API
- **Features**:
  - Automatic JWT token management
  - Request/response typing
  - Error handling
  - Token refresh logic

## Data Flow

### User Request Flow

1. **Client Request**: User interacts with React frontend
2. **API Call**: Frontend uses API client to make HTTP request
3. **Authentication**: JWT token attached to request
4. **Routing**: Axum router matches endpoint
5. **Middleware**: Request passes through auth, rate limiting, etc.
6. **Handler**: Route handler processes request
7. **Database**: SQLx queries database
8. **Response**: JSON response returned to client
9. **UI Update**: React updates based on response

### Authentication Flow

```
Login Request ──► Validate Credentials ──► Sign 7‑day JWT ──► Return Token
  │                       │                        │              │
  │                       │                        │              │
  ▼                       ▼                        ▼              ▼
Store Token ─────────────► Attach to Requests ──► Middleware ───► Handler Executes
in storage helper             (API Client)           verifies       (adds user context)
```

## Database Design

### Multi-Driver Support

DIDHub supports three database backends:

- **SQLite**: Default, file-based, zero-configuration
- **PostgreSQL**: Production-ready, advanced features
- **MySQL**: Production-ready, widely supported

### Schema Overview

```
users (authentication, profiles)
├── systems (user's DID systems)
│   ├── alters (system members)
│   ├── groups (alter groupings)
│   └── subsystems (alter sub-groups)
├── uploads (file storage metadata)
├── audit_logs (security events)
├── settings (application configuration)
└── system_requests (account approval workflow)
```

### Key Relationships

- **Users** can have multiple **systems**
- **Systems** contain multiple **alters**
- **Alters** can belong to multiple **groups** and **subsystems**
- **Uploads** are associated with users and can be linked to alters
- **Audit logs** track all significant actions

## Security Architecture

### Authentication & Authorization

- **JWT tokens**: Stateless authentication with 7-day expiry (sliding refresh endpoint under `/api/auth/refresh`)
- **Password hashing**: bcrypt with per-user salts
- **Role & approval checks**: Middleware injects `CurrentUser`, admin guard uses `AdminFlag`, and `must_change_password` enforcement gates sensitive routes
- **Session management**: API client stores tokens in browser storage and refreshes on demand

### Security Features

- **CORS**: Origin allowlist drawn from `FRONTEND_BASE_URL`, with an opt-in allow-all flag for development
- **CSRF**: Token rotation headers + middleware enforcing `x-csrf-token` for cookie-auth flows
- **Rate limiting**: Governor middleware backed by Redis (if configured) with 429 logging
- **Security headers**: HSTS and CSP toggles via config (`DIDHUB_ENABLE_HSTS`, `DIDHUB_CSP`)
- **Input validation**: JSON payload validation with explicit ownership checks before mutating operations
- **SQL injection protection**: SQLx prepared statements across all queries
- **Audit logging**: Mutating endpoints emit audit rows (`didhub-db::audit`) for compliance trails

### Data Protection

- **Encryption**: JWT signing with configurable secret
- **PII Handling**: Minimal personal data collection
- **File Security**: Upload validation and access control
- **Session Security**: HttpOnly cookies for sensitive data