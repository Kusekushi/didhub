import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser import RustRouteParser
from generator import TypeScriptGenerator


def test_openapi_generation_minimal(tmp_path):
    src = tmp_path / 'src'
    src.mkdir()
    f = src / 'models.rs'
    f.write_text('''
    pub struct Body { pub name: String }
    pub struct Resp { pub ok: bool }
    ''')

    # Create a fake route module (not strictly necessary for parsing types)
    parser = RustRouteParser(tmp_path)
    type_defs = []
    parser._parse_struct_definitions_from_dir(tmp_path, type_defs, module_prefix='crate')

    # Build a fake ApiModule/Endpoint manually
    from models import ApiModule, Endpoint
    ep = Endpoint(path='/test/{id}', method='GET', handler='crate::routes::test::get', auth_required=True)
    ep.query_type = None
    ep.body_type = None
    ep.response_type = 'crate::Resp'

    module = ApiModule('Test', [ep])
    gen = TypeScriptGenerator([module], type_defs)
    spec = gen.generate_openapi()

    assert '/test/{id}' in spec['paths']
    assert 'get' in spec['paths']['/test/{id}']
    # Security scheme should be present due to auth_required=True
    assert 'securitySchemes' in spec['components']
        # End of test