# Shared Build Tools Utilities

This module provides shared utilities for the build tools, reducing code
duplication and providing consistent behavior across all generators.

## Components

### Schema Loader (`schema_loader.py`)
- `SchemaCache`: Thread-safe schema cache with automatic invalidation based on
  file modification time and size.
- `load_schema`: Load and validate a YAML schema file.
- `collect_schema_paths`: Collect schema files from files or directories.

### Naming Utilities (`naming.py`)
- `to_pascal_case`: Convert strings to PascalCase (cached).
- `to_snake_case`: Convert strings to snake_case (cached).
- `singularize`: Convert plural words to singular form (cached).
- `sanitize_module_name`: Sanitize for Rust module names.
- `sanitize_field_name`: Sanitize for Rust field names.
- `RUST_KEYWORDS`: Frozen set of Rust reserved keywords.

### Error Types (`errors.py`)
- `SchemaError`: Base exception for schema-related errors.
- `SchemaValidationError`: Raised when a schema fails validation.
- `DialectError`: Raised for dialect-specific issues.
- `TypeMappingError`: Raised when a type mapping is missing or invalid.

## Usage

```python
from build_tools.shared import (
    SchemaCache,
    load_schema,
    collect_schema_paths,
    to_pascal_case,
    singularize,
    SchemaError,
)

# Use the global cache
cache = SchemaCache()
schema = cache.get(Path("schema.yaml"))

# Or load directly without caching
schema = load_schema(Path("schema.yaml"))

# Collect all schema files from a directory
paths = collect_schema_paths([Path("schemas/")])
```

## Performance Optimizations

- **Caching**: All naming functions use `@lru_cache` for repeated calls.
- **Schema Caching**: `SchemaCache` caches parsed schemas and invalidates when
  files change (based on mtime and size).
- **Frozen Dataclasses**: Cache keys use frozen dataclasses with `__slots__`
  for memory efficiency.
