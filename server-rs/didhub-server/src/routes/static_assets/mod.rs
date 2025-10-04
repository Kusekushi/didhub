use axum::body::Body;
use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::path::PathBuf;
use tokio::fs;
// AppConfig not required for static asset handlers
#[cfg(feature = "embed_static")]
use include_dir::{include_dir, Dir};

// Serve an asset under /assets or root of the dist directory.
pub async fn serve_asset(Path(rel): Path<String>) -> impl IntoResponse {
    tracing::debug!(path=%rel, "serve_asset called");
    let base = dist_dir();
    let safe_rel = rel.trim_start_matches('/');
    if safe_rel.contains("..") {
        return error_json(StatusCode::BAD_REQUEST, "invalid path", "invalid_path");
    }
    // Prefer embedded asset if present. The embedded directory stores frontend
    // assets under `assets/`, so try both the raw path and `assets/{path}`.
    #[cfg(feature = "embed_static")]
    {
        if let Some(file) = EMBEDDED_DIST
            .get_file(safe_rel)
            .or_else(|| EMBEDDED_DIST.get_file(&format!("assets/{}", safe_rel)))
        {
            tracing::debug!(path=%safe_rel, embedded=true, "embedded asset found");
            return create_asset_response(file.contents().to_vec(), file.path().to_path_buf());
        }
    }
    let full = base.join(safe_rel);
    tracing::debug!(path=%safe_rel, fs_path=%full.display(), embedded=false, "serving from fs");
    serve_file(full).await
}

pub async fn serve_root_file(Path(name): Path<String>) -> impl IntoResponse {
    tracing::debug!(path=%name, "serve_root_file called");
    let base = dist_dir();
    if name.contains("..") {
        return error_json(StatusCode::BAD_REQUEST, "invalid path", "invalid_path");
    }
    // If a root file is embedded (e.g., favicon or index.html), serve it.
    #[cfg(feature = "embed_static")]
    {
        if let Some(file) = EMBEDDED_DIST.get_file(&name) {
            tracing::debug!(path=%name, embedded=true, "embedded root file found");
            return create_asset_response(file.contents().to_vec(), file.path().to_path_buf());
        }
    }
    // Otherwise try serving from the filesystem.
    let full = base.join(&name);
    tracing::debug!(path=%name, fs_path=%full.display(), embedded=false, "serving root from fs");
    let resp = serve_file(full).await;
    // If the file was not found on disk, fall back to SPA index.html so
    // client-side routes like `/posts` still load the React app.
    if resp.status() == StatusCode::NOT_FOUND {
        return spa_fallback().await.into_response();
    }
    resp
}

// SPA fallback: anything not matching existing /api or static file returns index.html
pub async fn spa_fallback() -> impl IntoResponse {
    // Try embedded index.html first
    #[cfg(feature = "embed_static")]
    {
        if let Some(file) = EMBEDDED_DIST.get_file("index.html") {
            return create_asset_response(file.contents().to_vec(), file.path().to_path_buf());
        }
    }
    let index_path = dist_dir().join("index.html");
    if let Ok(bytes) = fs::read(&index_path).await {
        return create_asset_response(bytes, index_path);
    }
    error_json(StatusCode::NOT_FOUND, "index not found", "not_found")
}

async fn serve_file(path: PathBuf) -> Response {
    match fs::read(&path).await {
        Ok(bytes) => create_asset_response(bytes, path),
        Err(_) => error_json(StatusCode::NOT_FOUND, "not found", "not_found"),
    }
}

fn dist_dir() -> PathBuf {
    if let Ok(p) = std::env::var("DIDHUB_DIST_DIR") {
        return PathBuf::from(p);
    }
    // Default to ./static (same directory where release bundle places frontend)
    PathBuf::from("./static")
}

// Compile-time embed of the frontend `static/` directory. Requires the frontend
// to be built before compiling the Rust server so files exist at compile time.
#[cfg(feature = "embed_static")]
static EMBEDDED_DIST: Dir = include_dir!("../static");

// When `embed_static` is not enabled there is no `EMBEDDED_DIST` static; all
// uses are guarded by `cfg(feature = "embed_static")` above.

fn error_json(status: StatusCode, msg: &str, code: &str) -> Response {
    let body = Json(serde_json::json!({"error": msg, "code": code}));
    let mut resp = (status, body).into_response();
    if let Ok(hv) = header::HeaderValue::from_str(code) {
        resp.headers_mut().insert("x-error-code", hv);
    }
    resp.headers_mut().insert(
        "X-Content-Type-Options",
        header::HeaderValue::from_static("nosniff"),
    );
    resp
}

fn create_asset_response(bytes: Vec<u8>, path: PathBuf) -> Response {
    let mut resp = Response::new(Body::from(bytes));
    let mime = mime_guess::from_path(&path).first_or_octet_stream();
    let mime_str = if mime.type_() == mime_guess::mime::TEXT {
        format!("{}; charset=utf-8", mime)
    } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if matches!(ext, "js" | "mjs" | "cjs") {
            "application/javascript; charset=utf-8".to_string()
        } else {
            mime.to_string()
        }
    } else {
        mime.to_string()
    };
    let hv = header::HeaderValue::from_str(&mime_str)
        .unwrap_or(header::HeaderValue::from_static("application/octet-stream"));
    resp.headers_mut().insert(header::CONTENT_TYPE, hv);
    resp.headers_mut().insert(
        "X-Content-Type-Options",
        header::HeaderValue::from_static("nosniff"),
    );

    // Add cache headers for static assets
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        match ext {
            // Cache static assets aggressively (1 year)
            "js" | "css" | "png" | "jpg" | "jpeg" | "gif" | "svg" | "ico" | "woff" | "woff2"
            | "ttf" | "eot" => {
                resp.headers_mut().insert(
                    "Cache-Control",
                    header::HeaderValue::from_static("public, max-age=31536000, immutable"),
                );
            }
            // Cache HTML with shorter duration (1 hour) since it might change
            "html" => {
                resp.headers_mut().insert(
                    "Cache-Control",
                    header::HeaderValue::from_static("public, max-age=3600"),
                );
            }
            // Don't cache other files
            _ => {
                resp.headers_mut().insert(
                    "Cache-Control",
                    header::HeaderValue::from_static("no-cache"),
                );
            }
        }
    }

    resp
}
