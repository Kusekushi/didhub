-- MySQL OIDC identities
CREATE TABLE IF NOT EXISTS oidc_identities (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    provider VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_provider_subject (provider, subject),
    INDEX idx_oidc_user (user_id)
) ENGINE=InnoDB;
