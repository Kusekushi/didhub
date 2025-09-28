use axum::{
    routing::{get, post},
    Router,
};

use didhub_auth as auth;

pub fn build_auth_routes(auth_state: &auth::AuthState) -> Router {
    Router::new()
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/refresh", post(auth::refresh))
        .route("/version", get(crate::version::version_handler))
        .route("/oidc", get(crate::routes_oidc::public_providers))
        .route("/oidc/{id}/authorize", get(crate::routes_oidc::authorize))
        .route("/oidc/{id}/callback", get(crate::routes_oidc::callback))
        .route(
            "/password-reset/request",
            post(crate::routes_password_reset::request_reset),
        )
        .route(
            "/password-reset/verify",
            post(crate::routes_password_reset::verify_reset),
        )
        .route(
            "/password-reset/consume",
            post(crate::routes_password_reset::consume_reset),
        )
        .with_state(auth_state.clone())
}
