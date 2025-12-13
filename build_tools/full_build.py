#!/usr/bin/env python3
"""
Full project build orchestrator.

Runs all code generation steps and builds the entire project:
1. Generate SQL migrations from schema files
2. Generate Rust database code
3. Generate API routes and TypeScript client
4. Build Rust backend
5. Build runtime tools (Zig)
6. Optionally build frontend
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_SCRIPT = ROOT / "build_tools" / "migration_generator" / "main.py"
DB_CODEGEN_SCRIPT = ROOT / "build_tools" / "db_codegen" / "main.py"
API_CODEGEN_SCRIPT = ROOT / "build_tools" / "api_codegen" / "main.py"
SCHEMA_DIR = ROOT / "schemas" / "db"
DB_CRATE_DIR = ROOT / "backend" / "didhub-db"
CARGO_MANIFEST = ROOT / "backend" / "Cargo.toml"
FRONTEND_DIR = ROOT / "frontend" / "app"

# Runtime tools directories
RUNTIME_TOOLS = [
    ROOT / "runtime_tools" / "log_collector",
    ROOT / "runtime_tools" / "log_analyzer",
    ROOT / "runtime_tools" / "config_generator",
]


@dataclass
class BuildStep:
    """Represents a build step with timing."""

    name: str
    action: Callable[[], None]
    enabled: bool = True


class BuildError(Exception):
    """Raised when a build step fails."""

    pass


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess:
    """Run a command with proper error handling."""
    print(f"\n$ {' '.join(str(c) for c in command)}")
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=check,
            capture_output=capture,
            text=True,
        )
        return result
    except subprocess.CalledProcessError as e:
        if capture and e.stderr:
            print(e.stderr, file=sys.stderr)
        raise BuildError(f"Command failed: {' '.join(str(c) for c in command)}") from e
    except FileNotFoundError as e:
        raise BuildError(f"Command not found: {e.filename}") from e


def generate_migrations() -> None:
    """Generate SQL migrations from schema YAML files."""
    schema_files = sorted(SCHEMA_DIR.glob("*.y*ml"))
    if not schema_files:
        print(f"Warning: No schema files found in {SCHEMA_DIR}")
        return

    print(f"Found {len(schema_files)} schema file(s)")
    for schema_file in schema_files:
        run_command([sys.executable, str(MIGRATION_SCRIPT), str(schema_file)])


def generate_db_code() -> None:
    """Generate Rust database code from schemas."""
    run_command(
        [
            sys.executable,
            str(DB_CODEGEN_SCRIPT),
            str(SCHEMA_DIR),
            "--crate-dir",
            str(DB_CRATE_DIR),
        ]
    )


def generate_api_code() -> None:
    """Generate API routes and TypeScript client."""
    run_command([sys.executable, str(API_CODEGEN_SCRIPT)])


def build_rust(*, release: bool = False, check_only: bool = False) -> None:
    """Build the Rust backend."""
    if check_only:
        command = ["cargo", "check", "--manifest-path", str(CARGO_MANIFEST)]
    else:
        command = ["cargo", "build", "--manifest-path", str(CARGO_MANIFEST)]
        if release:
            command.append("--release")
    run_command(command)


def build_runtime_tools(*, release: bool = False) -> None:
    """Build Zig runtime tools."""
    for tool_dir in RUNTIME_TOOLS:
        if not tool_dir.exists():
            print(f"Warning: Runtime tool directory not found: {tool_dir}")
            continue

        if not (tool_dir / "build.zig").exists():
            continue

        command = ["zig", "build"]
        if release:
            command.append("--release=fast")

        print(f"\nBuilding {tool_dir.name}...")
        run_command(command, cwd=tool_dir)


def build_frontend() -> None:
    """Build the frontend application."""
    if not FRONTEND_DIR.exists():
        print(f"Warning: Frontend directory not found: {FRONTEND_DIR}")
        return

    # Install dependencies if needed
    if not (FRONTEND_DIR / "node_modules").exists():
        run_command(["pnpm", "install"], cwd=FRONTEND_DIR)

    run_command(["pnpm", "build"], cwd=FRONTEND_DIR)


def run_build_steps(steps: list[BuildStep], *, verbose: bool = False) -> None:
    """Execute build steps with timing."""
    total_start = time.perf_counter()
    results: list[tuple[str, float, bool]] = []

    for step in steps:
        if not step.enabled:
            continue

        print(f"\n{'=' * 60}")
        print(f"Step: {step.name}")
        print("=" * 60)

        step_start = time.perf_counter()
        try:
            step.action()
            elapsed = time.perf_counter() - step_start
            results.append((step.name, elapsed, True))
            print(f"\n[OK] {step.name} completed in {elapsed:.2f}s")
        except BuildError as e:
            elapsed = time.perf_counter() - step_start
            results.append((step.name, elapsed, False))
            print(f"\n[FAIL] {step.name} failed after {elapsed:.2f}s")
            print(f"Error: {e}")
            raise SystemExit(1)

    total_elapsed = time.perf_counter() - total_start

    print(f"\n{'=' * 60}")
    print("Build Summary")
    print("=" * 60)
    for name, elapsed, success in results:
        status = "[OK]" if success else "[FAIL]"
        print(f"  {status} {name}: {elapsed:.2f}s")
    print(f"\nTotal time: {total_elapsed:.2f}s")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--release",
        action="store_true",
        help="Build in release mode with optimizations",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check code (cargo check) without building",
    )
    parser.add_argument(
        "--include-frontend",
        action="store_true",
        help="Also build the frontend application",
    )
    parser.add_argument(
        "--skip-codegen",
        action="store_true",
        help="Skip code generation steps",
    )
    parser.add_argument(
        "--skip-runtime-tools",
        action="store_true",
        help="Skip building runtime tools",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Show verbose output",
    )
    args = parser.parse_args()

    steps = [
        BuildStep(
            "Generate Migrations", generate_migrations, enabled=not args.skip_codegen
        ),
        BuildStep("Generate DB Code", generate_db_code, enabled=not args.skip_codegen),
        BuildStep(
            "Generate API Code", generate_api_code, enabled=not args.skip_codegen
        ),
        BuildStep(
            "Build Rust Backend",
            lambda: build_rust(release=args.release, check_only=args.check),
        ),
        BuildStep(
            "Build Runtime Tools",
            lambda: build_runtime_tools(release=args.release),
            enabled=not args.skip_runtime_tools,
        ),
        BuildStep("Build Frontend", build_frontend, enabled=args.include_frontend),
    ]

    try:
        run_build_steps(steps, verbose=args.verbose)
    except KeyboardInterrupt:
        print("\n\nBuild interrupted.")
        sys.exit(130)


if __name__ == "__main__":
    main()
