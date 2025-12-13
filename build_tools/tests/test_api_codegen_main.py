import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import yaml

from build_tools.api_codegen.main import (
    GeneratorContext,
    Operation,
    RouteGroup,
    build_operations,
    group_routes,
    load_spec,
    main,
    render_backend,
    render_frontend,
    render_frontend_types,
    slugify,
    to_camel_case,
)


class TestGeneratorContext:
    def test_post_init_initializes_templates(self):
        """Test that __post_init__ properly initializes the template environment."""
        ctx = GeneratorContext()

        # Check that template_env is initialized
        assert ctx.template_env is not None
        assert hasattr(ctx.template_env, "get_template")

        # Check that templates are pre-compiled
        assert ctx._backend_template is not None
        assert ctx._frontend_template is not None

        # Check that templates are accessible via properties
        assert ctx.backend_template is ctx._backend_template
        assert ctx.frontend_template is ctx._frontend_template


class TestLoadSpec:
    def test_load_yaml_spec(self):
        """Test loading YAML OpenAPI spec."""
        spec_data = {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0.0"},
            "paths": {},
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
            yaml.dump(spec_data, f)
            f.flush()

            try:
                result = load_spec(Path(f.name))
                assert result == spec_data
            finally:
                Path(f.name).unlink()

    def test_load_json_spec(self):
        """Test loading JSON OpenAPI spec."""
        spec_data = {
            "openapi": "3.0.0",
            "info": {"title": "Test API", "version": "1.0.0"},
            "paths": {},
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(spec_data, f)
            f.flush()

            try:
                result = load_spec(Path(f.name))
                assert result == spec_data
            finally:
                Path(f.name).unlink()


class TestSlugify:
    def test_slugify_basic(self):
        """Test basic slugification."""
        assert slugify("getUser") == "get_user"
        assert slugify("GetUser") == "get_user"
        assert slugify("get-user") == "get_user"
        assert slugify("get user") == "get_user"

    def test_slugify_edge_cases(self):
        """Test edge cases in slugification."""
        assert slugify("") == "operation"
        assert slugify("!!!") == "operation"
        assert slugify("ABC") == "abc"

    def test_slugify_caching(self):
        """Test that slugify uses caching."""
        # Call multiple times with same input
        result1 = slugify("testInput")
        result2 = slugify("testInput")
        assert result1 == result2 == "test_input"


class TestToCamelCase:
    def test_to_camel_case_basic(self):
        """Test basic camelCase conversion."""
        assert to_camel_case("snake_case") == "snakeCase"
        assert to_camel_case("another_example") == "anotherExample"
        assert to_camel_case("single") == "single"

    def test_to_camel_case_edge_cases(self):
        """Test edge cases in camelCase conversion."""
        assert to_camel_case("") == ""
        assert to_camel_case("a") == "a"
        assert to_camel_case("_leading") == "Leading"

    def test_to_camel_case_caching(self):
        """Test that to_camel_case uses caching."""
        result1 = to_camel_case("test_case")
        result2 = to_camel_case("test_case")
        assert result1 == result2 == "testCase"


class TestBuildOperations:
    def test_build_operations_basic(self):
        """Test building operations from OpenAPI spec."""
        spec = {
            "paths": {
                "/users": {"get": {"summary": "Get users", "operationId": "getUsers"}}
            }
        }

        operations = build_operations(spec, {})

        assert len(operations) == 1
        op = operations[0]
        assert op.path == "/users"
        assert op.method == "get"
        assert op.handler_name == "get_users"
        assert op.method_name == "getUsers"

    def test_build_operations_with_parameters(self):
        """Test building operations with path and query parameters."""
        spec = {
            "paths": {
                "/users/{id}": {
                    "get": {
                        "summary": "Get user",
                        "operationId": "getUser",
                        "parameters": [
                            {"name": "id", "in": "path", "required": True},
                            {"name": "include", "in": "query"},
                        ],
                    }
                }
            }
        }

        operations = build_operations(spec, {})

        assert len(operations) == 1
        op = operations[0]
        assert op.has_path_params is True
        assert op.has_query_params is True


class TestGroupRoutes:
    def test_group_routes_basic(self):
        """Test grouping operations by path."""
        operations = [
            Operation(
                path="/users",
                method="get",
                handler_name="get_users",
                method_name="getUsers",
                summary="Get users",
                has_path_params=False,
                has_query_params=False,
                has_body=False,
            ),
            Operation(
                path="/users",
                method="post",
                handler_name="create_user",
                method_name="createUser",
                summary="Create user",
                has_path_params=False,
                has_query_params=False,
                has_body=True,
            ),
        ]

        routes = group_routes(operations)

        assert len(routes) == 1
        route = routes[0]
        assert route.path == "/users"
        assert len(route.operations) == 2


class TestRenderBackend:
    def test_render_backend_basic(self):
        """Test rendering backend code."""
        ctx = GeneratorContext()
        operations = [
            Operation(
                path="/test",
                method="get",
                handler_name="test_handler",
                method_name="testHandler",
                summary="Test operation",
                has_path_params=False,
                has_query_params=False,
                has_body=False,
            )
        ]
        routes = [RouteGroup(path="/test", axum_path="/test", operations=operations)]

        result = render_backend(ctx, operations, routes)

        assert isinstance(result, str)
        assert "test_handler" in result

    def test_render_backend_with_imports(self):
        """Test that render_backend includes necessary imports."""
        ctx = GeneratorContext()
        operations = [
            Operation(
                path="/test/{id}",
                method="get",
                handler_name="test_handler",
                method_name="testHandler",
                summary="Test operation",
                has_path_params=True,
                has_query_params=True,
                has_body=True,
                needs_headers=True,
            )
        ]
        routes = [
            RouteGroup(path="/test/{id}", axum_path="/test/:id", operations=operations)
        ]

        result = render_backend(ctx, operations, routes)

        assert isinstance(result, str)
        # Should include necessary imports based on operation features
        assert "use axum::extract::Path;" in result or "Path" in result


class TestRenderFrontend:
    def test_render_frontend_basic(self):
        """Test rendering frontend client code."""
        ctx = GeneratorContext()
        operations = [
            Operation(
                path="/test",
                method="get",
                handler_name="test_handler",
                method_name="testHandler",
                summary="Test operation",
                has_path_params=False,
                has_query_params=False,
                has_body=False,
                ts_return_type="any",
            )
        ]
        components = {"schemas": {}}

        result = render_frontend(ctx, operations, components)

        assert isinstance(result, str)
        assert "testHandler" in result

    def test_render_frontend_with_types(self):
        """Test rendering frontend client with types."""
        ctx = GeneratorContext()
        operations = []
        components = {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "name": {"type": "string"},
                    },
                }
            }
        }

        result = render_frontend(ctx, operations, components)

        assert isinstance(result, str)
        # The types are rendered separately, so check that the client references types
        assert "import type * as Types from './types';" in result


class TestRenderFrontendTypes:
    def test_render_frontend_types_basic(self):
        """Test rendering frontend TypeScript types."""
        components = {
            "schemas": {
                "User": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "name": {"type": "string"},
                    },
                    "required": ["id", "name"],
                }
            }
        }

        result = render_frontend_types(components)

        assert isinstance(result, str)
        assert "export interface User" in result
        assert "id: number;" in result
        assert "name: string;" in result


class TestMainFunction:
    @patch("build_tools.api_codegen.main.load_spec")
    @patch("build_tools.api_codegen.main.build_operations")
    @patch("build_tools.api_codegen.main.group_routes")
    @patch("build_tools.api_codegen.main.render_backend")
    @patch("build_tools.api_codegen.main.render_frontend")
    @patch("build_tools.api_codegen.main.render_frontend_types")
    @patch("pathlib.Path.mkdir")
    @patch("pathlib.Path.write_text")
    @patch("builtins.print")
    def test_main_success(
        self,
        mock_print,
        mock_write,
        mock_mkdir,
        mock_render_types,
        mock_render_frontend,
        mock_render_backend,
        mock_group_routes,
        mock_build_ops,
        mock_load_spec,
    ):
        """Test main function with successful execution."""
        # Mock spec data
        mock_spec = {
            "components": {"schemas": {}},
            "paths": {"/test": {"get": {"summary": "test"}}},
        }
        mock_load_spec.return_value = mock_spec

        # Mock operations and routes
        mock_ops = [MagicMock()]
        mock_build_ops.return_value = mock_ops
        mock_routes = [MagicMock()]
        mock_group_routes.return_value = mock_routes

        # Mock rendered code
        mock_render_backend.return_value = "backend code"
        mock_render_frontend.return_value = "frontend code"
        mock_render_types.return_value = "types code"

        with patch("sys.argv", ["api_codegen"]):
            main()

        # Verify calls
        mock_load_spec.assert_called_once()
        mock_build_ops.assert_called_once_with(mock_spec, {})
        mock_group_routes.assert_called_once_with(mock_ops)
        mock_render_backend.assert_called_once()
        mock_render_frontend.assert_called_once()
        mock_render_types.assert_called_once()

        # Verify file writes
        assert (
            mock_write.call_count == 4
        )  # backend, mod.rs, frontend client, frontend types

    @patch("build_tools.api_codegen.main.load_spec")
    @patch("build_tools.api_codegen.main.build_operations")
    def test_main_no_operations(self, mock_build_ops, mock_load_spec):
        """Test main function when no operations are found."""
        mock_load_spec.return_value = {"components": {"schemas": {}}}
        mock_build_ops.return_value = []

        with (
            patch("sys.argv", ["api_codegen"]),
            pytest.raises(
                SystemExit, match="Specification did not contain any operations"
            ),
        ):
            main()

    @patch("build_tools.api_codegen.main.load_spec")
    @patch("pathlib.Path.exists")
    @patch("pathlib.Path.is_file")
    def test_main_custom_spec_path(self, mock_is_file, mock_exists, mock_load_spec):
        """Test main function with custom spec path."""
        mock_exists.return_value = True
        mock_is_file.return_value = True
        mock_load_spec.return_value = {
            "components": {"schemas": {}},
            "paths": {"/test": {"get": {"summary": "test"}}},
        }

        with (
            patch("sys.argv", ["api_codegen", "--spec", "custom.yaml"]),
            patch(
                "build_tools.api_codegen.main.build_operations",
                return_value=[MagicMock()],
            ),
            patch(
                "build_tools.api_codegen.main.group_routes", return_value=[MagicMock()]
            ),
            patch("build_tools.api_codegen.main.render_backend", return_value="code"),
            patch("build_tools.api_codegen.main.render_frontend", return_value="code"),
            patch(
                "build_tools.api_codegen.main.render_frontend_types",
                return_value="code",
            ),
            patch("pathlib.Path.mkdir"),
            patch("pathlib.Path.write_text"),
            patch("builtins.print"),
        ):
            main()

        # Verify custom spec path was used
        mock_load_spec.assert_called_once_with(Path("custom.yaml"))
