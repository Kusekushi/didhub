#!/usr/bin/env python3
"""
Development server launcher with hot reload support.

Starts both backend (Rust with cargo-watch) and frontend (Vite) development
servers concurrently. Supports running individual servers with --rust or --frontend.
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
FRONTEND_APP_DIR = ROOT / "frontend" / "app"


class ServerProcess:
    """Manages a subprocess with proper signal handling."""

    def __init__(
        self,
        name: str,
        command: list[str],
        cwd: Path,
        env: dict[str, str] | None = None,
    ):
        self.name = name
        self.command = command
        self.cwd = cwd
        self.env = {**os.environ, **(env or {})}
        self.process: subprocess.Popen | None = None
        self._stopped = threading.Event()

    def start(self) -> None:
        """Start the subprocess."""
        print(f"[{self.name}] Starting: {' '.join(self.command)}")
        print(f"[{self.name}] Working directory: {self.cwd}")

        # On Windows, resolve the executable path to handle .cmd/.bat files
        resolved_cmd = list(self.command)
        if sys.platform == "win32" and self.command:
            resolved = shutil.which(self.command[0])
            if resolved:
                resolved_cmd[0] = resolved

        try:
            self.process = subprocess.Popen(
                resolved_cmd,
                cwd=self.cwd,
                env=self.env,
                # Use CREATE_NEW_PROCESS_GROUP on Windows for proper signal handling
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP
                if sys.platform == "win32"
                else 0,
            )
        except FileNotFoundError as e:
            print(f"[{self.name}] Error: Command not found - {e.filename}")
            print(f"[{self.name}] Make sure the required tools are installed.")
            self._stopped.set()
            return

        # Wait for process to complete
        try:
            self.process.wait()
        except KeyboardInterrupt:
            pass
        finally:
            self._stopped.set()

    def stop(self) -> None:
        """Stop the subprocess gracefully."""
        if self.process and self.process.poll() is None:
            print(f"[{self.name}] Stopping...")
            try:
                if sys.platform == "win32":
                    self.process.terminate()
                else:
                    self.process.send_signal(signal.SIGTERM)
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print(f"[{self.name}] Force killing...")
                self.process.kill()

    def wait(self) -> None:
        """Wait for the process to stop."""
        self._stopped.wait()


def check_cargo_watch() -> bool:
    """Check if cargo-watch is installed."""
    try:
        subprocess.run(
            ["cargo", "watch", "--version"],
            capture_output=True,
            check=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def start_rust_server(config_path: Path | None = None) -> ServerProcess:
    """Create the Rust development server process."""
    if config_path:
        # cargo watch -x "run -- -c path/to/config"
        command = ["cargo", "watch", "-x", f"run -- -c {config_path}"]
    else:
        command = ["cargo", "watch", "-x", "run"]

    return ServerProcess(
        name="Backend",
        command=command,
        cwd=BACKEND_DIR,
        env={"RUST_BACKTRACE": "1"},
    )


def start_frontend_server() -> ServerProcess:
    """Create the frontend development server process."""
    return ServerProcess(
        name="Frontend",
        command=["pnpm", "dev"],
        cwd=FRONTEND_APP_DIR,
    )


def main() -> NoReturn:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--rust",
        action="store_true",
        help="Only start the Rust backend server",
    )
    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Only start the frontend dev server",
    )
    parser.add_argument(
        "--config",
        "-c",
        type=Path,
        help="Path to config file for the backend",
    )
    args = parser.parse_args()

    # Determine which servers to start
    start_backend = args.rust or not args.frontend
    start_frontend_flag = args.frontend or not args.rust

    servers: list[ServerProcess] = []
    threads: list[threading.Thread] = []

    # Check dependencies
    if start_backend and not check_cargo_watch():
        print("Error: cargo-watch is not installed.")
        print("Install it with: cargo install cargo-watch")
        sys.exit(1)

    try:
        if start_backend:
            server = start_rust_server(args.config)
            servers.append(server)
            thread = threading.Thread(target=server.start, daemon=True)
            thread.start()
            threads.append(thread)

        if start_frontend_flag:
            server = start_frontend_server()
            servers.append(server)
            thread = threading.Thread(target=server.start, daemon=True)
            thread.start()
            threads.append(thread)

        print("\nDevelopment servers started. Press Ctrl+C to stop.\n")

        # Wait for any server to exit
        for server in servers:
            server.wait()

    except KeyboardInterrupt:
        print("\n\nShutting down...")
    finally:
        for server in servers:
            server.stop()

    print("Development servers stopped.")
    sys.exit(0)


if __name__ == "__main__":
    main()
