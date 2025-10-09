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

from models import ApiModule, Endpoint


class TypeScriptGenerator:
    """Generates TypeScript API client code using Jinja2 templates"""

    def __init__(self, api_modules: List[ApiModule]):
        self.api_modules = api_modules
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
            'api_modules': []
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
        param_list = ', '.join(f'{param}: string | number' for param in path_params) if path_params else ''

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

        # Render method template
        template = self.env.get_template('method.ts.jinja')
        return template.render(
            method_name=method_name,
            param_list=param_list,
            path_expr=path_expr,
            method=endpoint.method
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