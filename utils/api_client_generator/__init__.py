"""
API Client Generator - Generate TypeScript API clients from Rust route definitions.
"""

from .generator import TypeScriptGenerator
from .main import main
from .models import ApiModule, Endpoint
from .parser import RustRouteParser

__version__ = "0.1.0"
__all__ = [
    "TypeScriptGenerator",
    "RustRouteParser",
    "ApiModule",
    "Endpoint",
    "main",
]