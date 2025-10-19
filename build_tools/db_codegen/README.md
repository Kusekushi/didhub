# DB Code Generator

This tool converts the structured schema YAML files used for migrations into
Rust code for the `didhub-db` crate. The generated code provides strongly typed
row structs and minimal helper queries for each table defined in the schema.

## Usage

1. Install dependencies:

   ```pwsh
   python -m pip install -r tools/db_codegen/requirements.txt
   ```

2. Generate code for the default schema:

   ```pwsh
   python tools/db_codegen/main.py \
       backend/didhub-migrations/schemas/0001_initial.yaml \
       --crate-dir backend/didhub-db
   ```

   The script overwrites files beneath `backend/didhub-db/src/generated`. Always
   inspect the diff before committing.

3. To target a different schema file or output directory, update the arguments
   accordingly:

   ```pwsh
   python tools/db_codegen/main.py path/to/schema.yaml --crate-dir path/to/crate
   ```

The generator is deterministic. Re-running the tool with the same inputs
produces the same output.
