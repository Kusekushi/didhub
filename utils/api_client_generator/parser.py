"""
Rust route parser for extracting API endpoints from Axum route definitions.
"""

import re
from collections import defaultdict
import sys
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import MODULE_MAP, ROUTE_FILES, VALID_HTTP_METHODS
from models import ApiModule, Endpoint, TypeDefinition

# Tree-sitter imports
import tree_sitter
from tree_sitter import Language, Parser
import tree_sitter_rust as tsrust


class RustRouteParser:
    """Parses Rust route definitions from Axum router code"""

    def __init__(self, server_root: Path):
        self.server_root = server_root
        # Set up tree-sitter parser
        self.parser = Parser()
        self.parser.language = Language(tsrust.language())
from collections import defaultdict
import sys
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import MODULE_MAP, ROUTE_FILES, VALID_HTTP_METHODS
from models import ApiModule, Endpoint, TypeDefinition

# Tree-sitter imports
import tree_sitter
from tree_sitter import Language, Parser
import tree_sitter_rust as tsrust


class RustRouteParser:
    """Parses Rust route definitions from Axum router code"""

    def __init__(self, server_root: Path):
        self.server_root = server_root
        # Set up tree-sitter parser
        self.parser = Parser()
        self.parser.language = Language(tsrust.language())

    def parse_routes(self) -> Tuple[List[ApiModule], List[TypeDefinition]]:
        """Parse all route files and return organized API modules and type definitions"""
        modules = defaultdict(list)
        type_definitions = []
        referenced_types = set()

        # Parse router files to extract routes
        self._parse_router_files(modules, referenced_types)

        # Also parse struct definitions from route handler files and db models
        all_type_definitions = []
        self._parse_struct_definitions_from_dir(self.server_root, all_type_definitions)
        
        # Also parse db models
        db_root = self.server_root.parent / "didhub-db"
        if db_root.exists():
            self._parse_struct_definitions_from_dir(db_root, all_type_definitions)
        
        # Recursively collect all types referenced by the initially collected types
        all_referenced_types = set(referenced_types)
        self._collect_nested_types(all_type_definitions, all_referenced_types)
        
        # Filter type definitions to only include those that are referenced
        type_definitions = [td for td in all_type_definitions if td.name in all_referenced_types]

        # Convert to ApiModule objects
        api_modules = []
        for module_name, endpoints in modules.items():
            if module_name != 'misc':  # Skip misc modules
                api_modules.append(ApiModule(module_name, endpoints))

        print(f"DEBUG: Collected {len(referenced_types)} referenced types:")
        for t in sorted(referenced_types):
            print(f"DEBUG:   {t}")

        return sorted(api_modules, key=lambda m: m.name), type_definitions

    def _parse_router_files(self, modules: Dict[str, List[Endpoint]], referenced_types: set):
        """Parse all router files to extract route definitions"""
        from config import ROUTE_FILES
        
        for route_file in ROUTE_FILES:
            file_path = self.server_root / route_file
            if file_path.exists():
                print(f"DEBUG: Parsing router file: {file_path}")
                self._parse_route_file(file_path, modules, referenced_types)
            else:
                print(f"DEBUG: Router file not found: {file_path}")

    def _parse_route_file(self, file_path: Path, modules: Dict[str, List[Endpoint]], referenced_types: set):
        """Parse a single route file using tree-sitter"""
        content = file_path.read_text()
        
        # Determine auth level from filename
        auth_required = "protected" in file_path.name or "admin" in file_path.name
        is_admin = "admin" in file_path.name

        # Use regex to find all .route() calls - more reliable than AST parsing for chained calls
        # Match .route("path", method(handler)) patterns, allowing for multiline
        route_pattern = r'\.route\(\s*["\']([^"\']+)["\']\s*,\s*([^)]+\))'
        matches = re.findall(route_pattern, content, re.DOTALL)
        
        print(f"DEBUG: Found {len(matches)} route matches in {file_path.name}")
        for path_match, methods_match in matches[:3]:  # Debug first 3
            print(f"DEBUG:   path='{path_match}', methods='{methods_match}'")
        
        for path_match, methods_match in matches:
            path = path_match.strip()
            methods_str = methods_match.strip()
            
            if path and methods_str:
                # Parse methods and handlers
                method_handlers = self._parse_method_handlers(methods_str)
                
                print(f"DEBUG:   path='{path}' -> {len(method_handlers)} handlers: {method_handlers[:2]}")

                for method, handler in method_handlers:
                    endpoint = Endpoint(
                        path=path,
                        method=method.upper(),
                        handler=handler,
                        auth_required=auth_required,
                        is_admin=is_admin
                    )

                    # Parse handler function to extract parameter and return types
                    self._parse_handler_function(endpoint)

                    # Collect referenced types from this endpoint
                    self._collect_referenced_types(endpoint, referenced_types)

                    # Determine module from path
                    module_name = self._determine_module_from_path(path)
                    modules[module_name].append(endpoint)

    def _collect_nested_types(self, type_definitions: List[TypeDefinition], referenced_types: set):
        """Recursively collect all types referenced by the type definitions"""
        type_def_map = {td.name: td for td in type_definitions}
        
        def collect_from_type(ts_type: str):
            """Extract type names from a TypeScript type string"""
            # Handle arrays
            if ts_type.endswith('[]'):
                collect_from_type(ts_type[:-2])
                return
            
            # Handle union types
            if ' | ' in ts_type:
                for part in ts_type.split(' | '):
                    collect_from_type(part.strip())
                return
            
            # Handle generic types
            if '<' in ts_type:
                # Extract base type
                base_type = ts_type.split('<')[0]
                referenced_types.add(base_type)
                
                # Extract inner types
                inner_part = ts_type[ts_type.find('<')+1:ts_type.rfind('>')]
                for inner_type in inner_part.split(','):
                    collect_from_type(inner_type.strip())
                return
            
            # Simple type
            if ts_type and ts_type not in ['string', 'number', 'boolean', 'any']:
                referenced_types.add(ts_type)
        
        # Start with initially referenced types
        to_process = list(referenced_types)
        processed = set()
        
        while to_process:
            current_type = to_process.pop(0)
            if current_type in processed:
                continue
            processed.add(current_type)
            
            # If this is a defined type, collect its field types
            if current_type in type_def_map:
                type_def = type_def_map[current_type]
                for field_name, field_type in type_def.fields:
                    collect_from_type(field_type)

    def _collect_referenced_types(self, endpoint: Endpoint, referenced_types: set):
        """Collect all types referenced by an endpoint"""
        # Add query type if present
        if endpoint.query_type:
            self._extract_type_names(endpoint.query_type, referenced_types)
        
        # Add body type if present
        if endpoint.body_type:
            self._extract_type_names(endpoint.body_type, referenced_types)
        
        # Add response type if present
        if endpoint.response_type:
            self._extract_type_names(endpoint.response_type, referenced_types)

    def _extract_type_names(self, rust_type: str, referenced_types: set):
        """Extract type names from a Rust type string"""
        # Handle Vec<T>
        vec_match = re.match(r'Vec<(.+)>', rust_type)
        if vec_match:
            self._extract_type_names(vec_match.group(1), referenced_types)
            return
        
        # Handle Option<T>
        option_match = re.match(r'Option<(.+)>', rust_type)
        if option_match:
            self._extract_type_names(option_match.group(1), referenced_types)
            return
        
        # Handle generic types like Result<T, E>
        generic_match = re.match(r'(\w+)<(.+)>', rust_type)
        if generic_match:
            base_type = generic_match.group(1)
            inner_types = generic_match.group(2)
            referenced_types.add(base_type)
            # Recursively extract inner types
            for inner_type in inner_types.split(','):
                self._extract_type_names(inner_type.strip(), referenced_types)
            return
        
        # Handle TypeScript array notation T[]
        array_match = re.match(r'(.+)\[\]', rust_type)
        if array_match:
            self._extract_type_names(array_match.group(1), referenced_types)
            return
        
        # Handle union types T | null
        union_match = re.match(r'(.+)\s*\|\s*null', rust_type)
        if union_match:
            self._extract_type_names(union_match.group(1), referenced_types)
            return
        
        # Handle module-qualified types
        if '::' in rust_type:
            # Add the full qualified name and the base name
            referenced_types.add(rust_type)
            referenced_types.add(rust_type.split('::')[-1])
        else:
            # Simple type name
            referenced_types.add(rust_type)

    def _traverse_tree(self, node):
        """Traverse the AST tree"""
        yield node
        for child in node.children:
            yield from self._traverse_tree(child)

    def _extract_string_from_match(self, match: str) -> str:
        """Extract string literal from a regex match"""
        match = match.strip()
        if match.startswith('"') and match.endswith('"'):
            return match[1:-1]
        elif match.startswith("'") and match.endswith("'"):
            return match[1:-1]
        return None

    def _extract_route_args(self, args):
        """Extract path and methods from route call arguments"""
        if len(args) >= 2:
            path_node = args[0]
            methods_node = args[1]
            
            # Extract path string
            path = self._extract_string_literal(path_node)
            
            # Extract methods string (this is more complex, need to reconstruct the method call)
            methods_str = self._extract_method_call_text(methods_node)
            
            return path, methods_str
        return None, None

    def _extract_string_literal(self, node):
        """Extract string literal value"""
        if node.type == 'string_literal':
            text = node.text.decode('utf-8')
            # Remove quotes
            if text.startswith('"') and text.endswith('"'):
                return text[1:-1]
            elif text.startswith("'") and text.endswith("'"):
                return text[1:-1]
        return None

    def _extract_method_call_text(self, node):
        """Extract the text of a method call node"""
        return node.text.decode('utf-8')

    def _parse_method_handlers(self, methods_str: str) -> List[Tuple[str, str]]:
        """Parse method-handler pairs like 'get(handler)' or 'get(handler).post(other_handler)'"""
        # Split by dots to get individual method(handler) calls
        method_calls = methods_str.split('.')

        pairs = []
        for call in method_calls:
            call = call.strip()
            if not call:
                continue

            # Skip non-HTTP method calls (like .layer(...))
            if not any(call.startswith(method + '(') or call.startswith(f'axum::routing::{method}(') for method in VALID_HTTP_METHODS):
                continue

            method, handler = self._extract_method_handler(call)
            if method and handler:
                pairs.append((method, handler))

        return pairs

    def _extract_method_handler(self, method_handler_str: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract method and handler from 'method(handler)' or 'axum::routing::method(handler)'"""
        # Handle both simple method names and fully qualified axum::routing::method names
        for method in VALID_HTTP_METHODS:
            # Try simple method name first
            if method_handler_str.startswith(method + '('):
                handler_match = re.match(rf'{method}\(\s*([^)]+)\s*\),?', method_handler_str)
                if handler_match:
                    return method, handler_match.group(1)
            
            # Try fully qualified axum::routing::method
            qualified_method = f'axum::routing::{method}'
            if method_handler_str.startswith(qualified_method + '('):
                handler_match = re.match(rf'{qualified_method}\(\s*([^)]+)\s*\),?', method_handler_str)
                if handler_match:
                    return method, handler_match.group(1)
        
        return None, None

    def _determine_module_from_path(self, path: str) -> str:
        """Determine API module name from endpoint path"""
        path_parts = path.strip('/').split('/')

        if not path_parts or path_parts[0] == '':
            return 'misc'

        first_part = path_parts[0]

        # Handle nested paths
        if first_part == 'alters' and len(path_parts) > 1:
            return 'Alter'
        elif first_part == 'groups' and len(path_parts) > 1:
            return 'Group'
        elif first_part == 'systems' and len(path_parts) > 1:
            return 'Subsystem'
        elif first_part == 'subsystems' and len(path_parts) > 1:
            return 'Subsystem'
        elif first_part == 'me' and len(path_parts) > 1:
            return 'User'
        elif first_part == 'pdf' and len(path_parts) > 1:
            return 'Report'
        elif first_part in ['users', 'system-requests', 'settings', 'admin', 'audit', 'housekeeping']:
            return 'Admin'

        return MODULE_MAP.get(first_part, 'misc')

    def _parse_handler_function(self, endpoint: Endpoint):
        """Parse the handler function to extract parameter and return types"""
        # Convert handler path to file path
        # e.g., "crate::routes::admin::users::list_users" -> "src/routes/admin/users.rs"
        if not endpoint.handler.startswith('crate::routes::'):
            return  # Skip handlers that don't follow the expected pattern
        
        # Remove crate::routes:: prefix and split by ::
        handler_parts = endpoint.handler[len('crate::routes::'):].split('::')
        if len(handler_parts) < 2:
            return
        
        # Build file path: src/routes/{module}/{file}.rs
        module_path = '/'.join(handler_parts[:-1])  # all parts except the function name
        file_path = self.server_root / f"src/routes/{module_path}.rs"
        
        if not file_path.exists():
            return
        
        # Parse the handler file
        content = file_path.read_text()
        tree = self.parser.parse(bytes(content, 'utf-8'))
        root = tree.root_node
        
        function_name = handler_parts[-1]  # last part is the function name
        
        # Find the function definition
        for node in self._traverse_tree(root):
            if node.type == 'function_item':
                # Check if this is the function we're looking for
                identifier = node.child_by_field_name('name')
                if identifier and identifier.text.decode('utf-8') == function_name:
                    self._extract_function_signature(endpoint, node)
                    break

    def _extract_function_signature(self, endpoint: Endpoint, function_node):
        """Extract parameter and return types from a function node"""
        # Extract parameters
        parameters_node = function_node.child_by_field_name('parameters')
        if parameters_node:
            self._extract_parameters(endpoint, parameters_node)
        
        # Extract return type
        return_type_node = function_node.child_by_field_name('return_type')
        if return_type_node:
            self._extract_return_type(endpoint, return_type_node)

    def _extract_parameters(self, endpoint: Endpoint, parameters_node):
        """Extract query and body parameters from function parameters"""
        # Parameters are typically like: Query(q): Query<UsersQuery>, Json(payload): Json<CreateUserPayload>
        for param in parameters_node.children:
            if param.type == 'parameter':
                # Get the pattern and type
                pattern_node = param.child_by_field_name('pattern')
                type_node = param.child_by_field_name('type')
                
                if pattern_node and type_node:
                    type_text = type_node.text.decode('utf-8').strip()
                    
                    # Check for Query<T>
                    if type_text.startswith('Query<') and type_text.endswith('>'):
                        query_type = type_text[6:-1]  # Extract T from Query<T>
                        endpoint.query_type = query_type
                    
                    # Check for Json<T>
                    elif type_text.startswith('Json<') and type_text.endswith('>'):
                        rust_body_type = type_text[5:-1]  # Extract T from Json<T>
                        endpoint.body_type = rust_body_type

    def _extract_return_type(self, endpoint: Endpoint, return_type_node):
        """Extract response type from function return type"""
        # Return type is typically: Result<Json<UsersListResponse<UserOut>>, AppError>
        return_type_text = return_type_node.text.decode('utf-8').strip()
        
        # Look for Json<T> in the return type
        json_start = return_type_text.find('Json<')
        if json_start != -1:
            # Find the matching closing >
            bracket_count = 0
            for i in range(json_start + 5, len(return_type_text)):  # Start after 'Json<'
                if return_type_text[i] == '<':
                    bracket_count += 1
                elif return_type_text[i] == '>':
                    if bracket_count == 0:
                        # Found the matching closing >
                        rust_type = return_type_text[json_start + 5:i]
                        endpoint.response_type = rust_type
                        break
                    else:
                        bracket_count -= 1

    def _rust_type_to_typescript(self, rust_type: str) -> str:
        """Convert Rust type to TypeScript type"""
        
        # Handle Vec<T>
        vec_match = re.match(r'Vec<(.+)>', rust_type)
        if vec_match:
            inner_type = self._rust_type_to_typescript(vec_match.group(1))
            return f'{inner_type}[]'
        
        # Handle Option<T>
        option_match = re.match(r'Option<(.+)>', rust_type)
        if option_match:
            inner_type = self._rust_type_to_typescript(option_match.group(1))
            return f'{inner_type} | null'
        
        # Handle lifetime annotations like &'static str
        lifetime_match = re.match(r"&'static\s+(\w+)", rust_type)
        if lifetime_match:
            base_type = lifetime_match.group(1)
            if base_type == 'str':
                return 'string'
            else:
                return self._rust_type_to_typescript(base_type)
        
        # Handle tuple types like (String, String)
        tuple_match = re.match(r'\((.+)\)', rust_type)
        if tuple_match:
            inner_types = [self._rust_type_to_typescript(t.strip()) for t in tuple_match.group(1).split(',')]
            return f'[{", ".join(inner_types)}]'
        
        # Handle HashMap<K, V> (including qualified names)
        hashmap_match = re.match(r'(.+::)?HashMap<(.+),\s*(.+)>', rust_type)
        if hashmap_match:
            key_type = self._rust_type_to_typescript(hashmap_match.group(2))
            value_type = self._rust_type_to_typescript(hashmap_match.group(3))
            return f'Record<{key_type}, {value_type}>'
        
        # Handle Arc<RwLock<T>> (including qualified names) - simplify to any
        if 'Arc<RwLock<' in rust_type:
            return 'any'
        
        # Handle Duration - simplify to number
        if 'Duration' in rust_type:
            return 'number'
        
        # Handle serde_json::Value
        if rust_type == 'serde_json::Value':
            return 'any'
        
        # Handle module-qualified types like services::ServiceComponents
        if '::' in rust_type:
            # For now, just use the last part of the qualified name
            # In a more sophisticated implementation, we might track module aliases
            return rust_type.split('::')[-1]
        
        # For simple types, assume they map directly or use any
        # In a real implementation, you'd have a mapping from Rust types to TS types
        if rust_type == 'String':
            return 'string'
        elif rust_type in ['i64', 'i32', 'u64', 'u32', 'f64', 'f32']:
            return 'number'
        elif rust_type == 'bool':
            return 'boolean'
        else:
            # For unknown types, keep as-is (assuming they have TS equivalents)
            return rust_type

    def _parse_struct_definitions_from_dir(self, dir_root: Path, type_definitions: List[TypeDefinition]):
        """Parse struct definitions from a specific directory"""
        # Find all Rust files in the directory
        rust_files = []
        for root, dirs, files in os.walk(dir_root):
            for file in files:
                if file.endswith('.rs'):
                    rust_files.append(Path(root) / file)
        
        print(f"DEBUG: Found {len(rust_files)} Rust files in {dir_root}")
        for file_path in rust_files:
            self._parse_structs_from_file(file_path, type_definitions)

    def _parse_structs_from_file(self, file_path: Path, type_definitions: List[TypeDefinition]):
        """Parse struct definitions from a single Rust file"""
        try:
            content = file_path.read_text()
            tree = self.parser.parse(bytes(content, 'utf-8'))
            root = tree.root_node
            
            struct_count = 0
            for node in self._traverse_tree(root):
                if node.type == 'struct_item':
                    struct_count += 1
                    struct_def = self._parse_struct_definition(node)
                    if struct_def:
                        type_definitions.append(struct_def)
            
            if struct_count > 0:
                print(f"DEBUG: {file_path}: {struct_count} structs found")
        except Exception as e:
            # Skip files that can't be parsed
            print(f"DEBUG: Failed to parse {file_path}: {e}")
            pass

    def _parse_struct_definition(self, struct_node) -> Optional[TypeDefinition]:
        """Parse a struct definition into a TypeDefinition"""
        # Get struct name
        name_node = None
        for child in struct_node.children:
            if child.type == 'type_identifier':
                name_node = child
                break
        
        if not name_node:
            return None
        
        struct_name = name_node.text.decode('utf-8')
        print(f"DEBUG: Parsing struct {struct_name}")
        
        # Check if it's a public struct (starts with 'pub')
        visibility = None
        for child in struct_node.children:
            if child.type == 'visibility_modifier':
                visibility = child
                break
        
        if visibility:
            vis_text = visibility.text.decode('utf-8')
            print(f"DEBUG: Visibility: {repr(vis_text)}")
        else:
            print(f"DEBUG: No visibility found")
        
        if not visibility or visibility.text.decode('utf-8') != 'pub':
            print(f"DEBUG: Skipping non-public struct {struct_name}")
            return None
        
        # Parse type parameters for generic structs
        type_params = []
        for child in struct_node.children:
            if child.type == 'type_parameters':
                for param in child.children:
                    if param.type == 'type_parameter':
                        for subchild in param.children:
                            if subchild.type == 'type_identifier':
                                type_params.append(subchild.text.decode('utf-8'))
                break
        
        print(f"DEBUG: Struct {struct_name} has type_params: {type_params}")
        
        # Parse fields
        fields = []
        body_node = None
        for child in struct_node.children:
            if child.type == 'field_declaration_list':
                body_node = child
                break
        
        if body_node:
            for field_node in body_node.children:
                if field_node.type == 'field_declaration':
                    field_info = self._parse_struct_field(field_node)
                    if field_info:
                        fields.append(field_info)
        
        return TypeDefinition(
            name=struct_name,
            fields=fields,
            is_generic=len(type_params) > 0,
            type_params=type_params
        )

    def _parse_struct_field(self, field_node) -> Optional[Tuple[str, str]]:
        """Parse a struct field into (name, type) tuple"""
        # Get field name
        name_node = None
        type_node = None
        
        for child in field_node.children:
            if child.type == 'field_identifier':
                name_node = child
            elif child.type in ['generic_type', 'type_identifier', 'primitive_type']:
                type_node = child
        
        if not name_node or not type_node:
            return None
        
        field_name = name_node.text.decode('utf-8')
        rust_type = type_node.text.decode('utf-8')
        ts_type = self._rust_type_to_typescript(rust_type)
        
        return (field_name, ts_type)