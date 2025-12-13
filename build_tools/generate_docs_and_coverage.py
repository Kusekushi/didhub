#!/usr/bin/env python3
"""
Documentation and test coverage generator.

Generates:
- Rust documentation with cargo doc
- Frontend TypeScript documentation (if typedoc configured)
- Test coverage reports for Rust and frontend
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
FRONTEND_APP_DIR = ROOT / "frontend" / "app"
DOCS_DIR = ROOT / "docs"
COVERAGE_DIR = ROOT / "coverage"


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    check: bool = True,
) -> bool:
    """Run a command, returning success status."""
    print(f"\n$ {' '.join(str(c) for c in command)}")
    # On Windows, resolve the executable path to handle .cmd/.bat files
    resolved_cmd = list(command)
    if sys.platform == "win32" and command:
        resolved = shutil.which(command[0])
        if resolved:
            resolved_cmd[0] = resolved
    try:
        subprocess.run(resolved_cmd, cwd=cwd, check=check)
        return True
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError as e:
        print(f"Error: {e.filename} not found")
        return False


def generate_rust_docs(*, open_browser: bool = False) -> bool:
    """Generate Rust documentation with cargo doc."""
    print("\n" + "=" * 40)
    print("Generating Rust documentation...")
    print("=" * 40)

    command = [
        "cargo",
        "doc",
        "--manifest-path",
        str(BACKEND_DIR / "Cargo.toml"),
        "--no-deps",
        "--document-private-items",
    ]

    if open_browser:
        command.append("--open")

    return run_command(command)


def generate_frontend_docs() -> bool:
    """Generate frontend TypeScript documentation."""
    print("\n" + "=" * 40)
    print("Generating frontend documentation...")
    print("=" * 40)

    if not FRONTEND_APP_DIR.exists():
        print(f"Frontend directory not found: {FRONTEND_APP_DIR}")
        return True

    # Check if docs script exists in package.json
    package_json = FRONTEND_APP_DIR / "package.json"
    if package_json.exists():
        import json

        with open(package_json) as f:
            pkg = json.load(f)

        if "docs" in pkg.get("scripts", {}):
            return run_command(["pnpm", "run", "docs"], cwd=FRONTEND_APP_DIR)

    print("No docs script found in frontend package.json. Skipping.")
    return True


def run_rust_coverage(*, open_browser: bool = False) -> bool:
    """Run Rust test coverage with cargo-tarpaulin."""
    print("\n" + "=" * 40)
    print("Running Rust test coverage...")
    print("=" * 40)

    # Check if tarpaulin is installed
    result = subprocess.run(
        ["cargo", "tarpaulin", "--version"],
        capture_output=True,
    )
    if result.returncode != 0:
        print("cargo-tarpaulin is not installed.")
        print("Install with: cargo install cargo-tarpaulin")
        return False

    # Create coverage directory
    COVERAGE_DIR.mkdir(exist_ok=True)

    output_file = COVERAGE_DIR / "rust-coverage.html"

    success = run_command(
        [
            "cargo",
            "tarpaulin",
            "--manifest-path",
            str(BACKEND_DIR / "Cargo.toml"),
            "--out",
            "Html",
            "--output-dir",
            str(COVERAGE_DIR),
        ]
    )

    if success and open_browser and output_file.exists():
        webbrowser.open(f"file://{output_file}")

    return success


def run_frontend_coverage(*, open_browser: bool = False) -> bool:
    """Run frontend test coverage."""
    print("\n" + "=" * 40)
    print("Running frontend test coverage...")
    print("=" * 40)

    if not FRONTEND_APP_DIR.exists():
        print(f"Frontend directory not found: {FRONTEND_APP_DIR}")
        return True

    success = run_command(
        ["pnpm", "test", "--coverage"],
        cwd=FRONTEND_APP_DIR,
        check=False,
    )

    coverage_index = FRONTEND_APP_DIR / "coverage" / "index.html"
    if success and open_browser and coverage_index.exists():
        webbrowser.open(f"file://{coverage_index}")

    return success


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--docs",
        action="store_true",
        help="Generate documentation",
    )
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Run test coverage",
    )
    parser.add_argument(
        "--rust",
        action="store_true",
        help="Only for Rust",
    )
    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Only for frontend",
    )
    parser.add_argument(
        "--open",
        action="store_true",
        help="Open results in browser",
    )
    args = parser.parse_args()

    # If nothing specified, do everything
    if not args.docs and not args.coverage:
        args.docs = args.coverage = True

    target_all = not args.rust and not args.frontend

    success = True

    if args.docs:
        if args.rust or target_all:
            success = generate_rust_docs(open_browser=args.open) and success
        if args.frontend or target_all:
            success = generate_frontend_docs() and success

    if args.coverage:
        if args.rust or target_all:
            success = run_rust_coverage(open_browser=args.open) and success
        if args.frontend or target_all:
            success = run_frontend_coverage(open_browser=args.open) and success

    print("\n" + "=" * 40)
    if success:
        print("[OK] Documentation and coverage generation complete!")
    else:
        print("⚠ Completed with some errors.")
        sys.exit(1)


if __name__ == "__main__":
    main()
