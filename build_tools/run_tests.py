#!/usr/bin/env python3
"""
Unified test runner for all project codebases.

Supports:
- Rust: cargo test with optional filtering
- Frontend: Vitest via pnpm
- Python: pytest for build tools
- Zig: zig build test for runtime tools

Run without arguments to test everything.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
FRONTEND_APP_DIR = ROOT / "frontend" / "app"
BUILD_TOOLS_DIR = ROOT / "build_tools"
RUNTIME_TOOLS_DIR = ROOT / "runtime_tools"


@dataclass
class TestResult:
    """Result of a test run."""

    name: str
    success: bool
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    duration: float = 0.0


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    check: bool = True,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess:
    """Run a command with proper error handling."""
    full_env = {**os.environ, **(env or {})}
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
        env=full_env,
    )


def run_rust_tests(
    *,
    filter_pattern: str | None = None,
    release: bool = False,
    verbose: bool = False,
) -> TestResult:
    """Run Rust tests with cargo test."""
    print("\n" + "=" * 40)
    print("Running Rust tests...")
    print("=" * 40)

    start = time.perf_counter()

    command = [
        "cargo",
        "test",
        "--manifest-path",
        str(BACKEND_DIR / "Cargo.toml"),
    ]

    if release:
        command.append("--release")

    if filter_pattern:
        command.extend(["--", filter_pattern])

    if verbose:
        command.append("--nocapture")

    try:
        run_command(command, check=True, env={"RUST_BACKTRACE": "1"})
        duration = time.perf_counter() - start
        return TestResult("Rust", success=True, duration=duration)
    except subprocess.CalledProcessError:
        duration = time.perf_counter() - start
        return TestResult("Rust", success=False, failed=1, duration=duration)


def run_frontend_tests(
    *,
    watch: bool = False,
    coverage: bool = False,
) -> TestResult:
    """Run frontend tests with Vitest."""
    print("\n" + "=" * 40)
    print("Running frontend tests...")
    print("=" * 40)

    if not FRONTEND_APP_DIR.exists():
        print(f"Warning: Frontend directory not found: {FRONTEND_APP_DIR}")
        return TestResult("Frontend", success=True)

    start = time.perf_counter()

    command = ["pnpm", "test"]
    if watch:
        command.append("--watch")
    if coverage:
        command.append("--coverage")

    try:
        run_command(command, cwd=FRONTEND_APP_DIR, check=True)
        duration = time.perf_counter() - start
        return TestResult("Frontend", success=True, duration=duration)
    except subprocess.CalledProcessError:
        duration = time.perf_counter() - start
        return TestResult("Frontend", success=False, failed=1, duration=duration)


def run_zig_tests(*, verbose: bool = False, coverage: bool = False) -> TestResult:
    """Run Zig tests for runtime tools."""
    print("\n" + "=" * 40)
    print("Running Zig runtime tools tests...")
    print("=" * 40)

    start = time.perf_counter()

    # Check if zig is available
    if not shutil.which("zig"):
        print("Warning: zig is not installed. Skipping Zig tests.")
        return TestResult("Zig", success=True, skipped=1)

    # Check if kcov is available for coverage
    if coverage and not shutil.which("kcov"):
        print("Warning: kcov is not installed. Skipping Zig coverage.")
        coverage = False

    # Tools with test steps
    zig_tools = [
        ("config_generator", RUNTIME_TOOLS_DIR / "config_generator"),
        ("log_analyzer", RUNTIME_TOOLS_DIR / "log_analyzer"),
        ("log_collector", RUNTIME_TOOLS_DIR / "log_collector"),
    ]

    total_failed = 0
    total_attempted = 0
    coverage_dirs = []
    for name, tool_dir in zig_tools:
        if not tool_dir.exists():
            print(f"Warning: {name} directory not found: {tool_dir}")
            continue

        total_attempted += 1

        print(f"\nTesting {name}...")
        if coverage:
            coverage_dir = Path("coverage") / "zig" / name
            coverage_dir.mkdir(parents=True, exist_ok=True)
            coverage_dirs.append(coverage_dir)
            command = [
                "kcov",
                "--include-pattern=src/",
                str(coverage_dir),
                "zig",
                "build",
                "test",
            ]
        else:
            command = ["zig", "build", "test"]
        if verbose:
            command.append("--verbose")

        try:
            run_command(command, cwd=tool_dir, check=True)
        except subprocess.CalledProcessError:
            total_failed += 1

    # If coverage, combine lcov files
    if coverage and coverage_dirs:
        print("\nCombining Zig coverage reports...")
        combined_lcov = Path("coverage") / "zig-coverage.lcov"
        combined_lcov.parent.mkdir(parents=True, exist_ok=True)
        first = True
        for cov_dir in coverage_dirs:
            lcov_file = cov_dir / "lcov.info"
            if lcov_file.exists():
                if first:
                    # Copy first
                    shutil.copy(lcov_file, combined_lcov)
                    first = False
                else:
                    # Append
                    with open(combined_lcov, "a") as out:
                        with open(lcov_file) as f:
                            out.write(f.read())
        if not first:
            print(f"Combined coverage report saved to {combined_lcov}")
        else:
            print("No coverage reports found to combine.")

    duration = time.perf_counter() - start
    return TestResult(
        "Zig",
        success=total_failed == 0,
        passed=total_attempted - total_failed,
        failed=total_failed,
        duration=duration,
    )


def run_python_tests(*, verbose: bool = False) -> TestResult:
    """Run Python tests with pytest."""
    print("\n" + "=" * 40)
    print("Running Python tests...")
    print("=" * 40)

    start = time.perf_counter()

    # Check if pytest is available
    try:
        subprocess.run(
            [sys.executable, "-m", "pytest", "--version"],
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError:
        print("Warning: pytest is not installed. Skipping Python tests.")
        print("Install with: pip install pytest")
        return TestResult("Python", success=True, skipped=1)

    command = [sys.executable, "-m", "pytest", str(BUILD_TOOLS_DIR)]
    if verbose:
        command.append("-v")

    try:
        run_command(command, check=True)
        duration = time.perf_counter() - start
        return TestResult("Python", success=True, duration=duration)
    except subprocess.CalledProcessError:
        duration = time.perf_counter() - start
        return TestResult("Python", success=False, failed=1, duration=duration)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--rust",
        action="store_true",
        help="Only run Rust tests",
    )
    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Only run frontend tests",
    )
    parser.add_argument(
        "--python",
        action="store_true",
        help="Only run Python tests",
    )
    parser.add_argument(
        "--zig",
        action="store_true",
        help="Only run Zig runtime tools tests",
    )
    parser.add_argument(
        "--zig-coverage",
        action="store_true",
        help="Collect coverage for Zig tests",
    )
    parser.add_argument(
        "--filter",
        "-f",
        type=str,
        help="Filter pattern for Rust tests",
    )
    parser.add_argument(
        "--release",
        action="store_true",
        help="Run Rust tests in release mode",
    )
    parser.add_argument(
        "--coverage",
        action="store_true",
        help="Collect coverage for frontend tests",
    )
    parser.add_argument(
        "--watch",
        "-w",
        action="store_true",
        help="Watch mode for frontend tests",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Verbose output",
    )
    args = parser.parse_args()

    # If no specific target, test all
    test_all = not any([args.rust, args.frontend, args.python, args.zig])

    results: list[TestResult] = []
    total_start = time.perf_counter()

    if args.rust or test_all:
        results.append(
            run_rust_tests(
                filter_pattern=args.filter,
                release=args.release,
                verbose=args.verbose,
            )
        )

    if args.frontend or test_all:
        results.append(
            run_frontend_tests(
                watch=args.watch,
                coverage=args.coverage,
            )
        )

    if args.python or test_all:
        results.append(run_python_tests(verbose=args.verbose))

    if args.zig or test_all:
        results.append(run_zig_tests(verbose=args.verbose, coverage=args.zig_coverage))

    total_duration = time.perf_counter() - total_start

    # Print summary
    print("\n" + "=" * 40)
    print("Test Summary")
    print("=" * 40)

    all_success = True
    for result in results:
        status = "[OK]" if result.success else "[FAIL]"
        print(f"  {status} {result.name} ({result.duration:.2f}s)", end="")
        if result.failed > 0:
            print(f" - {result.failed} failed", end="")
        if result.skipped > 0:
            print(f" - {result.skipped} skipped", end="")
        print()
        if not result.success:
            all_success = False

    print(f"\nTotal time: {total_duration:.2f}s")

    if all_success:
        print("\nAll tests passed!")
    else:
        print("\nSome tests failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
