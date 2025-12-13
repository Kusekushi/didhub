import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from build_tools.full_build import (
    BuildError,
    BuildStep,
    build_frontend,
    build_rust,
    build_runtime_tools,
    generate_api_code,
    generate_db_code,
    generate_migrations,
    main,
    run_build_steps,
    run_command,
)


class TestRunCommand:
    @patch("subprocess.run")
    def test_run_command_success(self, mock_run):
        mock_process = MagicMock()
        mock_run.return_value = mock_process

        result = run_command(["echo", "hello"])
        assert result == mock_process
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_run_command_failure(self, mock_run):
        mock_run.side_effect = subprocess.CalledProcessError(1, "echo")

        with pytest.raises(BuildError):
            run_command(["echo", "hello"])

    @patch("subprocess.run")
    def test_run_command_file_not_found(self, mock_run):
        mock_run.side_effect = FileNotFoundError("echo")

        with pytest.raises(BuildError):
            run_command(["echo", "hello"])

    @patch("subprocess.run")
    def test_run_command_with_capture_stderr(self, mock_run, capsys):
        mock_run.side_effect = subprocess.CalledProcessError(1, "echo", stderr="error message")

        with pytest.raises(BuildError):
            run_command(["echo", "hello"], capture=True)

        captured = capsys.readouterr()
        assert "error message" in captured.err


class TestGenerateMigrations:
    @patch("build_tools.full_build.run_command")
    @patch("build_tools.full_build.SCHEMA_DIR")
    def test_generate_migrations_with_files(self, mock_schema_dir, mock_run_command):
        mock_schema_dir.glob.return_value = [
            Path("schema1.yaml"),
            Path("schema2.yml"),
        ]

        generate_migrations()

        assert mock_run_command.call_count == 2

    @patch("build_tools.full_build.run_command")
    @patch("build_tools.full_build.SCHEMA_DIR")
    def test_generate_migrations_no_files(self, mock_schema_dir, mock_run_command):
        mock_schema_dir.glob.return_value = []

        generate_migrations()

        mock_run_command.assert_not_called()


class TestGenerateDbCode:
    @patch("build_tools.full_build.run_command")
    def test_generate_db_code(self, mock_run_command):
        generate_db_code()

        mock_run_command.assert_called_once()


class TestGenerateApiCode:
    @patch("build_tools.full_build.run_command")
    def test_generate_api_code(self, mock_run_command):
        generate_api_code()

        mock_run_command.assert_called_once()


class TestBuildRust:
    @patch("build_tools.full_build.run_command")
    def test_build_rust_normal(self, mock_run_command):
        build_rust()

        mock_run_command.assert_called_once_with(
            ["cargo", "build", "--manifest-path", str(Path("/home/kusekushi/Desktop/didhub/backend/Cargo.toml"))]
        )

    @patch("build_tools.full_build.run_command")
    def test_build_rust_release(self, mock_run_command):
        build_rust(release=True)

        mock_run_command.assert_called_once_with(
            ["cargo", "build", "--manifest-path", str(Path("/home/kusekushi/Desktop/didhub/backend/Cargo.toml")), "--release"]
        )

    @patch("build_tools.full_build.run_command")
    def test_build_rust_check_only(self, mock_run_command):
        build_rust(check_only=True)

        mock_run_command.assert_called_once_with(
            ["cargo", "check", "--manifest-path", str(Path("/home/kusekushi/Desktop/didhub/backend/Cargo.toml"))]
        )


class TestBuildRuntimeTools:
    @patch("build_tools.full_build.run_command")
    @patch("pathlib.Path.exists")
    def test_build_runtime_tools_exists(self, mock_exists, mock_run_command):
        mock_exists.return_value = True

        build_runtime_tools()

        # Should call run_command 3 times (one for each tool)
        assert mock_run_command.call_count == 3

    @patch("build_tools.full_build.run_command")
    @patch("pathlib.Path.exists")
    def test_build_runtime_tools_not_exists(self, mock_exists, mock_run_command):
        mock_exists.return_value = False

        build_runtime_tools()

        mock_run_command.assert_not_called()

    @patch("build_tools.full_build.run_command")
    @patch("pathlib.Path.exists")
    def test_build_runtime_tools_missing_build_zig(self, mock_exists, mock_run_command):
        # Mock exists: first tool exists but no build.zig, second and third exist with build.zig
        mock_exists.side_effect = [True, False, True, True, True, True]

        build_runtime_tools()

        # Should call run_command for the 2 tools that have build.zig
        assert mock_run_command.call_count == 2

    @patch("build_tools.full_build.run_command")
    @patch("pathlib.Path.exists")
    def test_build_runtime_tools_release_mode(self, mock_exists, mock_run_command):
        mock_exists.return_value = True

        build_runtime_tools(release=True)

        # Check that --release=fast is in all commands
        for call in mock_run_command.call_args_list:
            args, kwargs = call
            assert "--release=fast" in args[0]


class TestBuildFrontend:
    @patch("build_tools.full_build.run_command")
    @patch("build_tools.full_build.FRONTEND_DIR")
    def test_build_frontend_exists_no_node_modules(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = True
        mock_frontend_dir.__truediv__.return_value.exists.return_value = False

        build_frontend()

        # Should call install and build
        assert mock_run_command.call_count == 2

    @patch("build_tools.full_build.run_command")
    @patch("build_tools.full_build.FRONTEND_DIR")
    def test_build_frontend_exists_with_node_modules(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = True
        mock_frontend_dir.__truediv__.return_value.exists.return_value = True

        build_frontend()

        # Should only call build
        assert mock_run_command.call_count == 1

    @patch("build_tools.full_build.run_command")
    @patch("build_tools.full_build.FRONTEND_DIR")
    def test_build_frontend_not_exists(self, mock_frontend_dir, mock_run_command):
        mock_frontend_dir.exists.return_value = False

        build_frontend()

        mock_run_command.assert_not_called()


class TestRunBuildSteps:
    def test_run_build_steps_success(self, capsys):
        steps = [
            BuildStep("Step 1", lambda: None),
            BuildStep("Step 2", lambda: None),
        ]

        run_build_steps(steps)

        captured = capsys.readouterr()
        assert "[OK] Step 1 completed" in captured.out
        assert "[OK] Step 2 completed" in captured.out

    def test_run_build_steps_failure(self, capsys):
        def failing_action():
            raise BuildError("Test error")

        steps = [
            BuildStep("Step 1", lambda: None),
            BuildStep("Step 2", failing_action),
        ]

        with pytest.raises(SystemExit):
            run_build_steps(steps)

        captured = capsys.readouterr()
        assert "[OK] Step 1 completed" in captured.out
        assert "[FAIL] Step 2 failed" in captured.out

    def test_run_build_steps_disabled(self, capsys):
        steps = [
            BuildStep("Step 1", lambda: None, enabled=False),
            BuildStep("Step 2", lambda: None),
        ]

        run_build_steps(steps)

        captured = capsys.readouterr()
        assert "Step 1" not in captured.out
        assert "[OK] Step 2 completed" in captured.out


class TestMain:
    @patch("build_tools.full_build.run_build_steps")
    @patch("sys.exit")
    def test_main_basic(self, mock_exit, mock_run_build_steps):
        with patch("sys.argv", ["full_build"]):
            main()

        mock_run_build_steps.assert_called_once()

    @patch("build_tools.full_build.run_build_steps")
    @patch("sys.exit")
    def test_main_with_release(self, mock_exit, mock_run_build_steps):
        with patch("sys.argv", ["full_build", "--release"]):
            main()

        mock_run_build_steps.assert_called_once()

    @patch("build_tools.full_build.run_build_steps")
    @patch("sys.exit")
    def test_main_keyboard_interrupt(self, mock_exit, mock_run_build_steps):
        mock_run_build_steps.side_effect = KeyboardInterrupt()

        with patch("sys.argv", ["full_build"]):
            main()

        mock_exit.assert_called_once_with(130)


class TestBuildStep:
    def test_build_step_init(self):
        step = BuildStep("Test Step", lambda: None, enabled=False)
        assert step.name == "Test Step"
        assert step.enabled is False
        assert callable(step.action)


class TestBuildError:
    def test_build_error(self):
        error = BuildError("Test error")
        assert str(error) == "Test error"