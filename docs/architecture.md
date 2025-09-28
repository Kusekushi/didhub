# DIDHub Architecture

This document provides an overview of DIDHub's system architecture, components, and design decisions.

## System Overview

DIDHub is a web application for managing alters and systems in Dissociative Identity Disorder (DID) communities. It consists of a Rust backend API server and a React frontend, designed for scalability, security, and ease of use.

## High-Level Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │────│   React App     │────│   API Client    │
│                 │    │   (Frontend)    │    │   (TypeScript)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                └───────────────────────┼───────────────────────┐
                                                        │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Rust Server   │────│   Axum Router   │────│   Services      │────│   Database      │
│   (Backend)     │    │   (HTTP)        │    │                 │    │   (SQLx)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                                                                             │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│   File System   │    │   Cache         │    │   Message       │            │
│   (Uploads)     │    │   (Redis)       │    │   Queue         │            │
└─────────────────┘    └─────────────────┘    └─────────────────┘            │
                                                                             │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐            │
│   SQLite        │    │   PostgreSQL    │    │   MySQL         │            │
│   (Default)     │    │   (Production)  │    │   (Production)  │            │
└─────────────────┘    └─────────────────┘    └─────────────────┘            │
```

## Components

### Backend (Rust)

#### Core Server (`didhub-server`)

- **Framework**: Axum (async web framework)
- **Database**: SQLx with support for SQLite, PostgreSQL, and MySQL
- **Authentication**: JWT-based with HS256 signing
- **Middleware**: CORS, rate limiting, logging, security headers
- **Features**:
  - Auto-updates (optional)
  - Static file serving
  - Background job processing

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
- **Build Tool**: Vite
- **UI Library**: Material-UI (MUI)
- **Routing**: React Router
- **State Management**: React Context API
- **Features**:
  - Responsive design
  - Dark/light theme support
  - Real-time updates
  - File uploads with drag-and-drop

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
Login Request ──► Validate Credentials ──► Generate JWT ──► Return Token
     │                       │                       │             │
     │                       │                       │             │
     ▼                       ▼                       ▼             ▼
Store Token ─────────────► Attach to Requests ──► Verify Token ──► Allow Access
in localStorage              (API Client)         (Middleware)    (Handler)
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

- **JWT Tokens**: Stateless authentication with 7-day expiry
- **Password Hashing**: bcrypt with salt
- **Role-Based Access**: Admin vs regular user permissions
- **Session Management**: Automatic token refresh

### Security Features

- **CORS Protection**: Configurable allowed origins
- **Rate Limiting**: Request throttling by IP
- **Security Headers**: HSTS, CSP, X-Frame-Options
- **Input Validation**: Comprehensive validation on all inputs
- **SQL Injection Protection**: Parameterized queries via SQLx
- **Audit Logging**: All sensitive operations logged

### Data Protection

- **Encryption**: JWT signing with configurable secret
- **PII Handling**: Minimal personal data collection
- **File Security**: Upload validation and access control
- **Session Security**: HttpOnly cookies for sensitive data