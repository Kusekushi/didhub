import pytest

from utils.api_client_generator.generator import TypeScriptGenerator
from utils.api_client_generator.models import TypeDefinition


def test_internally_tagged_enum_inlines_payload_fields(tmp_path):
    # Payload type definition (a struct with fields)
    payload_td = TypeDefinition(
        name='ApiMyPayload',
        rust_path='crate::models::MyPayload',
        module_path='crate::models',
        original_name='MyPayload',
        fields=[
            ('a', 'String', 'a', False, False),
            ('b', 'Option<String>', 'b', True, False),
        ],
        is_generic=False,
    )

    # Enum with internally tagged style
    enum_td = TypeDefinition(
        name='ApiMyEnum',
        rust_path='crate::models::MyEnum',
        module_path='crate::models',
        original_name='MyEnum',
        fields=[],
        is_generic=False,
        is_enum=True,
        variants=[('X', 'X', True, 'crate::models::MyPayload'), ('Y', 'Y', False, None)],
        rename_all=None,
        enum_style='internally_tagged',
        enum_tag='kind',
        enum_content=None,
    )

    gen = TypeScriptGenerator(api_modules=[], type_definitions=[payload_td, enum_td])
    openapi = gen.generate_openapi()

    # Top-level enum schema should exist and contain discriminator
    assert 'ApiMyEnum' in openapi['components']['schemas']
    top = openapi['components']['schemas']['ApiMyEnum']
    assert 'discriminator' in top
    assert top['discriminator']['propertyName'] == 'kind'

    # Variant schema should be present and composed with allOf referencing the payload component
    assert 'ApiMyEnumX' in openapi['components']['schemas']
    var_schema = openapi['components']['schemas']['ApiMyEnumX']
    # Expect allOf composition referencing payload and adding the tag property
    assert 'allOf' in var_schema
    refs = [e for e in var_schema['allOf'] if isinstance(e, dict) and '$ref' in e]
    assert refs and refs[0]['$ref'].endswith('/ApiMyPayload')
    # The augmentation object should include the tag property
    aug = [e for e in var_schema['allOf'] if isinstance(e, dict) and 'properties' in e and 'kind' in e['properties']]
    assert aug
