from pathlib import Path
from unittest.mock import MagicMock, patch

from build_tools.shared.process import print_command, resolve_command, run_subprocess


class TestResolveCommand:
    @patch("build_tools.shared.process.sys.platform", "win32")
    @patch("build_tools.shared.process.shutil.which")
    def test_resolve_command_on_windows(self, mock_which):
        mock_which.return_value = "C:\\tools\\pnpm.cmd"

        resolved = resolve_command(["pnpm", "lint"])

        assert resolved == ["C:\\tools\\pnpm.cmd", "lint"]

    @patch("build_tools.shared.process.sys.platform", "linux")
    def test_resolve_command_without_resolution(self):
        resolved = resolve_command(["cargo", "test"])

        assert resolved == ["cargo", "test"]


class TestRunSubprocess:
    @patch("build_tools.shared.process.subprocess.run")
    def test_run_subprocess_with_env_merge(self, mock_run):
        mock_process = MagicMock()
        mock_run.return_value = mock_process

        result = run_subprocess(
            ["cargo", "test"], Path("."), env={"RUST_BACKTRACE": "1"}
        )

        assert result == mock_process
        _, kwargs = mock_run.call_args
        assert kwargs["env"]["RUST_BACKTRACE"] == "1"
        assert kwargs["text"] is True


class TestPrintCommand:
    def test_print_command_with_leading_newline(self, capsys):
        print_command(["cargo", "fmt"], leading_newline=True)

        captured = capsys.readouterr()
        assert captured.out == "\n$ cargo fmt\n"
