import os
import sys
from pathlib import Path

import pytest

# Ensure the generator package imports resolve when tests are run from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parser import RustRouteParser
from generator import TypeScriptGenerator
from models import TypeDefinition, ApiModule


def write_file(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


@pytest.fixture()
def tmp_rust_dir(tmp_path):
    root = tmp_path / 'src'
    root.mkdir()
    return tmp_path


def test_serde_rename_and_flatten(tmp_rust_dir):
    # Create nested structs with serde rename and flatten
    file_path = tmp_rust_dir / 'src' / 'models.rs'
    content = '''
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
    '''
    write_file(file_path, content)

    parser = RustRouteParser(tmp_rust_dir)
    type_defs = []
    parser._parse_struct_definitions_from_dir(tmp_rust_dir, type_defs, module_prefix='crate')

    # Find Outer and Inner type defs
    names = {td.original_name: td for td in type_defs}
    assert 'Inner' in names
    assert 'Outer' in names

    inner_td = names['Inner']
    outer_td = names['Outer']

    # Inner should have name and label (serialized name)
    inner_field_serials = {f[2]: f for f in inner_td.fields}
    assert 'id' in inner_field_serials
    assert 'label' in inner_field_serials

    # Outer should have a flattened inner; generator should inline it
    gen = TypeScriptGenerator([], [inner_td, outer_td])
    interface = gen._generate_interface(outer_td)

    # The generated interface should contain properties 'id' and 'label' from the flattened Inner
    assert 'id:' in interface
    assert 'label:' in interface
    # extra should be optional (Option<String>)
    assert 'extra?' in interface


def test_nested_flatten_recursive(tmp_rust_dir):
    # A -> B flattened -> C flattened
    file_path = tmp_rust_dir / 'src' / 'nested.rs'
    content = '''
    pub struct C {
        pub a: i32,
    }
    pub struct B {
        #[serde(flatten)]
        pub c: C,
    }
    pub struct A {
        #[serde(flatten)]
        pub b: B,
    }
    '''
    write_file(file_path, content)

    parser = RustRouteParser(tmp_rust_dir)
    type_defs = []
    parser._parse_struct_definitions_from_dir(tmp_rust_dir, type_defs, module_prefix='crate')

    names = {td.original_name: td for td in type_defs}
    assert 'A' in names and 'B' in names and 'C' in names

    gen = TypeScriptGenerator([], [names['A'], names['B'], names['C']])
    iface = gen._generate_interface(names['A'])
    assert 'a:' in iface
