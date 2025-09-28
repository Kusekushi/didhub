-- Postgres posts
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id INTEGER,
    repost_of_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts(repost_of_post_id);
