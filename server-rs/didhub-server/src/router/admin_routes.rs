use axum::{
    routing::{delete, get, post},
    Router,
};

use didhub_auth as auth;

pub fn build_admin_routes(auth_state: &auth::AuthState) -> Router {
    Router::new()
        .route("/users", get(crate::routes_users::list_users))
        .route("/users/names", get(crate::routes_users::list_user_names))
        .route(
            "/users/{id}",
            get(crate::routes_users::get_user)
                .put(crate::routes_users::update_user)
                .delete(crate::routes_users::delete_user),
        )
        .route(
            "/uploads",
            get(crate::routes_upload_admin::list_uploads_admin),
        )
        .route(
            "/uploads/{name}",
            delete(crate::routes_upload_admin::delete_upload_admin),
        )
        .route(
            "/uploads/purge",
            post(crate::routes_upload_admin::purge_uploads_admin),
        )
        .route(
            "/system-requests",
            get(crate::routes_system_requests::list_system_requests),
        )
        .route(
            "/system-requests/{id}/decide",
            post(crate::routes_system_requests::decide_system_request),
        )
        .route(
            "/settings",
            get(crate::routes_settings::list_settings)
                .put(crate::routes_settings::bulk_upsert_settings),
        )
        .route(
            "/settings/{key}",
            get(crate::routes_settings::get_setting).put(crate::routes_settings::upsert_setting),
        )
        .route(
            "/admin/reload-upload-dir",
            post(crate::routes_admin_misc::reload_upload_dir),
        )
        .route(
            "/admin/migrate-upload-dir",
            post(crate::routes_admin_misc::migrate_uploads),
        )
        .route("/admin/redis", get(crate::routes_admin_misc::redis_status))
        .route(
            "/admin/update/check",
            get(crate::routes_admin_misc::check_updates),
        )
        .route(
            "/admin/update",
            post(crate::routes_admin_misc::perform_update_endpoint),
        )
        .route(
            "/admin/digest/custom",
            post(crate::routes_admin_misc::post_custom_digest),
        )
        .route(
            "/admin/db/query",
            post(crate::routes_admin_misc::query_database),
        )
        .route("/oidc/{id}/enabled", post(crate::routes_oidc::set_enabled))
        .route("/oidc/{id}/secret", get(crate::routes_oidc::get_secret))
        .route("/oidc/{id}/secret", post(crate::routes_oidc::update_secret))
        .route("/audit", get(crate::routes_audit::list_audit))
        .route("/audit/purge", post(crate::routes_audit::purge_audit))
        .route("/audit/clear", post(crate::routes_audit::clear_audit))
        .route(
            "/housekeeping/jobs",
            get(crate::routes_housekeeping::list_jobs),
        )
        .route(
            "/housekeeping/runs",
            get(crate::routes_housekeeping::list_runs).post(crate::routes_housekeeping::clear_runs),
        )
        .route(
            "/housekeeping/trigger/{name}",
            post(crate::routes_housekeeping::trigger_job),
        )
        .with_state(auth_state.clone())
}
