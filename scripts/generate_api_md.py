#!/usr/bin/env python3
import re
from pathlib import Path
import yaml

root = Path(__file__).resolve().parents[1]
openapi_path = root / 'packages' / 'api-client' / 'src' / 'generated' / 'openapi.yaml'
out_path = root / 'docs' / 'api.md'

data = yaml.safe_load(openapi_path.read_text(encoding='utf-8'))

paths = data.get('paths', {})

# Collect endpoints for a master table
rows = []
for p, methods in sorted(paths.items()):
    for method, info in sorted(methods.items()):
        summary = info.get('summary', '')
        params = info.get('parameters', []) or []
        param_list = ', '.join([param.get('name', '') for param in params])
        rows.append((method.upper(), p, summary, param_list, params))

md = []
md.append('# DIDHub HTTP API Reference (auto-generated)')
md.append('')
md.append('This file was generated from `packages/api-client/src/generated/openapi.yaml`.')
md.append('')
md.append('Base URL: `/api` prefix is used for JSON endpoints where applicable.')
md.append('')
md.append('## Endpoints')
md.append('')
md.append('| Method | Path | Summary | Parameters |')
md.append('| --- | --- | --- | --- |')
for method, p, summary, param_list, params in rows:
    md.append(f'| {method} | `{p}` | {summary} | {param_list} |')

md.append('')
md.append('---')
md.append('')

# Per-path detailed sections with method tables and parameter tables
for p, methods in sorted(paths.items()):
    md.append(f'## {p}')
    md.append('')
    md.append('| Method | Summary |')
    md.append('| --- | --- |')
    for method, info in sorted(methods.items()):
        summary = info.get('summary', '')
        md.append(f'| **{method.upper()}** | {summary} |')
    md.append('')

    for method, info in sorted(methods.items()):
        summary = info.get('summary', '')
        params = info.get('parameters', []) or []
        if params:
            md.append(f'### {method.upper()} {p} parameters')
            md.append('')
            md.append('| name | in | required | type |')
            md.append('| --- | --- | --- | --- |')
            for param in params:
                name = param.get('name', '')
                p_in = param.get('in', '')
                required = param.get('required', False)
                schema = param.get('schema', {}) or {}
                p_type = schema.get('type', '') if isinstance(schema, dict) else ''
                md.append(f'| {name} | {p_in} | {required} | {p_type} |')
            md.append('')

out_path.write_text('\n'.join(md), encoding='utf-8')
print('Wrote', out_path)
