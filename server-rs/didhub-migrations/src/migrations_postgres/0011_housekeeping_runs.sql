-- Postgres housekeeping runs
CREATE TABLE IF NOT EXISTS housekeeping_runs (
    id SERIAL PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    finished_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'running',
    message TEXT,
    rows_affected INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_job_started ON housekeeping_runs(job_name, started_at DESC);
