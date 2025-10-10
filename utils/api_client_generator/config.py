"""
Configuration and constants for the API client generator.
"""

from pathlib import Path

# Default paths
DEFAULT_SERVER_ROOT = Path("../../server-rs/didhub-server")
DEFAULT_OUTPUT_DIR = Path("../../packages/api-client/src")

# Route files to parse
ROUTE_FILES = [
    "src/router/auth_routes.rs",
    "src/router/protected_routes.rs",
    "src/router/admin_routes.rs",
    "src/router/builder.rs",
]

# Module mapping for path prefixes
MODULE_MAP = {
    'alters': 'Alter',
    'groups': 'Group',
    'systems': 'Subsystem',
    'subsystems': 'Subsystem',
    'me': 'Users',
    'upload': 'Files',
    'uploads': 'Files',
    'assets': 'Files',
    'auth': 'Users',
    'oidc': 'OIDC',
    'password-reset': 'Users',
    'health': 'misc',
    'metrics': 'misc',
    's': 'misc',
    'posts': 'Post',
    'pdf': 'Report',
    'users': 'Admin',
    'system-requests': 'Admin',
    'settings': 'Admin',
    'admin': 'Admin',
    'audit': 'Admin',
    'housekeeping': 'Admin',
    'version': 'misc',
    'debug': 'misc',
}

# HTTP methods to recognize
VALID_HTTP_METHODS = {'get', 'post', 'put', 'delete', 'patch', 'head', 'options'}

# Relative Rust source files in didhub-db that should be parsed for shared models
DIDHUB_DB_EXPORT_FILES = {
    "models.rs",
}