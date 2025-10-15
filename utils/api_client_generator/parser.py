"""
Rust route parser for extracting API endpoints from Axum route definitions.
"""

import re
from collections import defaultdict
import sys
import os
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import MODULE_MAP, VALID_HTTP_METHODS, DIDHUB_DB_EXPORT_FILES
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
        self.debug = os.environ.get('API_CLIENT_GENERATOR_DEBUG') == '1'

    def _debug(self, message: str):
        if self.debug:
            print(message)

    def parse_routes(self) -> Tuple[List[ApiModule], List[TypeDefinition]]:
        """Parse all route files and return organized API modules and type definitions"""
        modules = defaultdict(list)
        type_definitions = []
        referenced_types = set()

        # Parse router files to extract routes
        self._parse_router_files(modules, referenced_types)

        # Parse struct definitions from route handler files
        all_type_definitions = []
        self._parse_struct_definitions_from_dir(self.server_root, all_type_definitions, module_prefix='crate')
        
        # Parse selected didhub-db models that are safe to expose via the API client
        db_root = self.server_root.parent / "didhub-db"
        if db_root.exists():
            allowed_names = set(DIDHUB_DB_EXPORT_FILES)

            def include_db_file(path: Path) -> bool:
                return path.name in allowed_names

            self._parse_struct_definitions_from_dir(
                db_root,
                all_type_definitions,
                module_prefix='didhub_db',
                include_filter=include_db_file,
            )

        # Parse auth crate structures
        auth_root = self.server_root.parent / "didhub-auth"
        if auth_root.exists():
            self._parse_struct_definitions_from_dir(auth_root, all_type_definitions, module_prefix='didhub_auth')
        
        # Recursively collect all types referenced by the initially collected types
        all_referenced_types = set(referenced_types)
        self._collect_nested_types(all_type_definitions, all_referenced_types)
        
        # Deduplicate by fully-qualified path
        unique_type_defs = {}
        for td in all_type_definitions:
            unique_type_defs.setdefault(td.rust_path, td)

        # Filter type definitions to only include those that are referenced
        type_definitions = [
            td for td in unique_type_defs.values()
            if td.original_name in all_referenced_types or td.name in all_referenced_types or td.rust_path in all_referenced_types
        ]

        if not type_definitions:
            type_definitions = list(unique_type_defs.values())

        # Convert to ApiModule objects
        api_modules = []
        for module_name, endpoints in modules.items():
            if module_name != 'misc':  # Skip misc modules
                api_modules.append(ApiModule(module_name, endpoints))

        self._debug(f"DEBUG: Collected {len(referenced_types)} referenced types:")
        for t in sorted(referenced_types):
            self._debug(f"DEBUG:   {t}")

        return sorted(api_modules, key=lambda m: m.name), type_definitions

    def _parse_router_files(self, modules: Dict[str, List[Endpoint]], referenced_types: set):
        """Parse all router files to extract route definitions"""
        from config import ROUTE_FILES
        
        for route_file in ROUTE_FILES:
            file_path = self.server_root / route_file
            if file_path.exists():
                self._debug(f"DEBUG: Parsing router file: {file_path}")
                self._parse_route_file(file_path, modules, referenced_types)
            else:
                self._debug(f"DEBUG: Router file not found: {file_path}")

    def _parse_route_file(self, file_path: Path, modules: Dict[str, List[Endpoint]], referenced_types: set):
        """Parse a single route file using tree-sitter"""
        content = file_path.read_text()
        
        # Determine auth level from filename
        auth_required = "protected" in file_path.name or "admin" in file_path.name
        is_admin = "admin" in file_path.name

        # Use regex to find all .route() calls - more reliable than AST parsing for chained calls
        # Match .route("path", method(handler)) patterns, allowing for multiline
        route_matches: List[Tuple[str, str]] = []
        search_start = 0
        marker = '.route('

        while True:
            route_idx = content.find(marker, search_start)
            if route_idx == -1:
                break

            cursor = route_idx + len(marker)

            # Skip whitespace before the path literal
            while cursor < len(content) and content[cursor].isspace():
                cursor += 1

            path_literal, cursor = self._extract_string_literal_from_text(content, cursor)
            if path_literal is None:
                search_start = cursor
                continue

            path = path_literal.strip()

            # Skip whitespace after the path and expect a comma
            while cursor < len(content) and content[cursor].isspace():
                cursor += 1

            if cursor >= len(content) or content[cursor] != ',':
                search_start = cursor
                continue

            cursor += 1  # Skip comma

            # Skip whitespace before the method chain
            while cursor < len(content) and content[cursor].isspace():
                cursor += 1

            methods_start = cursor
            depth = 1  # Account for the opening parenthesis from .route(
            in_string: Optional[str] = None
            escape = False

            while cursor < len(content) and depth > 0:
                ch = content[cursor]
                if in_string:
                    if escape:
                        escape = False
                    elif ch == '\\':
                        escape = True
                    elif ch == in_string:
                        in_string = None
                else:
                    if ch in ('"', "'"):
                        in_string = ch
                    elif ch == '(':  # Enter nested paren
                        depth += 1
                    elif ch == ')':
                        depth -= 1
                cursor += 1

            methods_str = content[methods_start:cursor - 1].strip()
            if path and methods_str:
                route_matches.append((path, methods_str))

            search_start = cursor

        self._debug(f"DEBUG: Found {len(route_matches)} route matches in {file_path.name}")
        for path_match, methods_match in route_matches[:3]:  # Debug first 3
            self._debug(f"DEBUG:   path='{path_match}', methods='{methods_match}'")

        for path, methods_str in route_matches:
            if path and methods_str:
                # Parse methods and handlers
                method_handlers = self._parse_method_handlers(methods_str)

                self._debug(f"DEBUG:   path='{path}' -> {len(method_handlers)} handlers: {method_handlers[:2]}")

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
                    module_name = self._determine_module_from_path(path, is_admin)
                    modules[module_name].append(endpoint)

    def _collect_nested_types(self, type_definitions: List[TypeDefinition], referenced_types: set):
        """Recursively collect all types referenced by the type definitions"""
        type_def_map = {}
        for td in type_definitions:
            type_def_map[td.name] = td
            type_def_map[td.rust_path] = td
            type_def_map[td.original_name] = td
        
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
                if '::' in base_type:
                    referenced_types.add(base_type.split('::')[-1])
                
                # Extract inner types
                inner_part = ts_type[ts_type.find('<')+1:ts_type.rfind('>')]
                for inner_type in inner_part.split(','):
                    collect_from_type(inner_type.strip())
                return
            
            # Simple type
            if ts_type and ts_type not in ['string', 'number', 'boolean', 'any']:
                referenced_types.add(ts_type)
                if '::' in ts_type:
                    referenced_types.add(ts_type.split('::')[-1])
        
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
                for field_entry in type_def.fields:
                    # field_entry may be (field_name, rust_type) or (field_name, rust_type, serialized_name, is_optional)
                    if len(field_entry) >= 2:
                        field_type = field_entry[1]
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
        generic_match = re.match(r'([\w:]+)<(.+)>', rust_type)
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

    def _is_option_type(self, rust_type: str) -> bool:
        """Return True if rust_type is wrapped in Option<...> (including std/core variants)."""
        if not rust_type:
            return False
        # Deprecated: use _contains_option for deep detection
        return bool(re.match(r"^(?:Option|std::option::Option|core::option::Option)\s*<", rust_type))

    def _contains_option(self, rust_type: str) -> bool:
        """Recursively check whether the provided Rust type contains Option<...> anywhere in its structure.

        Handles nested generics, qualified names, arrays, and unions like `T | null`.
        """
        if not rust_type:
            return False

        s = rust_type.strip()

        # Direct Option variants
        if re.match(r"^(?:Option|std::option::Option|core::option::Option)\s*<", s):
            return True

        # Handle arrays like T[]
        if s.endswith('[]'):
            return self._contains_option(s[:-2])

        # Handle union types like T | null
        if '|' in s:
            for part in s.split('|'):
                if self._contains_option(part.strip()):
                    return True
            return False

        # Handle generic types Foo<Bar,Baz>
        if '<' in s and s.endswith('>'):
            base = s[:s.find('<')].strip()
            params_str = s[s.find('<') + 1:-1]
            # If base is itself an Option variant
            if re.match(r"^(?:Option|std::option::Option|core::option::Option)$", base) or base.endswith('::Option'):
                return True

            # Otherwise, split params and recurse
            params = self._split_generic_params(params_str)
            for p in params:
                if self._contains_option(p):
                    return True
            return False

        # For qualified names without generics, check if Option appears as segment
        if '::' in s and s.split('::')[-1].startswith('Option'):
            return True

        return False

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

    def _extract_string_literal_from_text(self, text: str, start_index: int) -> Tuple[Optional[str], int]:
        """Extract a string literal starting at the given index within raw text."""
        if start_index >= len(text):
            return None, start_index

        quote = text[start_index]
        if quote not in ('"', "'"):
            return None, start_index

        i = start_index + 1
        escape = False
        while i < len(text):
            ch = text[i]
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == quote:
                literal = text[start_index + 1:i]
                return literal, i + 1
            i += 1

        # Unterminated string literal; return None but advance to end to avoid infinite loops
        return None, len(text)

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

    def _determine_module_from_path(self, path: str, is_admin: bool = False) -> str:
        """Determine API module name from endpoint path"""
        if is_admin:
            return 'Admin'
            
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
            return 'Users'
        elif first_part == 'pdf' and len(path_parts) > 1:
            return 'Report'
        elif first_part in ['users', 'system-requests', 'settings', 'admin', 'audit', 'housekeeping']:
            return 'Admin'

        return MODULE_MAP.get(first_part, 'misc')

    def _compute_module_parts(self, file_path: Path, src_root: Path) -> List[str]:
        try:
            relative = file_path.relative_to(src_root)
        except ValueError:
            return []

        parts = list(relative.parts)
        if not parts:
            return []

        last = parts[-1]
        if last == 'mod.rs':
            parts = parts[:-1]
        else:
            parts[-1] = last[:-3]  # strip .rs

        sanitized = [part.replace('-', '_') for part in parts if part]
        return sanitized

    def _build_module_path(self, module_prefix: str, module_parts: List[str]) -> str:
        parts = []
        if module_prefix:
            parts.append(module_prefix)
        parts.extend(module_parts)
        return '::'.join(parts)

    def _build_ts_name(self, module_prefix: str, module_parts: List[str], struct_name: str) -> str:
        segments: List[str] = []
        if module_prefix and module_prefix != 'crate':
            segments.append(self._to_pascal_case(module_prefix))

        for part in module_parts:
            if part in {'routes', 'mod'}:
                continue
            segments.append(self._to_pascal_case(part))

        if segments and self._to_pascal_case(struct_name).startswith(''.join(segments)):
            return self._to_pascal_case(struct_name)

        if not segments:
            return self._to_pascal_case(struct_name)

        return ''.join(segments + [struct_name])

    def _to_pascal_case(self, value: str) -> str:
        parts = re.split(r'[_\-/]', value)
        return ''.join(part[:1].upper() + part[1:] for part in parts if part)

    def _split_generic_params(self, params_str: str) -> List[str]:
        params = []
        current = []
        depth = 0

        for char in params_str:
            if char == '<':
                depth += 1
                current.append(char)
            elif char == '>':
                depth -= 1
                current.append(char)
            elif char == ',' and depth == 0:
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

    def _qualify_type(self, rust_type: str, current_module: str) -> str:
        rust_type = rust_type.strip()
        if not rust_type:
            return rust_type

        # Remove leading references and lifetimes (e.g., &'a str)
        if rust_type.startswith('&'):
            rust_type = rust_type.lstrip('&').strip()
            if rust_type.startswith('mut '):
                rust_type = rust_type[4:]
            if rust_type.startswith("'"):
                # Drop lifetime annotation
                parts = rust_type.split(' ', 1)
                rust_type = parts[1] if len(parts) > 1 else 'str'

        if rust_type.startswith('crate::'):
            return rust_type

        if rust_type.startswith('super::'):
            resolved_module = current_module
            remainder = rust_type
            while remainder.startswith('super::'):
                remainder = remainder[7:]
                if '::' in resolved_module:
                    resolved_module = '::'.join(resolved_module.split('::')[:-1])
                else:
                    resolved_module = ''
            if remainder.startswith('crate::'):
                return remainder
            if resolved_module:
                rust_type = f"{resolved_module}::{remainder}"
            else:
                rust_type = remainder

        # Primitive/standard library aliases that shouldn't be qualified
        primitives = {
            'String', 'str', 'bool', 'i64', 'i32', 'i16', 'i8', 'u64', 'u32', 'u16', 'u8',
            'f64', 'f32', 'usize', 'isize', 'char', '()'
        }

        wrappers = {'Option', 'Vec', 'Result', 'HashMap', 'BTreeMap', 'Arc', 'Rc', 'Box'}

        if '<' in rust_type and rust_type.endswith('>'):
            base = rust_type[:rust_type.find('<')].strip()
            params_part = rust_type[rust_type.find('<') + 1:-1]
            params = self._split_generic_params(params_part)
            qualified_params = [self._qualify_type(param, current_module) for param in params]

            if base in wrappers:
                qualified_base = base
            else:
                qualified_base = self._qualify_type(base, current_module)

            return f"{qualified_base}<{', '.join(qualified_params)}>"

        if rust_type in wrappers:
            return rust_type

        if rust_type in primitives or re.fullmatch(r'[A-Z](_[A-Z])?', rust_type):
            return rust_type

        if '::' in rust_type:
            return rust_type

        return f"{current_module}::{rust_type}"

    def _parse_function_from_file(self, endpoint: Endpoint, function_name: str, file_path: Path, current_module: str) -> bool:
        if not file_path.exists():
            return False

        content = file_path.read_text()
        tree = self.parser.parse(bytes(content, 'utf-8'))
        root = tree.root_node

        debug_listing = []
        debug_nodes = []
        debug_errors = []

        for node in self._traverse_tree(root):
            if node.type == 'function_item':
                identifier = node.child_by_field_name('name')
                if identifier and identifier.text.decode('utf-8') == function_name:
                    if 'upload_file' in endpoint.handler:
                        self._debug(f"DEBUG: Found function node for {endpoint.handler} in {file_path}")
                    self._extract_function_signature(endpoint, node, current_module)
                    return True
                elif 'upload_file' in endpoint.handler and identifier:
                    debug_listing.append(identifier.text.decode('utf-8'))
            elif 'upload_file' in endpoint.handler:
                node_text = node.text.decode('utf-8', errors='ignore')
                if 'upload_file' in node_text[:200]:
                    debug_nodes.append(node.type)
            if node.type == 'ERROR':
                debug_errors.append(node.text.decode('utf-8', errors='ignore')[:100])

        if 'upload_file' in endpoint.handler:
            self._debug(f"DEBUG: function names in {file_path}: {debug_listing[:10]}")
            self._debug(f"DEBUG: node types containing 'upload_file': {debug_nodes[:10]}")
            if debug_errors:
                self._debug(f"DEBUG: parse errors in {file_path}: {debug_errors[:3]}")

        # Fallback to textual parsing when AST lookup fails (e.g., due to parse errors)
        return self._parse_function_textually(endpoint, content, function_name, current_module)

    def _parse_handler_function(self, endpoint: Endpoint):
        """Parse the handler function to extract parameter and return types"""
        # Convert handler path to file path
        # e.g., "crate::routes::admin::users::list_users" -> "src/routes/admin/users.rs"
        if endpoint.handler.startswith('crate::routes::'):
            handler_parts = endpoint.handler[len('crate::routes::'):].split('::')
            if len(handler_parts) < 2:
                return

            module_segments = handler_parts[:-1]
            relative_path = '/'.join(module_segments)

            candidate_files = [
                self.server_root / f"src/routes/{relative_path}.rs",
                self.server_root / f"src/routes/{relative_path}/mod.rs",
            ]

            function_name = handler_parts[-1]
            current_module = 'crate::routes::' + '::'.join(module_segments) if module_segments else 'crate::routes'

            found = False
            for candidate in candidate_files:
                if candidate.exists() and self._parse_function_from_file(endpoint, function_name, candidate, current_module):
                    found = True
                    break

            if found:
                return

            # If the handler is re-exported from a nested module (e.g. mod.rs `pub use foo::bar;`),
            # try looking into the nested module directory using the function name as the final segment.
            if module_segments:
                submodule_segments = module_segments + [function_name]
                sub_relative_path = '/'.join(submodule_segments)
                sub_candidates = [
                    self.server_root / f"src/routes/{sub_relative_path}.rs",
                    self.server_root / f"src/routes/{sub_relative_path}/mod.rs",
                ]
                sub_current_module = 'crate::routes::' + '::'.join(submodule_segments)

                for candidate in sub_candidates:
                    if candidate.exists() and self._parse_function_from_file(endpoint, function_name, candidate, sub_current_module):
                        return

                submodule_dir = self.server_root / f"src/routes/{relative_path}"
                if submodule_dir.exists():
                    for child in submodule_dir.iterdir():
                        if child.is_file() and child.suffix == '.rs' and child.name != 'mod.rs':
                            if self._parse_function_from_file(endpoint, function_name, child, sub_current_module):
                                return

        elif endpoint.handler.startswith('auth::'):
            handler_parts = endpoint.handler.split('::')
            if len(handler_parts) < 2:
                return

            function_name = handler_parts[-1]
            auth_root = self.server_root.parent / 'didhub-auth'
            candidate_files = [
                auth_root / 'src/handlers.rs',
                auth_root / 'src/handlers/mod.rs',
            ]
            file_path = next((c for c in candidate_files if c.exists()), None)
            if not file_path:
                return

            current_module = 'didhub_auth::handlers'
            self._parse_function_from_file(endpoint, function_name, file_path, current_module)

        elif endpoint.handler.startswith('metrics::'):
            # Special case for metrics handler from didhub-metrics crate
            handler_parts = endpoint.handler.split('::')
            if len(handler_parts) == 2 and handler_parts[1] == 'metrics_handler':
                # The metrics handler returns (StatusCode, String), so the response body is String
                # No parameters needed
                endpoint.response_type = 'String'
                endpoint.parameters = []

    def _parse_function_textually(self, endpoint: Endpoint, content: str, function_name: str, current_module: str) -> bool:
        """Fallback parser that extracts function signature information using regex."""
        # Match function signature with optional visibility/async modifiers
        pattern = re.compile(
            rf"pub\s+(?:async\s+)?fn\s+{function_name}\s*\((?P<params>.*?)\)\s*(?:->\s*(?P<ret>[^\{{]+))?\{{",
            re.DOTALL,
        )

        match = pattern.search(content)
        if not match:
            return False

        params_block = match.group('params') or ''
        return_block = match.group('ret') or ''

        # Split parameters respecting nested generics/parentheses
        params = []
        depth = 0
        current = []
        for ch in params_block:
            if ch == ',' and depth == 0:
                param = ''.join(current).strip()
                if param:
                    params.append(param)
                current = []
                continue

            if ch in '<({[':
                depth += 1
            elif ch in '>)}]':
                depth = max(depth - 1, 0)

            current.append(ch)

        final_param = ''.join(current).strip()
        if final_param:
            params.append(final_param)

        # Keep a small list of seen non-extractor params for heuristics
        non_extractor_params: List[str] = []

        for param in params:
            if ':' not in param:
                continue

            _, type_part = param.split(':', 1)
            type_text = type_part.strip()
            # Try a list of common extractor generics (Json, Query, Path, Form)
            extractor = self._extract_any_generic_inner(type_text, ['Json', 'Query', 'Path', 'Form', 'Multipart'])
            if extractor:
                kind, inner = extractor
                if kind.endswith('Query') or kind == 'Query':
                    endpoint.query_type = self._qualify_type(inner, current_module)
                    continue
                # Path params are treated as part of the path (handled earlier via path template)
                if kind.endswith('Path') or kind == 'Path':
                    # If Path<T> holds a single primitive or struct, we don't set body but may consider
                    # individual path parameters elsewhere. Skip.
                    continue
                # Json/Form/Multipart -> body
                if kind in ('Json', 'Form', 'Multipart') or kind.endswith('Json'):
                    endpoint.body_type = self._qualify_type(inner, current_module)
                    endpoint.body_optional = self._contains_option(type_text) or self._contains_option(inner)
                    continue

            # Heuristic: if this is not an extractor type, keep it for potential body inference
            # (e.g., `payload: CreateUserPayload` without Json<> wrapper)
            simple_type = type_text.split('<')[0].strip()
            if simple_type and simple_type not in ('&HttpRequest', 'HttpRequest', 'Request'):
                non_extractor_params.append(type_text)

        return_type_text = return_block.strip()
        if return_type_text:
            json_inner = self._extract_generic_inner(return_type_text, 'Json')
            if json_inner:
                endpoint.response_type = self._qualify_type(json_inner, current_module)

        return bool(endpoint.query_type or endpoint.body_type or endpoint.response_type)

    def _extract_function_signature(self, endpoint: Endpoint, function_node, current_module: str):
        """Extract parameter and return types from a function node"""
        # Extract parameters
        parameters_node = function_node.child_by_field_name('parameters')
        if parameters_node:
            self._extract_parameters(endpoint, parameters_node, current_module)
        
        # Extract return type
        return_type_node = function_node.child_by_field_name('return_type')
        if return_type_node:
            self._extract_return_type(endpoint, return_type_node, current_module)

        # Heuristic: if this is a mutating endpoint and we didn't find explicit Json/Form body,
        # but the function has a single non-extractor parameter type recorded, use that as body.
        heur = getattr(endpoint, '_heuristic_param_types', None)
        if not getattr(endpoint, 'body_type', None) and heur and len(heur) == 1:
            # Only apply for likely mutating methods; method is set on endpoint earlier when routes parsed
            if endpoint.method in ('POST', 'PUT', 'PATCH'):
                ct = heur[0]
                # Avoid treating HttpRequest or axum extractor aliases as body
                if not any(x in ct for x in ['HttpRequest', 'Request', 'Extension', 'State']):
                    # Qualify and set
                    endpoint.body_type = self._qualify_type(ct, current_module)
                    # If the type is Option<...> or contains Option anywhere, mark optional
                    endpoint.body_optional = self._contains_option(ct)

        # Also attempt to parse any @api hints from the function's leading attributes or doc-comments
        try:
            # Collect preceding siblings (attributes, comments) text
            leading_text = ''
            prev = function_node.prev_sibling
            while prev is not None:
                if prev.type in ('attribute_item', 'attribute', 'line_comment', 'block_comment'):
                    try:
                        leading_text = prev.text.decode('utf-8') + '\n' + leading_text
                    except Exception:
                        pass
                    prev = prev.prev_sibling
                    continue
                break
            # Also check children for inner attribute nodes
            for child in function_node.children:
                if child.type in ('attribute_item', 'attribute'):
                    try:
                        leading_text += child.text.decode('utf-8') + '\n'
                    except Exception:
                        pass

            if leading_text:
                # Look for patterns like #[api(response = "binary")]
                # match attribute forms like #[api(response = "binary")] or #[api(response = r#"binary"#)]
                m_attr = re.search(r'api\s*\(\s*response\s*=\s*(?P<q>r#".+?"#|".+?"|\'.+?\')\s*\)', leading_text, flags=re.DOTALL)
                if m_attr:
                    raw = m_attr.group('q')
                    # strip quotes/raw string markers
                    raw_val = raw
                    if raw_val.startswith('r#'):
                        raw_val = raw_val[2:]
                    if raw_val.startswith('"') or raw_val.startswith("'"):
                        raw_val = raw_val[1:-1]
                    endpoint.response_hint = raw_val.strip()

                # Look for doc-comment style /// @api response=binary or /// @api body=formdata
                for m in re.finditer(r'@api\s+([^\n\r]+)', leading_text):
                    kv = m.group(1).strip()
                    # split on spaces or commas
                    parts = re.split(r'[\s,]+', kv)
                    for part in parts:
                        if '=' in part:
                            k, v = part.split('=', 1)
                            k = k.strip()
                            v = v.strip().strip('\"\'')
                            if k == 'response':
                                endpoint.response_hint = v
                            elif k == 'body':
                                endpoint.body_hint = v
        except Exception:
            # be resilient to any parsing errors here
            pass

    def _extract_generic_inner(self, type_text: str, generic: str) -> Optional[str]:
        """Extract the inner type from a generic like Generic<T> handling nested generics."""
        idx = 0
        generic_len = len(generic)

        while idx < len(type_text):
            idx = type_text.find(generic, idx)
            if idx == -1:
                return None

            cursor = idx + generic_len
            while cursor < len(type_text) and type_text[cursor].isspace():
                cursor += 1

            if cursor >= len(type_text) or type_text[cursor] != '<':
                idx = cursor
                continue

            start = cursor + 1
            depth = 0
            i = start
            while i < len(type_text):
                ch = type_text[i]
                if ch == '<':
                    depth += 1
                elif ch == '>':
                    if depth == 0:
                        return type_text[start:i].strip()
                    depth -= 1
                i += 1

            # If we reach here, we had an unmatched '<'; try the next occurrence
            idx = cursor + 1

    def _extract_any_generic_inner(self, type_text: str, generics: List[str]) -> Optional[Tuple[str, str]]:
        """Try to extract the inner type for any of the provided generic names.

        Returns (generic_name_used, inner_text) or None.
        Handles qualified generic names and multiple occurrences, and nested generics.
        """
        for g in generics:
            inner = self._extract_generic_inner(type_text, g)
            if inner:
                return (g, inner)

        # Try to match unqualified generics that might be module-qualified like axum::extract::Json
        # by looking for the final segment name
        final_names = [g.split('::')[-1] for g in generics]
        for name in final_names:
            inner = self._extract_generic_inner(type_text, name)
            if inner:
                return (name, inner)

        return None

    def _extract_parameters(self, endpoint: Endpoint, parameters_node, current_module: str):
        """Extract query and body parameters from function parameters"""
        # Parameters are typically like: Query(q): Query<UsersQuery>, Json(payload): Json<CreateUserPayload>
        for param in parameters_node.children:
            if param.type == 'parameter':
                type_node = param.child_by_field_name('type')
                if not type_node:
                    continue

                type_text = type_node.text.decode('utf-8').strip()

                # Use the new helper to detect common extractor wrappers
                extractor = self._extract_any_generic_inner(type_text, ['Json', 'Query', 'Path', 'Form', 'Multipart'])
                if extractor:
                    kind, inner = extractor
                    if kind.endswith('Query') or kind == 'Query':
                        endpoint.query_type = self._qualify_type(inner, current_module)
                        continue
                    if kind.endswith('Path') or kind == 'Path':
                        # Path extractor -> path params handled separately
                        continue
                    if kind in ('Json', 'Form', 'Multipart') or kind.endswith('Json'):
                        endpoint.body_type = self._qualify_type(inner, current_module)
                        endpoint.body_optional = self._contains_option(type_text) or self._contains_option(inner)
                        continue

                # If no extractor wrapper, but the function is likely to accept a payload (POST/PUT/PATCH),
                # keep track of the bare type to use as a heuristic body type later.
                # Record the text for potential use by heuristics in the caller.
                # (We don't assign it immediately because we may prefer explicit Json<> wrappers.)
                if type_text:
                    # Attach a heuristic list on the endpoint if not present
                    heur = getattr(endpoint, '_heuristic_param_types', None)
                    if heur is None:
                        setattr(endpoint, '_heuristic_param_types', [])
                    endpoint._heuristic_param_types.append(type_text)

    def _extract_return_type(self, endpoint: Endpoint, return_type_node, current_module: str):
        """Extract response type from function return type"""
        # Return type is typically: Result<Json<UsersListResponse<UserOut>>, AppError>
        return_type_text = return_type_node.text.decode('utf-8').strip()
        
        if 'upload_file' in endpoint.handler:
            self._debug(f"DEBUG: return type for {endpoint.handler} -> {return_type_text}")

        json_inner = self._extract_generic_inner(return_type_text, 'Json')
        if json_inner:
            endpoint.response_type = self._qualify_type(json_inner, current_module)

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

    def _parse_struct_definitions_from_dir(
        self,
        dir_root: Path,
        type_definitions: List[TypeDefinition],
        module_prefix: str,
        include_filter: Optional[Callable[[Path], bool]] = None,
    ):
        """Parse struct definitions from a specific directory"""
        src_root = dir_root / 'src'
        if not src_root.exists():
            return

        rust_files = []
        for root, _dirs, files in os.walk(src_root):
            for file in files:
                if file.endswith('.rs'):
                    file_path = Path(root) / file
                    rel_path = file_path.relative_to(src_root)
                    if include_filter and not include_filter(rel_path):
                        continue
                    rust_files.append(file_path)

        self._debug(f"DEBUG: Found {len(rust_files)} Rust files in {src_root}")
        for file_path in rust_files:
            self._parse_structs_from_file(file_path, type_definitions, module_prefix, src_root)

    def _parse_structs_from_file(self, file_path: Path, type_definitions: List[TypeDefinition], module_prefix: str, src_root: Path):
        """Parse struct definitions from a single Rust file"""
        try:
            content = file_path.read_text()
            tree = self.parser.parse(bytes(content, 'utf-8'))
            root = tree.root_node
            
            struct_count = 0
            for node in self._traverse_tree(root):
                if node.type == 'struct_item':
                    struct_count += 1
                    struct_def = self._parse_struct_definition(node, file_path, module_prefix, src_root)
                    if struct_def:
                        type_definitions.append(struct_def)
            
            if struct_count > 0:
                self._debug(f"DEBUG: {file_path}: {struct_count} structs found")
        except Exception as e:
            # Skip files that can't be parsed
            self._debug(f"DEBUG: Failed to parse {file_path}: {e}")
            pass

    def _parse_struct_definition(self, struct_node, file_path: Path, module_prefix: str, src_root: Path) -> Optional[TypeDefinition]:
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
        self._debug(f"DEBUG: Parsing struct {struct_name}")
        
        # Check if it's a public struct (starts with 'pub')
        visibility = None
        for child in struct_node.children:
            if child.type == 'visibility_modifier':
                visibility = child
                break
        
        if visibility:
            vis_text = visibility.text.decode('utf-8')
            self._debug(f"DEBUG: Visibility: {repr(vis_text)}")
        else:
            self._debug(f"DEBUG: No visibility found")
        
        if not visibility or visibility.text.decode('utf-8') != 'pub':
            self._debug(f"DEBUG: Skipping non-public struct {struct_name}")
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

        self._debug(f"DEBUG: Struct {struct_name} has type_params: {type_params}")

        module_parts = self._compute_module_parts(file_path, src_root)
        module_path = self._build_module_path(module_prefix, module_parts)
        full_path = f"{module_path}::{struct_name}" if module_path else f"{module_prefix}::{struct_name}"
        ts_name = self._build_ts_name(module_prefix, module_parts, struct_name)
        self._debug(f"DEBUG: Struct {struct_name} resolved to {full_path} -> TS {ts_name}")

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

        # Detect struct-level attributes (e.g., #[serde(rename_all = "camelCase")])
        struct_attr_text = ''
        for child in struct_node.children:
            if child.type in ('attribute_item', 'attribute'):
                try:
                    struct_attr_text += child.text.decode('utf-8') + '\n'
                except Exception:
                    pass
        rename_all = None
        if struct_attr_text:
            meta = self._parse_serde_meta_from_text(struct_attr_text)
            if 'rename_all' in meta:
                rename_all = meta['rename_all']

        resolved_module = module_path if module_path else module_prefix
        qualified_fields = []
        for entry in fields:
            # entry may be (field_name, rust_type, serialized_name) or (field_name, rust_type, serialized_name, is_flatten)
            if len(entry) == 3:
                field_name, rust_type, serialized_name = entry
                is_flatten = False
            else:
                field_name, rust_type, serialized_name, is_flatten = entry

            qualified_type = self._qualify_type(rust_type, resolved_module)
            is_optional = self._contains_option(rust_type)
            qualified_fields.append((field_name, qualified_type, serialized_name, is_optional, is_flatten))
        fields = qualified_fields
        
        return TypeDefinition(
            name=ts_name,
            rust_path=full_path,
            module_path=module_path if module_path else module_prefix,
            original_name=struct_name,
            fields=fields,
            is_generic=len(type_params) > 0,
            type_params=type_params
            ,
            is_enum=False,
            variants=None,
            rename_all=rename_all,
        )

    def _parse_enum_definition(self, enum_node, file_path: Path, module_prefix: str, src_root: Path) -> Optional[TypeDefinition]:
        # Parse enum name
        name_node = None
        for child in enum_node.children:
            if child.type == 'type_identifier':
                name_node = child
                break
        if not name_node:
            return None
        enum_name = name_node.text.decode('utf-8')

        module_parts = self._compute_module_parts(file_path, src_root)
        module_path = self._build_module_path(module_prefix, module_parts)
        full_path = f"{module_path}::{enum_name}" if module_path else f"{module_prefix}::{enum_name}"
        ts_name = self._build_ts_name(module_prefix, module_parts, enum_name)

        # Collect enum variants
        variants = []
        for child in enum_node.children:
            if child.type == 'enum_variant_list':
                for var in child.children:
                    if var.type == 'enum_variant':
                        # variant could have attributes and identifier
                        var_name = None
                        var_attr_text = ''
                        for vchild in var.children:
                            if vchild.type in ('attribute_item', 'attribute'):
                                try:
                                    var_attr_text += vchild.text.decode('utf-8') + '\n'
                                except Exception:
                                    pass
                            if vchild.type == 'identifier' or vchild.type == 'type_identifier':
                                var_name = vchild.text.decode('utf-8')

                        serialized = var_name
                        if var_attr_text:
                            meta = self._parse_serde_meta_from_text(var_attr_text)
                            if 'rename' in meta:
                                serialized = meta['rename']

                        # Determine if variant has payload (tuple or struct variant) and capture payload type
                        has_payload = False
                        payload_type = None
                        for c in var.children:
                            if c.type == 'tuple_struct' or c.type == 'tuple_expression':
                                # naive capture of inner type text
                                try:
                                    payload_type = c.text.decode('utf-8')
                                except Exception:
                                    payload_type = None
                                has_payload = True
                                break
                            if c.type == 'call_expression' or c.type == 'field_declaration_list':
                                try:
                                    payload_type = c.text.decode('utf-8')
                                except Exception:
                                    payload_type = None
                                has_payload = True
                                break

                        variants.append((var_name, serialized, has_payload, payload_type))

        # Struct-level serde attributes on enum (rename_all, tag/content, untagged)
        struct_attr_text = ''
        for child in enum_node.children:
            if child.type in ('attribute_item', 'attribute'):
                try:
                    struct_attr_text += child.text.decode('utf-8') + '\n'
                except Exception:
                    pass
        rename_all = None
        enum_style = None
        enum_tag = None
        enum_content = None
        if struct_attr_text:
            meta = self._parse_serde_meta_from_text(struct_attr_text)
            if 'rename_all' in meta:
                rename_all = meta['rename_all']
            # Detect tagging: tag = "..." and content = "..." implies adjacent-style if both present
            if 'tag' in meta and 'content' in meta:
                enum_style = 'adjacent'
                enum_tag = meta.get('tag')
                enum_content = meta.get('content')
            elif 'tag' in meta:
                # single tag implies internally tagged
                enum_style = 'internally_tagged'
                enum_tag = meta.get('tag')
            elif meta.get('untagged'):
                enum_style = 'untagged'

        return TypeDefinition(
            name=ts_name,
            rust_path=full_path,
            module_path=module_path if module_path else module_prefix,
            original_name=enum_name,
            fields=[],
            is_generic=False,
            type_params=[],
            is_enum=True,
            variants=variants,
            rename_all=rename_all,
            enum_style=enum_style,
            enum_tag=enum_tag,
            enum_content=enum_content,
        )

    def _parse_struct_field(self, field_node) -> Optional[Tuple[str, str]]:
        """Parse a struct field into (name, type) tuple"""
        # Get field name
        name_node = None
        type_node = None
        
        # Also capture attributes preceding the field (like #[serde(rename = "...")])
        attr_text = ''

        # Some attribute nodes are siblings before the field_declaration in the AST.
        # Walk previous siblings to collect attribute text (e.g., #[serde(...)])
        try:
            prev = field_node.prev_sibling
            while prev is not None:
                if prev.type in ('attribute_item', 'attribute'):
                    try:
                        attr_text = prev.text.decode('utf-8') + '\n' + attr_text
                    except Exception:
                        pass
                # Stop collecting once we hit a non-attribute (e.g., a comma or other token)
                elif prev.type.strip():
                    # continue scanning but don't treat other nodes as attributes
                    pass
                prev = prev.prev_sibling
        except Exception:
            # prev_sibling may not exist in some tree-sitter builds; ignore silently
            pass

        for child in field_node.children:
            if child.type == 'attribute_item' or child.type == 'attribute':
                try:
                    attr_text += child.text.decode('utf-8') + '\n'
                except Exception:
                    pass
            if child.type == 'field_identifier':
                name_node = child
            elif child.type in ['generic_type', 'type_identifier', 'primitive_type']:
                type_node = child
        
        if not name_node or not type_node:
            return None
        
        field_name = name_node.text.decode('utf-8')
        rust_type = type_node.text.decode('utf-8')

        # Inspect attribute nodes more robustly using structured serde meta parsing.
        serialized_name = field_name
        is_flatten = False

        if attr_text:
            # Parse serde meta items from the collected attribute text.
            serde_meta = self._parse_serde_meta_from_text(attr_text)
            # serde_meta is a dict with keys like 'rename' -> value or 'flatten' -> True
            if serde_meta.get('flatten'):
                is_flatten = True
            if 'rename' in serde_meta and serde_meta['rename']:
                serialized_name = serde_meta['rename']

        return (field_name, rust_type, serialized_name, is_flatten)

    def _parse_serde_meta_from_text(self, text: str) -> Dict[str, object]:
        """Parse the inside of a #[serde(...)] attribute text into a dict.

        This is a pragmatic AST-guided parser that locates the serde(...) segment and
        parses comma-separated meta items while respecting quoted strings and raw r#"..."# forms.
        Returns a dict where keys are meta names and values are either True (for flags like flatten)
        or the string value for assignments like rename = "x".
        """
        res: Dict[str, object] = {}
        if not text:
            return res

        # Find the serde(...) segment
        m = re.search(r'serde\s*\(\s*(?P<body>.*?)\s*\)', text, flags=re.DOTALL)
        if not m:
            return res

        body = m.group('body').strip()

        # Tokenize respecting quotes and raw string r#"..."#
        items = []
        cur = []
        i = 0
        L = len(body)
        in_quote = None
        raw_delim = None

        while i < L:
            ch = body[i]
            if in_quote:
                # Handle raw string end if present
                if raw_delim:
                    # raw string ends with #" where # count == raw_delim
                    if body.startswith('"' + ('#' * raw_delim), i):
                        cur.append('"' + ('#' * raw_delim))
                        i += 1 + raw_delim
                        in_quote = None
                        raw_delim = None
                        continue
                    else:
                        cur.append(ch)
                else:
                    if ch == in_quote:
                        in_quote = None
                    cur.append(ch)
                i += 1
                continue

            # Not in quote
            if ch in ('"', "'"):
                in_quote = ch
                cur.append(ch)
                i += 1
                continue

            # Raw string literal start r#"..."# or r##"..."##
            if ch == 'r' and i + 1 < L and body[i+1] == '#':
                # count number of # after r
                j = i + 1
                hash_count = 0
                while j < L and body[j] == '#':
                    hash_count += 1
                    j += 1
                if j < L and body[j] == '"':
                    # start raw string
                    in_quote = '"'
                    raw_delim = hash_count
                    cur.append(body[i:j+1])
                    i = j + 1
                    continue

            if ch == ',' and not in_quote:
                item = ''.join(cur).strip()
                if item:
                    items.append(item)
                cur = []
                i += 1
                continue

            cur.append(ch)
            i += 1

        last = ''.join(cur).strip()
        if last:
            items.append(last)

        # Now parse items like 'rename = "x"' or 'flatten' or 'rename = r#"x"#'
        for it in items:
            if not it:
                continue
            if '=' in it:
                k, v = it.split('=', 1)
                k = k.strip()
                v = v.strip()
                # Remove possible trailing commas/spaces
                # Strip surrounding quotes or raw string markers
                # Raw string like r#"value"#
                raw_match = re.match(r'r#"(?P<val>.*)"#$', v)
                if raw_match:
                    val = raw_match.group('val')
                else:
                    # normal quoted string
                    q = v
                    if (q.startswith('"') and q.endswith('"')) or (q.startswith("'") and q.endswith("'")):
                        val = q[1:-1]
                    else:
                        val = q
                res[k] = val
            else:
                flag = it.strip()
                if flag:
                    res[flag] = True

        return res