-- Posts table to support simple posting & repost chains
CREATE TABLE IF NOT EXISTS posts (
    -- Use dialect-neutral primary key; backend-specific autoincrement handled separately
    id INTEGER PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id INTEGER,
    repost_of_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of_post_id);
