"""
Data models for the API client generator.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class Endpoint:
    """Represents an API endpoint"""
    path: str
    method: str
    handler: str
    auth_required: bool = False
    is_admin: bool = False


@dataclass
class ApiModule:
    """Represents an API module with its endpoints"""
    name: str
    endpoints: List[Endpoint]