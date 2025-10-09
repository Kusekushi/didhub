"""
Rust route parser for extracting API endpoints from Axum route definitions.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import MODULE_MAP, ROUTE_FILES, VALID_HTTP_METHODS
from models import ApiModule, Endpoint


class RustRouteParser:
    """Parses Rust route definitions from Axum router code"""

    def __init__(self, server_root: Path):
        self.server_root = server_root

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
        """Parse a single route file"""
        content = file_path.read_text()

        # Determine auth level from filename
        auth_required = "protected" in file_path.name or "admin" in file_path.name
        is_admin = "admin" in file_path.name

        # Find route definitions - handle multi-line routes
        lines = content.split('\n')
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if line.startswith('.route('):
                # Parse multi-line route definition
                path, methods_str, lines_consumed = self._parse_multiline_route(lines[i:])
                i += lines_consumed

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
            else:
                i += 1

    def _parse_multiline_route(self, lines: List[str]) -> Tuple[Optional[str], Optional[str], int]:
        """Parse a multi-line route definition"""
        route_content = ""
        paren_count = 0
        i = 0

        for line in lines:
            route_content += line.strip()
            paren_count += line.count('(') - line.count(')')

            if paren_count == 0 and route_content.strip().endswith(')'):
                break
            i += 1

        # Extract path and methods from .route("path", methods...)
        route_match = re.search(r'\.route\(\s*["\']([^"\']+)["\']\s*,\s*(.+)\)', route_content)
        if route_match:
            path = route_match.group(1)
            methods_str = route_match.group(2).rstrip(')')
            return path, methods_str, i + 1

        return None, None, i + 1

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
        """Extract method and handler from 'method(handler)'"""
        for method in VALID_HTTP_METHODS:
            if method_handler_str.startswith(method + '('):
                # Extract handler from method(handler)
                handler_match = re.match(rf'{method}\(\s*([^)]+)\s*\)', method_handler_str)
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