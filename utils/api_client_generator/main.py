"""
Main entry point for the API client generator.
"""

import argparse
import sys
from pathlib import Path

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import DEFAULT_OUTPUT_DIR, DEFAULT_SERVER_ROOT, GENERATED_FILE_NAME
from generator import TypeScriptGenerator
from parser import RustRouteParser


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Generate TypeScript API client from Rust routes')
    parser.add_argument('--server-root', type=Path, default=DEFAULT_SERVER_ROOT,
                       help='Path to the server source directory')
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR,
                       help='Output directory for generated files')

    args = parser.parse_args()

    server_root = args.server_root
    output_dir = args.output_dir

    if not server_root.exists():
        print(f"Server root directory not found: {server_root}")
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    # Parse routes
    route_parser = RustRouteParser(server_root)
    api_modules, type_definitions = route_parser.parse_routes()

    print(f"Found {len(api_modules)} API modules:")
    for module in api_modules:
        print(f"  - {module.name}: {len(module.endpoints)} endpoints")
    
    print(f"Found {len(type_definitions)} type definitions")

    # Generate TypeScript code
    generator = TypeScriptGenerator(api_modules, type_definitions)
    client_code = generator.generate_client_code()
    types_code = generator.generate_types_code()

    # Write generated client code
    client_output_file = output_dir / "generated" / "Client.ts"
    with open(client_output_file, 'w', encoding='utf-8') as f:
        f.write(client_code)

    # Write generated types code
    types_output_file = output_dir / "generated" / "Types.ts"
    with open(types_output_file, 'w', encoding='utf-8') as f:
        f.write(types_code)

    # Check if get_users is in the generated code
    if 'get_users(query: QueryParams)' in client_code:
        print("SUCCESS: get_users with query parameter found in generated code")
    else:
        print("ERROR: get_users with query parameter NOT found in generated code")

    print(f"Generated API client written to {client_output_file}")
    print(f"Generated types written to {types_output_file}")

    return 0


if __name__ == '__main__':
    exit(main())