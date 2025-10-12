from utils.api_client_generator.generator import TypeScriptGenerator
from utils.api_client_generator.models import TypeDefinition


def test_collision_with_tag_field_warns():
    # payload has a field 'kind' that would collide with tag
    payload_td = TypeDefinition(
        name='ApiPayloadCollision',
        rust_path='crate::models::PayloadCollision',
        module_path='crate::models',
        original_name='PayloadCollision',
        fields=[('kind', 'String', 'kind', False, False), ('x', 'String', 'x', False, False)],
        is_generic=False,
    )

    enum_td = TypeDefinition(
        name='ApiEnumCol',
        rust_path='crate::models::EnumCol',
        module_path='crate::models',
        original_name='EnumCol',
        fields=[],
        is_generic=False,
        is_enum=True,
        variants=[('V', 'V', True, 'crate::models::PayloadCollision')],
        enum_style='internally_tagged',
        enum_tag='kind',
    )

    gen = TypeScriptGenerator(api_modules=[], type_definitions=[payload_td, enum_td])
    openapi = gen.generate_openapi()

    assert 'x-generation-warnings' in openapi
    warnings = openapi['x-generation-warnings']
    # ensure at least one warning references the enum tag field
    assert any('kind' in w or 'tag' in w or 'collides' in w or 'contains field' in w for w in warnings)


def test_missing_component_fallback_warns():
    # payload type not present in components -> will fallback and warn
    enum_td = TypeDefinition(
        name='ApiEnumMissing',
        rust_path='crate::models::EnumMissing',
        module_path='crate::models',
        original_name='EnumMissing',
        fields=[],
        is_generic=False,
        is_enum=True,
        variants=[('V', 'V', True, 'crate::models::UnknownPayload')],
        enum_style='internally_tagged',
        enum_tag='kind',
    )

    gen = TypeScriptGenerator(api_modules=[], type_definitions=[enum_td])
    openapi = gen.generate_openapi()

    assert 'x-generation-warnings' in openapi
    found = any('Fell back to nesting payload' in w for w in openapi['x-generation-warnings'])
    assert found
