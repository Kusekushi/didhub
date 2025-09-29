use didhub_cache as cache;
use didhub_config as config;
use didhub_db as db;
use didhub_db::settings::SettingOperations;
use didhub_housekeeping as housekeeping;
use didhub_oidc as oidc;

use crate::routes_housekeeping::HousekeepingState;
use crate::upload_dir;

pub struct ServiceComponents {
    pub upload_dir_cache: upload_dir::UploadDirCache,
    pub registry: housekeeping::JobRegistry,
    pub housekeeping_state: HousekeepingState,
    pub cache: cache::AppCache,
    pub oidc_state: oidc::OidcState,
    pub oidc_settings: oidc::ProviderSettings,
}

impl ServiceComponents {
    pub async fn initialize(db: &db::Db, cfg: &config::AppConfig) -> Self {
        let upload_dir_cache = Self::initialize_upload_dir_cache(db, cfg).await;
        let registry = Self::initialize_housekeeping_registry().await;
        let housekeeping_state = Self::create_housekeeping_state(db, &registry);
        let cache = Self::initialize_cache(cfg).await;
        let oidc_state = oidc::OidcState::new();
        let oidc_settings = oidc::ProviderSettings::from_env();

        Self::seed_default_settings(db).await;

        Self {
            upload_dir_cache,
            registry,
            housekeeping_state,
            cache,
            oidc_state,
            oidc_settings,
        }
    }

    async fn initialize_upload_dir_cache(
        db: &db::Db,
        cfg: &config::AppConfig,
    ) -> upload_dir::UploadDirCache {
        let upload_dir_cache =
            upload_dir::UploadDirCache::new(db.clone(), cfg.upload_dir.clone(), 10);
        upload_dir::set_global(upload_dir_cache.clone());

        // Refresh TTL from DB in background (non-blocking)
        let udc = upload_dir_cache.clone();
        tokio::spawn(async move {
            udc.refresh_ttl_from_db().await;
        });

        upload_dir_cache
    }

    async fn initialize_housekeeping_registry() -> housekeeping::JobRegistry {
        let registry = housekeeping::JobRegistry::new();
        let reg_clone = registry.clone();

        tokio::spawn(async move {
            reg_clone.register(housekeeping::AuditRetentionJob).await;
            reg_clone.register(housekeeping::BirthdaysDigestJob).await;
            reg_clone.register(housekeeping::UploadsGcJob).await;
            reg_clone.register(housekeeping::UploadsBackfillJob).await;
            reg_clone.register(housekeeping::UploadsIntegrityJob).await;
            reg_clone.register(housekeeping::ShortlinksPruneJob).await;
            reg_clone.register(housekeeping::OrphansPruneJob).await;
            reg_clone.register(housekeeping::VacuumDbJob).await;
        });

        registry
    }

    fn create_housekeeping_state(
        db: &db::Db,
        registry: &housekeeping::JobRegistry,
    ) -> HousekeepingState {
        let housekeeping_state = HousekeepingState {
            db: db.clone(),
            registry: registry.clone(),
        };

        let _ = housekeeping::spawn_scheduler(registry.clone(), db.clone());
        housekeeping_state
    }

    async fn initialize_cache(cfg: &config::AppConfig) -> cache::AppCache {
        if let Some(url) = cfg.redis_url.as_ref() {
            if let Ok(client) = redis::Client::open(url.as_str()) {
                // Create a persistent multiplexed connection and wrap it in Arc<Mutex<>>
                match client.get_multiplexed_async_connection().await {
                    Ok(conn) => {
                        return cache::AppCache::redis(std::sync::Arc::new(
                            tokio::sync::Mutex::new(conn),
                        ));
                    }
                    Err(_) => {}
                }
            }
        }

        cache::AppCache::memory()
    }

    async fn seed_default_settings(db: &db::Db) {
        let default_settings: Vec<(&str, String)> = vec![
            ("feature.oidc_enabled", "true".to_string()),
            ("feature.email_enabled", "false".to_string()),
            ("avatar.max_dim", "512".to_string()),
            ("upload.image.max_dim", "2048".to_string()),
            ("uploads.gc.days", "7".to_string()),
            ("uploads.delete.retention.days", "30".to_string()),
            ("uploads.count_cache.ttl_secs", "30".to_string()),
            ("uploads.upload_dir_cache.ttl_secs", "10".to_string()),
            ("shortlinks.retention.days", "180".to_string()),
        ];

        let db_clone = db.clone();
        tokio::spawn(async move {
            for (key, value) in default_settings {
                if db_clone.get_setting(key).await.ok().flatten().is_none() {
                    let _ = db_clone.upsert_setting(key, &value).await;
                }
            }
        });
    }
}
