use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    body::Body,
    extract::Request,
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../../frontend/app/dist"]
#[exclude = ".gitkeep"]
pub struct EmbeddedAssets;

/// Serve embedded frontend assets with proper mime types
pub async fn serve_asset(req: Request) -> Response {
    let path = req.uri().path();
    tracing::debug!(path = %path, "serving embedded asset");
    
    let asset_path = if path.is_empty() || path == "/" {
        tracing::debug!("root path, serving index.html");
        "index.html"
    } else {
        path.trim_start_matches('/')
    };

    match EmbeddedAssets::get(asset_path) {
        Some(content) => {
            let mime = mime_guess::from_path(asset_path)
                .first_raw()
                .unwrap_or("application/octet-stream");

            tracing::debug!(path = asset_path, mime = mime, size = content.data.len(), "serving embedded asset");

            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, mime)],
                Body::from(content.data),
            )
                .into_response()
        }
        None => {
            tracing::debug!(path = asset_path, "asset not found, falling back to index.html");
            // Fallback to index.html for SPA routing
            match EmbeddedAssets::get("index.html") {
                Some(content) => {
                    tracing::debug!("serving index.html for SPA fallback");
                    (
                        StatusCode::OK,
                        [(header::CONTENT_TYPE, "text/html")],
                        Body::from(content.data),
                    )
                        .into_response()
                }
                None => {
                    tracing::error!("index.html not found in embedded assets!");
                    (
                        StatusCode::NOT_FOUND,
                        "Frontend assets not found. Please rebuild the frontend.",
                    )
                        .into_response()
                }
            }
        }
    }
}
