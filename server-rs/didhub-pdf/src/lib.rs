//! PDF generation utilities for DIDHub
//!
//! This crate provides functionality for generating PDF reports for alters, groups, and subsystems.

use genpdf::error::Error as GenPdfError;
use genpdf::Element;
use genpdf::{elements as genpdf_elements, fonts as genpdf_fonts, style as genpdf_style};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::path::{Path as StdPath, PathBuf};

static FONT_FAMILY_CACHE: OnceCell<genpdf_fonts::FontFamily<genpdf_fonts::FontData>> = OnceCell::new();

/// Data structure for generating alter PDFs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlterPdfData {
    pub id: i64,
    pub name: String,
    pub age: Option<String>,
    pub gender: Option<String>,
    pub pronouns: Option<String>,
    pub birthday: Option<String>,
    pub sexuality: Option<String>,
    pub species: Option<String>,
    pub alter_type: Option<String>,
    pub job: Option<String>,
    pub weapon: Option<String>,
    pub subsystem: Option<String>,
    pub triggers: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub system_roles: Vec<String>,
    pub soul_songs: Vec<String>,
    pub interests: Vec<String>,
    pub partners: Vec<String>,
    pub parents: Vec<String>,
    pub children: Vec<String>,
    pub affiliations: Vec<String>,
    pub is_system_host: bool,
    pub is_dormant: bool,
    pub is_merged: bool,
    pub image_paths: Vec<String>,
}

/// Data structure for generating group PDFs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupPdfData {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub leaders: Option<String>, // JSON string
}

/// Data structure for generating subsystem PDFs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubsystemPdfData {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub leaders: Option<String>, // JSON string
}

/// Configuration options for PDF generation
#[derive(Debug, Clone)]
pub struct PdfConfig {
    pub title_font_size: u8,
    pub body_font_size: u8,
    pub include_metadata: bool,
    pub author: Option<String>,
    pub creator: Option<String>,
}

impl Default for PdfConfig {
    fn default() -> Self {
        Self {
            title_font_size: 18,
            body_font_size: 12,
            include_metadata: true,
            author: None,
            creator: Some("DIDHub".to_string()),
        }
    }
}

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

fn load_default_font_family() -> Result<genpdf_fonts::FontFamily<genpdf_fonts::FontData>, didhub_error::AppError>
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

fn discover_font_family() -> Result<genpdf_fonts::FontFamily<genpdf_fonts::FontData>, didhub_error::AppError> {
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
            tracing::info!(
                font_family = %label,
                font_dir = %canonical_or_original.display(),
                "Using font family for PDF export"
            );
            return Ok(family);
        }
    }

    tracing::error!("Unable to locate a usable font family for PDF export");
    Err(didhub_error::AppError::Internal)
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
                tracing::warn!(
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
    tracing::debug!(
        font_family = %candidate.label,
        font_style = "regular",
        font_path = %regular_path.display(),
        "Loaded PDF font"
    );

    let bold = load_font_if_exists(dir, candidate.label, "bold", candidate.bold)?
        .map(|(font, path)| {
            tracing::debug!(
                font_family = %candidate.label,
                font_style = "bold",
                font_path = %path.display(),
                "Loaded PDF font"
            );
            font
        })
        .unwrap_or_else(|| {
            tracing::warn!(
                font_family = %candidate.label,
                font_dir = %dir.display(),
                "Missing bold font variant, falling back to regular"
            );
            regular.clone()
        });

    let italic = load_font_if_exists(dir, candidate.label, "italic", candidate.italic)?
        .map(|(font, path)| {
            tracing::debug!(
                font_family = %candidate.label,
                font_style = "italic",
                font_path = %path.display(),
                "Loaded PDF font"
            );
            font
        })
        .unwrap_or_else(|| {
            tracing::warn!(
                font_family = %candidate.label,
                font_dir = %dir.display(),
                "Missing italic font variant, falling back to regular"
            );
            regular.clone()
        });

    let bold_italic =
        load_font_if_exists(dir, candidate.label, "bold_italic", candidate.bold_italic)?
            .map(|(font, path)| {
                tracing::debug!(
                    font_family = %candidate.label,
                    font_style = "bold_italic",
                    font_path = %path.display(),
                    "Loaded PDF font"
                );
                font
            })
            .unwrap_or_else(|| {
                tracing::warn!(
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
                tracing::warn!(
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

    match didhub_image::prepare_image_for_pdf(&data) {
        Ok(processed) => Ok(processed),
        Err(_) => {
            tracing::debug!(
                image_path = %image_path,
                "Unable to process image for PDF; using raw bytes"
            );
            Ok(data)
        }
    }
}

/// Generate a PDF for an alter
pub fn generate_alter_pdf(data: &AlterPdfData, config: Option<PdfConfig>) -> Result<Vec<u8>, didhub_error::AppError> {
    let config = config.unwrap_or_else(PdfConfig::default);
    let font_family = load_default_font_family()?;
    let mut doc = genpdf::Document::new(font_family);

    // Set metadata
    if config.include_metadata {
        doc.set_title(format!("Alter {}", data.name));
        // Note: genpdf doesn't support author/creator metadata in this version
    }

    // Set page margins
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(10);
    doc.set_page_decorator(decorator);

    // Title
    doc.push(
        genpdf_elements::Paragraph::new(format!("Alter: {}", data.name))
            .styled(genpdf_style::Style::new().bold().with_font_size(config.title_font_size)),
    );
    doc.push(genpdf_elements::Break::new(1));

    // Basic Information Section
    add_section_header(&mut doc, "Basic Information");
    add_field(&mut doc, "Name", &data.name);
    if let Some(age) = &data.age {
        add_field(&mut doc, "Age", age);
    }
    if let Some(gender) = &data.gender {
        add_field(&mut doc, "Gender", gender);
    }
    if let Some(pronouns) = &data.pronouns {
        add_field(&mut doc, "Pronouns", pronouns);
    }
    if let Some(birthday) = &data.birthday {
        add_field(&mut doc, "Birthday", birthday);
    }
    if let Some(sexuality) = &data.sexuality {
        add_field(&mut doc, "Sexuality", sexuality);
    }
    doc.push(genpdf_elements::Break::new(0.5));

    // Physical/Character Traits Section
    if data.species.is_some() || data.alter_type.is_some() {
        add_section_header(&mut doc, "Physical/Character Traits");
        if let Some(species) = &data.species {
            add_field(&mut doc, "Species", species);
        }
        if let Some(alter_type) = &data.alter_type {
            add_field(&mut doc, "Type", alter_type);
        }
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // Relationships Section
    let has_relationships = !data.partners.is_empty() || !data.parents.is_empty() || !data.children.is_empty() || !data.affiliations.is_empty();
    if has_relationships {
        add_section_header(&mut doc, "Relationships");
        if !data.partners.is_empty() {
            add_list_field(&mut doc, "Partners", &data.partners);
        }
        if !data.parents.is_empty() {
            add_list_field(&mut doc, "Parents", &data.parents);
        }
        if !data.children.is_empty() {
            add_list_field(&mut doc, "Children", &data.children);
        }
        if !data.affiliations.is_empty() {
            add_list_field(&mut doc, "Affiliations", &data.affiliations);
        }
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // System Information Section
    add_section_header(&mut doc, "System Information");
    if !data.system_roles.is_empty() {
        add_list_field(&mut doc, "System Roles", &data.system_roles);
    }
    add_field(&mut doc, "System Host", if data.is_system_host { "Yes" } else { "No" });
    add_field(&mut doc, "Dormant", if data.is_dormant { "Yes" } else { "No" });
    add_field(&mut doc, "Merged", if data.is_merged { "Yes" } else { "No" });
    doc.push(genpdf_elements::Break::new(0.5));

    // Occupation/Role Section
    let has_occupation = data.job.is_some() || data.weapon.is_some() || data.subsystem.is_some();
    if has_occupation {
        add_section_header(&mut doc, "Occupation/Role");
        if let Some(job) = &data.job {
            add_field(&mut doc, "Job", job);
        }
        if let Some(weapon) = &data.weapon {
            add_field(&mut doc, "Weapon", weapon);
        }
        if let Some(subsystem) = &data.subsystem {
            add_field(&mut doc, "Subsystem", subsystem);
        }
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // Personal Details Section
    let has_personal = !data.soul_songs.is_empty() || !data.interests.is_empty() || data.triggers.is_some() || data.description.is_some() || data.notes.is_some();
    if has_personal {
        add_section_header(&mut doc, "Personal Details");
        if !data.soul_songs.is_empty() {
            add_list_field(&mut doc, "Soul Songs", &data.soul_songs);
        }
        if !data.interests.is_empty() {
            add_list_field(&mut doc, "Interests", &data.interests);
        }
        if let Some(triggers) = &data.triggers {
            add_field(&mut doc, "Triggers", triggers);
        }
        if let Some(description) = &data.description {
            add_field(&mut doc, "Description", description);
        }
        if let Some(notes) = &data.notes {
            add_field(&mut doc, "Notes", notes);
        }
        doc.push(genpdf_elements::Break::new(0.5));
    }

    // Add images
    add_images_to_pdf(&mut doc, &data.image_paths);

    // Render to bytes
    let mut buffer = Vec::new();
    doc.render(&mut buffer).map_err(|_| didhub_error::AppError::Internal)?;

    Ok(buffer)
}

/// Generate a PDF for a group
pub fn generate_group_pdf(data: &GroupPdfData, config: Option<PdfConfig>) -> Result<Vec<u8>, didhub_error::AppError> {
    let config = config.unwrap_or_else(PdfConfig::default);
    let font_family = load_default_font_family()?;
    let mut doc = genpdf::Document::new(font_family);

    // Set metadata
    if config.include_metadata {
        doc.set_title(format!("Group {}", data.name));
        // Note: genpdf doesn't support author/creator metadata in this version
    }

    // Set page margins
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(10);
    doc.set_page_decorator(decorator);

    // Title
    doc.push(
        genpdf_elements::Paragraph::new(format!("Group: {}", data.name))
            .styled(genpdf_style::Style::new().bold().with_font_size(config.title_font_size)),
    );
    doc.push(genpdf_elements::Break::new(1));

    // Basic Information
    add_section_header(&mut doc, "Information");
    add_field(&mut doc, "ID", &data.id.to_string());
    add_field(&mut doc, "Name", &data.name);

    if let Some(description) = &data.description {
        add_field(&mut doc, "Description", description);
    }

    if let Some(leaders) = &data.leaders {
        add_field(&mut doc, "Leaders", leaders);
    }

    // Render to bytes
    let mut buffer = Vec::new();
    doc.render(&mut buffer).map_err(|_| didhub_error::AppError::Internal)?;

    Ok(buffer)
}

/// Generate a PDF for a subsystem
pub fn generate_subsystem_pdf(data: &SubsystemPdfData, config: Option<PdfConfig>) -> Result<Vec<u8>, didhub_error::AppError> {
    let config = config.unwrap_or_else(PdfConfig::default);
    let font_family = load_default_font_family()?;
    let mut doc = genpdf::Document::new(font_family);

    // Set metadata
    if config.include_metadata {
        doc.set_title(format!("Subsystem {}", data.name));
        // Note: genpdf doesn't support author/creator metadata in this version
    }

    // Set page margins
    let mut decorator = genpdf::SimplePageDecorator::new();
    decorator.set_margins(10);
    doc.set_page_decorator(decorator);

    // Title
    doc.push(
        genpdf_elements::Paragraph::new(format!("Subsystem: {}", data.name))
            .styled(genpdf_style::Style::new().bold().with_font_size(config.title_font_size)),
    );
    doc.push(genpdf_elements::Break::new(1));

    // Basic Information
    add_section_header(&mut doc, "Information");
    add_field(&mut doc, "ID", &data.id.to_string());
    add_field(&mut doc, "Name", &data.name);

    if let Some(description) = &data.description {
        add_field(&mut doc, "Description", description);
    }

    if let Some(leaders) = &data.leaders {
        add_field(&mut doc, "Leaders", leaders);
    }

    // Render to bytes
    let mut buffer = Vec::new();
    doc.render(&mut buffer).map_err(|_| didhub_error::AppError::Internal)?;

    Ok(buffer)
}

/// Generate a simple PDF with title, text lines, and images
/// This function is kept for backward compatibility
pub fn simple_pdf(title: &str, lines: &[String], image_paths: &[String]) -> Result<Vec<u8>, didhub_error::AppError> {
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
    add_images_to_pdf(&mut doc, image_paths);

    // Render to bytes
    let mut buffer = Vec::new();
    doc.render(&mut buffer).map_err(|_| didhub_error::AppError::Internal)?;

    Ok(buffer)
}

// Helper functions

fn add_section_header(doc: &mut genpdf::Document, title: &str) {
    doc.push(
        genpdf_elements::Paragraph::new(title)
            .styled(genpdf_style::Style::new().bold().with_font_size(14)),
    );
    doc.push(genpdf_elements::Break::new(0.5));
}

fn add_field(doc: &mut genpdf::Document, label: &str, value: &str) {
    let text = format!("{}: {}", label, value);
    doc.push(genpdf_elements::Paragraph::new(text));
    doc.push(genpdf_elements::Break::new(0.25));
}

fn add_list_field(doc: &mut genpdf::Document, label: &str, items: &[String]) {
    let text = format!("{}: {}", label, items.join(", "));
    doc.push(genpdf_elements::Paragraph::new(text));
    doc.push(genpdf_elements::Break::new(0.25));
}

fn add_images_to_pdf(doc: &mut genpdf::Document, image_paths: &[String]) {
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
                        tracing::warn!(
                            error = %err,
                            image_path = %image_path,
                            "Failed to decode image for PDF export"
                        );
                    }
                }
            }
            Err(err) => {
                tracing::warn!(
                    error = %err,
                    image_path = %image_path,
                    "Failed to prepare image for PDF export"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests;
