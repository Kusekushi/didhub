from build_tools.shared.errors import (
    DialectError,
    SchemaError,
    SchemaValidationError,
    TypeMappingError,
)


class TestSchemaError:
    def test_init_no_path(self):
        error = SchemaError("test message")
        assert str(error) == "test message"
        assert error.schema_path is None

    def test_init_with_path(self):
        error = SchemaError("test message", "path/to/schema.json")
        assert str(error) == "[path/to/schema.json] test message"
        assert error.schema_path == "path/to/schema.json"


class TestSchemaValidationError:
    def test_init_no_field_no_path(self):
        error = SchemaValidationError("validation failed")
        assert str(error) == "validation failed"
        assert error.field is None
        assert error.schema_path is None

    def test_init_with_field(self):
        error = SchemaValidationError("invalid value", field="name")
        assert str(error) == "Field 'name': invalid value"
        assert error.field == "name"

    def test_init_with_field_and_path(self):
        error = SchemaValidationError("invalid value", "schema.json", "name")
        assert str(error) == "[schema.json] Field 'name': invalid value"
        assert error.field == "name"
        assert error.schema_path == "schema.json"


class TestDialectError:
    def test_init(self):
        error = DialectError("unsupported feature", "postgres")
        assert str(error) == "Dialect 'postgres': unsupported feature"
        assert error.dialect == "postgres"
        assert error.schema_path is None

    def test_init_with_path(self):
        error = DialectError("unsupported feature", "postgres", "schema.json")
        assert str(error) == "[schema.json] Dialect 'postgres': unsupported feature"
        assert error.dialect == "postgres"
        assert error.schema_path == "schema.json"


class TestTypeMappingError:
    def test_init(self):
        error = TypeMappingError("uuid", "table creation")
        assert str(error) == "No type mapping for 'uuid' (table creation)"
        assert error.type_name == "uuid"
        assert error.schema_path is None

    def test_init_with_path(self):
        error = TypeMappingError("uuid", "table creation", "schema.json")
        assert str(error) == "[schema.json] No type mapping for 'uuid' (table creation)"
        assert error.type_name == "uuid"
        assert error.schema_path == "schema.json"