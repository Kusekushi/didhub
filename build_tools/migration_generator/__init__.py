"""Migration Generator - Generates SQL migrations from schema definitions."""

from .main import (
    DialectConfig,
    MigrationGenerator,
    generate_migrations,
    main,
    DEFAULT_TYPES,
    DEFAULT_PRESETS,
    DEFAULT_AUTO_INCREMENT,
)

__all__ = [
    "DialectConfig",
    "MigrationGenerator",
    "generate_migrations",
    "main",
    "DEFAULT_TYPES",
    "DEFAULT_PRESETS",
    "DEFAULT_AUTO_INCREMENT",
]