"""Tests for build_tools.shared.toolchain."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from build_tools.shared.toolchain import (
    ToolchainInfo,
    Version,
    check_zig_compatibility,
    detect_cargo,
    detect_zig,
)


class TestVersion:
    def test_parse_basic(self):
        v = Version.parse("1.2.3")
        assert v == Version(1, 2, 3)

    def test_parse_with_prefix(self):
        v = Version.parse("cargo 1.80.0 (abc123)")
        assert v == Version(1, 80, 0)

    def test_parse_invalid(self):
        with pytest.raises(ValueError, match="Cannot parse version"):
            Version.parse("not-a-version")

    def test_str(self):
        assert str(Version(1, 2, 3)) == "1.2.3"

    def test_comparison(self):
        assert Version(1, 0, 0) < Version(2, 0, 0)
        assert Version(1, 1, 0) < Version(1, 2, 0)
        assert Version(1, 1, 1) < Version(1, 1, 2)
        assert Version(2, 0, 0) >= Version(1, 0, 0)
        assert Version(1, 0, 0) >= Version(1, 0, 0)


class TestDetectZig:
    @patch("shutil.which", return_value=None)
    def test_zig_not_installed(self, mock_which):
        info = detect_zig()
        assert info.available is False
        assert info.version is None
        assert info.path is None

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/bin/zig")
    def test_zig_installed(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(stdout="0.14.0\n")
        info = detect_zig()
        assert info.available is True
        assert info.version == Version(0, 14, 0)
        assert info.path == "/usr/bin/zig"

    @patch("subprocess.run", side_effect=FileNotFoundError)
    @patch("shutil.which", return_value="/usr/bin/zig")
    def test_zig_version_fails(self, mock_which, mock_run):
        info = detect_zig()
        assert info.available is True
        assert info.version is None


class TestDetectCargo:
    @patch("shutil.which", return_value=None)
    def test_cargo_not_installed(self, mock_which):
        info = detect_cargo()
        assert info.available is False
        assert info.version is None

    @patch("subprocess.run")
    @patch("shutil.which", return_value="/usr/bin/cargo")
    def test_cargo_installed(self, mock_which, mock_run):
        mock_run.return_value = MagicMock(stdout="cargo 1.80.0 (abc123)\n")
        info = detect_cargo()
        assert info.available is True
        assert info.version == Version(1, 80, 0)


class TestCheckZigCompatibility:
    @patch("build_tools.shared.toolchain.detect_zig")
    def test_not_installed(self, mock_detect):
        mock_detect.return_value = ToolchainInfo(
            name="zig", version=None, path=None, available=False
        )
        compatible, message = check_zig_compatibility()
        assert compatible is False
        assert "not installed" in message

    @patch("build_tools.shared.toolchain.detect_zig")
    def test_compatible_version(self, mock_detect):
        mock_detect.return_value = ToolchainInfo(
            name="zig",
            version=Version(0, 14, 0),
            path="/usr/bin/zig",
            available=True,
        )
        compatible, message = check_zig_compatibility()
        assert compatible is True
        assert "compatible" in message

    @patch("build_tools.shared.toolchain.detect_zig")
    def test_too_old(self, mock_detect):
        mock_detect.return_value = ToolchainInfo(
            name="zig",
            version=Version(0, 12, 0),
            path="/usr/bin/zig",
            available=True,
        )
        compatible, message = check_zig_compatibility()
        assert compatible is False
        assert "too old" in message

    @patch("build_tools.shared.toolchain.detect_zig")
    def test_too_new(self, mock_detect):
        mock_detect.return_value = ToolchainInfo(
            name="zig",
            version=Version(0, 16, 0),
            path="/usr/bin/zig",
            available=True,
        )
        compatible, message = check_zig_compatibility()
        assert compatible is False
        assert "not yet supported" in message

    @patch("build_tools.shared.toolchain.detect_zig")
    def test_version_unknown(self, mock_detect):
        mock_detect.return_value = ToolchainInfo(
            name="zig", version=None, path="/usr/bin/zig", available=True
        )
        compatible, message = check_zig_compatibility()
        assert compatible is True
        assert "could not be determined" in message
