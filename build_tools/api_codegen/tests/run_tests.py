"""Run generator unit checks without pytest (convenience runner)."""

import tempfile
from pathlib import Path
import yaml

from build_tools.api_codegen.tests import test_refs_and_allof as tests_module


def write_yaml(path: Path, data):
    path.write_text(yaml.safe_dump(data), encoding="utf-8")


def run():
    # Run the unit-style tests directly
    try:
        tests_module.test_external_ref_and_allof_discriminator(
            tmp_path=Path(tempfile.mkdtemp())
        )
        tests_module.test_file_url_external_ref(tmp_path=Path(tempfile.mkdtemp()))
        tests_module.test_allof_with_non_object_part(tmp_path=Path(tempfile.mkdtemp()))
    except AssertionError as e:
        print("TEST FAILURE:", e)
        raise
    print("OK: generator run-tests passed")


if __name__ == "__main__":
    run()
