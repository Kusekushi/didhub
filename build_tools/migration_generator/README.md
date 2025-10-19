# Migration Generator

This tool converts a dialect-neutral schema description into SQL migrations for
SQLite, PostgreSQL, and MySQL. It is designed to keep the migration files inside
`backend/didhub-migrations/src/migrations_*` in sync with a single source of
truth (`schema.yaml`).

## Schema format overview

The schema is defined in YAML and contains two top-level sections:

- `dialects`: configuration for each target database, including the output file
  path and optional headers/footers.
- `tables`: ordered definitions of tables. Each table lists its columns,
  constraints, indexes, and optional dialect-specific snippets (for triggers,
  views, functions, etc.).

A simplified example:

```yaml
types:
  uuid:
    sqlite: TEXT
    postgres: TEXT
    mysql: CHAR(36)

dialects:
  sqlite:
    output: src/migrations_sqlite/0001_initial.sql

  postgres:
    output: src/migrations_postgres/0001_initial.sql

  mysql:
    output: src/migrations_mysql/0001_initial.sql

 tables:
  - name: users
    columns:
      - name: id
        type: uuid
        primary_key: true
        nullable: false
      - name: username
        type: text
        nullable: false
        unique: true
    indexes:
      - name: idx_users_username
        columns: [username]
```

Any column or constraint can use `dialects` / `dialect_type` / `default` maps to
override behaviour for specific databases. For features that are hard to model
(e.g. triggers), add raw SQL via `dialect_extras` or the global
`global_statements` section.

See `backend/didhub-migrations/schema.yaml` for the full schema driving the
current migrations.

## Usage

1. Install the Python dependency:

   ```pwsh
   python -m pip install -r tools/migration_generator/requirements.txt
   ```

2. Regenerate all dialect migrations:

   ```pwsh
   python tools/migration_generator/main.py backend/didhub-migrations/schema.yaml
   ```

   To regenerate only a single dialect:

   ```pwsh
   python tools/migration_generator/main.py backend/didhub-migrations/schema.yaml --dialect postgres
   ```

The script overwrites the target migration files. Always review the diff before
committing.

## Default type mappings

The generator provides a set of built-in, dialect-aware type mappings so you
don't need to include a `types:` block in your schema. The defaults are:

- uuid
  - sqlite: TEXT
  - postgres: TEXT
  - mysql: CHAR(36)
- string
  - sqlite: TEXT
  - postgres: TEXT
  - mysql: VARCHAR(255)
- text
  - sqlite: TEXT
  - postgres: TEXT
  - mysql: TEXT
- json_text
  - sqlite: TEXT
  - postgres: TEXT
  - mysql: TEXT
- bool_flag
  - sqlite: INTEGER
  - postgres: INTEGER
  - mysql: TINYINT(1)
- timestamp
  - sqlite: TEXT
  - postgres: TIMESTAMP WITH TIME ZONE
  - mysql: TIMESTAMP

If you prefer different defaults you can still supply a `types:` mapping in the
schema — schema-provided mappings will override the built-in defaults.
