import sys
from pathlib import Path

# Make local modules importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser import RustRouteParser
from models import Endpoint


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def test_parser_extracts_api_attribute_and_doc_comment(tmp_path):
    src = tmp_path / 'src'
    src.mkdir()

    file_path = src / 'handlers.rs'
    file_path.write_text('''
    // Attribute style
    #[api(response = "binary")]
    pub async fn backup_handler() -> axum::response::Response {
        unimplemented!()
    }

    // Doc comment style
    /// @api response=binary
    pub async fn report_pdf() -> axum::response::Response {
        unimplemented!()
    }

    /// @api body=formdata
    pub async fn upload_file() -> axum::response::Response {
        unimplemented!()
    }
    ''')

    parser = RustRouteParser(tmp_path)

    # Build fake Endpoint objects and feed parser._parse_function_from_file to trigger extraction
    ep1 = Endpoint(path='/admin/backup', method='POST', handler='crate::routes::handlers::backup_handler')
    ep2 = Endpoint(path='/report/pdf', method='GET', handler='crate::routes::handlers::report_pdf')
    ep3 = Endpoint(path='/files/upload', method='POST', handler='crate::routes::handlers::upload_file')

    # parse from file directly
    # We call internal helper to simulate normal parse flow
    assert parser._parse_function_from_file(ep1, 'backup_handler', file_path, 'crate::routes::handlers')
    assert parser._parse_function_from_file(ep2, 'report_pdf', file_path, 'crate::routes::handlers')
    assert parser._parse_function_from_file(ep3, 'upload_file', file_path, 'crate::routes::handlers')

    # Hints should be set
    assert getattr(ep1, 'response_hint', None) == 'binary'
    assert getattr(ep2, 'response_hint', None) == 'binary'
    assert getattr(ep3, 'body_hint', None) == 'formdata'
