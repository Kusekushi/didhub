-- Postgres audit rfc3339 normalization (only necessary if older data exists)
UPDATE audit_log
SET created_at = to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
WHERE position('T' in created_at::text) = 0;
