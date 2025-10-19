"""Naming utilities for code generation."""

from __future__ import annotations

from functools import lru_cache

RUST_KEYWORDS: frozenset[str] = frozenset({
    "as",
    "async",
    "await",
    "break",
    "const",
    "continue",
    "crate",
    "dyn",
    "else",
    "enum",
    "extern",
    "false",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "Self",
    "static",
    "struct",
    "super",
    "trait",
    "true",
    "type",
    "union",
    "unsafe",
    "use",
    "where",
    "while",
})

# Common irregular plurals
_IRREGULAR_PLURALS: dict[str, str] = {
    "children": "child",
    "people": "person",
    "men": "man",
    "women": "woman",
    "mice": "mouse",
    "geese": "goose",
    "teeth": "tooth",
    "feet": "foot",
    "data": "datum",
    "criteria": "criterion",
    "analyses": "analysis",
    "indices": "index",
    "appendices": "appendix",
    "matrices": "matrix",
    "vertices": "vertex",
}


@lru_cache(maxsize=1024)
def singularize(name: str) -> str:
    """Convert a plural word to singular form.
    
    Uses caching for repeated calls with the same input.
    """
    # Check irregular plurals first
    lower = name.lower()
    if lower in _IRREGULAR_PLURALS:
        # Preserve original case pattern
        singular = _IRREGULAR_PLURALS[lower]
        if name[0].isupper():
            return singular.capitalize()
        return singular
    
    # Apply rules in order of specificity
    if name.endswith("ies") and len(name) > 3:
        return name[:-3] + "y"
    if name.endswith("ses") and len(name) > 3:
        return name[:-2]
    if name.endswith("xes") and len(name) > 3:
        return name[:-2]
    if name.endswith("zes") and len(name) > 3:
        return name[:-2]
    if name.endswith("ches") and len(name) > 4:
        return name[:-2]
    if name.endswith("shes") and len(name) > 4:
        return name[:-2]
    if name.endswith("s") and not name.endswith("ss") and len(name) > 1:
        return name[:-1]
    return name


@lru_cache(maxsize=1024)
def to_pascal_case(value: str) -> str:
    """Convert a string to PascalCase.
    
    Uses caching for repeated calls with the same input.
    
    Examples:
        >>> to_pascal_case("hello_world")
        'HelloWorld'
        >>> to_pascal_case("hello-world")
        'HelloWorld'
        >>> to_pascal_case("helloWorld")
        'HelloWorld'
    """
    # Handle already camelCase/PascalCase by inserting underscores before caps
    import re
    value = re.sub(r'([a-z])([A-Z])', r'\1_\2', value)
    
    parts = [part for part in value.replace("-", "_").split("_") if part]
    return "".join(part.capitalize() for part in parts)


@lru_cache(maxsize=1024)
def to_snake_case(value: str) -> str:
    """Convert a string to snake_case.
    
    Uses caching for repeated calls with the same input.
    
    Examples:
        >>> to_snake_case("HelloWorld")
        'hello_world'
        >>> to_snake_case("hello-world")
        'hello_world'
    """
    import re
    # Insert underscore before uppercase letters
    value = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', value)
    # Replace hyphens and multiple underscores
    value = value.replace("-", "_")
    value = re.sub(r'_+', '_', value)
    return value.lower().strip("_")


@lru_cache(maxsize=1024)
def sanitize_module_name(value: str) -> str:
    """Sanitize a value for use as a Rust module name.
    
    Uses caching for repeated calls with the same input.
    """
    return value.lower().replace("-", "_")


@lru_cache(maxsize=1024)
def sanitize_field_name(value: str) -> str:
    """Sanitize a value for use as a Rust field name.
    
    Uses caching for repeated calls with the same input.
    """
    sanitized = value.replace("-", "_")
    if sanitized in RUST_KEYWORDS:
        return f"r#{sanitized}"
    return sanitized
