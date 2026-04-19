from pathlib import Path

from build_tools.shared.cargo import cargo_manifest_command


def test_cargo_manifest_command():
    manifest_path = Path("backend") / "Cargo.toml"

    assert cargo_manifest_command("test", manifest_path, "--all-targets") == [
        "cargo",
        "test",
        "--manifest-path",
        str(manifest_path),
        "--all-targets",
    ]
