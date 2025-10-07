use crate::*;
use std::fs;

#[test]
fn test_simple_pdf_generation() {
    let title = "Test PDF";
    let lines = vec![
        "Line 1".to_string(),
        "Line 2".to_string(),
        "Line 3".to_string(),
    ];
    let image_paths = Vec::new();

    let result = simple_pdf(title, &lines, &image_paths);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());

    // PDF files should start with %PDF-
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_simple_pdf_with_images() {
    let title = "Test PDF with Images";
    let lines = vec!["This PDF contains images".to_string()];

    // Create a temporary test image file
    let temp_dir = std::env::temp_dir();
    let image_path = temp_dir.join("test_image.png");

    // Create a minimal PNG file (1x1 pixel)
    let png_data = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x37, 0x6E, 0xF9, 0x24, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, // IEND chunk
        0x60, 0x82,
    ];

    fs::write(&image_path, &png_data).expect("Failed to create test image");

    let image_paths = vec![image_path.to_string_lossy().to_string()];

    let result = simple_pdf(title, &lines, &image_paths);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));

    // Clean up
    let _ = fs::remove_file(&image_path);
}

#[test]
fn test_alter_pdf_generation() {
    let alter_data = AlterPdfData {
        id: 1,
        name: "Test Alter".to_string(),
        age: Some("25".to_string()),
        gender: Some("Non-binary".to_string()),
        pronouns: Some("they/them".to_string()),
        birthday: Some("1999-01-01".to_string()),
        sexuality: Some("Queer".to_string()),
        species: Some("Human".to_string()),
        alter_type: Some("Fictive".to_string()),
        job: Some("Developer".to_string()),
        weapon: Some("Keyboard".to_string()),
        subsystem: None,
        triggers: Some("Loud noises".to_string()),
        description: Some("A test alter".to_string()),
        notes: Some("Test notes".to_string()),
        system_roles: vec!["Host".to_string()],
        soul_songs: vec!["Test Song".to_string()],
        interests: vec!["Programming".to_string()],
        partners: vec!["Partner 1".to_string()],
        parents: vec!["Parent 1".to_string()],
        children: vec!["Child 1".to_string()],
        affiliations: vec!["Group 1".to_string()],
        is_system_host: true,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    let result = generate_alter_pdf(&alter_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_alter_pdf_with_custom_config() {
    let alter_data = AlterPdfData {
        id: 1,
        name: "Test Alter".to_string(),
        age: Some("25".to_string()),
        gender: Some("Non-binary".to_string()),
        pronouns: Some("they/them".to_string()),
        birthday: Some("1999-01-01".to_string()),
        sexuality: Some("Queer".to_string()),
        species: Some("Human".to_string()),
        alter_type: Some("Fictive".to_string()),
        job: Some("Developer".to_string()),
        weapon: Some("Keyboard".to_string()),
        subsystem: None,
        triggers: Some("Loud noises".to_string()),
        description: Some("A test alter".to_string()),
        notes: Some("Test notes".to_string()),
        system_roles: vec!["Host".to_string()],
        soul_songs: vec!["Test Song".to_string()],
        interests: vec!["Programming".to_string()],
        partners: vec!["Partner 1".to_string()],
        parents: vec!["Parent 1".to_string()],
        children: vec!["Child 1".to_string()],
        affiliations: vec!["Group 1".to_string()],
        is_system_host: true,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    let config = PdfConfig {
        title_font_size: 20,
        body_font_size: 12,
        include_metadata: true,
        author: Some("Test Author".to_string()),
        creator: Some("Test Creator".to_string()),
    };

    let result = generate_alter_pdf(&alter_data, Some(config));
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_alter_pdf_minimal_data() {
    let alter_data = AlterPdfData {
        id: 1,
        name: "Minimal Alter".to_string(),
        age: None,
        gender: None,
        pronouns: None,
        birthday: None,
        sexuality: None,
        species: None,
        alter_type: None,
        job: None,
        weapon: None,
        subsystem: None,
        triggers: None,
        description: None,
        notes: None,
        system_roles: vec![],
        soul_songs: vec![],
        interests: vec![],
        partners: vec![],
        parents: vec![],
        children: vec![],
        affiliations: vec![],
        is_system_host: false,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    let result = generate_alter_pdf(&alter_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_group_pdf_generation() {
    let group_data = GroupPdfData {
        id: 1,
        name: "Test Group".to_string(),
        description: Some("A test group".to_string()),
        leaders: Some(r#"["Leader 1", "Leader 2"]"#.to_string()),
    };

    let result = generate_group_pdf(&group_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_group_pdf_minimal_data() {
    let group_data = GroupPdfData {
        id: 1,
        name: "Minimal Group".to_string(),
        description: None,
        leaders: None,
    };

    let result = generate_group_pdf(&group_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_subsystem_pdf_generation() {
    let subsystem_data = SubsystemPdfData {
        id: 1,
        name: "Test Subsystem".to_string(),
        description: Some("A test subsystem".to_string()),
        leaders: Some(r#"["Leader 1"]"#.to_string()),
    };

    let result = generate_subsystem_pdf(&subsystem_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_subsystem_pdf_minimal_data() {
    let subsystem_data = SubsystemPdfData {
        id: 1,
        name: "Minimal Subsystem".to_string(),
        description: None,
        leaders: None,
    };

    let result = generate_subsystem_pdf(&subsystem_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_pdf_generation_with_invalid_image() {
    let title = "Test PDF";
    let lines = vec!["Test content".to_string()];
    let image_paths = vec!["nonexistent_image.png".to_string()];

    let result = simple_pdf(title, &lines, &image_paths);
    // Should still succeed even with invalid images (they're just logged as warnings)
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_empty_simple_pdf() {
    let title = "Empty PDF";
    let lines = vec![];
    let image_paths = vec![];

    let result = simple_pdf(title, &lines, &image_paths);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}