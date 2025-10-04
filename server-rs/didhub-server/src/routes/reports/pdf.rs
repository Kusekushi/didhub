use crate::{
    routes::common::{normalize_image_list, normalize_string_list},
    upload_dir::UploadDirCache,
};
use axum::{
    extract::{Extension, Path},
    http::{HeaderMap, HeaderValue},
    response::IntoResponse,
};
use didhub_db::alters::AlterOperations;
use didhub_db::groups::GroupOperations;
use didhub_db::relationships::AlterRelationships;
use didhub_db::subsystems::SubsystemOperations;
use didhub_db::Db;
use didhub_error::AppError;
use didhub_middleware::types::CurrentUser;
use genpdf::error::Error as GenPdfError;
use genpdf::Element;
use genpdf::{elements as genpdf_elements, fonts as genpdf_fonts, style as genpdf_style};
use once_cell::sync::OnceCell;
use std::collections::HashSet;
use std::env;
use std::path::{Path as StdPath, PathBuf};
use tracing::{debug, error, info, warn};

static FONT_FAMILY_CACHE: OnceCell<genpdf_fonts::FontFamily<genpdf_fonts::FontData>> =
    OnceCell::new();

struct FontCandidate {
    label: &'static str,
    regular: &'static [&'static str],
    bold: &'static [&'static str],
    italic: &'static [&'static str],
    bold_italic: &'static [&'static str],
}

const FONT_CANDIDATES: &[FontCandidate] = &[
    FontCandidate {
        label: "Hack",
        regular: &["Hack-Regular.ttf", "hack-regular.ttf"],
        bold: &["Hack-Bold.ttf", "hack-bold.ttf"],
        italic: &["Hack-Italic.ttf", "hack-italic.ttf"],
        bold_italic: &["Hack-BoldItalic.ttf", "hack-bolditalic.ttf"],
    },
    FontCandidate {
        label: "DejaVu Sans",
        regular: &["DejaVuSans.ttf"],
        bold: &["DejaVuSans-Bold.ttf"],
        italic: &["DejaVuSans-Oblique.ttf", "DejaVuSans-Italic.ttf"],
        bold_italic: &["DejaVuSans-BoldOblique.ttf", "DejaVuSans-BoldItalic.ttf"],
    },
    FontCandidate {
        label: "Liberation Sans",
        regular: &["LiberationSans-Regular.ttf"],
        bold: &["LiberationSans-Bold.ttf"],
        italic: &["LiberationSans-Italic.ttf"],
        bold_italic: &["LiberationSans-BoldItalic.ttf"],
    },
    FontCandidate {
        label: "Noto Sans",
        regular: &["NotoSans-Regular.ttf"],
        bold: &["NotoSans-Bold.ttf"],
        italic: &["NotoSans-Italic.ttf"],
        bold_italic: &["NotoSans-BoldItalic.ttf"],
    },
    FontCandidate {
        label: "Arial",
        regular: &["arial.ttf", "Arial.ttf"],
        bold: &["arialbd.ttf", "Arial-Bold.ttf"],
        italic: &["ariali.ttf", "Arial-Italic.ttf"],
        bold_italic: &["arialbi.ttf", "Arial-BoldItalic.ttf"],
    },
    FontCandidate {
        label: "Segoe UI",
        regular: &["segoeui.ttf"],
        bold: &["segoeuib.ttf"],
        italic: &["segoeuii.ttf"],
        bold_italic: &["segoeuiz.ttf"],
    },
];

fn get_font_directories() -> Vec<String> {
    let mut dirs = Vec::new();

    // Add relative fonts directory first
    dirs.push("./fonts".to_string());
    dirs.push(format!("{}/fonts", env!("CARGO_MANIFEST_DIR")));

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

fn load_default_font_family() -> Result<genpdf_fonts::FontFamily<genpdf_fonts::FontData>, AppError>
{
    if let Some(family) = FONT_FAMILY_CACHE.get() {
        return Ok(family.clone());
    }

    let family = discover_font_family()?;
    if FONT_FAMILY_CACHE.set(family.clone()).is_err() {
        if let Some(existing) = FONT_FAMILY_CACHE.get() {
            return Ok(existing.clone());
        }
    }

    Ok(family)
}

fn discover_font_family() -> Result<genpdf_fonts::FontFamily<genpdf_fonts::FontData>, AppError> {
    let mut seen = HashSet::new();

    for dir in get_font_directories() {
        let path = PathBuf::from(&dir);
        let canonical_or_original = path.canonicalize().unwrap_or_else(|_| path.clone());

        if !seen.insert(canonical_or_original.clone()) {
            continue;
        }

        if !canonical_or_original.exists() {
            continue;
        }

        if let Some((family, label)) = load_family_from_dir(&canonical_or_original) {
            info!(
                font_family = %label,
                font_dir = %canonical_or_original.display(),
                "Using font family for PDF export"
            );
            return Ok(family);
        }
    }

    error!("Unable to locate a usable font family for PDF export");
    Err(AppError::Internal)
}

fn load_family_from_dir(
    dir: &StdPath,
) -> Option<(
    genpdf_fonts::FontFamily<genpdf_fonts::FontData>,
    &'static str,
)> {
    for candidate in FONT_CANDIDATES {
        match load_family_with_candidate(dir, candidate) {
            Ok(Some(family)) => {
                return Some((family, candidate.label));
            }
            Ok(None) => continue,
            Err(err) => {
                warn!(
                    error = %err,
                    font_family = %candidate.label,
                    font_dir = %dir.display(),
                    "Failed to load font family candidate"
                );
            }
        }
    }
    None
}

fn load_family_with_candidate(
    dir: &StdPath,
    candidate: &FontCandidate,
) -> Result<Option<genpdf_fonts::FontFamily<genpdf_fonts::FontData>>, GenPdfError> {
    let Some((regular, regular_path)) =
        load_font_if_exists(dir, candidate.label, "regular", candidate.regular)?
    else {
        return Ok(None);
    };
    debug!(
        font_family = %candidate.label,
        font_style = "regular",
        font_path = %regular_path.display(),
        "Loaded PDF font"
    );

    let bold = load_font_if_exists(dir, candidate.label, "bold", candidate.bold)?
        .map(|(font, path)| {
            debug!(
                font_family = %candidate.label,
                font_style = "bold",
                font_path = %path.display(),
                "Loaded PDF font"
            );
            font
        })
        .unwrap_or_else(|| {
            warn!(
                font_family = %candidate.label,
                font_dir = %dir.display(),
                "Missing bold font variant, falling back to regular"
            );
            regular.clone()
        });

    let italic = load_font_if_exists(dir, candidate.label, "italic", candidate.italic)?
        .map(|(font, path)| {
            debug!(
                font_family = %candidate.label,
                font_style = "italic",
                font_path = %path.display(),
                "Loaded PDF font"
            );
            font
        })
        .unwrap_or_else(|| {
            warn!(
                font_family = %candidate.label,
                font_dir = %dir.display(),
                "Missing italic font variant, falling back to regular"
            );
            regular.clone()
        });

    let bold_italic =
        load_font_if_exists(dir, candidate.label, "bold_italic", candidate.bold_italic)?
            .map(|(font, path)| {
                debug!(
                    font_family = %candidate.label,
                    font_style = "bold_italic",
                    font_path = %path.display(),
                    "Loaded PDF font"
                );
                font
            })
            .unwrap_or_else(|| {
                warn!(
                    font_family = %candidate.label,
                    font_dir = %dir.display(),
                    "Missing bold italic font variant, falling back to regular"
                );
                regular.clone()
            });

    Ok(Some(genpdf_fonts::FontFamily {
        regular,
        bold,
        italic,
        bold_italic,
    }))
}

fn load_font_if_exists(
    dir: &StdPath,
    family_label: &str,
    style_label: &str,
    file_names: &[&'static str],
) -> Result<Option<(genpdf_fonts::FontData, PathBuf)>, GenPdfError> {
    for name in file_names {
        let path = dir.join(name);
        if !path.exists() {
            continue;
        }

        match genpdf_fonts::FontData::load(&path, None) {
            Ok(font) => return Ok(Some((font, path))),
            Err(err) => {
                warn!(
                    error = %err,
                    font_family = %family_label,
                    font_style = %style_label,
                    font_path = %path.display(),
                    "Failed to parse font file"
                );
            }
        }
    }

    Ok(None)
}

fn prepare_image_for_pdf(image_path: &str) -> Result<Vec<u8>, String> {
    let data =
        std::fs::read(image_path).map_err(|err| format!("failed to read image data: {err}"))?;

    match image::load_from_memory(&data) {
        Ok(image) => {
            if !image.color().has_alpha() {
                return Ok(data);
            }

            debug!(
                image_path = %image_path,
                "Flattening image alpha channel for PDF export"
            );

            let rgba_image = image.to_rgba8();
            let flattened = flatten_rgba_to_rgb(&rgba_image);
            let mut encoded = std::io::Cursor::new(Vec::new());

            image::DynamicImage::ImageRgb8(flattened)
                .write_to(&mut encoded, image::ImageFormat::Png)
                .map_err(|err| format!("failed to encode flattened image: {err}"))?;

            Ok(encoded.into_inner())
        }
        Err(err) => {
            debug!(
                error = %err,
                image_path = %image_path,
                "Unable to decode image when preparing for PDF; using raw bytes"
            );
            Ok(data)
        }
    }
}

fn flatten_rgba_to_rgb(rgba_image: &image::RgbaImage) -> image::RgbImage {
    let (width, height) = rgba_image.dimensions();
    let mut rgb_image = image::RgbImage::new(width, height);

    for (x, y, pixel) in rgba_image.enumerate_pixels() {
        let [r, g, b, a] = pixel.0;
        if a == 0 {
            rgb_image.put_pixel(x, y, image::Rgb([255, 255, 255]));
            continue;
        }

        if a == u8::MAX {
            rgb_image.put_pixel(x, y, image::Rgb([r, g, b]));
            continue;
        }

        let alpha = f32::from(a) / 255.0;
        let inv_alpha = 1.0 - alpha;

        let blend = |channel: u8| -> u8 {
            ((f32::from(channel) * alpha) + (255.0 * inv_alpha))
                .round()
                .clamp(0.0, 255.0) as u8
        };

        rgb_image.put_pixel(x, y, image::Rgb([blend(r), blend(g), blend(b)]));
    }

    rgb_image
}

fn simple_pdf(title: &str, lines: &[String], image_paths: &[String]) -> Result<Vec<u8>, AppError> {
    let font_family = load_default_font_family()?;
    let mut doc = genpdf::Document::new(font_family);
    doc.set_title(title);

    // Set page margins
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(10);
    doc.set_page_decorator(decorator);

    // Add title
    doc.push(
        genpdf_elements::Paragraph::new(title)
            .styled(genpdf_style::Style::new().bold().with_font_size(18)),
    );
    doc.push(genpdf_elements::Break::new(1));

    // Add content as paragraphs
    for line in lines {
        doc.push(genpdf_elements::Paragraph::new(line));
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // Add images
    for (index, image_path) in image_paths.iter().enumerate() {
        match prepare_image_for_pdf(image_path) {
            Ok(image_bytes) => {
                match genpdf::elements::Image::from_reader(std::io::Cursor::new(image_bytes)) {
                    Ok(mut image) => {
                        image.set_alignment(genpdf::Alignment::Center);
                        if index == 0 {
                            image.set_scale(genpdf::Scale::new(1.0, 1.0));
                        } else {
                            image.set_scale(genpdf::Scale::new(0.5, 0.5));
                        }

                        doc.push(image);
                        doc.push(genpdf_elements::Break::new(if index == 0 {
                            1.5
                        } else {
                            0.75
                        }));
                    }
                    Err(err) => {
                        warn!(
                            error = %err,
                            image_path = %image_path,
                            "Failed to decode image for PDF export"
                        );
                    }
                }
            }
            Err(err) => {
                warn!(
                    error = %err,
                    image_path = %image_path,
                    "Failed to prepare image for PDF export"
                );
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

    let system_roles = normalize_string_list(alter.system_roles.as_deref());
    let soul_songs = normalize_string_list(alter.soul_songs.as_deref());
    let interests = normalize_string_list(alter.interests.as_deref());
    let images = normalize_image_list(alter.images.as_deref());

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
    if !system_roles.is_empty() {
        lines.push(format!("System Roles: {}", system_roles.join(", ")));
    }
    lines.push(format!(
        "System Host: {}",
        if alter.is_system_host == 1 {
            "Yes"
        } else {
            "No"
        }
    ));
    lines.push(format!(
        "Dormant: {}",
        if alter.is_dormant == 1 { "Yes" } else { "No" }
    ));
    lines.push(format!(
        "Merged: {}",
        if alter.is_merged == 1 { "Yes" } else { "No" }
    ));

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
    if !soul_songs.is_empty() {
        lines.push(format!("Soul Songs: {}", soul_songs.join(", ")));
    }
    if !interests.is_empty() {
        lines.push(format!("Interests: {}", interests.join(", ")));
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
    let mut image_paths: Vec<String> = Vec::new();
    if !images.is_empty() {
        for image in &images {
            let trimmed = image.trim();
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                // Skip remote images for PDF embedding.
                continue;
            }
            let relative = if let Some(rest) = trimmed.strip_prefix("/uploads/") {
                rest
            } else {
                trimmed.trim_start_matches('/')
            };
            let full_path = std::path::Path::new(&upload_dir).join(relative);
            if full_path.exists() {
                image_paths.push(full_path.to_string_lossy().to_string());
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
