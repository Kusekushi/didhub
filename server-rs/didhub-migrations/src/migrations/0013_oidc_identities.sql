-- OIDC identity linkage table (portable baseline for SQLite; adjust per backend if needed later)
CREATE TABLE IF NOT EXISTS oidc_identities (
    -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT,
    UNIQUE(provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_oidc_user ON oidc_identities(user_id);
