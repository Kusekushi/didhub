#!/usr/bin/env python3
"""
Build tool wrapper for DIDAlterHub.

This is a convenience wrapper that forwards to the build_tools module.
Run with --help to see available commands.

Usage:
    python build.py <command> [options]
    ./build.py <command> [options]  (on Unix with execute permission)

Commands:
    build       Full project build (codegen + compile)
    dev         Start development servers
    test        Run tests
    lint        Lint and format code
    clean       Clean build artifacts
    setup       Set up development environment
    docs        Generate documentation and coverage
    release     Create a new release
    package     Create distribution package
    codegen     Run code generators individually

Examples:
    python build.py build --release
    python build.py dev --rust
    python build.py test --frontend --coverage
    python build.py lint --check
    python build.py clean --dry-run
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> int:
    """Forward all arguments to build_tools module."""
    return subprocess.call(
        [sys.executable, "-m", "build_tools"] + sys.argv[1:],
        cwd=ROOT,
    )


if __name__ == "__main__":
    sys.exit(main())
