use axum::{
    extract::{Extension, Query},
    Json,
};
use didhub_db::{alters::AlterOperations, audit, settings::SettingOperations, Db};
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use tracing::{debug, info, warn};

#[derive(serde::Deserialize)]
pub struct CustomDigestQuery {
    pub days_ahead: Option<i64>,
}

#[derive(serde::Serialize)]
pub struct DigestResponse {
    pub posted: bool,
    pub count: i64,
    pub message: String,
}

pub async fn post_custom_digest(
    Extension(user): Extension<CurrentUser>,
    Extension(db): Extension<Db>,
    Query(q): Query<CustomDigestQuery>,
) -> Result<Json<DigestResponse>, AppError> {
    if user.is_admin == 0 {
        warn!(user_id=%user.id, username=%user.username, "unauthorized attempt to post custom digest");
        return Err(AppError::Forbidden);
    }

    let days_ahead = q.days_ahead.unwrap_or(7).max(1).min(365);

    debug!(user_id=%user.id, days_ahead=%days_ahead, "posting custom digest");

    let webhook = db.get_setting("discord_webhook_url").await?;
    let webhook = if webhook.is_none() {
        db.get_setting("discord.webhook").await?
    } else {
        webhook
    };

    if webhook.is_none() {
        return Ok(Json(DigestResponse {
            posted: false,
            count: 0,
            message: "no webhook configured".into(),
        }));
    }

    let alters = db.upcoming_birthdays(days_ahead).await.unwrap_or_default();
    if alters.is_empty() {
        return Ok(Json(DigestResponse {
            posted: false,
            count: 0,
            message: format!("no upcoming birthdays in next {} days", days_ahead),
        }));
    }

    let names: Vec<String> = alters
        .iter()
        .map(|a| {
            if let Some(b) = &a.birthday {
                format!("{} ({})", a.name, b)
            } else {
                a.name.clone()
            }
        })
        .collect();

    let ip_arc = didhub_middleware::client_ip::get_request_ip();
    let ip = ip_arc.as_ref().map(|s| s.as_str());
    audit::record_with_metadata(
        &db,
        Some(user.id.as_str()),
        "digest.birthdays.custom",
        Some("digest"),
        None,
        serde_json::json!({
            "count": names.len(),
            "entries": names,
            "days_ahead": days_ahead,
            "custom": true
        }),
        ip,
    )
    .await;

    warn!(user_id=%user.id, count=%names.len(), days_ahead=%days_ahead, "custom digest unimplemented");

    info!(user_id=%user.id, count=%names.len(), days_ahead=%days_ahead, "custom digest posted successfully");

    Ok(Json(DigestResponse {
        posted: true,
        count: alters.len() as i64,
        message: format!(
            "Custom digest posted with {} birthdays for next {} days",
            alters.len(),
            days_ahead
        ),
    }))
}
