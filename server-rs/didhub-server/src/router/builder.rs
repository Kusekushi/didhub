//! # Router Builder
//!
//! This module provides the `AppRouterBuilder` for constructing the main Axum router
//! with all middleware, routes, and configuration.

use axum::{middleware::from_fn_with_state, Router};
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    trace::TraceLayer,
};

use didhub_auth as auth;
use didhub_config as config;
use didhub_db as db;
use didhub_middleware::{client_ip, csrf, middleware_ext, request_logger, validation};

use crate::{
    constants::cors::ALLOWED_METHODS,
    rate_limit_governor::{self, Audit429Layer},
    router::{build_admin_routes, build_auth_routes, build_protected_routes},
    routes, security_headers,
    services::ServiceComponents,
};

/// Builder for constructing the main application router.
///
/// This builder assembles all routes, middleware, and services into a complete
/// Axum router ready for serving HTTP requests.
pub struct AppRouterBuilder {
    db: db::Db,
    config: config::AppConfig,
}

impl AppRouterBuilder {
    /// Create a new router builder with the given database and configuration.
    pub fn new(db: db::Db, config: config::AppConfig) -> Self {
        Self { db, config }
    }

    /// Build the complete application router.
    ///
    /// This method assembles:
    /// - CORS configuration
    /// - Authentication state
    /// - Service components (caches, etc.)
    /// - Route groups (auth, protected, admin)
    /// - Middleware layers (compression, logging, security headers, etc.)
    /// - Static file serving
    ///
    /// # Returns
    ///
    /// A fully configured Axum `Router`
    pub async fn build(self) -> Router {
        let service_components = ServiceComponents::initialize(&self.db, &self.config).await;

        self.build_with_services(&service_components)
    }

    /// Build the application router with pre-initialized service components.
    ///
    /// This method is used when service components have already been initialized
    /// and need to be reused (e.g., for proper shutdown handling).
    ///
    /// # Arguments
    ///
    /// * `service_components` - Pre-initialized service components
    ///
    /// # Returns
    ///
    /// A fully configured Axum `Router`
    pub fn build_with_services(&self, service_components: &ServiceComponents) -> Router {
        let cors_layer = self.build_cors_layer();
        let auth_state = auth::AuthState {
            db: self.db.clone(),
            cfg: self.config.clone(),
            cache: service_components.cache.clone(),
        };

        let auth_routes = build_auth_routes(&auth_state)
            .layer(axum::middleware::from_fn(
                validation::require_json_content_type,
            ))
            .layer(axum::middleware::from_fn(validation::validate_api_version));
        let protected_routes = build_protected_routes(&auth_state)
            .layer(from_fn_with_state(
                auth_state.clone(),
                auth::auth_middleware,
            ))
            .layer(axum::middleware::from_fn(
                validation::require_json_content_type,
            ))
            .layer(axum::middleware::from_fn(validation::validate_api_version));
        let admin_routes = build_admin_routes(&auth_state)
            .layer(from_fn_with_state(auth_state, auth::auth_middleware))
            .layer(axum::middleware::from_fn(
                validation::require_json_content_type,
            ))
            .layer(axum::middleware::from_fn(validation::validate_api_version));

        Router::new()
            .route("/health", axum::routing::get(routes::health))
            .nest("/api", auth_routes)
            .nest("/api", protected_routes)
            .nest("/api", admin_routes)
            .layer(
                ServiceBuilder::new()
                    .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
                    .layer(PropagateRequestIdLayer::x_request_id())
                    .layer(TraceLayer::new_for_http())
                    .layer(cors_layer)
                    .layer(CompressionLayer::new())
                    .layer(axum::middleware::from_fn(
                        middleware_ext::error_logging_middleware,
                    ))
                    .layer(axum::middleware::from_fn(request_logger::request_logger))
                    .layer(axum::middleware::from_fn(client_ip::extract_client_ip))
                    .layer(axum::middleware::from_fn(csrf::csrf_middleware))
                    // Allow disabling rate limiting for e2e via env var so tests
                    // don't fail due to server-side throttling. Default behavior
                    // is to use the normal governor with rules.
                    .layer(if std::env::var("DIDHUB_DISABLE_RATE_LIMIT").is_ok() {
                        rate_limit_governor::governor_layer_disabled(
                            service_components.cache.clone(),
                            self.db.clone(),
                        )
                    } else {
                        rate_limit_governor::governor_layer_with(
                            service_components.cache.clone(),
                            self.db.clone(),
                        )
                    })
                    .layer(Audit429Layer {
                        db: self.db.clone(),
                    })
                    .layer(axum::middleware::from_fn(
                        security_headers::apply_security_headers,
                    )),
            )
            .route(
                "/uploads/{filename}",
                axum::routing::get(crate::routes::files::uploads::serve_file),
            )
            .layer(axum::Extension(self.config.clone()))
            .layer(axum::Extension(service_components.upload_dir_cache.clone()))
            .layer(axum::Extension(self.db.clone()))
            .layer(axum::Extension(service_components.oidc_state.clone()))
            .layer(axum::Extension(service_components.oidc_settings.clone()))
            .layer(axum::Extension(service_components.cache.clone()))
            .layer(axum::Extension(
                service_components.housekeeping_state.clone(),
            ))
            .route(
                "/assets/{path}",
                axum::routing::get(crate::routes::static_assets::serve_asset),
            )
            .route(
                "/{file}",
                axum::routing::get(crate::routes::static_assets::serve_root_file),
            )
            .fallback(axum::routing::get(
                crate::routes::static_assets::spa_fallback,
            ))
    }

    fn build_cors_layer(&self) -> CorsLayer {
        if self.config.allow_all_frontend_origins {
            CorsLayer::very_permissive()
        } else {
            let origins: Vec<axum::http::HeaderValue> = self
                .config
                .frontend_origins
                .iter()
                .filter_map(|o| axum::http::HeaderValue::from_str(o).ok())
                .collect();

            if origins.is_empty() {
                CorsLayer::new().allow_origin(Any)
            } else {
                CorsLayer::new()
                    .allow_origin(AllowOrigin::list(origins))
                    .allow_methods(ALLOWED_METHODS.to_vec())
                    .allow_headers([
                        axum::http::header::CONTENT_TYPE,
                        axum::http::header::AUTHORIZATION,
                        axum::http::header::COOKIE,
                        axum::http::HeaderName::from_static("x-csrf-token"),
                    ])
                    .allow_credentials(true)
            }
        }
    }
}
