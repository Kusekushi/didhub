use didhub_db::Db;
use didhub_db::alters::AlterOperations;
use didhub_error::AppError;
use didhub_db::groups::GroupOperations;
use didhub_db::subsystems::SubsystemOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_middleware::types::CurrentUser;
use crate::upload_dir::UploadDirCache;
use axum::{
    extract::{Extension, Path},
    http::{HeaderMap, HeaderValue},
    response::IntoResponse,
};
use genpdf::{Element};
use genpdf::{elements as genpdf_elements, fonts as genpdf_fonts, style as genpdf_style};
use std::env;
use tracing::{debug, error, info, warn};
use serde_json;

fn get_font_directories() -> Vec<String> {
    let mut dirs = Vec::new();
    
    // Add relative fonts directory first
    dirs.push("./fonts".to_string());
    
    // Platform-specific font directories
    if cfg!(target_os = "windows") {
        // Windows font directories
        if let Ok(windir) = env::var("WINDIR") {
            dirs.push(format!("{}\\Fonts", windir));
        } else {
            dirs.push("C:\\Windows\\Fonts".to_string());
        }
        dirs.push("C:\\Windows\\Fonts".to_string());
    } else if cfg!(target_os = "macos") {
        // macOS font directories
        dirs.push("/System/Library/Fonts".to_string());
        dirs.push("/Library/Fonts".to_string());
        if let Ok(home) = env::var("HOME") {
            dirs.push(format!("{}/Library/Fonts", home));
        }
    } else {
        // Linux/Unix-like systems
        dirs.push("/usr/share/fonts".to_string());
        dirs.push("/usr/share/fonts/TTF".to_string());
        dirs.push("/usr/share/fonts/truetype".to_string());
        dirs.push("/usr/local/share/fonts".to_string());
        if let Ok(home) = env::var("HOME") {
            dirs.push(format!("{}/.fonts", home));
            dirs.push(format!("{}/.local/share/fonts", home));
        }
    }
    
    dirs
}

fn simple_pdf(title: &str, lines: &[String], image_paths: &[String]) -> Result<Vec<u8>, AppError> {
    // Create a new PDF document
    let mut font_family = None;
    
    // Try loading fonts from all platform-appropriate directories
    for font_dir in get_font_directories() {
        if let Ok(ff) = genpdf_fonts::from_files(&font_dir, "Hack", None) {
            font_family = Some(ff);
            break;
        }
        // Also try common font names as fallbacks
        for fallback_font in &["DejaVu Sans", "Liberation Sans", "Arial", "Helvetica"] {
            if let Ok(ff) = genpdf_fonts::from_files(&font_dir, fallback_font, None) {
                font_family = Some(ff);
                break;
            }
        }
        if font_family.is_some() {
            break;
        }
    }
    
    let font_family = font_family.ok_or(AppError::Internal)?;
    let mut doc = genpdf::Document::new(font_family);
    doc.set_title(title);
    
    // Set page margins
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(10);
    doc.set_page_decorator(decorator);

    // Add title
    doc.push(genpdf_elements::Paragraph::new(title).styled(genpdf_style::Style::new().bold().with_font_size(18)));
    doc.push(genpdf_elements::Break::new(1));

    // Add content as paragraphs
    for line in lines {
        doc.push(genpdf_elements::Paragraph::new(line));
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // Add images
    for image_path in image_paths {
        if let Ok(image_data) = std::fs::read(image_path) {
            if let Ok(image) = genpdf::elements::Image::from_reader(std::io::Cursor::new(image_data)) {
                doc.push(image);
                doc.push(genpdf_elements::Break::new(1));
            }
        }
    }

    // Render to bytes
    let mut buffer = Vec::new();
    doc.render(&mut buffer).map_err(|_| AppError::Internal)?;
    
    Ok(buffer)
}

pub async fn export_alter(
    Path(id): Path<i64>,
    Extension(db): Extension<Db>,
    Extension(udc): Extension<UploadDirCache>,
    Extension(_user): Extension<CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    debug!(
        alter_id = %id,
        user_id = %_user.id,
        "Starting alter PDF export"
    );

    let alter = db
        .fetch_alter(id)
        .await
        .map_err(|e| {
            error!(
                alter_id = %id,
                user_id = %_user.id,
                error = %e,
                "Failed to fetch alter for PDF export"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                alter_id = %id,
                user_id = %_user.id,
                "Alter not found for PDF export"
            );
            AppError::NotFound
        })?;

    debug!(
        alter_id = %id,
        user_id = %_user.id,
        alter_name = %alter.name,
        owner_user_id = ?alter.owner_user_id,
        "Alter fetched successfully for PDF export"
    );

    // Get relationships
    let (partner_ids, parent_ids, child_ids, affiliation_ids) = tokio::join!(
        db.partners_of(alter.id),
        db.parents_of(alter.id),
        db.children_of(alter.id),
        db.affiliations_of(alter.id)
    );

    let partner_ids = partner_ids?;
    let parent_ids = parent_ids?;
    let child_ids = child_ids?;
    let affiliation_ids = affiliation_ids?;

    // Fetch alter names for relationships
    let mut partner_names = Vec::new();
    for partner_id in &partner_ids {
        if let Some(partner_alter) = db.fetch_alter(*partner_id).await? {
            partner_names.push(partner_alter.name);
        }
    }

    let mut parent_names = Vec::new();
    for parent_id in &parent_ids {
        if let Some(parent_alter) = db.fetch_alter(*parent_id).await? {
            parent_names.push(parent_alter.name);
        }
    }

    let mut child_names = Vec::new();
    for child_id in &child_ids {
        if let Some(child_alter) = db.fetch_alter(*child_id).await? {
            child_names.push(child_alter.name);
        }
    }

    let mut affiliation_names = Vec::new();
    for affiliation_id in &affiliation_ids {
        if let Some(affiliation_alter) = db.fetch_alter(*affiliation_id).await? {
            affiliation_names.push(affiliation_alter.name);
        }
    }

    let mut lines = Vec::new();

    // Basic information
    lines.push(format!("Name: {}", alter.name));
    if let Some(age) = &alter.age {
        lines.push(format!("Age: {}", age));
    }
    if let Some(gender) = &alter.gender {
        lines.push(format!("Gender: {}", gender));
    }
    if let Some(pronouns) = &alter.pronouns {
        lines.push(format!("Pronouns: {}", pronouns));
    }
    if let Some(birthday) = &alter.birthday {
        lines.push(format!("Birthday: {}", birthday));
    }
    if let Some(sexuality) = &alter.sexuality {
        lines.push(format!("Sexuality: {}", sexuality));
    }

    // Relationships
    if !partner_names.is_empty() {
        lines.push(format!("Partners: {}", partner_names.join(", ")));
    }
    if !parent_names.is_empty() {
        lines.push(format!("Parents: {}", parent_names.join(", ")));
    }
    if !child_names.is_empty() {
        lines.push(format!("Children: {}", child_names.join(", ")));
    }

    // Physical/Character traits
    if let Some(species) = &alter.species {
        lines.push(format!("Species: {}", species));
    }
    if let Some(alter_type) = &alter.alter_type {
        lines.push(format!("Type: {}", alter_type));
    }

    // System information
    if let Some(system_roles) = &alter.system_roles {
        lines.push(format!("System Roles: {}", system_roles));
    }
    lines.push(format!("System Host: {}", if alter.is_system_host == 1 { "Yes" } else { "No" }));
    lines.push(format!("Dormant: {}", if alter.is_dormant == 1 { "Yes" } else { "No" }));
    lines.push(format!("Merged: {}", if alter.is_merged == 1 { "Yes" } else { "No" }));

    // Affiliations
    if !affiliation_names.is_empty() {
        lines.push(format!("Affiliations: {}", affiliation_names.join(", ")));
    }

    // Occupation/Role
    if let Some(job) = &alter.job {
        lines.push(format!("Job: {}", job));
    }
    if let Some(weapon) = &alter.weapon {
        lines.push(format!("Weapon: {}", weapon));
    }
    if let Some(subsystem) = &alter.subsystem {
        lines.push(format!("Subsystem: {}", subsystem));
    }

    // Personal details
    if let Some(soul_songs) = &alter.soul_songs {
        lines.push(format!("Soul Songs: {}", soul_songs));
    }
    if let Some(interests) = &alter.interests {
        lines.push(format!("Interests: {}", interests));
    }
    if let Some(triggers) = &alter.triggers {
        lines.push(format!("Triggers: {}", triggers));
    }
    if let Some(description) = &alter.description {
        lines.push(format!("Description: {}", description));
    }
    if let Some(notes) = &alter.notes {
        lines.push(format!("Notes: {}", notes));
    }

    // Get upload directory for images
    let upload_dir = udc.current().await;

    // Collect image paths
    let mut image_paths = Vec::new();
    if let Some(images) = &alter.images {
        if let Ok(image_list) = serde_json::from_str::<Vec<String>>(images) {
            for image_filename in image_list {
                let full_path = std::path::Path::new(&upload_dir).join(&image_filename);
                if full_path.exists() {
                    image_paths.push(full_path.to_string_lossy().to_string());
                }
            }
        }
    }

    let pdf = simple_pdf(&format!("Alter {}", alter.name), &lines, &image_paths)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=alter-{}.pdf", alter.id)).unwrap(),
    );

    info!(
        alter_id = %id,
        user_id = %_user.id,
        alter_name = %alter.name,
        pdf_size = pdf.len(),
        "Alter PDF export completed successfully"
    );

    Ok((headers, pdf))
}

pub async fn export_group(
    Path(id): Path<i64>,
    Extension(db): Extension<Db>,
    Extension(_user): Extension<CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    debug!(
        group_id = %id,
        user_id = %_user.id,
        "Starting group PDF export"
    );

    let group = db
        .fetch_group(id)
        .await
        .map_err(|e| {
            error!(
                group_id = %id,
                user_id = %_user.id,
                error = %e,
                "Failed to fetch group for PDF export"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                group_id = %id,
                user_id = %_user.id,
                "Group not found for PDF export"
            );
            AppError::NotFound
        })?;

    debug!(
        group_id = %id,
        user_id = %_user.id,
        group_name = %group.name,
        has_description = group.description.is_some(),
        has_leaders = group.leaders.is_some(),
        "Group fetched successfully for PDF export"
    );

    let lines = vec![
        format!("ID: {}", group.id),
        format!("Name: {}", group.name),
        format!("Description: {}", group.description.unwrap_or_default()),
        format!(
            "Leaders JSON: {}",
            group.leaders.unwrap_or_else(|| "[]".into())
        ),
    ];

    let pdf = simple_pdf(&format!("Group {}", group.name), &lines, &[])?;
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=group-{}.pdf", group.id)).unwrap(),
    );

    info!(
        group_id = %id,
        user_id = %_user.id,
        group_name = %group.name,
        pdf_size = pdf.len(),
        "Group PDF export completed successfully"
    );

    Ok((headers, pdf))
}

pub async fn export_subsystem(
    Path(id): Path<i64>,
    Extension(db): Extension<Db>,
    Extension(_user): Extension<CurrentUser>,
) -> Result<impl IntoResponse, AppError> {
    debug!(
        subsystem_id = %id,
        user_id = %_user.id,
        "Starting subsystem PDF export"
    );

    let subsystem = db
        .fetch_subsystem(id)
        .await
        .map_err(|e| {
            error!(
                subsystem_id = %id,
                user_id = %_user.id,
                error = %e,
                "Failed to fetch subsystem for PDF export"
            );
            AppError::Internal
        })?
        .ok_or_else(|| {
            warn!(
                subsystem_id = %id,
                user_id = %_user.id,
                "Subsystem not found for PDF export"
            );
            AppError::NotFound
        })?;

    debug!(
        subsystem_id = %id,
        user_id = %_user.id,
        subsystem_name = %subsystem.name,
        has_description = subsystem.description.is_some(),
        has_leaders = subsystem.leaders.is_some(),
        "Subsystem fetched successfully for PDF export"
    );

    let lines = vec![
        format!("ID: {}", subsystem.id),
        format!("Name: {}", subsystem.name),
        format!("Description: {}", subsystem.description.unwrap_or_default()),
        format!(
            "Leaders JSON: {}",
            subsystem.leaders.unwrap_or_else(|| "[]".into())
        ),
    ];

    let pdf = simple_pdf(&format!("Subsystem {}", subsystem.name), &lines, &[])?;
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "attachment; filename=subsystem-{}.pdf",
            subsystem.id
        ))
        .unwrap(),
    );

    info!(
        subsystem_id = %id,
        user_id = %_user.id,
        subsystem_name = %subsystem.name,
        pdf_size = pdf.len(),
        "Subsystem PDF export completed successfully"
    );

    Ok((headers, pdf))
}
