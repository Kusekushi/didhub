-- MySQL posts
CREATE TABLE IF NOT EXISTS posts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    body TEXT NOT NULL,
    created_by_user_id BIGINT,
    repost_of_post_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_posts_created_at (created_at),
    INDEX idx_posts_author (created_by_user_id, created_at),
    INDEX idx_posts_repost_of (repost_of_post_id)
) ENGINE=InnoDB;
