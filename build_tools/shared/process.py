from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Mapping, Sequence


def format_command(command: Sequence[str | Path]) -> str:
    """Format a command for display."""
    return " ".join(str(part) for part in command)


def print_command(
    command: Sequence[str | Path], *, leading_newline: bool = False
) -> None:
    """Print a command before execution."""
    prefix = "\n$ " if leading_newline else "$ "
    print(f"{prefix}{format_command(command)}")


def resolve_command(command: Sequence[str | Path]) -> list[str]:
    """Resolve the executable on Windows so .cmd and .bat files work."""
    resolved = [str(part) for part in command]
    if sys.platform == "win32" and resolved:
        executable = shutil.which(resolved[0])
        if executable:
            resolved[0] = executable
    return resolved


def run_subprocess(
    command: Sequence[str | Path],
    cwd: Path,
    *,
    check: bool = True,
    capture: bool = False,
    env: Mapping[str, str] | None = None,
    timeout: float | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with common build-tools behavior."""
    merged_env = None if env is None else {**os.environ, **env}
    return subprocess.run(
        resolve_command(command),
        cwd=cwd,
        check=check,
        capture_output=capture,
        text=True,
        env=merged_env,
        timeout=timeout,
    )
