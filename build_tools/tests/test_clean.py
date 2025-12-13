import argparse
from unittest.mock import patch

import pytest

from build_tools.clean import (
    CLEAN_DIRS,
    GENERATED_DIRS,
    clean_directory,
    clean_file,
    find_pyc_files,
    find_pycache_dirs,
    format_size,
    get_dir_size,
    main,
)


class TestFindPycacheDirs:
    def test_find_pycache_dirs(self, tmp_path):
        # Create some __pycache__ dirs
        (tmp_path / "__pycache__").mkdir()
        (tmp_path / "subdir" / "__pycache__").mkdir(parents=True)
        (tmp_path / "not_pycache").mkdir()

        pycaches = list(find_pycache_dirs(tmp_path))
        assert len(pycaches) == 2
        assert all(p.name == "__pycache__" for p in pycaches)

    def test_find_pycache_dirs_no_dirs(self, tmp_path):
        pycaches = list(find_pycache_dirs(tmp_path))
        assert pycaches == []


class TestFindPycFiles:
    def test_find_pyc_files(self, tmp_path):
        # Create some .pyc files
        (tmp_path / "file.pyc").touch()
        (tmp_path / "subdir" / "file.pyc").parent.mkdir(parents=True)
        (tmp_path / "subdir" / "file.pyc").touch()
        (tmp_path / "file.py").touch()

        pycs = list(find_pyc_files(tmp_path))
        assert len(pycs) == 2
        assert all(p.suffix == ".pyc" for p in pycs)

    def test_find_pyc_files_no_files(self, tmp_path):
        pycs = list(find_pyc_files(tmp_path))
        assert pycs == []


class TestGetDirSize:
    def test_get_dir_size(self, tmp_path):
        # Create a file with known size
        file_path = tmp_path / "test.txt"
        content = "hello world"
        file_path.write_text(content)
        expected_size = len(content.encode())

        assert get_dir_size(tmp_path) == expected_size

    def test_get_dir_size_empty_dir(self, tmp_path):
        assert get_dir_size(tmp_path) == 0

    def test_get_dir_size_nonexistent(self, tmp_path):
        nonexistent = tmp_path / "nonexistent"
        assert get_dir_size(nonexistent) == 0


class TestFormatSize:
    @pytest.mark.parametrize(
        "size_bytes,expected",
        [
            (0, "0.0 B"),
            (512, "512.0 B"),
            (1024, "1.0 KB"),
            (1536, "1.5 KB"),
            (1048576, "1.0 MB"),
            (1073741824, "1.0 GB"),
            (1099511627776, "1.0 TB"),
        ],
    )
    def test_format_size(self, size_bytes, expected):
        assert format_size(size_bytes) == expected


class TestCleanDirectory:
    def test_clean_directory_exists(self, tmp_path, capsys):
        # Create a directory with a file
        dir_path = tmp_path / "test_dir"
        dir_path.mkdir()
        file_path = dir_path / "file.txt"
        file_path.write_text("content")

        clean_directory(dir_path, "test dir")

        assert not dir_path.exists()
        captured = capsys.readouterr()
        assert "Removing:" in captured.out
        assert "test dir" in captured.out

    def test_clean_directory_dry_run(self, tmp_path, capsys):
        dir_path = tmp_path / "test_dir"
        dir_path.mkdir()
        (dir_path / "file.txt").write_text("content")

        clean_directory(dir_path, "test dir", dry_run=True)

        assert dir_path.exists()
        captured = capsys.readouterr()
        assert "Would remove:" in captured.out

    def test_clean_directory_nonexistent(self, tmp_path):
        nonexistent = tmp_path / "nonexistent"
        size = clean_directory(nonexistent, "test")
        assert size == 0


class TestCleanFile:
    def test_clean_file_exists(self, tmp_path, capsys):
        file_path = tmp_path / "test.txt"
        file_path.write_text("content")

        clean_file(file_path)

        assert not file_path.exists()
        captured = capsys.readouterr()
        assert "Removing:" not in captured.out  # clean_file doesn't print

    def test_clean_file_dry_run(self, tmp_path, capsys):
        file_path = tmp_path / "test.txt"
        file_path.write_text("content")

        clean_file(file_path, dry_run=True)

        assert file_path.exists()
        captured = capsys.readouterr()
        assert "Would remove:" in captured.out

    def test_clean_file_nonexistent(self, tmp_path):
        nonexistent = tmp_path / "nonexistent.txt"
        size = clean_file(nonexistent)
        assert size == 0


class TestMain:
    @patch("build_tools.clean.shutil.rmtree")
    @patch("build_tools.clean.Path.exists")
    @patch("build_tools.clean.find_pycache_dirs")
    @patch("build_tools.clean.find_pyc_files")
    @patch("sys.stdout")
    def test_main_dry_run(
        self, mock_stdout, mock_find_pyc, mock_find_pycache, mock_exists, mock_rmtree
    ):
        mock_exists.return_value = True
        mock_find_pycache.return_value = []
        mock_find_pyc.return_value = []

        with patch("argparse.ArgumentParser.parse_args") as mock_parse:
            mock_parse.return_value = argparse.Namespace(
                dry_run=True, generated=False, all=False
            )
            main()

        # Should not call rmtree in dry run
        mock_rmtree.assert_not_called()

    @patch("build_tools.clean.shutil.rmtree")
    @patch("build_tools.clean.Path.exists")
    @patch("build_tools.clean.find_pycache_dirs")
    @patch("build_tools.clean.find_pyc_files")
    @patch("sys.stdout")
    def test_main_with_generated(
        self, mock_stdout, mock_find_pyc, mock_find_pycache, mock_exists, mock_rmtree
    ):
        mock_exists.return_value = True
        mock_find_pycache.return_value = []
        mock_find_pyc.return_value = []

        with patch("argparse.ArgumentParser.parse_args") as mock_parse:
            mock_parse.return_value = argparse.Namespace(
                dry_run=False, generated=True, all=False
            )
            main()

        # Should call rmtree for generated dirs
        assert mock_rmtree.call_count >= len(GENERATED_DIRS)

    @patch("build_tools.clean.shutil.rmtree")
    @patch("build_tools.clean.Path.exists")
    @patch("build_tools.clean.find_pycache_dirs")
    @patch("build_tools.clean.find_pyc_files")
    @patch("sys.stdout")
    def test_main_with_all(
        self, mock_stdout, mock_find_pyc, mock_find_pycache, mock_exists, mock_rmtree
    ):
        mock_exists.return_value = True
        mock_find_pycache.return_value = []
        mock_find_pyc.return_value = []

        with patch("argparse.ArgumentParser.parse_args") as mock_parse:
            mock_parse.return_value = argparse.Namespace(
                dry_run=False, generated=False, all=True
            )
            main()

        # Should call rmtree for all dirs
        assert mock_rmtree.call_count >= len(CLEAN_DIRS) + len(GENERATED_DIRS)
