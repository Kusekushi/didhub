#!/usr/bin/env python3
"""
Unified linting and formatting for all project codebases.

Supports:
- Rust: cargo clippy + cargo fmt
- Frontend: ESLint via pnpm
- Python: ruff check + format

Run without arguments to lint/format everything.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
FRONTEND_APP_DIR = ROOT / "frontend" / "app"
BUILD_TOOLS_DIR = ROOT / "build_tools"
RUNTIME_TOOLS_DIR = ROOT / "runtime_tools"


@dataclass
class LintResult:
    """Result of a lint operation."""

    name: str
    success: bool
    fixed: int = 0
    errors: int = 0


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess:
    """Run a command with proper error handling."""
    print(f"\n$ {' '.join(str(c) for c in command)}")
    # On Windows, resolve the executable path to handle .cmd/.bat files
    resolved_cmd = list(command)
    if sys.platform == "win32" and command:
        resolved = shutil.which(command[0])
        if resolved:
            resolved_cmd[0] = resolved
    return subprocess.run(
        resolved_cmd,
        cwd=cwd,
        check=check,
        capture_output=capture,
        text=True,
    )


def lint_rust(*, fix: bool = True) -> LintResult:
    """Lint and format Rust code."""
    print("\n" + "=" * 40)
    print("Linting Rust code...")
    print("=" * 40)

    errors = 0

    # Run clippy
    try:
        clippy_cmd = [
            "cargo",
            "clippy",
            "--manifest-path",
            str(BACKEND_DIR / "Cargo.toml"),
            "--all-targets",
            "--",
            "-D",
            "warnings",
        ]
        if fix:
            clippy_cmd.insert(2, "--fix")
            clippy_cmd.insert(3, "--allow-dirty")
        run_command(clippy_cmd, check=True)
    except subprocess.CalledProcessError:
        errors += 1

    # Run fmt
    try:
        fmt_cmd = [
            "cargo",
            "fmt",
            "--manifest-path",
            str(BACKEND_DIR / "Cargo.toml"),
            "--all",
        ]
        if not fix:
            fmt_cmd.append("--check")
        run_command(fmt_cmd, check=True)
    except subprocess.CalledProcessError:
        errors += 1

    return LintResult("Rust", success=errors == 0, errors=errors)


def lint_frontend(*, fix: bool = True) -> LintResult:
    """Lint frontend TypeScript/JavaScript code."""
    print("\n" + "=" * 40)
    print("Linting frontend code...")
    print("=" * 40)

    if not FRONTEND_APP_DIR.exists():
        print(f"Warning: Frontend directory not found: {FRONTEND_APP_DIR}")
        return LintResult("Frontend", success=True)

    try:
        cmd = ["pnpm", "lint"]
        if fix:
            cmd.append("--fix")
        run_command(cmd, cwd=FRONTEND_APP_DIR, check=True)
        return LintResult("Frontend", success=True)
    except subprocess.CalledProcessError:
        return LintResult("Frontend", success=False, errors=1)


def lint_python(*, fix: bool = True) -> LintResult:
    """Lint and format Python code with ruff."""
    print("\n" + "=" * 40)
    print("Linting Python code...")
    print("=" * 40)

    errors = 0
    fixed = 0

    # Check if ruff is available
    try:
        subprocess.run(
            [sys.executable, "-m", "ruff", "--version"],
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        print("Warning: ruff is not installed. Skipping Python linting.")
        print("Install with: pip install ruff")
        return LintResult("Python", success=True)

    # Run ruff check
    try:
        check_cmd = [
            sys.executable,
            "-m",
            "ruff",
            "check",
            str(BUILD_TOOLS_DIR),
            str(ROOT / "build.py"),
        ]
        if fix:
            check_cmd.append("--fix")
        result = run_command(check_cmd, check=False, capture=True)
        if result.returncode != 0:
            errors += 1
            if result.stdout:
                print(result.stdout)
    except subprocess.CalledProcessError:
        errors += 1

    # Run ruff format
    try:
        format_cmd = [
            sys.executable,
            "-m",
            "ruff",
            "format",
            str(BUILD_TOOLS_DIR),
            str(ROOT / "build.py"),
        ]
        if not fix:
            format_cmd.append("--check")
        run_command(format_cmd, check=True)
    except subprocess.CalledProcessError:
        errors += 1

    return LintResult("Python", success=errors == 0, errors=errors, fixed=fixed)


def lint_zig(*, fix: bool = True) -> LintResult:
    """Lint and format Zig code."""
    print("\n" + "=" * 40)
    print("Linting Zig code...")
    print("=" * 40)

    if not RUNTIME_TOOLS_DIR.exists():
        print(f"Warning: Runtime tools directory not found: {RUNTIME_TOOLS_DIR}")
        return LintResult("Zig", success=True)

    # Check if zig is available
    try:
        subprocess.run(
            ["zig", "version"],
            capture_output=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Warning: zig is not installed. Skipping Zig linting.")
        print("Install Zig from https://ziglang.org/download/")
        return LintResult("Zig", success=True)

    errors = 0

    # Run zig fmt on each runtime tool
    for tool_dir in RUNTIME_TOOLS_DIR.iterdir():
        if tool_dir.is_dir() and (tool_dir / "build.zig").exists():
            try:
                fmt_cmd = ["zig", "fmt"]
                if not fix:
                    fmt_cmd.append("--check")
                fmt_cmd.append(str(tool_dir))
                run_command(fmt_cmd, check=True)
            except subprocess.CalledProcessError:
                errors += 1

    return LintResult("Zig", success=errors == 0, errors=errors)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--rust",
        action="store_true",
        help="Only lint Rust code",
    )
    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Only lint frontend code",
    )
    parser.add_argument(
        "--python",
        action="store_true",
        help="Only lint Python code",
    )
    parser.add_argument(
        "--zig",
        action="store_true",
        help="Only lint Zig code",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check only, don't fix (useful for CI)",
    )
    args = parser.parse_args()

    # If no specific target, lint all
    lint_all = not any([args.rust, args.frontend, args.python, args.zig])
    fix = not args.check

    results: list[LintResult] = []

    if args.rust or lint_all:
        results.append(lint_rust(fix=fix))
    if args.frontend or lint_all:
        results.append(lint_frontend(fix=fix))
    if args.python or lint_all:
        results.append(lint_python(fix=fix))
    if args.zig or lint_all:
        results.append(lint_zig(fix=fix))

    # Print summary
    print("\n" + "=" * 40)
    print("Lint Summary")
    print("=" * 40)

    all_success = True
    for result in results:
        status = "[OK]" if result.success else "[FAIL]"
        print(f"  {status} {result.name}", end="")
        if result.errors > 0:
            print(f" ({result.errors} error(s))", end="")
        if result.fixed > 0:
            print(f" ({result.fixed} fixed)", end="")
        print()
        if not result.success:
            all_success = False

    if all_success:
        print("\nAll checks passed!")
    else:
        print("\nSome checks failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
