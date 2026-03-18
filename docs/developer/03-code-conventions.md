# Code conventions – quick reference

This document captures the essential style rules used across the repository. It is a concise reference and not a full tutorial. For complete guidance, see AGENTS.md in the repo root.

## TypeScript conventions (frontend)
- File naming: use PascalCase for components (e.g., MyComponent.tsx) and camelCase for utilities/helpers (e.g., formatDate.ts).
- Imports order: follow a consistent structure from external libraries to internal modules, with project-relative paths grouped logically (external → internal packages → relative components → relative utils → types → styles).
- Types vs interfaces: prefer interfaces for object shapes that may be extended; use type aliases for unions or more complex type constructions.
- Avoid any; use unknown: do not use the any type. When a value is unknown, prefer unknown and narrow the type safely.

> Note: This document references AGENTS.md for full details and examples.

## Rust conventions (backend)
- File naming: use snake_case for modules and file names.
- Imports order: follow a consistent ordering similar to TypeScript (external crates first, then internal modules).
- Error handling: use thiserror for library crates and anyhow for application code.
- Result usage: adopt Result<T, E> for fallible operations and propagate errors appropriately.

> Note: See AGENTS.md for full rules and rationale.

## Python conventions (build_tools)
- Build tooling resides in build_tools/ and is wired through the orchestrator (build.py).
- Adhere to general Python conventions (PEP8, typing where appropriate) for scripts in this area.

> Note: AGENTS.md contains the detailed guidelines.

References:
- AGENTS.md (global conventions and project-wide rules)
- Frontend: README and code structure in frontend/app/
- Backend: Rust crates under backend/ and related cargo setup
