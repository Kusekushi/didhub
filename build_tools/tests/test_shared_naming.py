import pytest

from build_tools.shared.naming import (
    RUST_KEYWORDS,
    sanitize_field_name,
    sanitize_module_name,
    singularize,
    to_pascal_case,
    to_snake_case,
)


class TestSingularize:
    @pytest.mark.parametrize(
        "plural,singular",
        [
            ("cats", "cat"),
            ("dogs", "dog"),
            ("children", "child"),
            ("people", "person"),
            ("men", "man"),
            ("women", "woman"),
            ("mice", "mouse"),
            ("geese", "goose"),
            ("teeth", "tooth"),
            ("feet", "foot"),
            ("data", "datum"),
            ("criteria", "criterion"),
            ("analyses", "analysis"),
            ("indices", "index"),
            ("appendices", "appendix"),
            ("matrices", "matrix"),
            ("vertices", "vertex"),
            ("parties", "party"),
            ("classes", "class"),
            ("boxes", "box"),
            ("churches", "church"),
            ("dishes", "dish"),
            ("cats", "cat"),
            ("cat", "cat"),  # already singular
            ("child", "child"),  # irregular but already singular
        ],
    )
    def test_singularize(self, plural, singular):
        assert singularize(plural) == singular

    def test_singularize_caching(self):
        # Test that caching works
        result1 = singularize("cats")
        result2 = singularize("cats")
        assert result1 == result2 == "cat"

    def test_singularize_case_preservation(self):
        assert singularize("Children") == "Child"
        assert singularize("PEOPLE") == "Person"


class TestToPascalCase:
    @pytest.mark.parametrize(
        "input_str,expected",
        [
            ("hello_world", "HelloWorld"),
            ("hello-world", "HelloWorld"),
            ("helloWorld", "HelloWorld"),
            ("hello_world_test", "HelloWorldTest"),
            ("single", "Single"),
            ("", ""),
            ("_", ""),
            ("a", "A"),
            ("already_pascal", "AlreadyPascal"),
            ("camelCase", "CamelCase"),
            ("PascalCase", "PascalCase"),
        ],
    )
    def test_to_pascal_case(self, input_str, expected):
        assert to_pascal_case(input_str) == expected

    def test_to_pascal_case_caching(self):
        result1 = to_pascal_case("hello_world")
        result2 = to_pascal_case("hello_world")
        assert result1 == result2 == "HelloWorld"


class TestToSnakeCase:
    @pytest.mark.parametrize(
        "input_str,expected",
        [
            ("HelloWorld", "hello_world"),
            ("hello-world", "hello_world"),
            ("helloWorld", "hello_world"),
            ("HelloWorldTest", "hello_world_test"),
            ("single", "single"),
            ("", ""),
            ("A", "a"),
            ("already_snake", "already_snake"),
            ("camelCase", "camel_case"),
            ("PascalCase", "pascal_case"),
            ("XMLHttpRequest", "xmlhttp_request"),
        ],
    )
    def test_to_snake_case(self, input_str, expected):
        assert to_snake_case(input_str) == expected

    def test_to_snake_case_caching(self):
        result1 = to_snake_case("HelloWorld")
        result2 = to_snake_case("HelloWorld")
        assert result1 == result2 == "hello_world"


class TestSanitizeModuleName:
    @pytest.mark.parametrize(
        "input_str,expected",
        [
            ("hello-world", "hello_world"),
            ("hello_world", "hello_world"),
            ("Hello-World", "hello_world"),
            ("module-name", "module_name"),
        ],
    )
    def test_sanitize_module_name(self, input_str, expected):
        assert sanitize_module_name(input_str) == expected

    def test_sanitize_module_name_caching(self):
        result1 = sanitize_module_name("hello-world")
        result2 = sanitize_module_name("hello-world")
        assert result1 == result2 == "hello_world"


class TestSanitizeFieldName:
    @pytest.mark.parametrize(
        "input_str,expected",
        [
            ("field-name", "field_name"),
            ("field_name", "field_name"),
            ("normal_field", "normal_field"),
            ("type", "r#type"),  # keyword
            ("fn", "r#fn"),  # keyword
            ("normal", "normal"),  # not keyword
        ],
    )
    def test_sanitize_field_name(self, input_str, expected):
        assert sanitize_field_name(input_str) == expected

    def test_sanitize_field_name_caching(self):
        result1 = sanitize_field_name("type")
        result2 = sanitize_field_name("type")
        assert result1 == result2 == "r#type"

    def test_rust_keywords_constant(self):
        # Ensure all expected keywords are in the set
        expected_keywords = {
            "as",
            "async",
            "await",
            "break",
            "const",
            "continue",
            "crate",
            "dyn",
            "else",
            "enum",
            "extern",
            "false",
            "fn",
            "for",
            "if",
            "impl",
            "in",
            "let",
            "loop",
            "match",
            "mod",
            "move",
            "mut",
            "pub",
            "ref",
            "return",
            "self",
            "Self",
            "static",
            "struct",
            "super",
            "trait",
            "true",
            "type",
            "union",
            "unsafe",
            "use",
            "where",
            "while",
        }
        assert RUST_KEYWORDS == expected_keywords
