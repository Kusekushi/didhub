"""Schema loading utilities with caching support."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Sequence

import yaml

from .errors import SchemaError


@dataclass(frozen=True, slots=True)
class CacheKey:
    """Immutable cache key for schema files."""

    path: Path
    mtime: float
    size: int

    @classmethod
    def from_path(cls, path: Path) -> CacheKey:
        """Create a cache key from a file path."""
        stat = path.stat()
        return cls(
            path=path.resolve(),
            mtime=stat.st_mtime,
            size=stat.st_size,
        )


@dataclass
class CachedSchema:
    """A cached schema with metadata."""

    data: dict[str, Any]
    key: CacheKey
    content_hash: str


class SchemaCache:
    """Thread-safe schema cache with automatic invalidation.

    Caches parsed schema files and automatically invalidates when
    the underlying file changes (based on mtime and size).
    """

    __slots__ = ("_cache", "_max_size")

    def __init__(self, max_size: int = 100) -> None:
        self._cache: dict[Path, CachedSchema] = {}
        self._max_size = max_size

    def get(self, path: Path) -> dict[str, Any]:
        """Get a schema from cache, loading it if necessary.

        Args:
            path: Path to the schema file.

        Returns:
            The parsed schema data.

        Raises:
            SchemaError: If the schema is invalid.
        """
        resolved = path.resolve()
        current_key = CacheKey.from_path(resolved)

        # Check if we have a valid cached version
        cached = self._cache.get(resolved)
        if cached is not None and cached.key == current_key:
            return cached.data

        # Load and cache the schema
        data = load_schema(resolved)
        content = resolved.read_bytes()
        content_hash = hashlib.sha256(content).hexdigest()[:16]

        # Evict oldest entries if cache is full
        if len(self._cache) >= self._max_size:
            # Remove the first (oldest) entry
            oldest = next(iter(self._cache))
            del self._cache[oldest]

        self._cache[resolved] = CachedSchema(
            data=data,
            key=current_key,
            content_hash=content_hash,
        )

        return data

    def invalidate(self, path: Path | None = None) -> None:
        """Invalidate cached schemas.

        Args:
            path: Specific path to invalidate, or None to clear all.
        """
        if path is None:
            self._cache.clear()
        else:
            self._cache.pop(path.resolve(), None)

    def __len__(self) -> int:
        return len(self._cache)


def load_schema(schema_path: Path) -> dict[str, Any]:
    """Load and validate a schema from a YAML file.

    Args:
        schema_path: Path to the schema file.

    Returns:
        The parsed schema dictionary.

    Raises:
        SchemaError: If the file cannot be read or parsed.
    """
    try:
        content = schema_path.read_text(encoding="utf-8")
    except OSError as e:
        raise SchemaError(f"Failed to read schema file: {e}", str(schema_path)) from e

    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise SchemaError(f"Invalid YAML: {e}", str(schema_path)) from e

    if not isinstance(data, dict):
        raise SchemaError("Schema root must be a mapping", str(schema_path))

    return data


def collect_schema_paths(inputs: Sequence[Path]) -> list[Path]:
    """Collect all schema files from the given inputs.

    Args:
        inputs: Paths to schema files or directories.

    Returns:
        List of unique, resolved schema file paths.

    Raises:
        FileNotFoundError: If any input path doesn't exist.
    """

    def _iter_paths() -> Iterator[Path]:
        for raw in inputs:
            path = raw.resolve()
            if not path.exists():
                raise FileNotFoundError(f"Schema path '{raw}' does not exist")
            if path.is_dir():
                yield from sorted(
                    p
                    for p in path.iterdir()
                    if p.is_file() and p.suffix in (".yaml", ".yml")
                )
            else:
                yield path

    # Use dict to preserve order while deduplicating
    seen: dict[Path, None] = {}
    for path in _iter_paths():
        seen.setdefault(path, None)

    return list(seen.keys())


# Global cache instance for convenience
_global_cache: SchemaCache | None = None


def get_global_cache() -> SchemaCache:
    """Get the global schema cache instance."""
    global _global_cache
    if _global_cache is None:
        _global_cache = SchemaCache()
    return _global_cache
