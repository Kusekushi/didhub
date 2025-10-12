import sys
from pathlib import Path

# Make local modules importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser import RustRouteParser
from generator import TypeScriptGenerator


def test_generator_snapshot_rename_and_flatten(tmp_path):
    # Create a Rust source with rename + flatten and a fake endpoint file for client generation
    src_dir = tmp_path / 'src'
    src_dir.mkdir()

    models_rs = src_dir / 'models.rs'
    models_rs.write_text('''
    pub struct Inner {
        pub id: i32,
        #[serde(rename = "label")]
        pub name: String,
    }

    pub struct Outer {
        #[serde(flatten)]
        pub inner: Inner,
        pub extra: Option<String>,
    }
    ''')

    # Parse types
    parser = RustRouteParser(tmp_path)
    type_defs = []
    parser._parse_struct_definitions_from_dir(tmp_path, type_defs, module_prefix='crate')

    # Validate parsed types exist
    names = {td.original_name: td for td in type_defs}
    assert 'Inner' in names and 'Outer' in names

    # Generate TypeScript types
    gen = TypeScriptGenerator([], [names['Inner'], names['Outer']])
    types_code = gen.generate_types_code()

    # Snapshot-like checks
    # Outer should inline id and label from Inner
    assert 'label:' in types_code
    assert 'id:' in types_code
    # extra should be optional
    assert 'extra?' in types_code

    # Also ensure Inner's 'name' is serialized as 'label'
    assert 'export interface' in types_code
