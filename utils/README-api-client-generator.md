# API Client Generator

This Python script automatically generates TypeScript API client code from the Rust server route definitions.

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

The generator uses a Python virtual environment with the following dependencies:

- `jinja2>=3.0.0` - Templating engine for clean code generation

To set up the environment:

```bash
cd utils
python -m venv venv
# On Windows:
.\venv\Scripts\activate && pip install -r requirements.txt
# On Unix:
source venv/bin/activate && pip install -r requirements.txt
```

## Usage

```bash
# Generate the API client
pnpm run generate-api-client

# Or run directly
python scripts/generate_api_client.py [--server-root path/to/server] [--output-dir path/to/output]
```

## How it works

1. **Parses Rust route files**: Reads `server-rs/didhub-server/src/router/*.rs` files to extract route definitions
2. **Extracts endpoints**: Identifies HTTP methods, paths, and parameters from Axum route macros
3. **Groups by module**: Organizes endpoints into logical API modules (Alter, User, Group, etc.)
4. **Generates TypeScript**: Uses Jinja2 templates to create typed API client classes with proper method signatures

## Generated Structure

The script generates `packages/api-client/src/generated-client.ts` with:

- **Complete HttpClient implementation**: Full HTTP client with authentication, CSRF protection, debugging, and error handling
- **Type definitions**: All HTTP-related types (`HttpMethod`, `QueryParams`, `HttpResponse`, etc.)
- **ApiClientModules interface**: Defines the module structure
- **ApiClient class**: Main client with all modules as properties
- **Individual API classes**: `AlterApi`, `UserApi`, `GroupApi`, etc.
- **Typed methods**: Each endpoint becomes a properly typed async method with correct parameter types (query, body) and return types

The generated client is completely self-contained and does not require external dependencies beyond the core utilities (`ApiError`, `getStoredToken`, `readCsrfToken`).

## Method Naming

- GET `/alters` → `get_alters()`  
- POST `/alters` → `post_alters(body: CreateAlterPayload)`  
- GET `/alters/{id}` → `get_alters_by_id(id: string | number)`  
- PUT `/alters/{id}` → `put_alters_by_id(id: string | number, body: UpdateAlterPayload)`  
- GET `/users` → `get_users(query: UsersQuery): Promise<UsersListResponse<User>>`

## Integration

The generator is integrated into the build process:

```bash
pnpm run build  # Automatically generates API client before building
```

## Limitations

- Currently generates `Promise<any>` return types (could be improved with response type analysis)
- Requires manual regeneration when routes change
- Doesn't handle complex request body schemas yet

## Future Improvements

- Handle authentication requirements in method signatures
- Support for OpenAPI spec generation

Note: The generator now emits per-endpoint request and response interfaces into the generated `Types.ts` file. Each endpoint gets a `<Module><MethodName>Request` interface and a `<Module><MethodName>Response` type alias which the generated client methods reference.