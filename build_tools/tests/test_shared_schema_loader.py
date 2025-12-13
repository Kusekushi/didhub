from pathlib import Path
from unittest.mock import patch

import pytest

from build_tools.shared.errors import SchemaError
from build_tools.shared.schema_loader import (
    CacheKey,
    CachedSchema,
    SchemaCache,
    collect_schema_paths,
    get_global_cache,
    load_schema,
)


class TestCacheKey:
    def test_from_path(self, tmp_path):
        file_path = tmp_path / "test.yaml"
        file_path.write_text("content")

        key = CacheKey.from_path(file_path)
        assert key.path == file_path.resolve()
        assert isinstance(key.mtime, float)
        assert key.size == len("content")

    def test_frozen(self, tmp_path):
        file_path = tmp_path / "test.yaml"
        file_path.write_text("content")

        key = CacheKey.from_path(file_path)
        with pytest.raises(AttributeError):
            key.path = Path("/new/path")


class TestCachedSchema:
    def test_init(self, tmp_path):
        file_path = tmp_path / "test.yaml"
        file_path.write_text("content")
        key = CacheKey.from_path(file_path)

        data = {"key": "value"}
        content_hash = "abc123"

        cached = CachedSchema(data, key, content_hash)
        assert cached.data == data
        assert cached.key == key
        assert cached.content_hash == content_hash


class TestSchemaCache:
    def test_init(self):
        cache = SchemaCache()
        assert len(cache) == 0
        assert cache._max_size == 100

    def test_init_custom_max_size(self):
        cache = SchemaCache(max_size=50)
        assert cache._max_size == 50

    def test_get_new_schema(self, tmp_path):
        cache = SchemaCache()
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        data = cache.get(schema_path)
        assert data == {"key": "value"}
        assert len(cache) == 1

    def test_get_cached_schema(self, tmp_path):
        cache = SchemaCache()
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        data1 = cache.get(schema_path)
        data2 = cache.get(schema_path)
        assert data1 is data2  # Same object from cache

    def test_get_schema_file_changed(self, tmp_path):
        cache = SchemaCache()
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        data1 = cache.get(schema_path)
        schema_path.write_text("key: new_value\n")
        data2 = cache.get(schema_path)

        assert data1 != data2
        assert data2 == {"key": "new_value"}

    def test_get_schema_max_cache_size(self, tmp_path):
        cache = SchemaCache(max_size=2)
        paths = []
        for i in range(3):
            path = tmp_path / f"test{i}.yaml"
            path.write_text(f"key: value{i}\n")
            paths.append(path)
            cache.get(path)

        assert len(cache) == 2  # Should have evicted the first one

    def test_invalidate_all(self, tmp_path):
        cache = SchemaCache()
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        cache.get(schema_path)
        assert len(cache) == 1

        cache.invalidate()
        assert len(cache) == 0

    def test_invalidate_specific(self, tmp_path):
        cache = SchemaCache()
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        cache.get(schema_path)
        assert len(cache) == 1

        cache.invalidate(schema_path)
        assert len(cache) == 0


class TestLoadSchema:
    def test_load_valid_schema(self, tmp_path):
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\nlist:\n  - item1\n  - item2\n")

        data = load_schema(schema_path)
        assert data == {"key": "value", "list": ["item1", "item2"]}

    def test_load_schema_file_not_found(self, tmp_path):
        nonexistent = tmp_path / "nonexistent.yaml"

        with pytest.raises(SchemaError) as exc_info:
            load_schema(nonexistent)

        assert "Failed to read schema file" in str(exc_info.value)

    def test_load_schema_invalid_yaml(self, tmp_path):
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("invalid: yaml: content: [\n")

        with pytest.raises(SchemaError) as exc_info:
            load_schema(schema_path)

        assert "Invalid YAML" in str(exc_info.value)

    def test_load_schema_not_dict(self, tmp_path):
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("- item1\n- item2\n")

        with pytest.raises(SchemaError) as exc_info:
            load_schema(schema_path)

        assert "Schema root must be a mapping" in str(exc_info.value)


class TestCollectSchemaPaths:
    def test_collect_single_file(self, tmp_path):
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        paths = collect_schema_paths([schema_path])
        assert paths == [schema_path.resolve()]

    def test_collect_directory(self, tmp_path):
        (tmp_path / "schema1.yaml").write_text("key: value\n")
        (tmp_path / "schema2.yml").write_text("key: value\n")
        (tmp_path / "not_schema.txt").write_text("content")

        paths = collect_schema_paths([tmp_path])
        expected = [
            (tmp_path / "schema1.yaml").resolve(),
            (tmp_path / "schema2.yml").resolve(),
        ]
        assert paths == expected

    def test_collect_mixed_inputs(self, tmp_path):
        single_file = tmp_path / "single.yaml"
        single_file.write_text("key: value\n")

        dir_path = tmp_path / "schemas"
        dir_path.mkdir()
        (dir_path / "schema1.yaml").write_text("key: value\n")

        paths = collect_schema_paths([single_file, dir_path])
        expected = [
            single_file.resolve(),
            (dir_path / "schema1.yaml").resolve(),
        ]
        assert paths == expected

    def test_collect_nonexistent_path(self, tmp_path):
        nonexistent = tmp_path / "nonexistent"

        with pytest.raises(FileNotFoundError):
            collect_schema_paths([nonexistent])

    def test_collect_deduplicates(self, tmp_path):
        schema_path = tmp_path / "test.yaml"
        schema_path.write_text("key: value\n")

        # Pass the same path twice
        paths = collect_schema_paths([schema_path, schema_path])
        assert paths == [schema_path.resolve()]


class TestGetGlobalCache:
    def test_get_global_cache(self):
        cache1 = get_global_cache()
        cache2 = get_global_cache()
        assert cache1 is cache2  # Same instance

    @patch("build_tools.shared.schema_loader._global_cache", None)
    def test_get_global_cache_creates_new(self):
        cache = get_global_cache()
        assert isinstance(cache, SchemaCache)
