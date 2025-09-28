use axum::http::Method;

pub const ALLOWED_METHODS: &[Method] = &[
    Method::GET,
    Method::POST,
    Method::PUT,
    Method::DELETE,
    Method::PATCH,
];