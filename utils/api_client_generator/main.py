"""
Main entry point for the API client generator.
"""

import argparse
import sys
from pathlib import Path

# Add current directory to path for relative imports
sys.path.insert(0, str(Path(__file__).parent))

from config import DEFAULT_OUTPUT_DIR, DEFAULT_SERVER_ROOT
from generator import TypeScriptGenerator
from parser import RustRouteParser


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Generate TypeScript API client from Rust routes')
    parser.add_argument('--server-root', type=Path, default=DEFAULT_SERVER_ROOT,
                       help='Path to the server source directory')
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR,
                       help='Output directory for generated files')
    parser.add_argument('--emit-openapi', dest='emit_openapi', action='store_true', default=True,
                       help='Emit an OpenAPI JSON file alongside generated TypeScript (default: true)')
    parser.add_argument('--no-openapi', dest='emit_openapi', action='store_false',
                       help="Disable emitting OpenAPI JSON")

    args = parser.parse_args()

    server_root = args.server_root
    output_dir = args.output_dir

    if not server_root.exists():
        print(f"Server root directory not found: {server_root}")
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / 'generated').mkdir(parents=True, exist_ok=True)

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
    # Generate OpenAPI JSON (optional)
    openapi_doc = None
    if args.emit_openapi:
        try:
            openapi_doc = generator.generate_openapi()
        except Exception:
            openapi_doc = None

    total_endpoints = sum(len(module.endpoints) for module in api_modules)
    generated_bindings = generator.total_method_bindings

    print(
        f"Sanity check: parsed {total_endpoints} endpoints, generated {generated_bindings} bindings"
    )
    if total_endpoints != generated_bindings:
        print("WARNING: Endpoint count does not match generated bindings!")
    else:
        print("Endpoint binding count matches parsed routes.")

    # Write generated client code
    client_output_file = output_dir / "generated" / "Client.ts"
    with open(client_output_file, 'w', encoding='utf-8') as f:
        f.write(client_code)

    # Write generated types code
    types_output_file = output_dir / "generated" / "Types.ts"
    with open(types_output_file, 'w', encoding='utf-8') as f:
        f.write(types_code)

    # Write OpenAPI JSON if produced
    if openapi_doc is not None:
        import json
        openapi_output = output_dir / 'generated' / 'openapi.json'
        with open(openapi_output, 'w', encoding='utf-8') as f:
            json.dump(openapi_doc, f, indent=2, ensure_ascii=False)
        print(f"Generated OpenAPI written to {openapi_output}")
        # Also emit YAML when PyYAML is available
        try:
            import yaml
            openapi_yaml = output_dir / 'generated' / 'openapi.yaml'
            with open(openapi_yaml, 'w', encoding='utf-8') as f:
                yaml.safe_dump(openapi_doc, f, sort_keys=False)
            print(f"Generated OpenAPI YAML written to {openapi_yaml}")
        except Exception:
            pass
    elif not args.emit_openapi:
        print("OpenAPI emission disabled by CLI flag")

    print(f"Generated API client written to {client_output_file}")
    print(f"Generated types written to {types_output_file}")

    return 0


if __name__ == '__main__':
    exit(main())