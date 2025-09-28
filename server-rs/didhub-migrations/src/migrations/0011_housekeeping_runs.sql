-- Housekeeping runs table stores execution metadata for background/triggered jobs
CREATE TABLE IF NOT EXISTS housekeeping_runs (
    -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
    id INTEGER PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running', -- running|success|error
    message TEXT, -- optional error or summary message
    rows_affected INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_housekeeping_runs_job_started ON housekeeping_runs(job_name, started_at DESC);