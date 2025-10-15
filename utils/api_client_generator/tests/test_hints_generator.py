import sys
from pathlib import Path

# Make local modules importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generator import TypeScriptGenerator
from models import ApiModule, Endpoint


def test_generator_prefers_response_hint_for_binary():
    # Create an ApiModule with one endpoint that has a response_hint
    ep = Endpoint(path='/admin/backup', method='GET', handler='crate::routes::admin::backup')
    ep.response_hint = 'binary'

    module = ApiModule(name='Admin', endpoints=[ep])
    gen = TypeScriptGenerator([module], [])
    gen.endpoint_interfaces = []

    methods = gen._generate_module_methods(module)
    # methods is a list of rendered method code strings; join to search
    combined = '\n'.join(methods)

    # The generated method should include the response type union containing Blob/ArrayBuffer
    assert 'Blob' in combined or 'ArrayBuffer' in combined


def test_generator_prefers_body_hint_for_formdata():
    ep = Endpoint(path='/files/upload', method='POST', handler='crate::routes::files::upload')
    ep.body_hint = 'formdata'

    module = ApiModule(name='Files', endpoints=[ep])
    gen = TypeScriptGenerator([module], [])
    gen.endpoint_interfaces = []

    methods = gen._generate_module_methods(module)
    # endpoint_interfaces should have been populated with a request interface entry
    # find the request iface for our endpoint
    found = None
    for sig in gen.endpoint_interfaces:
        if sig[0].startswith('Files') and 'Upload' in sig[0]:
            found = sig
            break
    assert found is not None
    # sig structure: (request_iface, tuple(req_fields), response_iface, response_type)
    req_fields = found[1]
    # Look for 'body' field containing FormData in its type
    body_field = next((f for f in req_fields if f[0] == 'body'), None)
    assert body_field is not None
    assert 'FormData' in body_field[1]
