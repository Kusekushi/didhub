-- MySQL audit rfc3339 normalization (approximate)
UPDATE audit_log
SET created_at = DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ')
WHERE INSTR(created_at, 'T') = 0;
