use axum::{
    routing::{get, post},
    Router,
};

use crate::routes::auth::wrappers;
use didhub_auth as auth;

pub fn build_auth_routes(auth_state: &auth::AuthState) -> Router {
    Router::new()
        .route("/auth/register", post(wrappers::register))
        .route("/auth/login", post(wrappers::login))
        .route("/auth/refresh", post(wrappers::refresh))
        .route("/version", get(crate::version::version_handler))
        .route("/oidc", get(crate::routes::auth::oidc::public_providers))
        .route(
            "/oidc/{id}/authorize",
            get(crate::routes::auth::oidc::authorize),
        )
        .route(
            "/oidc/{id}/callback",
            get(crate::routes::auth::oidc::callback),
        )
        .route(
            "/password-reset/request",
            post(crate::routes::auth::password_reset::request_reset),
        )
        .route(
            "/password-reset/verify",
            post(crate::routes::auth::password_reset::verify_reset),
        )
        .route(
            "/password-reset/consume",
            post(crate::routes::auth::password_reset::consume_reset),
        )
        .with_state(auth_state.clone())
}
