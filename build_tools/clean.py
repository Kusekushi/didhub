#!/usr/bin/env python3
"""
Clean build artifacts and caches across the project.

Removes:
- Rust target directories
- Node modules and build outputs
- Python caches (__pycache__, .pyc files)
- Zig build outputs
- Generated code (optional)
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parents[1]

# Directories to always clean
CLEAN_DIRS: list[tuple[Path, str]] = [
    (ROOT / "backend" / "target", "Rust build artifacts"),
    (ROOT / "frontend" / "app" / "node_modules", "Frontend node_modules"),
    (ROOT / "frontend" / "app" / "dist", "Frontend build output"),
    (ROOT / "frontend" / "api" / "node_modules", "API client node_modules"),
    (ROOT / "runtime_tools" / "log_collector" / "zig-out", "Log collector build"),
    (ROOT / "runtime_tools" / "log_collector" / "zig-cache", "Log collector cache"),
    (ROOT / "runtime_tools" / "log_analyzer" / "zig-out", "Log analyzer build"),
    (ROOT / "runtime_tools" / "log_analyzer" / "zig-cache", "Log analyzer cache"),
    (ROOT / "runtime_tools" / "config_generator" / "zig-out", "Config generator build"),
    (ROOT / "runtime_tools" / "config_generator" / "zig-cache", "Config generator cache"),
]

# Generated code directories (cleaned only with --generated flag)
GENERATED_DIRS: list[tuple[Path, str]] = [
    (ROOT / "backend" / "didhub-backend" / "src" / "generated", "Backend generated routes"),
    (ROOT / "backend" / "didhub-db" / "src" / "generated", "Database generated code"),
    (ROOT / "backend" / "didhub-migrations" / "src" / "generated", "Generated migrations"),
    (ROOT / "frontend" / "api" / "src", "Frontend API client"),
]


def find_pycache_dirs(root: Path) -> Iterator[Path]:
    """Find all __pycache__ directories under root."""
    for path in root.rglob("__pycache__"):
        if path.is_dir():
            yield path


def find_pyc_files(root: Path) -> Iterator[Path]:
    """Find all .pyc files under root."""
    for path in root.rglob("*.pyc"):
        if path.is_file():
            yield path


def get_dir_size(path: Path) -> int:
    """Get total size of a directory in bytes."""
    if not path.exists():
        return 0
    total = 0
    try:
        for item in path.rglob("*"):
            if item.is_file():
                total += item.stat().st_size
    except (PermissionError, OSError):
        pass
    return total


def format_size(size_bytes: int) -> str:
    """Format size in human-readable form."""
    for unit in ("B", "KB", "MB", "GB"):
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def clean_directory(path: Path, description: str, *, dry_run: bool = False) -> int:
    """Clean a directory, returning bytes freed."""
    if not path.exists():
        return 0
    
    size = get_dir_size(path)
    if dry_run:
        print(f"  Would remove: {path} ({description}) - {format_size(size)}")
    else:
        print(f"  Removing: {path} ({description}) - {format_size(size)}")
        shutil.rmtree(path, ignore_errors=True)
    return size


def clean_file(path: Path, *, dry_run: bool = False) -> int:
    """Clean a file, returning bytes freed."""
    if not path.exists():
        return 0
    
    size = path.stat().st_size
    if dry_run:
        print(f"  Would remove: {path} - {format_size(size)}")
    else:
        path.unlink()
    return size


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be cleaned without removing anything",
    )
    parser.add_argument(
        "--generated",
        action="store_true",
        help="Also clean generated code (requires regeneration)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Clean everything including generated code",
    )
    args = parser.parse_args()

    total_freed = 0

    print("Cleaning build artifacts...")
    for path, description in CLEAN_DIRS:
        total_freed += clean_directory(path, description, dry_run=args.dry_run)

    print("\nCleaning Python caches...")
    for pycache in find_pycache_dirs(ROOT / "build_tools"):
        total_freed += clean_directory(pycache, "__pycache__", dry_run=args.dry_run)
    
    for pyc in find_pyc_files(ROOT / "build_tools"):
        total_freed += clean_file(pyc, dry_run=args.dry_run)

    if args.generated or args.all:
        print("\nCleaning generated code...")
        for path, description in GENERATED_DIRS:
            total_freed += clean_directory(path, description, dry_run=args.dry_run)

    action = "Would free" if args.dry_run else "Freed"
    print(f"\n{action}: {format_size(total_freed)}")
    
    if args.dry_run:
        print("\nRun without --dry-run to actually clean.")


if __name__ == "__main__":
    main()
