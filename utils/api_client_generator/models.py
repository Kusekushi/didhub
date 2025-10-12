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

    def __post_init__(self):
        if self.type_params is None:
            self.type_params = []