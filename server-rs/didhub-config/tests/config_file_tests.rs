use didhub_config::AppConfig;
use serde_json::json;
use std::env;

mod test_utils;
use test_utils::with_env_lock;

#[test]
fn config_file_upload_directory_overrides_default() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");
        let uploads_dir = base_dir.join("custom_uploads");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "uploads": {
                "directory": uploads_dir.to_string_lossy()
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        let expected = uploads_dir.to_string_lossy().replace('\\', "/");
        assert_eq!(cfg.upload_dir.replace('\\', "/"), expected);

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_logging_flags() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-log-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "logging": {
                "json": true,
                "level": "debug"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert!(cfg.log_json);
        assert_eq!(cfg.log_level.as_deref(), Some("debug"));
        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_server_settings() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-server-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "server": {
                "host": "127.0.0.1",
                "port": 8080
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(cfg.host, "127.0.0.1");
        assert_eq!(cfg.port, 8080);
        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_cors_settings() {
    with_env_lock(|| {
        let unique = format!(
            "didhub-config-test-cors-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "cors": {
                "allowed_origins": ["https://example.com", "https://app.example.com"],
                "allow_all_origins": false
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(cfg.allow_all_frontend_origins, false);
        assert_eq!(
            cfg.frontend_origins,
            vec!["https://example.com", "https://app.example.com"]
        );
        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_redis_settings() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-redis-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "redis": {
                "url": "redis://localhost:6379/0"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(cfg.redis_url, Some("redis://localhost:6379/0".to_string()));
        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_auto_update_settings() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-update-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "sqlite",
                "path": "./data/didhub.sqlite"
            },
            "auto_update": {
                "enabled": true,
                "check_enabled": true,
                "repo": "myorg/myrepo",
                "check_interval_hours": 12
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(cfg.auto_update_enabled, true);
        assert_eq!(cfg.auto_update_check, true);
        assert_eq!(cfg.update_repo, "myorg/myrepo");
        assert_eq!(cfg.update_check_interval_hours, 12);
        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_parsing_error_logs_warning() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-error-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        // Write invalid JSON to trigger parsing error
        std::fs::write(&config_path, "{ invalid json }").unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        // This should not panic, just log a warning
        let cfg = AppConfig::from_env().unwrap();
        // Config should still work with defaults
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 6000);

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_nonexistent_path_logs_warning() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let config_path = "/nonexistent/path/config.json";
        env::set_var("DIDHUB_CONFIG_FILE", config_path);

        // This should not panic, just log a warning
        let cfg = AppConfig::from_env().unwrap();
        // Config should still work with defaults
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 6000);

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_unsupported_database_driver() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-unsupported-db-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "unsupported_driver",
                "path": "./data/didhub.sqlite"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        // This should not panic, just log a warning about unsupported driver
        let cfg = AppConfig::from_env().unwrap();
        // Config should still work with defaults since unsupported driver is ignored
        assert_eq!(cfg.host, "0.0.0.0");
        assert_eq!(cfg.port, 6000);

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_database_empty_credentials() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-empty-db-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "postgres",
                "database": "",
                "username": "",
                "password": "somepass",
                "host": "localhost",
                "port": 5432
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        // Empty database/username should result in no DB URL being set
        assert_eq!(cfg.db_url, None);

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_database_mysql_driver() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-mysql-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "mysql",
                "database": "didhub_db",
                "username": "didhub_user",
                "password": "didhub_pass",
                "host": "db.example.com",
                "port": 3306
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(
            cfg.db_url,
            Some("mysql://didhub_user:didhub_pass@db.example.com:3306/didhub_db".to_string())
        );

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_database_postgres_with_ssl() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-postgres-ssl-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "postgres",
                "database": "didhub_db",
                "username": "didhub_user",
                "password": "didhub_pass",
                "host": "db.example.com",
                "port": 5432,
                "ssl_mode": "require"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        assert_eq!(
            cfg.db_url,
            Some(
                "postgres://didhub_user:didhub_pass@db.example.com:5432/didhub_db?sslmode=require"
                    .to_string()
            )
        );

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}

#[test]
fn config_file_database_postgres_invalid_ssl_mode() {
    with_env_lock(|| {
        env::set_var("FRONTEND_BASE_URL", "http://localhost:5173");

        let unique = format!(
            "didhub-config-test-postgres-invalid-ssl-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base_dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&base_dir).unwrap();
        let config_path = base_dir.join("config.json");

        let config_contents = json!({
            "database": {
                "driver": "postgres",
                "database": "didhub_db",
                "username": "didhub_user",
                "password": "didhub_pass",
                "host": "db.example.com",
                "port": 5432,
                "ssl_mode": "invalid_mode"
            }
        });
        std::fs::write(
            &config_path,
            serde_json::to_string_pretty(&config_contents).unwrap(),
        )
        .unwrap();

        env::set_var("DIDHUB_CONFIG_FILE", &config_path);
        let cfg = AppConfig::from_env().unwrap();
        // Invalid SSL mode should be ignored, so no ?sslmode= parameter
        assert_eq!(
            cfg.db_url,
            Some("postgres://didhub_user:didhub_pass@db.example.com:5432/didhub_db".to_string())
        );

        env::remove_var("DIDHUB_CONFIG_FILE");
    });
}
