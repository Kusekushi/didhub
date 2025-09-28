-- Postgres OIDC identities
CREATE TABLE IF NOT EXISTS oidc_identities (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_oidc_user ON oidc_identities(user_id);
