import signal
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from build_tools.dev_server import (
    ServerProcess,
    check_cargo_watch,
    start_frontend_server,
    start_rust_server,
)


class TestCheckCargoWatch:
    @patch("subprocess.run")
    def test_check_cargo_watch_success(self, mock_run):
        mock_run.return_value = MagicMock()
        assert check_cargo_watch() is True
        mock_run.assert_called_once_with(
            ["cargo", "watch", "--version"],
            capture_output=True,
            check=True,
        )

    @patch("subprocess.run")
    def test_check_cargo_watch_failure(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(1, "cargo")
        assert check_cargo_watch() is False

    @patch("subprocess.run")
    def test_check_cargo_watch_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError()
        assert check_cargo_watch() is False


class TestStartRustServer:
    def test_start_rust_server_no_config(self):
        server = start_rust_server()
        assert server.name == "Backend"
        assert server.command == ["cargo", "watch", "-x", "run"]
        assert server.cwd.name == "backend"
        assert server.env["RUST_BACKTRACE"] == "1"

    def test_start_rust_server_with_config(self, tmp_path):
        config_path = tmp_path / "config.toml"
        server = start_rust_server(config_path)
        assert server.command == ["cargo", "watch", "-x", f"run -- -c {config_path}"]


class TestStartFrontendServer:
    def test_start_frontend_server(self):
        server = start_frontend_server()
        assert server.name == "Frontend"
        assert server.command == ["pnpm", "dev"]
        assert server.cwd.name == "app"


class TestServerProcess:
    def test_init(self):
        command = ["echo", "hello"]
        cwd = Path("/tmp")
        env = {"TEST": "value"}
        server = ServerProcess("Test", command, cwd, env)
        assert server.name == "Test"
        assert server.command == command
        assert server.cwd == cwd
        assert server.env["TEST"] == "value"
        assert "PATH" in server.env  # inherited from os.environ

    @pytest.mark.skipif(sys.platform != "linux", reason="Linux-specific test")
    @patch("subprocess.Popen")
    def test_start_success(self, mock_popen):
        mock_process = MagicMock()
        mock_process.wait.return_value = None
        mock_popen.return_value = mock_process

        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        server.start()

        mock_popen.assert_called_once()
        mock_process.wait.assert_called_once()

    @pytest.mark.skipif(sys.platform != "linux", reason="Linux-specific test")
    @patch("subprocess.Popen")
    def test_start_file_not_found(self, mock_popen, capsys):
        mock_popen.side_effect = FileNotFoundError("echo")

        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        server.start()

        captured = capsys.readouterr()
        assert "Command not found" in captured.out

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific test")
    @patch("shutil.which")
    @patch("subprocess.Popen")
    def test_start_windows_resolution(self, mock_popen, mock_which):
        mock_which.return_value = "/path/to/cmd.exe"
        mock_process = MagicMock()
        mock_process.wait.return_value = None
        mock_popen.return_value = mock_process

        server = ServerProcess("Test", ["cmd"], Path("/tmp"))
        server.start()

        mock_popen.assert_called_once()
        args, kwargs = mock_popen.call_args
        assert args[0][0] == "/path/to/cmd.exe"
        # On Windows, creationflags should be set
        assert "creationflags" in kwargs

    @pytest.mark.skipif(sys.platform != "linux", reason="Linux-specific test")
    def test_stop_linux(self):
        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.wait.return_value = None
        server.process = mock_process

        server.stop()

        mock_process.send_signal.assert_called_once_with(signal.SIGTERM)
        mock_process.wait.assert_called_once_with(timeout=5)

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific test")
    def test_stop_windows(self):
        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.wait.return_value = None
        server.process = mock_process

        server.stop()

        mock_process.terminate.assert_called_once()
        mock_process.wait.assert_called_once_with(timeout=5)

    def test_stop_timeout(self):
        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        mock_process = MagicMock()
        mock_process.poll.return_value = None
        mock_process.wait.side_effect = subprocess.TimeoutExpired("cmd", 5)
        server.process = mock_process

        server.stop()

        mock_process.kill.assert_called_once()

    def test_stop_no_process(self):
        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        server.stop()  # Should not raise

    def test_wait(self):
        server = ServerProcess("Test", ["echo"], Path("/tmp"))
        server._stopped.set()
        server.wait()  # Should return immediately
