"""
DB Code Generator - Generates Rust database code from schema definitions.

This module provides optimized code generation with:
- Schema caching for repeated runs
- Parallel table processing
- Efficient memory usage via generators
- Comprehensive type safety
"""

from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Final, Iterator, Sequence

from jinja2 import Environment, FileSystemLoader, StrictUndefined

# Add parent directory to path for shared imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared import (
    SchemaCache,
    SchemaError,
    SchemaValidationError,
    TypeMappingError,
    collect_schema_paths,
    sanitize_field_name,
    sanitize_module_name,
    singularize,
    to_pascal_case,
)

# Type mappings from schema types to Rust types
DEFAULT_RUST_TYPES: Final[dict[str, str]] = {
    "uuid": "uuid::Uuid",
    "string": "String",
    "text": "String",
    "json_text": "String",
    "bool_flag": "i32",
    "timestamp": "String",
    "number": "f64",
    "integer": "i64",
    "bigint": "i64",
    "smallint": "i16",
    "float": "f32",
    "double": "f64",
    "boolean": "bool",
    "blob": "Vec<u8>",
}

# Template configuration
TEMPLATE_DIR: Final[Path] = Path(__file__).parent / "templates"


@dataclass(frozen=True, slots=True)
class Column:
    """Represents a database column with Rust type information."""
    name: str
    field_name: str
    base_type: str
    field_type: str
    is_nullable: bool
    has_default: bool
    is_primary: bool
    alias_name: str | None
    resolved_base_type: str


@dataclass(frozen=True, slots=True)
class TypeAlias:
    """Represents a conditional type alias for Rust code generation."""
    name: str
    native: str
    fallback: str


@dataclass(frozen=True, slots=True)
class ModuleSpec:
    """Specification for a generated Rust module."""
    module_name: str
    struct_name: str


@dataclass
class GeneratorContext:
    """Context for code generation with cached resources."""
    template_env: Environment = field(init=False)
    schema_cache: SchemaCache = field(default_factory=SchemaCache)
    
    def __post_init__(self) -> None:
        self.template_env = Environment(
            loader=FileSystemLoader(TEMPLATE_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
            keep_trailing_newline=True,
            undefined=StrictUndefined,
            auto_reload=False,  # Disable auto-reload for performance
            enable_async=False,
        )
        # Pre-compile templates
        self._module_template = self.template_env.get_template("module.rs.j2")
        self._mod_template = self.template_env.get_template("mod.rs.j2")
    
    @property
    def module_template(self):
        return self._module_template
    
    @property
    def mod_template(self):
        return self._mod_template


@lru_cache(maxsize=256)
def _quote(value: str) -> str:
    """Quote a string for Rust literal embedding. Cached for performance."""
    return json.dumps(value)


def _alias_name(struct_name: str, field_name: str) -> str:
    """Generate a type alias name for UUID fields."""
    cleaned = field_name.removeprefix("r#")
    return f"{struct_name}{to_pascal_case(cleaned)}Type"


def _rust_type_for_column(
    column: dict[str, Any],
    schema_path: str | None = None,
) -> str:
    """Resolve the Rust type for a column.
    
    Args:
        column: Column definition from schema.
        schema_path: Path to schema file for error messages.
        
    Returns:
        The Rust type string.
        
    Raises:
        TypeMappingError: If no type mapping exists.
        SchemaValidationError: If the column definition is invalid.
    """
    # Check for explicit Rust type override
    if "rust_type" in column:
        return str(column["rust_type"])
    
    type_name = column.get("type")
    col_name = column.get("name", "<unknown>")
    
    if not type_name:
        raise SchemaValidationError(
            f"column is missing required 'type'",
            schema_path,
            field=col_name,
        )
    
    if isinstance(type_name, dict):
        raise SchemaValidationError(
            "uses dialect-specific type mapping; add a 'rust_type' override",
            schema_path,
            field=col_name,
        )
    
    mapped = DEFAULT_RUST_TYPES.get(str(type_name))
    if not mapped:
        raise TypeMappingError(
            type_name,
            f"column '{col_name}'",
            schema_path,
        )
    
    return mapped


def _build_columns(
    table: dict[str, Any],
    struct_name: str,
    schema_path: str | None = None,
) -> tuple[list[Column], list[TypeAlias]]:
    """Build Column and TypeAlias objects from a table definition.
    
    Uses optimized iteration and pre-allocation where possible.
    """
    raw_columns = table.get("columns", [])
    columns: list[Column] = []
    aliases: list[TypeAlias] = []
    
    for column in raw_columns:
        name = str(column["name"])
        field_name = sanitize_field_name(name)
        base_type = _rust_type_for_column(column, schema_path)
        is_nullable = bool(column.get("nullable", True))
        has_default = column.get("default") is not None
        is_primary = bool(column.get("primary_key", False))
        
        alias: str | None = None
        resolved_base_type = base_type
        
        if base_type == "uuid::Uuid":
            alias = _alias_name(struct_name, field_name)
            aliases.append(TypeAlias(name=alias, native=base_type, fallback="String"))
            resolved_base_type = alias
        
        field_type = f"Option<{resolved_base_type}>" if is_nullable else resolved_base_type
        
        columns.append(
            Column(
                name=name,
                field_name=field_name,
                base_type=base_type,
                field_type=field_type,
                is_nullable=is_nullable,
                has_default=has_default,
                is_primary=is_primary,
                alias_name=alias,
                resolved_base_type=resolved_base_type,
            )
        )
    
    return columns, aliases


def _determine_primary_keys(
    table: dict[str, Any],
    columns: Sequence[Column],
) -> list[str]:
    """Determine primary key columns from table definition."""
    keys: list[str] = []
    raw_pk = table.get("primary_key")
    
    if isinstance(raw_pk, str):
        keys.append(raw_pk)
    elif isinstance(raw_pk, list):
        keys.extend(str(item) for item in raw_pk)
    
    # Fallback to column-level primary_key flags
    if not keys:
        keys = [col.name for col in columns if col.is_primary]
    
    # Deduplicate while preserving order
    seen: set[str] = set()
    return [k for k in keys if not (k in seen or seen.add(k))]  # type: ignore[func-returns-value]


def _render_table_module(
    table: dict[str, Any],
    output_dir: Path,
    ctx: GeneratorContext,
    schema_path: str | None = None,
) -> ModuleSpec:
    """Render a single table module.
    
    This function is designed to be thread-safe for parallel execution.
    """
    table_name = str(table["name"])
    module_name = sanitize_module_name(table_name)
    struct_name = f"{to_pascal_case(table_name)}Row"
    
    columns, aliases = _build_columns(table, struct_name, schema_path)
    primary_keys = _determine_primary_keys(table, columns)
    
    needs_uuid = bool(aliases)
    
    # Pre-compute SQL literals
    column_names_literal = ", ".join(_quote(col.name) for col in columns)
    column_list = ", ".join(col.name for col in columns)
    column_list_literal = _quote(column_list)
    select_all = f"SELECT {column_list} FROM {table_name}"
    insert_placeholders = ", ".join("?" for _ in columns)
    insert_literal = _quote(
        f"INSERT INTO {table_name} ({column_list}) VALUES ({insert_placeholders})"
    )
    
    # Primary key handling
    pk_column: Column | None = None
    if len(primary_keys) == 1:
        pk_name = primary_keys[0]
        pk_column = next((col for col in columns if col.name == pk_name), None)
    
    has_primary_key = pk_column is not None
    select_by_pk_literal: str | None = None
    delete_by_pk_literal: str | None = None
    update_by_pk_literal: str | None = None
    updatable_columns: list[Column] = []
    
    if pk_column is not None:
        select_by_pk_literal = _quote(
            f"SELECT {column_list} FROM {table_name} WHERE {pk_column.name} = ?"
        )
        delete_by_pk_literal = _quote(
            f"DELETE FROM {table_name} WHERE {pk_column.name} = ?"
        )
        updatable_columns = [col for col in columns if col.name != pk_column.name]
        if updatable_columns:
            set_clause = ", ".join(f"{col.name} = ?" for col in updatable_columns)
            update_by_pk_literal = _quote(
                f"UPDATE {table_name} SET {set_clause} WHERE {pk_column.name} = ?"
            )
    
    # Generate function names
    singular_module = singularize(module_name)
    insert_function_name = f"insert_{singular_module}" if singular_module else "insert_row"
    insert_alias_distinct = insert_function_name != "insert_row"
    
    rendered = ctx.module_template.render(
        struct_name=struct_name,
        columns=columns,
        needs_uuid=needs_uuid,
        aliases=aliases,
        table_name_literal=_quote(table_name),
        column_names_literal=column_names_literal,
        column_list_literal=column_list_literal,
        select_all_literal=_quote(select_all),
        has_primary_key=has_primary_key,
        pk_column=pk_column,
        select_by_pk_literal=select_by_pk_literal,
        delete_by_pk_literal=delete_by_pk_literal,
        insert_literal=insert_literal,
        insert_function_name=insert_function_name,
        insert_alias_distinct=insert_alias_distinct,
        updatable_columns=updatable_columns,
        has_update_by_pk=update_by_pk_literal is not None,
        update_by_pk_literal=update_by_pk_literal,
    )
    
    output_path = output_dir / f"{module_name}.rs"
    output_path.write_text(rendered, encoding="utf-8")
    
    return ModuleSpec(module_name=module_name, struct_name=struct_name)


def _write_mod_file(
    modules: Iterator[ModuleSpec] | Sequence[ModuleSpec],
    mod_path: Path,
    ctx: GeneratorContext,
) -> None:
    """Write the mod.rs file for the generated modules."""
    # Deduplicate and sort
    dedup: dict[str, ModuleSpec] = {}
    for spec in modules:
        dedup[spec.module_name] = spec
    
    ordered = sorted(dedup.values(), key=lambda item: item.module_name)
    rendered = ctx.mod_template.render(modules=ordered)
    mod_path.write_text(rendered, encoding="utf-8")


def generate(
    schema_paths: Sequence[Path],
    output_dir: Path,
    parallel: bool = True,
    max_workers: int | None = None,
) -> int:
    """Generate Rust code from schema files.
    
    Args:
        schema_paths: Paths to schema YAML files.
        output_dir: Directory for generated code.
        parallel: Whether to process tables in parallel.
        max_workers: Maximum number of parallel workers.
        
    Returns:
        Number of modules generated.
    """
    ctx = GeneratorContext()
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Collect all tables from all schemas
    tables_with_paths: list[tuple[dict[str, Any], str]] = []
    
    for schema_path in schema_paths:
        schema = ctx.schema_cache.get(schema_path)
        tables = schema.get("tables")
        
        if not isinstance(tables, list):
            raise SchemaValidationError(
                "schema must provide a 'tables' list",
                str(schema_path),
            )
        
        for table in tables:
            tables_with_paths.append((table, str(schema_path)))
    
    module_specs: list[ModuleSpec] = []
    
    if parallel and len(tables_with_paths) > 1:
        # Use thread pool for I/O-bound operations
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    _render_table_module,
                    table,
                    output_dir,
                    ctx,
                    schema_path,
                ): table["name"]
                for table, schema_path in tables_with_paths
            }
            
            for future in as_completed(futures):
                table_name = futures[future]
                try:
                    spec = future.result()
                    module_specs.append(spec)
                except Exception as e:
                    raise SchemaError(
                        f"Failed to generate module for table '{table_name}': {e}"
                    ) from e
    else:
        # Sequential processing
        for table, schema_path in tables_with_paths:
            spec = _render_table_module(table, output_dir, ctx, schema_path)
            module_specs.append(spec)
    
    _write_mod_file(module_specs, output_dir / "mod.rs", ctx)
    
    return len({spec.module_name for spec in module_specs})


def main(argv: list[str] | None = None) -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Rust database code from schema definitions",
    )
    parser.add_argument(
        "paths",
        type=Path,
        nargs="+",
        help="Schema file(s) or directories containing schema YAML files",
    )
    parser.add_argument(
        "--crate-dir",
        type=Path,
        default=Path("backend/didhub-db"),
        help="Path to the didhub-db crate root",
    )
    parser.add_argument(
        "--no-parallel",
        action="store_true",
        help="Disable parallel processing",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Maximum number of parallel workers",
    )
    
    args = parser.parse_args(argv)
    
    try:
        schema_paths = collect_schema_paths(args.paths)
        if not schema_paths:
            raise SystemExit("No schema files found")
        
        crate_dir = args.crate_dir.resolve()
        generated_dir = crate_dir / "src" / "generated"
        
        module_count = generate(
            schema_paths,
            generated_dir,
            parallel=not args.no_parallel,
            max_workers=args.workers,
        )
        
        print(
            f"Generated {module_count} table module(s) from "
            f"{len(schema_paths)} schema file(s) into {generated_dir}"
        )
    except (SchemaError, FileNotFoundError) as e:
        raise SystemExit(f"Error: {e}") from e


if __name__ == "__main__":
    main()
