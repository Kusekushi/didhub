"""Shared utilities for build tools."""

from .schema_loader import (
    SchemaCache,
    load_schema,
    collect_schema_paths,
)
from .naming import (
    to_pascal_case,
    to_snake_case,
    singularize,
    sanitize_module_name,
    sanitize_field_name,
    RUST_KEYWORDS,
)
from .errors import (
    SchemaError,
    SchemaValidationError,
    DialectError,
    TypeMappingError,
)

__all__ = [
    # Schema loading
    "SchemaCache",
    "load_schema",
    "collect_schema_paths",
    # Naming utilities
    "to_pascal_case",
    "to_snake_case",
    "singularize",
    "sanitize_module_name",
    "sanitize_field_name",
    "RUST_KEYWORDS",
    # Errors
    "SchemaError",
    "SchemaValidationError",
    "DialectError",
    "TypeMappingError",
]
