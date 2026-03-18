# System Architecture

This document describes the high‑level architecture of the DIDAlterHub project, including how schema‑driven development feeds code generation, the backend and frontend crate structure, the build system, and the data flow between the client, API, backend, and database.

## Schema‑driven development (schemas/ → generated code)
- The project maintains API and database surface definitions as YAML specifications under the schemas directory:
  - API surface: schemas/api/openapi.yaml
  - Database schema: schemas/db/0001_initial.yaml
- Code generation is driven by the build system. OpenAPI specs generate:
  - TypeScript client libraries in frontend/api/src/generated/
  - Rust server types and client interfaces in backend/didhub-backend/src/generated/
- The database YAML definitions generate Rust data models and SQLx mappings that keep the Rust domain model in sync with the DB schema.
- The generated code is checked in as part of the code generation workflow but should not be edited manually in generated folders; edits should be made to the YAML specs and re‑generated.

## Backend architecture (crates)
- didhub-backend: The main Axum application that wires together routes, middleware, and business services.
- didhub-auth: Authentication and authorization components (e.g., JWT or session management) used by protected endpoints.
- didhub-db: Database models and domain objects used by SQLx to map between Rust types and DB rows.
- didhub-db-connection: Connection pooling and management for database access.
- didhub-migrations: SQLx migrations that evolve the database schema over time.
- didhub-jobs: Background job processing for long‑running tasks and deferred work.
- didhub-job-queue: Inbound/outbound job queue infrastructure coordinating job execution.
- didhub-config: Configuration loading and management (environment, file, etc.).
- didhub-log-client: Logging client and facilities used by services to emit structured logs.
- didhub-updates: Update handling, including service updates and deployment coordination.

## Frontend architecture (Vite + React + TypeScript + Tailwind)
- The frontend is a modern SPA built with Vite, React, and TypeScript, with Tailwind CSS for styling.
- It consumes the generated TypeScript API client (frontend/api/src/generated/) to talk to the backend endpoints defined by the OpenAPI spec.
- Generated types ensure the frontend and backend share a consistent view of the API surface and data shapes.

## Build system and automation
- The build system is driven by build.py and a set of tools under build_tools/.
- The workflow includes generating code from schemas, compiling both backend Rust crates and the frontend, and running tests and lint checks.
- Generated code lives in:
  - backend/didhub-backend/src/generated/
  - frontend/api/src/generated/
- After schema changes, you run the build process to re‑generate types and ensure the repository remains in sync.

## Data flow (text diagram)
Client -> Frontend -> API -> Backend -> Database
  - Client: Web browser running the frontend UI.
  - Frontend: Serves the app bundle and invokes the generated TypeScript API client.
  - API: The OpenAPI‑driven surface that exposes endpoints for the frontend to call.
  - Backend: The Rust Axum application handling business logic and routing.
  - Database: The persistent storage accessed via didhub-db and SQLx, with migrations managed by didhub-migrations.

## OpenAPI and database schema code generation
- OpenAPI (schemas/api/openapi.yaml) defines the REST API surface. A generation step creates:
  - A TypeScript client in frontend/api/src/generated/ for type‑safe API calls.
  - Rust server types in backend/didhub-backend/src/generated/ to model request/response payloads and service boundaries.
- The database schema (schemas/db/0001_initial.yaml) feeds the Rust data models and SQL mappings so the ORM layer stays aligned with the database.
- The generated code is a product of the build process and should reflect the canonical YAML specifications rather than ad‑hoc edits.

## Generated code locations
- OpenAPI/TypeScript client: frontend/api/src/generated/
- OpenAPI/Rust server types: backend/didhub-backend/src/generated/
- Database‑driven Rust models: backend/didhub-db/ (types generated in generated crates as part of the codegen workflow)

## Notes on evolution and consistency
- Do not manually edit generated code in the generated/ folders. Modify the YAML specs and re‑run the code generator to propagate changes.
- The single source of truth for the API is schemas/api/openapi.yaml; the single source of truth for the database is schemas/db/0001_initial.yaml.
- The build system coordinates code generation, compilation, and tests to ensure end‑to‑end consistency across the stack.

---

This document reflects the current project layout and how the pieces fit together to support a robust, schema‑driven development workflow.
