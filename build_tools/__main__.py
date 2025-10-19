#!/usr/bin/env python3
"""
Unified build tools CLI for the DIDAlterHub project.

Usage:
    python -m build_tools <command> [options]

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
    python -m build_tools build --release
    python -m build_tools dev --rust
    python -m build_tools test --frontend --coverage
    python -m build_tools lint --check
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Ensure build_tools is importable
BUILD_TOOLS_DIR = Path(__file__).parent
if str(BUILD_TOOLS_DIR.parent) not in sys.path:
    sys.path.insert(0, str(BUILD_TOOLS_DIR.parent))


def cmd_build(args: list[str]) -> int:
    """Run full build."""
    from build_tools import full_build
    sys.argv = ["full_build"] + args
    try:
        full_build.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_dev(args: list[str]) -> int:
    """Start development servers."""
    from build_tools import dev_server
    sys.argv = ["dev_server"] + args
    try:
        dev_server.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 0


def cmd_test(args: list[str]) -> int:
    """Run tests."""
    from build_tools import run_tests
    sys.argv = ["run_tests"] + args
    try:
        run_tests.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_lint(args: list[str]) -> int:
    """Lint and format code."""
    from build_tools import lint_and_format
    sys.argv = ["lint_and_format"] + args
    try:
        lint_and_format.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_clean(args: list[str]) -> int:
    """Clean build artifacts."""
    from build_tools import clean
    sys.argv = ["clean"] + args
    try:
        clean.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_setup(args: list[str]) -> int:
    """Set up development environment."""
    from build_tools import setup_dev_env
    sys.argv = ["setup_dev_env"] + args
    try:
        setup_dev_env.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_docs(args: list[str]) -> int:
    """Generate documentation and coverage."""
    from build_tools import generate_docs_and_coverage
    sys.argv = ["generate_docs_and_coverage"] + args
    try:
        generate_docs_and_coverage.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_release(args: list[str]) -> int:
    """Create a new release."""
    from build_tools import release
    sys.argv = ["release"] + args
    try:
        release.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_package(args: list[str]) -> int:
    """Create distribution packages."""
    from build_tools import package
    sys.argv = ["package"] + args
    try:
        package.main()
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else 1


def cmd_codegen(args: list[str]) -> int:
    """Run code generators."""
    parser = argparse.ArgumentParser(description="Run code generators")
    parser.add_argument(
        "generator",
        choices=["db", "migrations", "api", "all"],
        help="Which generator to run",
    )
    parser.add_argument(
        "extra_args",
        nargs="*",
        help="Additional arguments for the generator",
    )
    
    parsed = parser.parse_args(args)
    
    # Generator configs: (module_name, default_args_factory)
    # default_args_factory returns args to use when no extra_args provided
    root = Path(__file__).parent.parent
    schemas_dir = root / "backend" / "didhub-migrations" / "schemas"
    
    def migrations_default_args() -> list[str]:
        """Get all schema YAML files for migration generator."""
        return [str(p) for p in sorted(schemas_dir.glob("*.yaml"))]
    
    def db_default_args() -> list[str]:
        """Get default args for db codegen."""
        return [
            str(schemas_dir),
            "--crate-dir", str(root / "backend" / "didhub-db"),
        ]
    
    def api_default_args() -> list[str]:
        """API codegen has sensible defaults, no args needed."""
        return []
    
    generators = {
        "migrations": ("migration_generator.main", migrations_default_args),
        "db": ("db_codegen.main", db_default_args),
        "api": ("api_codegen.main", api_default_args),
    }
    
    if parsed.generator == "all":
        to_run = list(generators.keys())
    else:
        to_run = [parsed.generator]
    
    for gen in to_run:
        module_name, default_args_fn = generators[gen]
        print(f"\n{'=' * 40}")
        print(f"Running {gen} generator...")
        print('=' * 40)
        
        import importlib
        module = importlib.import_module(f"build_tools.{module_name}")
        
        # Use extra_args if provided, otherwise use defaults
        gen_args = parsed.extra_args if parsed.extra_args else default_args_fn()
        
        # Migration generator processes one file at a time
        if gen == "migrations" and not parsed.extra_args:
            for schema_file in gen_args:
                print(f"  Processing {Path(schema_file).name}...")
                try:
                    module.main([schema_file])
                except SystemExit as e:
                    if e.code and e.code != 0:
                        return e.code if isinstance(e.code, int) else 1
        else:
            sys.argv = [module_name] + gen_args
            try:
                module.main()
            except SystemExit as e:
                if e.code and e.code != 0:
                    return e.code if isinstance(e.code, int) else 1
    
    return 0


COMMANDS = {
    "build": (cmd_build, "Full project build (codegen + compile)"),
    "dev": (cmd_dev, "Start development servers"),
    "test": (cmd_test, "Run tests"),
    "lint": (cmd_lint, "Lint and format code"),
    "clean": (cmd_clean, "Clean build artifacts"),
    "setup": (cmd_setup, "Set up development environment"),
    "docs": (cmd_docs, "Generate documentation and coverage"),
    "release": (cmd_release, "Create a new release"),
    "package": (cmd_package, "Create distribution packages"),
    "codegen": (cmd_codegen, "Run code generators individually"),
}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        print("Available commands:")
        for name, (_, desc) in COMMANDS.items():
            print(f"  {name:12} {desc}")
        print("\nUse '<command> --help' for command-specific options.")
        return 0
    
    command = sys.argv[1]
    args = sys.argv[2:]
    
    if command not in COMMANDS:
        print(f"Unknown command: {command}")
        print(f"Available commands: {', '.join(COMMANDS.keys())}")
        return 1
    
    handler, _ = COMMANDS[command]
    return handler(args)


if __name__ == "__main__":
    sys.exit(main())
