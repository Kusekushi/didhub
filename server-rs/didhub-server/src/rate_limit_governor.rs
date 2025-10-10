use axum::{
    body::Body,
    http::{Request, StatusCode},
    response::Response,
};
use didhub_cache::{AppCache, Cache};
use didhub_db::audit;
use didhub_metrics::{RATE_LIMIT_ALLOWED, RATE_LIMIT_DENIED};
use didhub_middleware::types::CurrentUser;
use futures::future::BoxFuture;
use std::task::{Context, Poll};
use tower::{Layer, Service};
use tracing::{debug, warn};

// Rule-driven limiter that mirrors the legacy `rate_limit::RateLimitLayer` semantics
// but implemented as a tower Layer so it can be replaced in the middleware stack.
#[derive(Clone)]
pub struct GovernorRule {
    pub method: &'static str,
    pub path: &'static str,
    pub limit: i64,
    pub window_secs: u64,
}

impl GovernorRule {
    pub fn new(method: &'static str, path: &'static str, limit: i64, window_secs: u64) -> Self {
        Self {
            method,
            path,
            limit,
            window_secs,
        }
    }
}

#[derive(Clone)]
pub struct GovernorLayer {
    pub rules: Vec<GovernorRule>,
    pub cache: AppCache,
    pub db: didhub_db::Db,
}

#[derive(Clone)]
pub struct GovernorService<S> {
    inner: S,
    rules: Vec<GovernorRule>,
    cache: AppCache,
    db: didhub_db::Db,
}

impl<S> Layer<S> for GovernorLayer {
    type Service = GovernorService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        GovernorService {
            inner,
            rules: self.rules.clone(),
            cache: self.cache.clone(),
            db: self.db.clone(),
        }
    }
}

// Construct a GovernorLayer with the provided cache and db (used by `lib.rs`).
pub fn governor_layer_with(cache: AppCache, db: didhub_db::Db) -> GovernorLayer {
    GovernorLayer {
        rules: default_rules(),
        cache,
        db,
    }
}

// metrics served via metrics::metrics_handler

#[derive(Clone)]
pub struct Audit429Layer {
    pub db: didhub_db::Db,
}

impl<S> Layer<S> for Audit429Layer {
    type Service = Audit429Service<S>;
    fn layer(&self, inner: S) -> Self::Service {
        Audit429Service {
            inner,
            db: self.db.clone(),
        }
    }
}

#[derive(Clone)]
pub struct Audit429Service<S> {
    inner: S,
    db: didhub_db::Db,
}

impl<S> Service<Request<Body>> for Audit429Service<S>
where
    S: Service<Request<Body>, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = S::Error;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }
    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let mut inner = self.inner.clone();
        let db = self.db.clone();
        let method = req.method().clone();
        let path = req.uri().path().to_string();
        let ip = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
            .unwrap_or_else(|| "anon".into());
        let user_id = req.extensions().get::<CurrentUser>().map(|u| u.id.clone());
        Box::pin(async move {
            let resp = inner.call(req).await?;
            if resp.status() == StatusCode::TOO_MANY_REQUESTS {
                warn!(
                    method=%method,
                    path=%path,
                    ip=%ip,
                    user_id=?user_id,
                    "rate limit exceeded - recording audit event"
                );
                tokio::spawn(async move {
                    audit::record_with_metadata(
                        &db,
                        user_id.as_deref(),
                        "rate_limit.denied",
                        Some("route"),
                        Some(&path),
                        serde_json::json!({"method": method.as_str(), "ip": ip}),
                    )
                    .await;
                });
            }
            Ok(resp)
        })
    }
}

impl<S> Service<Request<Body>> for GovernorService<S>
where
    S: Service<Request<Body>, Response = Response> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = S::Error;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }
    fn call(&mut self, req: Request<Body>) -> Self::Future {
        let mut inner = self.inner.clone();
        let rules = self.rules.clone();
        let cache = self.cache.clone();
        let db = self.db.clone();
        let method = req.method().as_str().to_string();
        let path = req.uri().path().to_string();
        let ip = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.split(',').next().unwrap_or(s).trim().to_string())
            .unwrap_or_else(|| "anon".into());
        let ext_user_id = req
            .extensions()
            .get::<CurrentUser>()
            .map(|u| u.id.to_string())
            .unwrap_or_else(|| "guest".into());
        Box::pin(async move {
            // find a matching rule exactly like the legacy layer
            // find a matching rule: exact match or prefix when rule.path ends with "/*"
            let matched = rules
                .iter()
                .find(|r| {
                    if r.method != method {
                        return false;
                    }
                    if r.path.ends_with("/*") {
                        let prefix = &r.path[..r.path.len() - 2];
                        path.starts_with(prefix)
                    } else {
                        r.path == path
                    }
                })
                .cloned();

            if let Some(rule) = matched {
                debug!(
                    method=%method,
                    path=%path,
                    user_id=%ext_user_id,
                    ip=%ip,
                    rule_limit=%rule.limit,
                    rule_window_secs=%rule.window_secs,
                    "applying rate limit rule"
                );

                let key = format!("rl:{}:{}:{}:{}", rule.method, rule.path, ext_user_id, ip);
                let ttl = std::time::Duration::from_secs(rule.window_secs);
                let count = cache
                    .incr(&key, Some(ttl))
                    .await
                    .map_err(|_| {
                        // ignore cache errors and proceed without limiting
                    })
                    .unwrap_or(0);

                debug!(
                    method=%method,
                    path=%path,
                    user_id=%ext_user_id,
                    ip=%ip,
                    current_count=%count,
                    limit=%rule.limit,
                    "rate limit check result"
                );

                if count > rule.limit {
                    warn!(
                        method=%method,
                        path=%path,
                        user_id=%ext_user_id,
                        ip=%ip,
                        current_count=%count,
                        limit=%rule.limit,
                        window_secs=%rule.window_secs,
                        "rate limit exceeded - blocking request"
                    );

                    let audit_user = if ext_user_id == "guest" {
                        None
                    } else {
                        Some(ext_user_id)
                    };
                    let ip_clone = ip.clone();
                    let path_clone = rule.path.to_string();
                    let method_static = rule.method;
                    let db_for_audit = db.clone();
                    tokio::spawn(async move {
                        audit::record_with_metadata(
                            &db_for_audit,
                            audit_user.as_deref(),
                            "rate_limit.denied",
                            Some("route"),
                            Some(path_clone.as_str()),
                            serde_json::json!({"method": method_static, "ip": ip_clone}),
                        )
                        .await;
                    });
                    RATE_LIMIT_DENIED
                        .with_label_values(&[rule.method, rule.path])
                        .inc();
                    let body = serde_json::json!({"error":"rate limited","code":"rate_limited","retry_after_secs": rule.window_secs});
                    let mut resp =
                        Response::new(axum::body::Body::from(serde_json::to_vec(&body).unwrap()));
                    *resp.status_mut() = StatusCode::TOO_MANY_REQUESTS;
                    resp.headers_mut().insert(
                        "content-type",
                        axum::http::HeaderValue::from_static("application/json"),
                    );
                    resp.headers_mut().insert(
                        "x-error-code",
                        axum::http::HeaderValue::from_static("rate_limited"),
                    );
                    return Ok(resp);
                } else {
                    // allowed
                    debug!(
                        method=%method,
                        path=%path,
                        user_id=%ext_user_id,
                        ip=%ip,
                        current_count=%count,
                        limit=%rule.limit,
                        "rate limit check passed"
                    );
                    RATE_LIMIT_ALLOWED
                        .with_label_values(&[rule.method, rule.path])
                        .inc();
                }
            } else {
                debug!(
                    method=%method,
                    path=%path,
                    user_id=%ext_user_id,
                    ip=%ip,
                    "no rate limit rule matched - allowing request"
                );
            }
            inner.call(req).await
        })
    }
}

pub fn default_rules() -> Vec<GovernorRule> {
    vec![
        GovernorRule::new("POST", "/api/auth/login", 5, 60),
        GovernorRule::new("POST", "/api/auth/register", 3, 300),
        GovernorRule::new("POST", "/api/password-reset/request", 3, 300),
        GovernorRule::new("POST", "/api/password-reset/verify", 5, 300),
        GovernorRule::new("POST", "/api/password-reset/consume", 5, 300),
        GovernorRule::new("POST", "/api/me/password", 5, 600),
        GovernorRule::new("POST", "/api/me/request-system", 3, 3600),
        GovernorRule::new("POST", "/api/alters", 60, 3600),
        GovernorRule::new("POST", "/api/avatar", 10, 3600),
        GovernorRule::new("POST", "/api/uploads", 600, 3600),
    ]
}
