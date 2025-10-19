import json
from pathlib import Path

from build_tools.api_codegen import main as gen


def test_json_external_ref_resolution(tmp_path):
    # create an external JSON file with a schema
    external = tmp_path / "external.json"
    external.write_text(json.dumps({
        "components": {
            "schemas": {
                "ExternalType": {
                    "type": "object",
                    "properties": {"x": {"type": "string"}},
                    "required": ["x"]
                }
            }
        }
    }))

    spec = {
        "openapi": "3.0.0",
        "info": {"title": "test", "version": "1.0"},
        "paths": {},
        "components": {
            "schemas": {
                "Wrapper": {"$ref": f"file://{external.as_posix()}#/components/schemas/ExternalType"}
            }
        }
    }

    schema = gen.resolve_ref_general(spec["components"]["schemas"]["Wrapper"].get("$ref"), spec, base_path=str(tmp_path))
    assert schema is not None
    assert schema.get("type") == "object"
    assert "x" in schema.get("properties", {})


def test_implicit_discriminator_inference():
    # oneOf without explicit discriminator but with type-likenames - generator should not crash
    spec = {
        "openapi": "3.0.0",
        "info": {"title": "test", "version": "1.0"},
        "paths": {},
        "components": {
            "schemas": {
                "Cat": {"type": "object", "properties": {"meow": {"type": "boolean"}}},
                "Dog": {"type": "object", "properties": {"bark": {"type": "boolean"}}},
                "Pet": {"oneOf": [{"$ref": "#/components/schemas/Cat"}, {"$ref": "#/components/schemas/Dog"}]}
            }
        }
    }

    # Should return reasonable TypeScript text without throwing
    ts = gen.render_frontend_types(spec, out_path=None)
    assert "Cat" in ts and "Dog" in ts


def test_circular_refs_do_not_infinite_loop(tmp_path):
    # A -> B -> A circular refs
    spec = {
        "openapi": "3.0.0",
        "info": {"title": "test", "version": "1.0"},
        "paths": {},
        "components": {
            "schemas": {
                "A": {"type": "object", "properties": {"b": {"$ref": "#/components/schemas/B"}}},
                "B": {"type": "object", "properties": {"a": {"$ref": "#/components/schemas/A"}}}
            }
        }
    }

    ts = gen.render_frontend_types(spec, out_path=None)
    # ensure output produced and doesn't repeat endlessly
    assert isinstance(ts, str)
    assert "A" in ts and "B" in ts
