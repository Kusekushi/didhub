"""
API Code Generator - Generates backend routes and frontend client code from OpenAPI specs.

This module provides optimized code generation with:
- Spec caching for repeated runs
- Template pre-compilation
- Efficient type resolution
- Comprehensive type safety
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Final

import yaml
from jinja2 import Environment, FileSystemLoader

# Add parent directory to path for shared imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# HTTP methods supported in OpenAPI
HTTP_METHODS: Final[frozenset[str]] = frozenset({
    "get", "post", "put", "patch", "delete", "options", "head"
})

# Mapping from HTTP methods to Axum routing methods
ROUTING_METHODS: Final[dict[str, str]] = {
    "get": "get",
    "post": "post",
    "put": "put",
    "patch": "patch",
    "delete": "delete",
    "options": "any",
    "head": "any",
}


@dataclass(frozen=True, slots=True)
class Operation:
    """Represents an API operation from OpenAPI spec."""
    path: str
    method: str
    handler_name: str
    method_name: str
    summary: str
    has_path_params: bool
    has_query_params: bool
    has_body: bool
    needs_headers: bool = False
    delegate_target: str | None = None
    rust_return_type: str = "Result<Json<Value>, ApiError>"
    ts_return_type: str = "unknown"


@dataclass(slots=True)
class RouteGroup:
    """Group of operations sharing the same path."""
    path: str
    axum_path: str
    operations: list[Operation]

    @property
    def method_chain(self) -> str:
        """Generate Axum method chain for routing."""
        parts = [
            f"{ROUTING_METHODS.get(op.method, 'any')}({op.handler_name})"
            for op in self.operations
        ]
        return ".".join(parts)


@dataclass
class GeneratorContext:
    """Context for code generation with cached resources."""
    template_env: Environment = field(init=False)
    _backend_template: Any = field(init=False)
    _frontend_template: Any = field(init=False)
    
    def __post_init__(self) -> None:
        templates_dir = Path(__file__).parent / "templates"
        self.template_env = Environment(
            loader=FileSystemLoader(templates_dir),
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
            auto_reload=False,  # Disable auto-reload for performance
        )
        # Pre-compile templates
        self._backend_template = self.template_env.get_template("backend_routes.rs.jinja")
        self._frontend_template = self.template_env.get_template("frontend_client.ts.jinja")
    
    @property
    def backend_template(self):
        return self._backend_template
    
    @property
    def frontend_template(self):
        return self._frontend_template


# Caches for external resources
_external_file_cache: dict[str, dict[str, Any]] = {}
_external_url_cache: dict[str, dict[str, Any]] = {}


def load_spec(path: Path) -> dict[str, Any]:
    """Load an OpenAPI spec from a file.
    
    Supports both YAML and JSON formats.
    """
    raw = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yml", ".yaml"}:
        return yaml.safe_load(raw)
    return json.loads(raw)


@lru_cache(maxsize=512)
def slugify(value: str, *, fallback: str = "operation") -> str:
    """Convert a string to a slug suitable for function names. Cached."""
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    value = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", value)
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", value)
    cleaned = re.sub(r"_+", "_", cleaned)
    cleaned = cleaned.strip("_")
    return cleaned.lower() or fallback


@lru_cache(maxsize=512)
def to_camel_case(value: str) -> str:
    """Convert a snake_case string to camelCase. Cached."""
    parts = value.split("_")
    if not parts:
        return value
    first, *rest = parts
    return first + "".join(segment.capitalize() for segment in rest)


def infer_return_type(details: dict[str, Any]) -> str:
    """Infer the Rust return type from OpenAPI response definitions."""
    responses = details.get("responses", {})
    if not isinstance(responses, dict):
        return "Result<Json<Value>, ApiError>"

    for status, response in responses.items():
        if status != "default" and not str(status).startswith("2"):
            continue
        if not isinstance(response, dict):
            continue
        content = response.get("content", {})
        if not isinstance(content, dict):
            continue
        for media_type, media in content.items():
            if not isinstance(media, dict):
                continue
            schema = media.get("schema", {})
            schema_type = schema.get("type") if isinstance(schema, dict) else None
            schema_format = schema.get("format") if isinstance(schema, dict) else None
            if schema_type == "string" and schema_format == "binary":
                return "Result<Response, ApiError>"
            if isinstance(media_type, str) and media_type == "application/octet-stream":
                return "Result<Response, ApiError>"

    return "Result<Json<Value>, ApiError>"


def infer_ts_return_type(details: dict[str, Any], schemas: dict[str, Any]) -> str:
    """Infer the TypeScript return type from OpenAPI response definitions."""
    responses = details.get("responses", {})
    if not isinstance(responses, dict):
        return "unknown"

    for status, response in responses.items():
        if status != "default" and not str(status).startswith("2"):
            continue
        if not isinstance(response, dict):
            continue
        content = response.get("content", {})
        if not isinstance(content, dict):
            continue
        for media_type, media in content.items():
            if not isinstance(media, dict):
                continue
            schema = media.get("schema", {})
            if isinstance(schema, dict):
                ref = schema.get("$ref")
                if ref:
                    # Resolve reference
                    resolved = _resolve_local_ref(ref, schemas)
                    if resolved:
                        name = ref.split("/")[-1]
                        return f"Types.{name}"
                schema_type = schema.get("type")
                if schema_type == "string" and schema.get("format") == "binary":
                    return "Blob"
                elif schema_type == "string":
                    return "string"
                elif schema_type in ("integer", "number"):
                    return "number"
                elif schema_type == "boolean":
                    return "boolean"
                elif schema_type == "array":
                    items = schema.get("items", {})
                    if isinstance(items, dict):
                        item_ref = items.get("$ref")
                        if item_ref:
                            resolved = _resolve_local_ref(item_ref, schemas)
                            if resolved:
                                item_name = item_ref.split("/")[-1]
                                return f"Types.{item_name}[]"
                        item_type = items.get("type")
                        if item_type == "string":
                            return "string[]"
                        elif item_type in ("integer", "number"):
                            return "number[]"
                        elif item_type == "boolean":
                            return "boolean[]"
                    return "any[]"
                elif schema_type == "object":
                    return "any"

    return "unknown"


def _ensure_unique(base: str, used: dict[str, int]) -> str:
    """Ensure a handler name is unique by appending a suffix if needed."""
    if base not in used:
        used[base] = 1
        return base
    used[base] += 1
    return f"{base}_{used[base]}"


def build_operations(spec: dict[str, Any], schemas: dict[str, Any]) -> list[Operation]:
    """Build Operation objects from an OpenAPI spec.
    
    Extracts all operations from paths and returns them sorted by path and method.
    """
    result: list[Operation] = []
    used_handlers: dict[str, int] = {}

    for path, path_item in spec.get("paths", {}).items():
        if not isinstance(path_item, dict):
            continue
        path_level_params = path_item.get("parameters", [])

        for method, details in path_item.items():
            if method not in HTTP_METHODS:
                continue
            if not isinstance(details, dict):
                continue

            params = list(path_level_params) + list(details.get("parameters", []))
            has_path = any(param.get("in") == "path" for param in params)
            has_query = any(param.get("in") == "query" for param in params)
            has_body = "requestBody" in details

            raw_operation_id = details.get("operationId") or details.get("summary") or f"{method}_{path}"
            handler_slug = slugify(raw_operation_id, fallback=f"{method}_operation").replace("__", "_")
            handler_name = _ensure_unique(handler_slug, used_handlers)

            summary = details.get("summary", "").strip()

            delegate_target: str | None = None
            needs_headers = False

            # Parse x-handler metadata
            handler_meta = details.get("x-handler")
            if isinstance(handler_meta, str):
                delegate_target = handler_meta
            elif isinstance(handler_meta, dict):
                target = handler_meta.get("delegate") or handler_meta.get("target")
                if target is not None:
                    delegate_target = str(target)
                pass_headers = handler_meta.get("passHeaders") or handler_meta.get("needsHeaders")
                if pass_headers is not None:
                    needs_headers = bool(pass_headers)

            # Override from explicit fields
            delegate_override = details.get("x-handler-delegate")
            if delegate_override is not None:
                delegate_target = str(delegate_override)

            pass_headers_override = details.get("x-handler-pass-headers")
            if pass_headers_override is not None:
                needs_headers = bool(pass_headers_override)

            needs_headers_override = details.get("x-handler-needs-headers")
            if needs_headers_override is not None:
                needs_headers = bool(needs_headers_override)

            rust_return_type = infer_return_type(details)
            ts_return_type = infer_ts_return_type(details, schemas)

            result.append(Operation(
                path=path,
                method=method,
                handler_name=handler_name,
                method_name=to_camel_case(handler_name),
                summary=summary,
                has_path_params=has_path,
                has_query_params=has_query,
                has_body=has_body,
                needs_headers=needs_headers,
                delegate_target=delegate_target,
                rust_return_type=rust_return_type,
                ts_return_type=ts_return_type,
            ))

    result.sort(key=lambda op: (op.path, op.method))
    return result


def group_routes(operations: list[Operation]) -> list[RouteGroup]:
    """Group operations by path for Axum routing."""
    grouped: dict[str, list[Operation]] = {}
    for op in operations:
        grouped.setdefault(op.path, []).append(op)

    route_groups = [
        RouteGroup(
            path=path,
            axum_path=path,
            operations=sorted(ops, key=lambda o: o.method),
        )
        for path, ops in grouped.items()
    ]

    return sorted(route_groups, key=lambda g: g.path)


def collect_routing_imports(routes: list[RouteGroup]) -> list[str]:
    """Collect unique routing method imports needed."""
    imports: set[str] = set()
    for group in routes:
        if not group.operations:
            continue
        first = group.operations[0]
        routing = ROUTING_METHODS.get(first.method)
        if routing:
            imports.add(routing)
    return sorted(imports) or ["get"]


def render_backend(
    ctx: GeneratorContext,
    operations: list[Operation],
    routes: list[RouteGroup],
) -> str:
    """Render the backend Rust routes file."""
    use_header_map = any(op.needs_headers for op in operations)
    use_path = any(op.has_path_params for op in operations)
    use_query = any(op.has_query_params for op in operations)
    use_json = any(op.has_body for op in operations)
    use_response = any("Response" in op.rust_return_type for op in operations)
    
    return ctx.backend_template.render(
        operations=operations,
        routes=[{
            "axum_path": group.axum_path,
            "method_chain": group.method_chain,
        } for group in routes],
        routing_imports=collect_routing_imports(routes),
        use_header_map=use_header_map,
        use_path=use_path,
        use_query=use_query,
        use_json=use_json,
        use_optional_query=use_query,
        use_response=use_response,
    )


def _render_ts_types(schemas: dict[str, Any]) -> str:
    """Render simple TypeScript types from OpenAPI schemas (best-effort)."""
    out_lines: list[str] = []
    
    for name, schema in schemas.items():
        schema_type = schema.get("type")
        if schema_type == "object":
            props = schema.get("properties", {})
            out_lines.append(f"export interface {name} {{")
            required_props = set(schema.get("required", []))
            for prop_name, prop in props.items():
                ptype = prop.get("type", "any")
                if ptype == "string":
                    ts_type = "string"
                elif ptype in ("integer", "number"):
                    ts_type = "number"
                elif ptype == "boolean":
                    ts_type = "boolean"
                elif ptype == "array":
                    items = prop.get("items", {})
                    itype = items.get("type", "any")
                    ts_type = (
                        "string" if itype == "string"
                        else "number" if itype in ("integer", "number")
                        else "any"
                    ) + "[]"
                else:
                    ts_type = "any"
                optional = "?" if prop_name not in required_props else ""
                out_lines.append(f"  {prop_name}{optional}: {ts_type};")
            out_lines.append("}")
            out_lines.append("")
        else:
            # Fallback: export a type alias
            ts_equiv = (
                "string" if schema_type == "string"
                else "number" if schema_type in ("integer", "number")
                else "any"
            )
            out_lines.append(f"export type {name} = {ts_equiv};")
            out_lines.append("")
    
    return "\n".join(out_lines)


def render_frontend(
    ctx: GeneratorContext,
    operations: list[Operation],
    components: dict[str, Any],
) -> str:
    """Render the frontend TypeScript client."""
    schemas = components.get("schemas", {}) if components else {}
    types_block = _render_ts_types(schemas) if schemas else ""

    return ctx.frontend_template.render(
        operations=[{
            "method": op.method,
            "path": op.path,
            "method_name": op.method_name,
            "summary": op.summary,
            "has_body": op.has_body,
            "ts_return_type": op.ts_return_type,
        } for op in operations],
        types=types_block,
    )


def _resolve_local_ref(ref: str, schemas: dict[str, Any]) -> dict[str, Any] | None:
    """Handle local refs only."""
    if ref.startswith("#/components/schemas/"):
        name = ref.split("/")[-1]
        return schemas.get(name)
    return None


def _fetch_remote_url(url: str) -> dict[str, Any] | None:
    """Fetch and cache a remote JSON/YAML document by URL.
    
    Uses urllib3 Retry via requests.adapters.HTTPAdapter.
    """
    if url in _external_url_cache:
        return _external_url_cache[url]
    
    try:
        import requests
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry

        session = requests.Session()
        retries = Retry(total=3, backoff_factor=0.5, status_forcelist=(500, 502, 503, 504))
        adapter = HTTPAdapter(max_retries=retries)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        resp = session.get(url, timeout=5)
        resp.raise_for_status()
        
        try:
            data = resp.json()
        except Exception:
            data = yaml.safe_load(resp.text)

        if isinstance(data, dict):
            _external_url_cache[url] = data
            return data
    except Exception:
        pass
    
    return None


def _load_external_file(file_path: Path) -> dict[str, Any] | None:
    """Load and cache YAML/JSON external file content."""
    key = str(file_path.resolve())
    if key in _external_file_cache:
        return _external_file_cache[key]
    
    try:
        raw = file_path.read_text(encoding="utf-8")
        data = yaml.safe_load(raw) if file_path.suffix.lower() in {".yml", ".yaml"} else json.loads(raw)
        if isinstance(data, dict):
            _external_file_cache[key] = data
            return data
    except Exception:
        pass
    
    return None


def _resolve_ref_general_impl(
    ref: str,
    base: Path,
    schemas: dict[str, Any],
) -> dict[str, Any] | None:
    """Resolve a $ref that may be local or external (file).

    Supports:
      - local refs: '#/components/schemas/Name'
      - external file refs: 'models.yaml#/components/schemas/Name'
      - relative paths: './models.yaml#/components/schemas/Name'
      - fragment-only refs (treated as local)
      
    Returns the referenced schema dict or None.
    """
    # Local fragment
    if ref.startswith("#/components/schemas/") or ref.startswith("#/"):
        return _resolve_local_ref(ref, schemas)

    # If ref contains a fragment referring to components/schemas
    if "#/components/schemas/" in ref:
        file_part, name = ref.split("#/components/schemas/", 1)
        
        # If no file part, fallback to local
        if not file_part:
            return _resolve_local_ref(ref, schemas)

        # Handle URLs
        if file_part.startswith(("http://", "https://")):
            data = _fetch_remote_url(file_part)
            if not data:
                return None
            comps = data.get("components", {}) if isinstance(data, dict) else {}
            schs = comps.get("schemas", {}) if isinstance(comps, dict) else {}
            return schs.get(name)

        # Handle file:// URLs
        if file_part.startswith("file://"):
            try:
                from urllib.parse import urlparse
                from urllib.request import url2pathname
                
                parsed = urlparse(file_part)
                path_str = url2pathname(parsed.path or '')
                if parsed.netloc and not path_str.startswith(parsed.netloc):
                    path_str = parsed.netloc + path_str
                if not path_str:
                    path_str = file_part[len('file://'):]
                file_path = Path(path_str).resolve()
            except Exception:
                return None
            
            data = _load_external_file(file_path)
            if not data:
                return None
            comps = data.get("components", {}) if isinstance(data, dict) else {}
            schs = comps.get("schemas", {}) if isinstance(comps, dict) else {}
            return schs.get(name)

        # Handle relative file paths
        try:
            file_path = (base.parent / file_part).resolve()
        except Exception:
            return None

        data = _load_external_file(file_path)
        if not data:
            return None
        comps = data.get("components", {}) if isinstance(data, dict) else {}
        schs = comps.get("schemas", {}) if isinstance(comps, dict) else {}
        return schs.get(name)

    return None


# Backwards-compatible wrapper used by tests
def resolve_ref_general(
    ref: str,
    maybe_spec_or_base: Any,
    base_path: str | dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Resolve a $ref with backwards compatibility for various calling conventions."""
    if isinstance(maybe_spec_or_base, dict):
        specs = maybe_spec_or_base
        components = specs.get("components", {}) or {}
        schemas = components.get("schemas", {}) or {}
        base = Path(base_path) if isinstance(base_path, str) else Path(__file__).resolve()
        return _resolve_ref_general_impl(ref, base, schemas)

    try:
        base_path_obj = Path(maybe_spec_or_base)
        schemas = base_path if isinstance(base_path, dict) else {}
        return _resolve_ref_general_impl(ref, base_path_obj, schemas)
    except Exception:
        return _resolve_ref_general_impl(ref, Path(__file__).resolve(), {})


def _topo_sort_types(schemas: dict[str, Any]) -> list[str]:
    """Topologically sort types based on $ref dependencies."""
    deps: dict[str, set[str]] = {name: set() for name in schemas.keys()}
    
    def collect_refs(sch: Any, target_name: str) -> None:
        if not isinstance(sch, dict):
            return
        if "$ref" in sch:
            ref = sch["$ref"]
            if ref.startswith("#/components/schemas/"):
                deps[target_name].add(ref.split("/")[-1])
        for v in sch.values():
            if isinstance(v, dict):
                collect_refs(v, target_name)
            elif isinstance(v, list):
                for it in v:
                    if isinstance(it, dict):
                        collect_refs(it, target_name)
    
    for name, schema in schemas.items():
        collect_refs(schema, name)
    
    ordered: list[str] = []
    temporary: set[str] = set()
    permanent: set[str] = set()
    
    def visit(n: str) -> None:
        if n in permanent:
            return
        if n in temporary:
            return  # cycle, ignore
        temporary.add(n)
        for d in deps.get(n, set()):
            if d in schemas:
                visit(d)
        permanent.add(n)
        ordered.append(n)
    
    for n in schemas.keys():
        visit(n)
    return ordered


# Backwards compatibility alias
topo_sort_types = _topo_sort_types


def render_frontend_types(components_or_spec: Dict, out_path: Optional[str] = None) -> str:
    """Render a dedicated TypeScript types file from components.schemas.

    This is a conservative, best-effort renderer that resolves local $ref
    references within components.schemas and emits interfaces / type aliases.
    It does not attempt full OpenAPI feature coverage but supports:
      - object schemas with properties
      - enums
      - oneOf / anyOf (as unions)
      - arrays
      - $ref to components/schemas
    """
    # Support being passed either the components dict or the full spec (older tests pass spec)
    if not components_or_spec:
        return ""
    if isinstance(components_or_spec, dict) and "components" in components_or_spec:
        components = components_or_spec.get("components", {}) or {}
    else:
        components = components_or_spec or {}
    schemas = components.get("schemas", {}) or {}

    def resolve_ref_to_schema(ref: str) -> Dict:
        # Try resolving local first, then external via resolve_ref_general
        if ref.startswith("#/components/schemas/"):
            name = ref.split("/")[-1]
            return schemas.get(name, {})
        # attempt external
        resolved = resolve_ref_general(ref, Path(__file__).resolve(), schemas)
        return resolved or {}

    def ts_for_schema(schema: Dict) -> str:
        # protect against non-dict inputs
        if not isinstance(schema, dict):
            return "any"

        if "$ref" in schema:
            ref = schema["$ref"]
            # If the ref is a local components fragment, prefer the named type
            if ref.startswith("#/components/schemas/"):
                return ref.split("/")[-1]
            # For external refs (file:// or relative file paths), attempt to resolve and inline
            resolved = resolve_ref_to_schema(ref)
            if resolved:
                return ts_for_schema(resolved)
            # Fallback: if it's an external ref ending with a type name, return that name
            if "/components/schemas/" in ref:
                return ref.split("/")[-1]
            return "any"

        # handle allOf merging: resolve each part (including external refs) and merge object parts
        if "allOf" in schema:
            parts = schema.get("allOf", []) or []
            merged_props: Dict[str, Dict] = {}
            merged_required: List[str] = []
            non_object_types: List[str] = []
            for part in parts:
                if isinstance(part, dict) and "$ref" in part:
                    part = resolve_ref_to_schema(part["$ref"]) or part
                if not isinstance(part, dict):
                    continue
                ptype = part.get("type")
                if ptype == "object" or "properties" in part:
                    props = part.get("properties", {}) or {}
                    for k, v in props.items():
                        # prefer later parts to override earlier ones
                        merged_props[k] = v
                    for r in part.get("required", []) or []:
                        if r not in merged_required:
                            merged_required.append(r)
                else:
                    # non-object part: capture its ts representation
                    non_object_types.append(ts_for_schema(part))

            if merged_props and not non_object_types:
                merged = {"type": "object", "properties": merged_props, "required": merged_required}
                return ts_for_schema(merged)
            # fallback: if non-object types exist, form a union with object shape if present
            parts_ts: List[str] = []
            if merged_props:
                merged = {"type": "object", "properties": merged_props, "required": merged_required}
                parts_ts.append(ts_for_schema(merged))
            parts_ts.extend([t for t in non_object_types if t])
            return " | ".join(parts_ts) if parts_ts else "any"

        t = schema.get("type")
        if t == "object":
            props = schema.get("properties", {}) or {}
            lines = ["{" ]
            required = set(schema.get("required", []))
            for pname, pdef in props.items():
                ptype = ts_for_schema(pdef)
                optional = "" if pname in required else "?"
                lines.append(f"  {pname}{optional}: {ptype};")
            lines.append("}")
            return "\n".join(lines)
        if t == "array":
            items = schema.get("items", {"type": "any"})
            return ts_for_schema(items) + "[]"
        if "enum" in schema:
            vals = schema.get("enum", [])
            enum_types = " | ".join([f'"{v}"' for v in vals])
            return enum_types
        if t == "string":
            return "string"
        if t in ("integer", "number"):
            return "number"
        if t == "boolean":
            return "boolean"
        return "any"

    out_lines: List[str] = ["// Auto-generated TypeScript types from OpenAPI components.schemas", ""]
    # Always include a standard ValidationPayload type used by the backend for structured validation errors
    out_lines.append("export interface ValidationIssue { code: string; message: string; }")
    out_lines.append("")
    out_lines.append("export type ValidationPayload = { validation: { [field: string]: ValidationIssue } };")
    out_lines.append("")
    order = topo_sort_types(schemas)
    for name in order:
        schema = schemas[name]
        # top-level $ref aliasing/inlining: try to resolve external refs
        if isinstance(schema, dict) and "$ref" in schema:
            ref = schema["$ref"]
            # try to resolve external refs to inline simple types
            resolved = resolve_ref_general(ref, Path(__file__).resolve(), schemas) or resolve_ref_to_schema(ref)
            if resolved and isinstance(resolved, dict):
                # if resolved is a simple non-object, inline its TS
                if resolved.get("type") and resolved.get("type") != "object":
                    out_lines.append(f"export type {name} = {ts_for_schema(resolved)}")
                    out_lines.append("")
                    continue
                # otherwise alias to the referenced type name if possible
                if "/components/schemas/" in ref:
                    out_lines.append(f"export type {name} = {ref.split('/')[-1]}")
                    out_lines.append("")
                    continue
        if schema.get("type") == "object" or "properties" in schema:
            out_lines.append(f"export interface {name} {ts_for_schema(schema)}")
        elif "oneOf" in schema or "anyOf" in schema:
            variants = schema.get("oneOf") or schema.get("anyOf") or []
            disc = schema.get("discriminator") or {}
            prop_name = disc.get("propertyName") if isinstance(disc, dict) else None
            mapping = disc.get("mapping") if isinstance(disc, dict) else {}
            parts = []
            for v in variants:
                if "$ref" in v:
                    refpath = v["$ref"]
                    refname = refpath.split("/")[-1]
                    if prop_name and mapping:
                        # try to find a tag value that maps to this ref
                        tag = None
                        for tag_val, mref in mapping.items():
                            if mref == refpath or mref.endswith('/' + refname):
                                tag = tag_val
                                break
                        if tag:
                            # produce discriminated intersection: {propName: "tag"} & RefType
                            parts.append(f"{{ {prop_name}: \"{tag}\" }} & {refname}")
                            continue
                    parts.append(refname)
                else:
                    parts.append(ts_for_schema(v))
            out_lines.append(f"export type {name} = { ' | '.join(parts) }")
        elif "enum" in schema:
            vals = schema.get("enum", [])
            out_lines.append(f"export type {name} = { ' | '.join([f'\"{v}\"' for v in vals]) }")
        else:
            out_lines.append(f"export type {name} = {ts_for_schema(schema)}")
        out_lines.append("")

    return "\n".join(out_lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", default=Path("schemas/api/openapi.yaml"), type=Path, help="Path to the OpenAPI specification (JSON or YAML)")
    parser.add_argument("--backend", default=Path("backend/didhub-backend/src/generated/routes.rs"), type=Path, help="Output path for backend routes file")
    parser.add_argument("--frontend", default=Path("frontend/api/src/client.ts"), type=Path, help="Output path for the frontend API client")
    parser.add_argument("--frontend-types", default=Path("frontend/api/src/types.ts"), type=Path, help="Output path for frontend TypeScript types")
    args = parser.parse_args()

    spec = load_spec(args.spec)
    components = spec.get("components", {})
    schemas = components.get("schemas", {})
    operations = build_operations(spec, schemas)
    if not operations:
        raise SystemExit("Specification did not contain any operations")

    routes = group_routes(operations)

    # Use GeneratorContext for optimized template handling
    ctx = GeneratorContext()

    backend_code = render_backend(ctx, operations, routes)
    frontend_code = render_frontend(ctx, operations, spec.get("components", {}))
    frontend_types_code = render_frontend_types(spec.get("components", {}))

    args.backend.parent.mkdir(parents=True, exist_ok=True)
    args.backend.write_text(backend_code, encoding="utf-8")

    # Write the mod.rs file for the generated module
    mod_file = args.backend.parent / "mod.rs"
    mod_file.write_text("// Auto-generated by build_tools/api_codegen. Do not edit manually.\n#![cfg_attr(rustfmt, rustfmt_skip)]\n\npub mod routes;\n", encoding="utf-8")

    # Write frontend client and types into frontend/api/src
    frontend_src = Path("frontend/api/src")
    frontend_src.mkdir(parents=True, exist_ok=True)
    (frontend_src / "client.ts").write_text(frontend_code, encoding="utf-8")
    (frontend_src / "types.ts").write_text(frontend_types_code, encoding="utf-8")

    print(f"Generated backend routes -> {args.backend}")
    print(f"Generated frontend client -> {args.frontend}")
    print(f"Generated frontend types -> {args.frontend_types}")


if __name__ == "__main__":
    main()
