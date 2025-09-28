-- Normalize existing audit_log.created_at values to RFC3339 (append T and Z if in 'YYYY-MM-DD HH:MM:SS' form)
UPDATE audit_log
SET created_at = substr(created_at,1,10) || 'T' || substr(created_at,12) || 'Z'
WHERE created_at LIKE '____-__-__ __:__:__' AND instr(created_at,'T') = 0;