#!/usr/bin/env python3
"""
Development environment setup script.

Sets up all dependencies and tools needed for development:
- Checks for required tools (cargo, pnpm, zig, etc.)
- Installs Rust dependencies
- Installs frontend dependencies
- Installs Python dependencies for build tools
- Sets up pre-commit hooks
- Copies example config files
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
FRONTEND_DIR = ROOT / "frontend"
BUILD_TOOLS_DIR = ROOT / "build_tools"
EXAMPLE_CONFIG_DIR = ROOT / "example"


@dataclass
class ToolCheck:
    """Result of a tool availability check."""
    name: str
    command: str
    available: bool
    version: str = ""
    required: bool = True


def check_tool(name: str, command: str, *, required: bool = True) -> ToolCheck:
    """Check if a tool is available."""
    try:
        result = subprocess.run(
            [command, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            # Extract first line of version output
            version = result.stdout.strip().split("\n")[0]
            return ToolCheck(name, command, True, version, required)
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return ToolCheck(name, command, False, "", required)


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


def check_all_tools() -> list[ToolCheck]:
    """Check all required and optional tools."""
    print("\nChecking required tools...")
    print("=" * 40)
    
    tools = [
        check_tool("Rust/Cargo", "cargo", required=True),
        check_tool("pnpm", "pnpm", required=True),
        check_tool("Python", sys.executable, required=True),
        check_tool("Zig", "zig", required=False),
        check_tool("Docker", "docker", required=False),
        check_tool("Git", "git", required=True),
        check_tool("pre-commit", "pre-commit", required=False),
    ]
    
    for tool in tools:
        if tool.available:
            print(f"  [OK] {tool.name}: {tool.version}")
        else:
            marker = "[FAIL]" if tool.required else "[--]"
            status = "NOT FOUND" if tool.required else "not found (optional)"
            print(f"  {marker} {tool.name}: {status}")
    
    return tools


def install_rust_deps() -> bool:
    """Install/update Rust dependencies."""
    print("\n" + "=" * 40)
    print("Installing Rust dependencies...")
    print("=" * 40)
    
    # Just build to fetch deps
    return run_command([
        "cargo", "fetch",
        "--manifest-path", str(BACKEND_DIR / "Cargo.toml"),
    ])


def install_frontend_deps() -> bool:
    """Install frontend dependencies."""
    print("\n" + "=" * 40)
    print("Installing frontend dependencies...")
    print("=" * 40)
    
    if not FRONTEND_DIR.exists():
        print(f"Warning: Frontend directory not found: {FRONTEND_DIR}")
        return True
    
    return run_command(["pnpm", "install"], cwd=FRONTEND_DIR)


def install_python_deps() -> bool:
    """Install Python dependencies for build tools."""
    print("\n" + "=" * 40)
    print("Installing Python dependencies...")
    print("=" * 40)
    
    success = True
    requirements_files = list(BUILD_TOOLS_DIR.rglob("requirements.txt"))
    
    if not requirements_files:
        print("No requirements.txt files found.")
        return True
    
    # Collect all requirements
    all_packages: set[str] = set()
    for req_file in requirements_files:
        with open(req_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    all_packages.add(line)
    
    if all_packages:
        print(f"Installing: {', '.join(sorted(all_packages))}")
        success = run_command([
            sys.executable, "-m", "pip", "install",
            *sorted(all_packages),
        ])
    
    # Also install dev dependencies
    dev_packages = ["pytest", "ruff"]
    print(f"\nInstalling dev tools: {', '.join(dev_packages)}")
    run_command([sys.executable, "-m", "pip", "install", *dev_packages], check=False)
    
    return success


def setup_precommit() -> bool:
    """Set up pre-commit hooks."""
    print("\n" + "=" * 40)
    print("Setting up pre-commit hooks...")
    print("=" * 40)
    
    config_file = ROOT / ".pre-commit-config.yaml"
    if not config_file.exists():
        print("No .pre-commit-config.yaml found. Skipping.")
        return True
    
    # Check if pre-commit is installed
    try:
        subprocess.run(["pre-commit", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("pre-commit not installed. Installing...")
        run_command([sys.executable, "-m", "pip", "install", "pre-commit"])
    
    return run_command(["pre-commit", "install"])


def setup_configs() -> bool:
    """Copy example config files if they don't exist."""
    print("\n" + "=" * 40)
    print("Setting up configuration files...")
    print("=" * 40)
    
    if not EXAMPLE_CONFIG_DIR.exists():
        print("No example config directory found.")
        return True
    
    copied = 0
    for example_file in EXAMPLE_CONFIG_DIR.glob("config.example.*"):
        # Convert config.example.yaml -> config.yaml
        dest_name = example_file.name.replace(".example", "")
        dest = ROOT / dest_name
        
        if not dest.exists():
            shutil.copy(example_file, dest)
            print(f"  Copied: {example_file.name} -> {dest_name}")
            copied += 1
        else:
            print(f"  Exists: {dest_name} (skipped)")
    
    if copied == 0:
        print("  No new config files copied.")
    
    return True


def install_cargo_tools() -> bool:
    """Install useful cargo tools."""
    print("\n" + "=" * 40)
    print("Installing Cargo tools...")
    print("=" * 40)
    
    tools = [
        ("cargo-watch", "cargo install cargo-watch"),
        ("cargo-tarpaulin", "cargo install cargo-tarpaulin"),
    ]
    
    for name, install_cmd in tools:
        # Check if already installed
        result = subprocess.run(
            ["cargo", name.replace("cargo-", ""), "--version"],
            capture_output=True,
        )
        if result.returncode == 0:
            print(f"  [OK] {name} already installed")
        else:
            print(f"  Installing {name}...")
            run_command(install_cmd.split(), check=False)
    
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only check if tools are installed, don't set up anything",
    )
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="Skip frontend dependency installation",
    )
    parser.add_argument(
        "--skip-rust",
        action="store_true",
        help="Skip Rust dependency installation",
    )
    parser.add_argument(
        "--skip-python",
        action="store_true",
        help="Skip Python dependency installation",
    )
    parser.add_argument(
        "--skip-precommit",
        action="store_true",
        help="Skip pre-commit hook setup",
    )
    parser.add_argument(
        "--install-cargo-tools",
        action="store_true",
        help="Install useful cargo tools (cargo-watch, cargo-tarpaulin)",
    )
    args = parser.parse_args()

    tools = check_all_tools()
    
    # Check for missing required tools
    missing_required = [t for t in tools if t.required and not t.available]
    if missing_required:
        print("\n⚠ Missing required tools:")
        for tool in missing_required:
            print(f"  - {tool.name} ({tool.command})")
        if args.check_only:
            sys.exit(1)
        print("\nPlease install these tools before continuing.")
        sys.exit(1)

    if args.check_only:
        print("\n[OK] All required tools are available.")
        return

    success = True

    if not args.skip_rust:
        success = install_rust_deps() and success

    if not args.skip_frontend:
        success = install_frontend_deps() and success

    if not args.skip_python:
        success = install_python_deps() and success

    if not args.skip_precommit:
        success = setup_precommit() and success

    success = setup_configs() and success

    if args.install_cargo_tools:
        success = install_cargo_tools() and success

    print("\n" + "=" * 40)
    if success:
        print("[OK] Development environment setup complete!")
        print("\nNext steps:")
        print("  1. Copy and edit config: cp example/config.example.yaml config.yaml")
        print("  2. Run the build: python build_tools/full_build.py")
        print("  3. Start dev servers: python build_tools/dev_server.py")
    else:
        print("⚠ Setup completed with some errors.")
        sys.exit(1)


if __name__ == "__main__":
    main()