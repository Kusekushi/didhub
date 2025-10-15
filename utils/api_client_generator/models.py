"""
Data models for the API client generator.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple


@dataclass
class Endpoint:
    """Represents an API endpoint"""
    path: str
    method: str
    handler: str
    auth_required: bool = False
    is_admin: bool = False
    query_type: Optional[str] = None  # Type name for query parameters (e.g., "UsersQuery")
    body_type: Optional[str] = None   # Type name for request body (e.g., "CreateUserPayload")
    body_optional: bool = False  # True if the request body is an Option<...> in Rust
    response_type: Optional[str] = None  # Type name for response (e.g., "UsersListResponse<UserOut>")
    # Optional explicit hints parsed from doc comments or attributes (e.g., @api response=binary)
    response_hint: Optional[str] = None  # e.g., 'binary', 'pdf', 'json'
    body_hint: Optional[str] = None      # e.g., 'formdata', 'json', 'binary'


@dataclass
class ApiModule:
    """Represents an API module with its endpoints"""
    name: str
    endpoints: List[Endpoint]


@dataclass
class TypeDefinition:
    """Represents a TypeScript interface definition"""
    name: str  # TypeScript-friendly unique name
    rust_path: str  # Fully-qualified Rust path (e.g. crate::routes::admin::uploads::ListParams)
    module_path: str  # Module portion of the path (e.g. crate::routes::admin::uploads)
    original_name: str  # Original Rust struct name (e.g. ListParams)
    # Each field is a tuple: (field_name, rust_type, serialized_name, is_optional, is_flatten)
    # - field_name: Rust identifier for the field
    # - rust_type: the (possibly qualified) Rust type string
    # - serialized_name: the name used by serde when serialized (may be different due to #[serde(rename = "...")])
    # - is_optional: True if the Rust type contains Option<...> anywhere
    # - is_flatten: True if the field has #[serde(flatten)] and should be inlined
    fields: List[Tuple[str, str, str, bool, bool]]  # (field_name, rust_type, serialized_name, is_optional, is_flatten)
    is_generic: bool = False
    type_params: List[str] = None  # For generic types like T, U
    # Whether this TypeDefinition represents an enum instead of a struct
    is_enum: bool = False
    # For enums: list of variants as tuples (variant_name, serialized_name, has_payload, payload_type)
    # payload_type is a Rust type string for tuple-like variants when available
    variants: List[Tuple[str, str, bool, Optional[str]]] = None
    # Struct-level serde rename_all directive (e.g., 'camelCase', 'snake_case').
    rename_all: Optional[str] = None
    # Enum tagging information (for enums only): one of 'externally_tagged', 'internally_tagged',
    # 'adjacent', 'untagged'. When present, the generator uses this to emit OpenAPI shapes that
    # better match serde's enum representation. `tag` and `content` store the field names used by
    # serde (e.g. tag='type', content='content').
    enum_style: Optional[str] = None
    enum_tag: Optional[str] = None
    enum_content: Optional[str] = None

    def __post_init__(self):
        if self.type_params is None:
            self.type_params = []
        if self.variants is None:
            self.variants = []