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
    response_type: Optional[str] = None  # Type name for response (e.g., "UsersListResponse<UserOut>")


@dataclass
class ApiModule:
    """Represents an API module with its endpoints"""
    name: str
    endpoints: List[Endpoint]


@dataclass
class TypeDefinition:
    """Represents a TypeScript interface definition"""
    name: str
    fields: List[Tuple[str, str]]  # (field_name, field_type)
    is_generic: bool = False
    type_params: List[str] = None  # For generic types like T, U

    def __post_init__(self):
        if self.type_params is None:
            self.type_params = []