#!/usr/bin/env python3
"""
Packaging script for DIDAlterHub.

Creates a comprehensive distribution package containing:
- Backend executable
- All runtime tools
- Example configuration
- Documentation

Supports cross-platform packaging with automatic platform detection.
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = ROOT / "dist"
BACKEND_TARGET = ROOT / "backend" / "target"
RUNTIME_TOOLS = ROOT / "runtime_tools"
FRONTEND_APP = ROOT / "frontend" / "app"


def get_platform_info() -> tuple[str, str]:
    """Get platform and architecture information."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    # Normalize platform names
    if system == "windows":
        platform_name = "windows"
    elif system == "linux":
        platform_name = "linux"
    elif system == "darwin":
        platform_name = "macos"
    else:
        platform_name = system

    # Normalize architecture names
    if machine in ["x86_64", "amd64"]:
        arch = "x64"
    elif machine in ["aarch64", "arm64"]:
        arch = "arm64"
    elif machine == "i386":
        arch = "x86"
    else:
        arch = machine

    return f"{platform_name}-{arch}", "" if platform_name == "windows" else ""


def get_binary_extension() -> str:
    """Get the binary file extension for the current platform."""
    return ".exe" if platform.system() == "Windows" else ""


def run_command(
    command: list[str],
    cwd: Path = ROOT,
    *,
    check: bool = True,
    capture: bool = False,
) -> subprocess.CompletedProcess:
    """Run a command with proper error handling."""
    print(f"$ {' '.join(str(c) for c in command)}")
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
        raise


def build_frontend() -> Path:
    """Build the frontend application."""
    frontend_dir = FRONTEND_APP
    if not frontend_dir.exists():
        raise FileNotFoundError(f"Frontend directory not found: {frontend_dir}")

    # Check if pnpm is available, otherwise use npm
    try:
        run_command(["pnpm", "--version"], capture=True)
        package_manager = "pnpm"
    except subprocess.CalledProcessError:
        package_manager = "npm"

    # Install dependencies if node_modules doesn't exist
    node_modules = frontend_dir / "node_modules"
    if not node_modules.exists():
        print("Installing frontend dependencies...")
        run_command([package_manager, "install"], cwd=frontend_dir)

    # Build the frontend
    print("Building frontend...")
    run_command([package_manager, "run", "build"], cwd=frontend_dir)

    # Return the dist directory
    dist_dir = frontend_dir / "dist"
    if not dist_dir.exists():
        raise FileNotFoundError(f"Frontend build directory not found: {dist_dir}")

    return dist_dir


def get_version() -> str:
    """Get the current version from Cargo.toml."""
    cargo_toml = ROOT / "backend" / "didhub-backend" / "Cargo.toml"
    content = cargo_toml.read_text()

    import re

    match = re.search(r'version\s*=\s*"([^"]+)"', content)
    if not match:
        raise ValueError("Could not find version in Cargo.toml")

    return match.group(1)


def create_comprehensive_package(version: str, release: bool = True) -> Path:
    """Create a single comprehensive package with backend, runtime tools, config, docs, and frontend."""
    platform_info, _ = get_platform_info()
    binary_ext = get_binary_extension()

    profile = "release" if release else "debug"
    target_dir = BACKEND_TARGET / profile

    if not target_dir.exists():
        raise FileNotFoundError(f"Target directory not found: {target_dir}")

    backend_binary = target_dir / f"didhub-backend{binary_ext}"
    if not backend_binary.exists():
        raise FileNotFoundError(f"Backend binary not found: {backend_binary}")

    # Build frontend
    try:
        frontend_dist = build_frontend()
        print(f"Frontend built successfully: {frontend_dist}")
    except Exception as e:
        print(f"Warning: Failed to build frontend: {e}")
        frontend_dist = None

    # Create package directory
    package_name = f"didhub-{version}-{platform_info}"
    package_dir = DIST_DIR / package_name
    package_dir.mkdir(parents=True, exist_ok=True)

    # Create bin directory for executables
    bin_dir = package_dir / "bin"
    bin_dir.mkdir(exist_ok=True)

    # Copy backend binary
    shutil.copy2(backend_binary, bin_dir / f"didhub-backend{binary_ext}")

    # Copy runtime tools
    tool_executables = {
        "log_collector": f"didhub-log-collector{binary_ext}",
        "log_analyzer": f"didhub-log-analyzer{binary_ext}",
        "config_generator": f"config-generator{binary_ext}",
    }

    for tool_dir in RUNTIME_TOOLS.iterdir():
        if not tool_dir.is_dir():
            continue

        tool_name = tool_dir.name
        bin_dir_src = tool_dir / "zig-out" / "bin"
        if not bin_dir_src.exists():
            print(f"Warning: Binary directory not found for {tool_name}: {bin_dir_src}")
            continue

        exe_name = tool_executables.get(tool_name)
        if not exe_name:
            print(f"Warning: Unknown tool {tool_name}")
            continue

        binary = bin_dir_src / exe_name
        if not binary.exists():
            print(f"Warning: Binary not found for {tool_name}: {binary}")
            continue

        # Copy binary to bin directory
        shutil.copy2(binary, bin_dir / exe_name)

    # Copy example config
    config_dir = package_dir / "config"
    config_dir.mkdir(exist_ok=True)
    example_config = ROOT / "example" / ".config.yaml"
    if example_config.exists():
        shutil.copy2(example_config, config_dir / "config.yaml")

    # Copy documentation
    docs_dir = package_dir / "docs"
    docs_dir.mkdir(exist_ok=True)

    docs_to_copy = [
        ROOT / "PACKAGING.md",
        ROOT / "LICENSE",
    ]

    for doc_file in docs_to_copy:
        if doc_file.exists():
            shutil.copy2(doc_file, docs_dir / doc_file.name)

    # Copy frontend static files
    if frontend_dist:
        static_dir = package_dir / "static"
        static_dir.mkdir(exist_ok=True)
        print(f"Copying frontend files to {static_dir}")
        for file_path in frontend_dist.rglob("*"):
            if file_path.is_file():
                relative_path = file_path.relative_to(frontend_dist)
                dest_path = static_dir / relative_path
                dest_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(file_path, dest_path)

    # Create archive
    archive_name = f"{package_name}.zip"
    archive_path = DIST_DIR / archive_name

    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in package_dir.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(package_dir)
                zf.write(file_path, arcname)

    print(f"Created comprehensive package: {archive_path}")
    return archive_path


def create_docker_image(version: str) -> None:
    """Create a Docker image for the backend."""
    dockerfile = ROOT / "Dockerfile"
    if not dockerfile.exists():
        print("Warning: Dockerfile not found, skipping Docker image creation")
        return

    image_name = f"didhub-backend:{version}"
    run_command(["docker", "build", "-t", image_name, "."], cwd=ROOT)
    print(f"Created Docker image: {image_name}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--release",
        action="store_true",
        default=True,
        help="Use release builds (default)",
    )
    parser.add_argument(
        "--debug",
        action="store_false",
        dest="release",
        help="Use debug builds",
    )
    parser.add_argument(
        "--docker",
        action="store_true",
        help="Create Docker image",
    )

    args = parser.parse_args()

    # Clean dist directory
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)

    version = get_version()
    print(f"Packaging version: {version}")

    packages = []

    # Create comprehensive package with backend, runtime tools, config, and docs
    try:
        packages.append(create_comprehensive_package(version, args.release))
    except Exception as e:
        print(f"Error creating comprehensive package: {e}")
        return

    if args.docker:
        try:
            create_docker_image(version)
        except Exception as e:
            print(f"Error creating Docker image: {e}")

    print(f"\nPackaging complete! Created {len(packages)} packages in {DIST_DIR}")
    for package in packages:
        print(f"  - {package.name}")


if __name__ == "__main__":
    main()
