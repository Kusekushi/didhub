"""
TypeScript API client code generator using Jinja2 templates.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Set

from jinja2 import Environment, FileSystemLoader

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from models import ApiModule, Endpoint, TypeDefinition


class TypeScriptGenerator:
    """Generates TypeScript API client code using Jinja2 templates"""

    def __init__(self, api_modules: List[ApiModule], type_definitions: List[TypeDefinition]):
        self.api_modules = api_modules
        self.type_definitions = self._normalize_type_names(type_definitions)
        self.total_method_bindings = 0
        self.env = self._setup_jinja_env()
        self.rust_to_ts: Dict[str, str] = {}
        simple_name_map: Dict[str, Set[str]] = defaultdict(set)

        for type_def in self.type_definitions:
            self.rust_to_ts[type_def.rust_path] = type_def.name
            simple_name_map[type_def.original_name].add(type_def.name)

        self.simple_to_ts = {
            name: next(iter(names))
            for name, names in simple_name_map.items()
            if len(names) == 1
        }

    def _setup_jinja_env(self) -> Environment:
        """Setup Jinja2 environment with templates"""
        template_dir = Path(__file__).parent / "templates"
        env = Environment(
            loader=FileSystemLoader(template_dir),
            trim_blocks=True,
            lstrip_blocks=True
        )
        return env

    def generate_client_code(self) -> str:
        """Generate the complete API client code"""
        # Prepare data for template
        self.total_method_bindings = 0
        template_data = {
            'api_modules': [],
            'type_definitions': self._generate_type_definitions()
        }

        for module in self.api_modules:
            module_data = {
                'name': module.name,
                'methods': self._generate_module_methods(module)
            }
            template_data['api_modules'].append(module_data)
            self.total_method_bindings += len(module_data['methods'])

        # Render main template
        template = self.env.get_template('client.ts.jinja')
        return template.render(**template_data)

    def generate_types_code(self) -> str:
        """Generate the TypeScript type definitions only"""
        # Prepare data for template
        template_data = {
            'type_definitions': self._generate_type_definitions()
        }

        # Render types template
        template = self.env.get_template('types.ts.jinja')
        return template.render(**template_data)

    def _generate_module_methods(self, module: ApiModule) -> List[str]:
        """Generate methods for a module"""
        methods = []

        # Group endpoints by path to detect conflicts
        endpoints_by_path = defaultdict(list)
        for endpoint in module.endpoints:
            endpoints_by_path[endpoint.path].append(endpoint)

        for path, endpoints in endpoints_by_path.items():
            if len(endpoints) == 1:
                # Single endpoint for this path
                endpoint = endpoints[0]
                method_code = self._generate_endpoint_method(endpoint)
                methods.append(method_code)
            else:
                # Multiple endpoints for same path - include method in name
                for endpoint in endpoints:
                    method_code = self._generate_endpoint_method(endpoint, include_method_in_name=True)
                    methods.append(method_code)

        return methods

    def _generate_endpoint_method(self, endpoint: Endpoint, include_method_in_name: bool = False) -> str:
        """Generate a method for a single endpoint"""
        # Convert path parameters to method parameters
        path_params = re.findall(r'\{([^}]+)\}', endpoint.path)
        
        # Build parameter list
        params = []
        
        # Add path parameters
        for param in path_params:
            params.append(f'{param}: string | number')
        
        # Add query parameters
        if endpoint.query_type:
            ts_query_type = self._rust_type_to_typescript(endpoint.query_type)
            params.append(f'query?: Partial<{ts_query_type}> | QueryInput')
        
        # Add body parameter for POST/PUT/PATCH
        has_body_param = endpoint.method in ['POST', 'PUT', 'PATCH']
        if has_body_param:
            if endpoint.body_type:
                # Convert Rust type to TypeScript type
                ts_body_type = self._rust_type_to_typescript(endpoint.body_type)
                params.append(f'body: {ts_body_type}')
            else:
                params.append('body?: unknown')
        
        param_list = ', '.join(params) if params else ''

        # Generate method name from path
        method_name = self._path_to_method_name(endpoint.path, endpoint.method, include_method_in_name)

        # Handle path parameter substitution
        if path_params:
            path_template = endpoint.path
            for param in path_params:
                path_template = path_template.replace(f'{{{param}}}', f'${{{param}}}')
            path_expr = f'`/api{path_template}`'
        else:
            path_expr = f"'/api{endpoint.path}'"

        # Determine return type
        response_ts_type = self._rust_type_to_typescript(endpoint.response_type) if endpoint.response_type else 'unknown'
        return_type = f'Promise<HttpResponse<{response_ts_type}>>'
        response_type = response_ts_type

        use_json_body = has_body_param and endpoint.body_type is not None
        use_body_payload = has_body_param and not use_json_body

        # Render method template
        template = self.env.get_template('method.ts.jinja')
        return template.render(
            method_name=method_name,
            param_list=param_list,
            path_expr=path_expr,
            method=endpoint.method,
            return_type=return_type,
            response_type=response_type,
            has_query=endpoint.query_type is not None,
            use_json_body=use_json_body,
            use_body_payload=use_body_payload
        )

    def _path_to_method_name(self, path: str, method: str, include_method_in_name: bool = False) -> str:
        """Convert endpoint path to a method name"""
        # Remove leading slash and split by slashes
        parts = path.strip('/').split('/')

        # Convert path parameters to descriptive names
        method_parts = []
        for part in parts:
            if part.startswith('{') and part.endswith('}'):
                param_name = part[1:-1]
                # Convert common param names
                if param_name == 'id':
                    method_parts.append('by_id')  # Include 'by_id' to distinguish
                elif param_name in ['user_id', 'alter_id', 'group_id', 'system_id']:
                    method_parts.append(f'by_{param_name.replace("_id", "")}')
                else:
                    method_parts.append(f'by_{param_name}')
            else:
                # Clean up the part name
                clean_part = re.sub(r'[^a-zA-Z0-9]', '_', part)
                if clean_part and clean_part != '_':
                    method_parts.append(clean_part)

        # Add HTTP method prefix if requested or for non-GET methods when there might be conflicts
        if include_method_in_name or method != 'GET':
            method_parts.insert(0, method.lower())

        # Join and create a reasonable method name
        name = '_'.join(method_parts)
        if not name:
            name = f'{method.lower()}_request'

        prefix_map = {
            'GET': 'get',
            'POST': 'post',
            'PUT': 'put',
            'PATCH': 'patch',
            'DELETE': 'delete'
        }

        snake_name = name
        prefix = prefix_map.get(method)
        if prefix and not snake_name.startswith(f'{prefix}_'):
            snake_name = f'{prefix}_{snake_name}' if snake_name else prefix

        return snake_name

    def _split_generic_params(self, params_str: str) -> List[str]:
        params = []
        current = []
        angle_depth = 0
        paren_depth = 0

        for char in params_str:
            if char == '<':
                angle_depth += 1
                current.append(char)
            elif char == '>':
                angle_depth -= 1
                current.append(char)
            elif char == '(':  # nested tuple inside generics
                paren_depth += 1
                current.append(char)
            elif char == ')':
                paren_depth -= 1
                current.append(char)
            elif char == ',' and angle_depth == 0 and paren_depth == 0:
                param = ''.join(current).strip()
                if param:
                    params.append(param)
                current = []
            else:
                current.append(char)

        final = ''.join(current).strip()
        if final:
            params.append(final)

        return params

    def _split_tuple_elements(self, tuple_str: str) -> List[str]:
        elements = []
        current = []
        angle_depth = 0
        paren_depth = 0

        for char in tuple_str:
            if char == '<':
                angle_depth += 1
                current.append(char)
            elif char == '>':
                angle_depth -= 1
                current.append(char)
            elif char == '(':
                paren_depth += 1
                current.append(char)
            elif char == ')':
                paren_depth -= 1
                current.append(char)
            elif char == ',' and angle_depth == 0 and paren_depth == 0:
                element = ''.join(current).strip()
                if element:
                    elements.append(element)
                current = []
            else:
                current.append(char)

        final = ''.join(current).strip()
        if final:
            elements.append(final)

        return elements

    def _resolve_custom_type(self, rust_type: str, for_types_file: bool) -> str | None:
        if rust_type in self.rust_to_ts:
            ts_name = self.rust_to_ts[rust_type]
            return ts_name if for_types_file else f'Types.{ts_name}'

        simple = rust_type.split('::')[-1]
        ts_name = self.simple_to_ts.get(simple)
        if ts_name:
            return ts_name if for_types_file else f'Types.{ts_name}'

        return None

    def _rust_type_to_typescript(self, rust_type: str, for_types_file: bool = False) -> str:
        """Convert Rust type to TypeScript type"""
        if not rust_type:
            return 'unknown'

        rust_type = rust_type.strip()

        # Option types map to Maybe<> in client and union in types file
        option_prefixes = (
            'Option<',
            'std::option::Option<',
            'core::option::Option<',
        )
        for prefix in option_prefixes:
            if rust_type.startswith(prefix) and rust_type.endswith('>'):
                inner = rust_type[len(prefix):-1].strip()
                ts_inner = self._rust_type_to_typescript(inner, for_types_file)
                return f'{ts_inner} | null' if for_types_file else f'Maybe<{ts_inner}>'

        # Vec<T>
        vec_prefixes = (
            'Vec<',
            'std::vec::Vec<',
            'alloc::vec::Vec<',
        )
        for prefix in vec_prefixes:
            if rust_type.startswith(prefix) and rust_type.endswith('>'):
                inner = rust_type[len(prefix):-1].strip()
                ts_inner = self._rust_type_to_typescript(inner, for_types_file)
                return f'Array<{ts_inner}>'

        # Slices T[]
        if rust_type.endswith('[]'):
            inner = rust_type[:-2].strip()
            ts_inner = self._rust_type_to_typescript(inner, for_types_file)
            return f'Array<{ts_inner}>'

        # HashMap / BTreeMap style dictionaries
        map_prefixes = (
            ('HashMap<', 8),
            ('std::collections::HashMap<', len('std::collections::HashMap<')),
            ('std::collections::hash_map::HashMap<', len('std::collections::hash_map::HashMap<')),
        )
        for prefix, offset in map_prefixes:
            if rust_type.startswith(prefix) and rust_type.endswith('>'):
                params = self._split_generic_params(rust_type[offset:-1])
                if len(params) == 2:
                    key_ts = self._rust_type_to_typescript(params[0], for_types_file)
                    val_ts = self._rust_type_to_typescript(params[1], for_types_file)
                    return f'Record<{key_ts}, {val_ts}>'

        btree_prefixes = (
            ('BTreeMap<', 9),
            ('std::collections::BTreeMap<', len('std::collections::BTreeMap<')),
        )
        for prefix, offset in btree_prefixes:
            if rust_type.startswith(prefix) and rust_type.endswith('>'):
                params = self._split_generic_params(rust_type[offset:-1])
                if len(params) == 2:
                    key_ts = self._rust_type_to_typescript(params[0], for_types_file)
                    val_ts = self._rust_type_to_typescript(params[1], for_types_file)
                    return f'Record<{key_ts}, {val_ts}>'

        # Tuple types e.g. (T1, T2)
        tuple_start = rust_type.find('(')
        if tuple_start != -1 and rust_type.endswith(')'):
            prefix = rust_type[:tuple_start]
            if not prefix or prefix.endswith('::'):
                inner = rust_type[tuple_start + 1:-1].strip()
            else:
                inner = ''
            if inner == '':
                # Fall back to generic handling if this wasn't actually a tuple
                pass
            else:
                elements = self._split_tuple_elements(inner)
                ts_elements = [self._rust_type_to_typescript(elem, for_types_file) for elem in elements]

                if len(ts_elements) == 1:
                    return ts_elements[0]

                return f'[{", ".join(ts_elements)}]'

        if rust_type.startswith('(') and rust_type.endswith(')'):
            inner = rust_type[1:-1].strip()
            if not inner:
                return '[]'

            elements = self._split_tuple_elements(inner)
            ts_elements = [self._rust_type_to_typescript(elem, for_types_file) for elem in elements]

            if len(ts_elements) == 1:
                return ts_elements[0]

            return f'[{", ".join(ts_elements)}]'

        # Generic types e.g. Foo<Bar, Baz>
        if '<' in rust_type and rust_type.endswith('>'):
            base = rust_type[:rust_type.find('<')].strip()
            params_str = rust_type[rust_type.find('<') + 1:-1]
            params = self._split_generic_params(params_str)
            ts_params = [self._rust_type_to_typescript(param, for_types_file) for param in params]
            ts_base = self._rust_type_to_typescript(base, for_types_file)
            return f'{ts_base}<{", ".join(ts_params)}>'

        primitive_map = {
            'String': 'string',
            'str': 'string',
            'bool': 'boolean',
            'i8': 'number',
            'i16': 'number',
            'i32': 'number',
            'i64': 'number',
            'isize': 'number',
            'u8': 'number',
            'u16': 'number',
            'u32': 'number',
            'u64': 'number',
            'usize': 'number',
            'f32': 'number',
            'f64': 'number',
            'serde_json::Value': 'Types.ApiJsonValue',
            'axum::response::Response': 'unknown',
        }

        if rust_type in primitive_map:
            return primitive_map[rust_type]

        if rust_type.startswith('crate::') or rust_type.startswith('didhub_db::') or '::' in rust_type:
            resolved = self._resolve_custom_type(rust_type, for_types_file)
            if resolved:
                return resolved
            rust_type = rust_type.split('::')[-1]

            if rust_type in primitive_map:
                return primitive_map[rust_type]

        # Handle simple custom types by name if unambiguous
        resolved = self._resolve_custom_type(rust_type, for_types_file)
        if resolved:
            return resolved

        return rust_type

    def _generate_type_definitions(self) -> List[str]:
        """Generate TypeScript interface definitions"""
        interfaces = []
        
        for type_def in sorted(self.type_definitions, key=lambda td: td.name):
            interface_code = self._generate_interface(type_def)
            interfaces.append(interface_code)
        
        return interfaces

    def _generate_interface(self, type_def: TypeDefinition) -> str:
        """Generate a TypeScript interface from a TypeDefinition"""
        lines = []
        
        # Interface declaration
        if type_def.is_generic:
            type_params = ', '.join(type_def.type_params)
            lines.append(f"export interface {type_def.name}<{type_params}> {{")
        else:
            lines.append(f"export interface {type_def.name} {{")
        
        # Fields
        for field_name, field_type in type_def.fields:
            ts_field_type = self._rust_type_to_typescript(field_type, for_types_file=True)
            optional_marker = '?' if self._is_optional_field(type_def, field_name, field_type) else ''
            lines.append(f"  {field_name}{optional_marker}: {ts_field_type};")
        
        lines.append("}")
        lines.append("")  # Empty line between interfaces
        
        return '\n'.join(lines)

    def _is_optional_field(self, type_def: TypeDefinition, field_name: str, rust_type: str) -> bool:
        optional_prefixes = (
            'Option<',
            'std::option::Option<',
            'core::option::Option<',
        )

        if not rust_type or not rust_type.startswith(optional_prefixes):
            return False

        relax_suffixes = (
            'Query',
            'Params',
            'Payload',
            'Request',
            'Body',
            'Filters',
            'Options',
        )

        return type_def.original_name.endswith(relax_suffixes)

    def _normalize_type_names(self, type_definitions: List[TypeDefinition]) -> List[TypeDefinition]:
        by_base: Dict[str, List[TypeDefinition]] = defaultdict(list)
        for td in type_definitions:
            base_name = self._to_pascal_case(td.original_name)
            by_base[base_name].append(td)

        used_names: Set[str] = set()

        for base_name, defs in by_base.items():
            if len(defs) == 1:
                candidate = self._unique_name(f'Api{base_name}', used_names)
                defs[0].name = candidate
                used_names.add(candidate)
                continue

            for td in defs:
                module_suffix = self._build_module_suffix(td.module_path)
                candidate = f'Api{module_suffix}{base_name}' if module_suffix else f'Api{base_name}'
                candidate = self._unique_name(candidate, used_names)
                td.name = candidate
                used_names.add(candidate)

        return type_definitions

    def _build_module_suffix(self, module_path: str) -> str:
        if not module_path:
            return ''

        parts = [part for part in module_path.split('::') if part and part not in {'crate'}]
        if not parts:
            return ''

        tail = parts[-2:] if len(parts) > 1 else parts
        return ''.join(self._to_pascal_case(part) for part in tail)

    def _unique_name(self, candidate: str, used: Set[str]) -> str:
        if candidate not in used:
            return candidate

        index = 2
        while True:
            alt = f'{candidate}{index}'
            if alt not in used:
                return alt
            index += 1

    def _to_pascal_case(self, value: str) -> str:
        parts = re.split(r'[_\-/]', value)
        return ''.join(part[:1].upper() + part[1:] for part in parts if part)