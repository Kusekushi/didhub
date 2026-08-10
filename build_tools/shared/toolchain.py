"""Toolchain version detection and compatibility checking."""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import NamedTuple


class Version(NamedTuple):
    """Semantic version tuple."""

    major: int
    minor: int
    patch: int

    @classmethod
    def parse(cls, version_string: str) -> Version:
        """Parse a version string like '0.16.0' into a Version tuple."""
        match = re.search(r"(\d+)\.(\d+)\.(\d+)", version_string)
        if not match:
            raise ValueError(f"Cannot parse version from: {version_string}")
        return cls(int(match.group(1)), int(match.group(2)), int(match.group(3)))

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}"

    def __ge__(self, other: Version) -> bool:
        return (self.major, self.minor, self.patch) >= (
            other.major,
            other.minor,
            other.patch,
        )

    def __lt__(self, other: Version) -> bool:
        return (self.major, self.minor, self.patch) < (
            other.major,
            other.minor,
            other.patch,
        )


@dataclass(frozen=True)
class ToolchainInfo:
    """Information about a detected toolchain."""

    name: str
    version: Version | None
    path: str | None
    available: bool


def detect_zig() -> ToolchainInfo:
    """Detect Zig toolchain version and availability."""
    zig_path = shutil.which("zig")
    if not zig_path:
        return ToolchainInfo(name="zig", version=None, path=None, available=False)

    try:
        result = subprocess.run(
            [zig_path, "version"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        version = Version.parse(result.stdout.strip())
        return ToolchainInfo(name="zig", version=version, path=zig_path, available=True)
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
        OSError,
        ValueError,
    ):
        return ToolchainInfo(name="zig", version=None, path=zig_path, available=True)


def detect_cargo() -> ToolchainInfo:
    """Detect Cargo/Rust toolchain version and availability."""
    cargo_path = shutil.which("cargo")
    if not cargo_path:
        return ToolchainInfo(name="cargo", version=None, path=None, available=False)

    try:
        result = subprocess.run(
            [cargo_path, "--version"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        version = Version.parse(result.stdout.strip())
        return ToolchainInfo(
            name="cargo", version=version, path=cargo_path, available=True
        )
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
        OSError,
        ValueError,
    ):
        return ToolchainInfo(name="cargo", version=None, path=cargo_path, available=True)


_ZIG_MIN_VERSION = Version(0, 13, 0)
_ZIG_MAX_VERSION = Version(0, 15, 99)


def check_zig_compatibility() -> tuple[bool, str]:
    """Check if the installed Zig version is compatible with the runtime tools.

    Returns:
        Tuple of (is_compatible, message).
    """
    info = detect_zig()

    if not info.available:
        return False, "Zig is not installed"

    if info.version is None:
        return True, "Zig is available but version could not be determined"

    if info.version < _ZIG_MIN_VERSION:
        return (
            False,
            f"Zig {info.version} is too old. Minimum required: {_ZIG_MIN_VERSION}",
        )

    if info.version > _ZIG_MAX_VERSION:
        return (
            False,
            f"Zig {info.version} is not yet supported. "
            f"Maximum supported: {_ZIG_MAX_VERSION}. "
            "The runtime tools use APIs that changed in Zig 0.16.0.",
        )

    return True, f"Zig {info.version} is compatible"
