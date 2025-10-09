"""
Rust route parser for extracting API endpoints from Axum route definitions.
"""

import re
from collections import defaultdict
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import MODULE_MAP, ROUTE_FILES, VALID_HTTP_METHODS
from models import ApiModule, Endpoint

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

    def parse_routes(self) -> List[ApiModule]:
        """Parse all route files and return organized API modules"""
        modules = defaultdict(list)

        for route_file in ROUTE_FILES:
            file_path = self.server_root / route_file
            if file_path.exists():
                self._parse_route_file(file_path, modules)

        # Convert to ApiModule objects
        api_modules = []
        for module_name, endpoints in modules.items():
            if module_name != 'misc':  # Skip misc modules
                api_modules.append(ApiModule(module_name, endpoints))

        return sorted(api_modules, key=lambda m: m.name)

    def _parse_route_file(self, file_path: Path, modules: Dict[str, List[Endpoint]]):
        """Parse a single route file using tree-sitter"""
        content = file_path.read_text()
        
        # Determine auth level from filename
        auth_required = "protected" in file_path.name or "admin" in file_path.name
        is_admin = "admin" in file_path.name

        # Parse with tree-sitter
        tree = self.parser.parse(bytes(content, 'utf-8'))
        root = tree.root_node

        # Find all call expressions that are method calls to 'route'
        for node in self._traverse_tree(root):
            if node.type == 'call_expression':
                method_call = self._extract_method_call(node)
                if method_call and method_call['method'] == 'route':
                    path, methods_str = self._extract_route_args(method_call['args'])
                    if path and methods_str:
                        # Parse methods and handlers
                        method_handlers = self._parse_method_handlers(methods_str)

                        for method, handler in method_handlers:
                            endpoint = Endpoint(
                                path=path,
                                method=method.upper(),
                                handler=handler,
                                auth_required=auth_required,
                                is_admin=is_admin
                            )

                            # Determine module from path
                            module_name = self._determine_module_from_path(path)
                            modules[module_name].append(endpoint)

    def _traverse_tree(self, node):
        """Traverse the AST tree"""
        yield node
        for child in node.children:
            yield from self._traverse_tree(child)

    def _extract_method_call(self, call_node):
        """Extract method call information from a call_expression node"""
        # Check if it's a method call (has a field expression before)
        if call_node.parent and call_node.parent.type == 'field_expression':
            field_expr = call_node.parent
            if field_expr.child_by_field_name('field') and field_expr.child_by_field_name('field').text.decode('utf-8') == 'route':
                # Get arguments
                args = []
                arguments_node = call_node.child_by_field_name('arguments')
                if arguments_node:
                    for arg in arguments_node.children:
                        if arg.type not in ['(', ')', ',']:
                            args.append(arg)
                return {'method': 'route', 'args': args}
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
        """Parse method-handler pairs like 'get(handler).post(other_handler)'"""
        # Split by dots to get individual method(handler) calls
        method_calls = methods_str.split('.')

        pairs = []
        for call in method_calls:
            call = call.strip()
            if not call:
                continue

            # Skip non-HTTP method calls (like .layer(...))
            if not any(call.startswith(method + '(') for method in VALID_HTTP_METHODS):
                continue

            method, handler = self._extract_method_handler(call)
            if method and handler:
                pairs.append((method, handler))

        return pairs

    def _extract_method_handler(self, method_handler_str: str) -> Tuple[Optional[str], Optional[str]]:
        """Extract method and handler from 'method(handler)' or 'method(handler),'"""
        for method in VALID_HTTP_METHODS:
            if method_handler_str.startswith(method + '('):
                # Extract handler from method(handler) or method(handler),
                handler_match = re.match(rf'{method}\(\s*([^)]+)\s*\),?', method_handler_str)
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