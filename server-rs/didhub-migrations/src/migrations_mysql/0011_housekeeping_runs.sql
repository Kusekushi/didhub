-- MySQL housekeeping runs
CREATE TABLE IF NOT EXISTS housekeeping_runs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'running',
    message TEXT,
    rows_affected INTEGER DEFAULT 0,
    INDEX idx_housekeeping_runs_job_started (job_name, started_at)
) ENGINE=InnoDB;
