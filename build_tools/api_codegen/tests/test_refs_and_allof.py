import tempfile
import textwrap
from pathlib import Path
import yaml
import json

from build_tools.api_codegen import main as generator


def write_yaml(path: Path, data):
    path.write_text(yaml.safe_dump(data), encoding="utf-8")


def test_external_ref_and_allof_discriminator(tmp_path: Path):
    # Create external file with component schema Foo and Bar
    ext = tmp_path / "models.yaml"
    ext_data = {
        "components": {
            "schemas": {
                "Base": {
                    "type": "object",
                    "properties": {"id": {"type": "string"}},
                    "required": ["id"]
                },
                "Foo": {
                    "allOf": [
                        {"$ref": "#/components/schemas/Base"},
                        {
                            "type": "object",
                            "properties": {"kind": {"type": "string", "enum": ["foo"]}, "foo": {"type": "string"}},
                            "required": ["kind", "foo"]
                        }
                    ]
                },
                "Bar": {
                    "allOf": [
                        {"$ref": "#/components/schemas/Base"},
                        {
                            "type": "object",
                            "properties": {"kind": {"type": "string", "enum": ["bar"]}, "bar": {"type": "number"}},
                            "required": ["kind", "bar"]
                        }
                    ]
                }
            }
        }
    }
    write_yaml(ext, ext_data)

    # Main spec references external models via oneOf with discriminator
    spec = {
        "openapi": "3.0.0",
        "components": {
            "schemas": {
                "Payload": {
                    "oneOf": [
                        {"$ref": f"{ext.name}#/components/schemas/Foo"},
                        {"$ref": f"{ext.name}#/components/schemas/Bar"}
                    ],
                    "discriminator": {"propertyName": "kind", "mapping": {"foo": f"{ext.name}#/components/schemas/Foo", "bar": f"{ext.name}#/components/schemas/Bar"}}
                }
            }
        }
    }

    # Write spec to file and invoke render_frontend_types
    spec_file = tmp_path / "spec.yaml"
    write_yaml(spec_file, spec)

    comps = spec.get("components")
    ts = generator.render_frontend_types(comps)

    # Expect a discriminated union type for Payload referencing Foo and Bar names
    assert "export type Payload" in ts
    assert "Foo" in ts and "Bar" in ts
    # The union should include discriminated shapes like { kind: "foo" } & Foo
    assert '{ kind: "foo" } & Foo' in ts or '"foo"' in ts


def test_file_url_external_ref(tmp_path: Path):
    # create external file and refer to it using file:// URL
    ext = tmp_path / "remote.yaml"
    ext_data = {
        "components": {"schemas": {"X": {"type": "string", "enum": ["x"]}}}
    }
    write_yaml(ext, ext_data)

    spec = {"components": {"schemas": {"RefX": {"$ref": f"{ext.as_uri()}#/components/schemas/X"}}}}
    # ensure the resolver can fetch the external schema
    resolved = generator.resolve_ref_general(f"{ext.as_uri()}#/components/schemas/X", Path(generator.__file__), {})
    assert isinstance(resolved, dict)
    assert resolved.get("type") == "string"
    assert resolved.get("enum") == ["x"]


def test_allof_with_non_object_part(tmp_path: Path):
    # allOf combining object and a primitive should produce a union
    spec = {"components": {"schemas": {"Mixed": {"allOf": [{"type": "object", "properties": {"a": {"type": "string"}}}, {"type": "string"}]}}}}
    ts = generator.render_frontend_types(spec.get("components"))
    # Expect Mixed to be a union including string
    assert "export type Mixed" in ts
    assert "string" in ts
