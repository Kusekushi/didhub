pub const DEFAULT_SETTINGS: &[(&str, &str)] = &[
    ("feature.oidc_enabled", "true"),
    ("feature.email_enabled", "false"),
    ("avatar.max_dim", "512"),
    ("upload.image.max_dim", "2048"),
    ("uploads.gc.days", "7"),
    ("uploads.delete.retention.days", "30"),
    ("uploads.count_cache.ttl_secs", "30"),
    ("uploads.upload_dir_cache.ttl_secs", "10"),
    ("shortlinks.retention.days", "180"),
];