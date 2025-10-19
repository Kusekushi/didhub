"""Custom exceptions for build tools."""

from __future__ import annotations


class SchemaError(Exception):
    """Base exception for schema-related errors."""

    def __init__(self, message: str, schema_path: str | None = None) -> None:
        self.schema_path = schema_path
        full_message = f"{message}" if not schema_path else f"[{schema_path}] {message}"
        super().__init__(full_message)


class SchemaValidationError(SchemaError):
    """Raised when a schema fails validation."""

    def __init__(
        self,
        message: str,
        schema_path: str | None = None,
        field: str | None = None,
    ) -> None:
        self.field = field
        if field:
            message = f"Field '{field}': {message}"
        super().__init__(message, schema_path)


class DialectError(SchemaError):
    """Raised for dialect-specific issues."""

    def __init__(
        self,
        message: str,
        dialect: str,
        schema_path: str | None = None,
    ) -> None:
        self.dialect = dialect
        super().__init__(f"Dialect '{dialect}': {message}", schema_path)


class TypeMappingError(SchemaError):
    """Raised when a type mapping is missing or invalid."""

    def __init__(
        self,
        type_name: str,
        context: str,
        schema_path: str | None = None,
    ) -> None:
        self.type_name = type_name
        super().__init__(f"No type mapping for '{type_name}' ({context})", schema_path)
