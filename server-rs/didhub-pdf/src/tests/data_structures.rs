use crate::*;
use serde_json;

#[test]
fn test_alter_pdf_data_serialization() {
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

    // Test serialization
    let json = serde_json::to_string(&alter_data).unwrap();
    assert!(json.contains("\"name\":\"Test Alter\""));
    assert!(json.contains("\"id\":1"));

    // Test deserialization
    let deserialized: AlterPdfData = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.id, alter_data.id);
    assert_eq!(deserialized.name, alter_data.name);
}

#[test]
fn test_pdf_config_default() {
    let config = PdfConfig::default();
    assert_eq!(config.title_font_size, 18);
    assert_eq!(config.body_font_size, 12);
    assert_eq!(config.include_metadata, true);
    assert_eq!(config.author, None);
    assert_eq!(config.creator, Some("DIDHub".to_string()));
}
