"""
TypeScript API client code generator using Jinja2 templates.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import List

from jinja2 import Environment, FileSystemLoader

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from models import ApiModule, Endpoint, TypeDefinition


class TypeScriptGenerator:
    """Generates TypeScript API client code using Jinja2 templates"""

    def __init__(self, api_modules: List[ApiModule], type_definitions: List[TypeDefinition]):
        self.api_modules = api_modules
        self.type_definitions = type_definitions
        self.env = self._setup_jinja_env()

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
            params.append('query: QueryParams')
        
        # Add body parameter for POST/PUT/PATCH
        if endpoint.method in ['POST', 'PUT', 'PATCH']:
            if endpoint.body_type:
                # Convert Rust type to TypeScript type
                ts_body_type = self._rust_type_to_typescript(endpoint.body_type)
                params.append(f'body: {ts_body_type}')
            else:
                params.append('body?: any')
        
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
        response_ts_type = self._rust_type_to_typescript(endpoint.response_type) if endpoint.response_type else 'any'
        return_type = f'Promise<{response_ts_type}>'
        response_type = response_ts_type

        # Render method template
        template = self.env.get_template('method.ts.jinja')
        return template.render(
            method_name=method_name,
            param_list=param_list,
            path_expr=path_expr,
            method=endpoint.method,
            return_type=return_type,
            response_type=response_type,
            has_query=endpoint.query_type is not None
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

        return name

    def _rust_type_to_typescript(self, rust_type: str) -> str:
        """Convert Rust type to TypeScript type"""
        # Basic type mappings - extend as needed
        type_mappings = {
            'i32': 'number',
            'i64': 'number',
            'f32': 'number',
            'f64': 'number',
            'bool': 'boolean',
            'String': 'string',
            'Vec': 'Array',
            'Option': 'Maybe',
            'HashMap': 'Record<string, ',
            'BTreeMap': 'Record<string, ',
            'serde_json::Value': 'any',
        }

        # Handle option types
        if rust_type.startswith('Option<') and rust_type.endswith('>'):
            inner_type = rust_type[7:-1]
            ts_inner_type = self._rust_type_to_typescript(inner_type)
            return f'Maybe<{ts_inner_type}>'

        # Handle vector types
        if rust_type.startswith('Vec<') and rust_type.endswith('>'):
            inner_type = rust_type[4:-1]
            ts_inner_type = self._rust_type_to_typescript(inner_type)
            return f'Array<{ts_inner_type}>'

        # Handle array types (T[])
        if rust_type.endswith('[]'):
            inner_type = rust_type[:-2]
            ts_inner_type = self._rust_type_to_typescript(inner_type)
            return f'Array<{ts_inner_type}>'

        # Handle map types
        if rust_type.startswith('HashMap<') and rust_type.endswith('>'):
            key_value_types = rust_type[8:-1].split(',')
            if len(key_value_types) == 2:
                key_type = key_value_types[0].strip()
                value_type = key_value_types[1].strip()
                ts_key_type = self._rust_type_to_typescript(key_type)
                ts_value_type = self._rust_type_to_typescript(value_type)
                return f'Record<{ts_key_type}, {ts_value_type}>'
        if rust_type.startswith('BTreeMap<') and rust_type.endswith('>'):
            key_value_types = rust_type[9:-1].split(',')
            if len(key_value_types) == 2:
                key_type = key_value_types[0].strip()
                value_type = key_value_types[1].strip()
                ts_key_type = self._rust_type_to_typescript(key_type)
                ts_value_type = self._rust_type_to_typescript(value_type)
                return f'Record<{ts_key_type}, {ts_value_type}>'

        # Handle generic types by processing recursively
        if '<' in rust_type and '>' in rust_type:
            # Parse generic type like Type<Param1, Param2>
            base_type = rust_type.split('<')[0]
            params_str = rust_type[len(base_type)+1:-1]  # Remove base< and >
            
            # Parse parameters, handling nested generics
            params = []
            current_param = ""
            level = 0
            for char in params_str:
                if char == '<':
                    level += 1
                elif char == '>':
                    level -= 1
                elif char == ',' and level == 0:
                    params.append(current_param.strip())
                    current_param = ""
                    continue
                current_param += char
            if current_param.strip():
                params.append(current_param.strip())
            
            # Convert each parameter
            ts_params = [self._rust_type_to_typescript(param) for param in params]
            
            # Convert base type
            ts_base = self._rust_type_to_typescript(base_type)
            
            return f'{ts_base}<{", ".join(ts_params)}>'

        # Default to string for unknown types
        result = type_mappings.get(rust_type, rust_type)
        
        # Handle qualified names (e.g., super::TypeName -> TypeName)
        if '::' in result:
            result = result.split('::')[-1]  # Take the last part after ::
        
        # If this is a custom type (interface we generated), prefix with Types.
        # Handle generic types by extracting the base type name
        base_type = result.split('<')[0]  # Remove generic parameters
        type_names = [td.name for td in self.type_definitions]
        if base_type in type_names:
            result = f'Types.{result}'
        
        return result

    def _generate_type_definitions(self) -> List[str]:
        """Generate TypeScript interface definitions"""
        interfaces = []
        
        for type_def in self.type_definitions:
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
            lines.append(f"  {field_name}: {field_type};")
        
        lines.append("}")
        lines.append("")  # Empty line between interfaces
        
        return '\n'.join(lines)