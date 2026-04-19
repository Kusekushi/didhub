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
from .cargo import cargo_manifest_command
from .process import format_command, print_command, resolve_command, run_subprocess

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
    # Process helpers
    "format_command",
    "print_command",
    "resolve_command",
    "run_subprocess",
    # Cargo helpers
    "cargo_manifest_command",
]
