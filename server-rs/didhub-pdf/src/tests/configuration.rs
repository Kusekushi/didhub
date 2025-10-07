use crate::*;

#[test]
fn test_pdf_config_default_values() {
    let config = PdfConfig::default();
    assert_eq!(config.title_font_size, 18);
    assert_eq!(config.body_font_size, 12);
    assert_eq!(config.include_metadata, true);
    assert_eq!(config.author, None);
    assert_eq!(config.creator, Some("DIDHub".to_string()));
}

#[test]
fn test_pdf_config_custom_values() {
    let config = PdfConfig {
        title_font_size: 24,
        body_font_size: 14,
        include_metadata: true,
        author: Some("Test Author".to_string()),
        creator: Some("Test Creator".to_string()),
    };

    assert_eq!(config.title_font_size, 24);
    assert_eq!(config.body_font_size, 14);
    assert_eq!(config.include_metadata, true);
    assert_eq!(config.author, Some("Test Author".to_string()));
    assert_eq!(config.creator, Some("Test Creator".to_string()));
}
