import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from build_tools.run_tests import (
    TestResult,
    run_command,
    run_frontend_tests,
    run_python_tests,
    run_rust_tests,
    run_zig_tests,
)


class TestRunCommand:
    @pytest.mark.skipif(sys.platform != "linux", reason="Linux-specific test")
    @patch("subprocess.run")
    def test_run_command_success(self, mock_run):
        mock_process = MagicMock()
        mock_run.return_value = mock_process

        result = run_command(["echo", "hello"], Path("/tmp"))

        mock_run.assert_called_once()
        assert result == mock_process

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific test")
    @patch("subprocess.run")
    @patch("shutil.which")
    def test_run_command_windows_resolution(self, mock_which, mock_run):
        mock_which.return_value = "/path/to/cmd.exe"
        mock_process = MagicMock()
        mock_run.return_value = mock_process

        result = run_command(["cmd"], Path("/tmp"))

        mock_run.assert_called_once()
        args, kwargs = mock_run.call_args
        assert args[0][0] == "/path/to/cmd.exe"


class TestRunRustTests:
    @patch("build_tools.run_tests.run_command")
    def test_run_rust_tests_success(self, mock_run_command):
        mock_run_command.return_value = MagicMock()

        result = run_rust_tests()

        assert result.name == "Rust"
        assert result.success is True
        assert result.failed == 0
        mock_run_command.assert_called_once()

    @patch("build_tools.run_tests.run_command")
    def test_run_rust_tests_failure(self, mock_run_command):
        mock_run_command.side_effect = subprocess.CalledProcessError(1, "cargo")

        result = run_rust_tests()

        assert result.name == "Rust"
        assert result.success is False
        assert result.failed == 1

    @patch("build_tools.run_tests.run_command")
    def test_run_rust_tests_with_options(self, mock_run_command):
        mock_run_command.return_value = MagicMock()

        result = run_rust_tests(filter_pattern="test_*", release=True, verbose=True)

        assert result.success is True
        args, kwargs = mock_run_command.call_args
        command = args[0]
        assert "--release" in command
        assert "--nocapture" in command
        assert "test_*" in command


class TestRunFrontendTests:
    @patch("build_tools.run_tests.run_command")
    @patch("build_tools.run_tests.FRONTEND_APP_DIR")
    def test_run_frontend_tests_success(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = True
        mock_run_command.return_value = MagicMock()

        result = run_frontend_tests()

        assert result.name == "Frontend"
        assert result.success is True
        mock_run_command.assert_called_once()

    @patch("build_tools.run_tests.FRONTEND_APP_DIR")
    def test_run_frontend_tests_dir_not_found(self, mock_frontend_dir):
        mock_frontend_dir.exists.return_value = False

        result = run_frontend_tests()

        assert result.name == "Frontend"
        assert result.success is True  # Warning, not failure

    @patch("build_tools.run_tests.run_command")
    @patch("build_tools.run_tests.FRONTEND_APP_DIR")
    def test_run_frontend_tests_failure(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = True
        mock_run_command.side_effect = subprocess.CalledProcessError(1, "pnpm")

        result = run_frontend_tests()

        assert result.success is False
        assert result.failed == 1

    @patch("build_tools.run_tests.run_command")
    @patch("build_tools.run_tests.FRONTEND_APP_DIR")
    def test_run_frontend_tests_with_options(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = True
        mock_run_command.return_value = MagicMock()

        result = run_frontend_tests(watch=True, coverage=True)

        args, kwargs = mock_run_command.call_args
        command = args[0]
        assert "--watch" in command
        assert "--coverage" in command


class TestRunZigTests:
    @patch("shutil.which")
    def test_run_zig_tests_no_zig(self, mock_which):
        mock_which.return_value = None

        result = run_zig_tests()

        assert result.name == "Zig"
        assert result.success is True
        assert result.skipped == 1

    @patch("build_tools.run_tests.run_command")
    @patch("shutil.which")
    @patch("build_tools.run_tests.RUNTIME_TOOLS_DIR")
    def test_run_zig_tests_success(self, mock_runtime_dir, mock_which, mock_run_command):
        mock_which.return_value = "/usr/bin/zig"
        mock_runtime_dir.__truediv__ = lambda self, x: Path(f"/runtime/{x}")
        # Mock exists for all tools
        with patch("pathlib.Path.exists", return_value=True):
            mock_run_command.return_value = MagicMock()

            result = run_zig_tests()

            assert result.name == "Zig"
            assert result.success is True
            assert result.passed == 3  # 3 tools
            assert result.failed == 0

    @patch("build_tools.run_tests.run_command")
    @patch("shutil.which")
    @patch("build_tools.run_tests.RUNTIME_TOOLS_DIR")
    def test_run_zig_tests_partial_failure(self, mock_runtime_dir, mock_which, mock_run_command):
        mock_which.return_value = "/usr/bin/zig"
        mock_runtime_dir.__truediv__ = lambda self, x: Path(f"/runtime/{x}")

        call_count = 0
        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:  # First call is config_generator
                raise subprocess.CalledProcessError(1, "zig")
            return MagicMock()

        mock_run_command.side_effect = side_effect

        with patch("pathlib.Path.exists", return_value=True):
            result = run_zig_tests()

            assert result.success is False
            assert result.passed == 2
            assert result.failed == 1

    @patch("build_tools.run_tests.run_command")
    @patch("shutil.which")
    def test_run_zig_tests_coverage_no_kcov(self, mock_which, mock_run_command):
        mock_which.side_effect = lambda cmd: cmd == "zig"
        mock_run_command.return_value = MagicMock()

        with patch("builtins.print"):
            result = run_zig_tests(coverage=True)

        assert result.name == "Zig"
        assert result.success is True
        assert result.passed == 3  # Tools exist
        assert result.failed == 0  # Since no tools exist in test

    @patch("build_tools.run_tests.run_command")
    @patch("shutil.which")
    @patch("build_tools.run_tests.RUNTIME_TOOLS_DIR")
    def test_run_zig_tests_with_coverage(self, mock_runtime_dir, mock_which, mock_run_command):
        mock_which.side_effect = lambda cmd: cmd in ["zig", "kcov"]
        mock_runtime_dir.__truediv__ = lambda self, x: Path(f"/runtime/{x}")
        mock_run_command.return_value = MagicMock()

        original_exists = Path.exists
        Path.exists = lambda self: str(self).startswith("/runtime")
        try:
            result = run_zig_tests(coverage=True)
        finally:
            Path.exists = original_exists

        assert result.name == "Zig"
        assert result.success is True
        assert result.passed == 3

class TestRunPythonTests:
    @patch("subprocess.run")
    @patch("build_tools.run_tests.run_command")
    def test_run_python_tests_success(self, mock_run_command, mock_subprocess_run):
        mock_subprocess_run.return_value = MagicMock()
        mock_run_command.return_value = MagicMock()

        result = run_python_tests()

        assert result.name == "Python"
        assert result.success is True

    @patch("subprocess.run")
    def test_run_python_tests_no_pytest(self, mock_subprocess_run):
        mock_subprocess_run.side_effect = subprocess.CalledProcessError(1, "pytest")

        result = run_python_tests()

        assert result.name == "Python"
        assert result.success is True  # Warning, not failure
        assert result.skipped == 1

    @patch("subprocess.run")
    @patch("build_tools.run_tests.run_command")
    def test_run_python_tests_failure(self, mock_run_command, mock_subprocess_run):
        mock_subprocess_run.return_value = MagicMock()
        mock_run_command.side_effect = subprocess.CalledProcessError(1, "pytest")

        result = run_python_tests()

        assert result.success is False
        assert result.failed == 1

    @patch("subprocess.run")
    @patch("build_tools.run_tests.run_command")
    def test_run_python_tests_verbose(self, mock_run_command, mock_subprocess_run):
        mock_subprocess_run.return_value = MagicMock()
        mock_run_command.return_value = MagicMock()

        result = run_python_tests(verbose=True)

        args, kwargs = mock_run_command.call_args
        command = args[0]
        assert "-v" in command


class TestTestResult:
    def test_init(self):
        result = TestResult("Test", True, 5, 1, 2, 10.5)
        assert result.name == "Test"
        assert result.success is True
        assert result.passed == 5
        assert result.failed == 1
        assert result.skipped == 2
        assert result.duration == 10.5

    def test_init_defaults(self):
        result = TestResult("Test", False)
        assert result.name == "Test"
        assert result.success is False
        assert result.passed == 0
        assert result.failed == 0
        assert result.skipped == 0
        assert result.duration == 0.0