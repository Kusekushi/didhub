# API Client Generator

This Python script generates a TypeScript API client from the Rust server's route and type definitions.
It parses the Rust code (handlers, structs, enums and serde attributes) and emits:

- a typed TypeScript client (Client + Types) under your output directory
- an OpenAPI 3.0 document (JSON and optional YAML) describing paths and schemas

The generator tries to preserve serde semantics where practical (renames, flatten, rename_all)
and emits enum variants with explicit per-variant component schemas and a discriminator when
an enum contains payload-bearing variants.

## Architecture

The generator is organized as a modular Python package located in `utils/api_client_generator/`:

- **`models.py`** - Core data structures (`Endpoint`, `ApiModule`)
- **`config.py`** - Configuration constants and path mappings
- **`parser.py`** - Rust route parsing logic
- **`generator.py`** - TypeScript code generation using Jinja2 templates
- **`main.py`** - CLI entry point
- **`templates/`** - Jinja2 templates for code generation
  - `client.ts.jinja` - Main client class template
  - `method.ts.jinja` - Individual method template

## Dependencies

The generator runs on Python and requires the dependencies listed in `utils/requirements.txt`.
Key dependencies:

- `jinja2` — templating engine for TypeScript output
- `tree-sitter` / `tree-sitter-rust` used by the parser (installed by the requirements file)
- `PyYAML` (optional) — if present the generator writes `openapi.yaml` in addition to `openapi.json`

Quick setup (from repository root):

```pwsh
cd utils
python -m venv .venv
.\.venv\Scripts\Activate.ps1  # PowerShell; or use the equivalent on your shell
pip install -r requirements.txt
```

## Usage

From the repository root you can run the bundled helper script or call the generator directly.

Generate the client (default output is `packages/api-client/src/generated`):

```pwsh
pnpm run generate-api-client
```

Run the generator directly (examples):

```pwsh
# Generate client + OpenAPI (default)
python utils/api_client_generator/main.py --server-root server-rs/didhub-server --output-dir packages/api-client/src --emit-openapi

# Generate client but skip OpenAPI emission
python utils/api_client_generator/main.py --server-root server-rs/didhub-server --output-dir packages/api-client/src --no-openapi
```

## How it works

1. Parses Rust route files and handler signatures to find endpoints, HTTP methods and handlers.
2. Parses referenced Rust types (structs/enums) including `#[serde(...)]` attributes to
  collect field serialized names, `flatten` markers, and `rename_all` directives where present.
3. Groups endpoints into modules and renders TypeScript code using Jinja2 templates.
4. Optionally emits a minimal OpenAPI 3.0 document with `paths` and `components.schemas` that
  mirrors the parsed types and endpoints.

## Generated Structure

The generator writes a self-contained client under the output dir (typically `packages/api-client/src/generated`):

- `Client.ts` — the API client with module classes and methods
- `Types.ts` — generated TypeScript interfaces and type aliases for parsed Rust types
- `openapi.json` (and optionally `openapi.yaml`) — a minimal OpenAPI 3.0 document

Highlights of the generated client:

- An HttpClient wrapper with authentication and CSRF helpers used by the methods
- Per-module API classes (AlterApi, UsersApi, etc.) with typed methods
- Method signatures that prefer a single `request` object interface (Request/Response interfaces are generated per endpoint)

The client does not require extra runtime dependencies outside the monorepo tooling.

## Method Naming

- GET `/alters` → `get_alters()`  
- POST `/alters` → `post_alters(body: CreateAlterPayload)`  
- GET `/alters/{id}` → `get_alters_by_id(id: string | number)`  
- PUT `/alters/{id}` → `put_alters_by_id(id: string | number, body: UpdateAlterPayload)`  
- GET `/users` → `get_users(query: UsersQuery): Promise<UsersListResponse<User>>`

## Integration

Typical workflows:

- Local development: run the server (Rust) and generate the client when you change routes or types.
- CI: the generator is run in CI before building the `@didhub/api-client` package so the generated
  TypeScript and OpenAPI are available to the TypeScript build/test steps.

The repository includes a convenience build step that runs the generator before building TypeScript packages.

## Limitations & notes

- Response typing: return types are derived from the parsed response type when available, but complex
  generic or dynamic response shapes may still fall back to a JSON-value type.
- Serde coverage: the generator handles common serde attributes (`rename`, `flatten`, `rename_all`) and
  attempts to preserve serialized names, but very complex serde patterns or custom serializers may not
  round-trip perfectly.
- Enum tagging: when enums include payload-bearing variants the generator emits an adjacent-style
  representation in OpenAPI (an object with a `type` discriminator and a `payload` property). This
  enables better typing and round-tripping in clients but may not match every serde-tagging strategy.
- OpenAPI: the generator emits a practical OpenAPI document (paths + components) intended for
  documentation and tooling. It captures shapes and field names where possible and attempts to
  preserve type references. Notable behaviors:

- Enum tagging: supports multiple serde enum tagging styles (adjacent, internally-tagged,
  externally-tagged and untagged) and emits corresponding OpenAPI shapes where practical.
- allOf composition: when an enum variant payload references a known component schema the
  generator composes the variant schema using `allOf: [ { $ref: ... }, { properties: {...} } ]`
  to preserve the original component reference while allowing the generator to add the enum tag.
- Warnings: the generator attaches `x-generation-warnings` to the emitted OpenAPI document when
  it performs lossy conversions (collisions, missing referenced components, or fallback nesting).
  Consumers and CI can inspect these warnings to decide whether to adjust types or generator options.

If you need broader serde coverage or different enum representations (internally/externally tagged),
we can extend the parser/generator to emit alternative styles.

## OpenAPI generation

The generator can emit an OpenAPI 3.0 document beside the generated TypeScript.
By default it writes `generated/openapi.json` (and `generated/openapi.yaml` when `PyYAML` is installed)
inside the output directory (the repo default is `packages/api-client/src/generated/`).

Control emission with the CLI flags:

```pwsh
# Emit OpenAPI (default)
python utils/api_client_generator/main.py --emit-openapi

# Disable OpenAPI emission
python utils/api_client_generator/main.py --no-openapi
```

Important OpenAPI notes:

- DELETE operations will not include a `requestBody` to stay compatible with common OpenAPI semantics.
- Enums with payload-bearing variants are emitted as a `oneOf` of per-variant component schemas,
  and a `discriminator` is added so generated OpenAPI-aware clients can deserialize into the correct variant.
