from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from build_tools import __main__


class TestCmdFunctions:
    @patch("build_tools.full_build.main")
    def test_cmd_build_success(self, mock_main):
        result = __main__.cmd_build([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.full_build.main")
    def test_cmd_build_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_build([])
        assert result == 1

    @patch("build_tools.dev_server.main")
    def test_cmd_dev_success(self, mock_main):
        result = __main__.cmd_dev([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.dev_server.main")
    def test_cmd_dev_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_dev([])
        assert result == 1

    @patch("build_tools.run_tests.main")
    def test_cmd_test_success(self, mock_main):
        result = __main__.cmd_test([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.run_tests.main")
    def test_cmd_test_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_test([])
        assert result == 1

    @patch("build_tools.lint_and_format.main")
    def test_cmd_lint_success(self, mock_main):
        result = __main__.cmd_lint([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.lint_and_format.main")
    def test_cmd_lint_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_lint([])
        assert result == 1

    @patch("build_tools.clean.main")
    def test_cmd_clean_success(self, mock_main):
        result = __main__.cmd_clean([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.clean.main")
    def test_cmd_clean_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_clean([])
        assert result == 1

    @patch("build_tools.setup_dev_env.main")
    def test_cmd_setup_success(self, mock_main):
        result = __main__.cmd_setup([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.setup_dev_env.main")
    def test_cmd_setup_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_setup([])
        assert result == 1

    @patch("build_tools.generate_docs_and_coverage.main")
    def test_cmd_docs_success(self, mock_main):
        result = __main__.cmd_docs([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.generate_docs_and_coverage.main")
    def test_cmd_docs_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_docs([])
        assert result == 1

    @patch("build_tools.release.main")
    def test_cmd_release_success(self, mock_main):
        result = __main__.cmd_release([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.release.main")
    def test_cmd_release_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_release([])
        assert result == 1

    @patch("build_tools.package.main")
    def test_cmd_package_success(self, mock_main):
        result = __main__.cmd_package([])
        assert result == 0
        mock_main.assert_called_once()

    @patch("build_tools.package.main")
    def test_cmd_package_failure(self, mock_main):
        mock_main.side_effect = SystemExit(1)
        result = __main__.cmd_package([])
        assert result == 1


class TestCmdCodegen:
    @patch("importlib.import_module")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.glob")
    def test_cmd_codegen_db(self, mock_glob, mock_exists, mock_import):
        mock_exists.return_value = True
        mock_glob.return_value = [Path("schema1.yaml"), Path("schema2.yaml")]
        mock_module = MagicMock()
        mock_import.return_value = mock_module

        result = __main__.cmd_codegen(["db"])

        assert result == 0
        mock_import.assert_called_with("build_tools.db_codegen.main")
        mock_module.main.assert_called_once()

    @patch("importlib.import_module")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.glob")
    def test_cmd_codegen_api(self, mock_glob, mock_exists, mock_import):
        mock_exists.return_value = True
        mock_module = MagicMock()
        mock_import.return_value = mock_module

        result = __main__.cmd_codegen(["api"])

        assert result == 0
        mock_import.assert_called_with("build_tools.api_codegen.main")
        mock_module.main.assert_called_once()

    @patch("importlib.import_module")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.glob")
    def test_cmd_codegen_migrations(self, mock_glob, mock_exists, mock_import):
        mock_exists.return_value = True
        mock_glob.return_value = [Path("schema1.yaml"), Path("schema2.yaml")]
        mock_module = MagicMock()
        mock_import.return_value = mock_module

        result = __main__.cmd_codegen(["migrations"])

        assert result == 0
        mock_import.assert_called_with("build_tools.migration_generator.main")
        assert mock_module.main.call_count == 2  # Called for each schema file

    @patch("importlib.import_module")
    def test_cmd_codegen_all(self, mock_import):
        mock_module = MagicMock()
        mock_import.return_value = mock_module

        with (
            patch("pathlib.Path.exists", return_value=True),
            patch("pathlib.Path.glob", return_value=[]),
        ):
            result = __main__.cmd_codegen(["all"])

        assert result == 0
        # Should import all generators
        assert mock_import.call_count >= 3

    @patch("argparse.ArgumentParser.parse_args")
    def test_cmd_codegen_invalid_generator(self, mock_parse):
        """Test cmd_codegen with invalid generator - should handle gracefully."""
        mock_parse.side_effect = SystemExit(2)
        with pytest.raises(SystemExit) as exc_info:
            __main__.cmd_codegen(["invalid"])
        assert exc_info.value.code == 2


class TestMain:
    def test_main_help(self):
        with patch("sys.argv", ["build_tools"]), patch("builtins.print") as mock_print:
            result = __main__.main()
            assert result == 0
            mock_print.assert_called()

    def test_main_unknown_command(self):
        with (
            patch("sys.argv", ["build_tools", "unknown"]),
            patch("sys.stderr"),
        ):
            result = __main__.main()
            assert result == 1

    @patch("build_tools.full_build.main")
    @patch("sys.exit")
    def test_main_valid_command(self, mock_exit, mock_full_build_main):
        with patch("sys.argv", ["build_tools", "build"]):
            result = __main__.main()
            assert result == 0
            mock_full_build_main.assert_called_once()

    @patch("build_tools.full_build.main")
    @patch("sys.exit")
    def test_main_command_with_args(self, mock_exit, mock_full_build_main):
        with patch("sys.argv", ["build_tools", "build", "--release"]):
            result = __main__.main()
            assert result == 0
            mock_full_build_main.assert_called_once_with()
