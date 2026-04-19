from __future__ import annotations

from pathlib import Path


def cargo_manifest_command(
    subcommand: str, manifest_path: Path, *extra_args: str
) -> list[str]:
    """Build a cargo command scoped to a manifest."""
    return ["cargo", subcommand, "--manifest-path", str(manifest_path), *extra_args]
