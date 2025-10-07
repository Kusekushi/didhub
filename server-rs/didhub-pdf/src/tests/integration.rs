use crate::*;

#[test]
fn test_full_alter_pdf_workflow() {
    // Create comprehensive alter data
    let alter_data = AlterPdfData {
        id: 42,
        name: "Alex Chen".to_string(),
        age: Some("28".to_string()),
        gender: Some("Non-binary".to_string()),
        pronouns: Some("they/them".to_string()),
        birthday: Some("1996-03-15".to_string()),
        sexuality: Some("Bisexual".to_string()),
        species: Some("Human".to_string()),
        alter_type: Some("Fictive".to_string()),
        job: Some("Software Engineer".to_string()),
        weapon: Some("Laptop".to_string()),
        subsystem: Some("Tech Team".to_string()),
        triggers: Some("Sudden loud noises, flashing lights".to_string()),
        description: Some("A skilled programmer who specializes in Rust development. Very analytical and logical.".to_string()),
        notes: Some("Has been fronting for 3 years. Excellent at problem-solving.".to_string()),
        system_roles: vec!["Host".to_string(), "Protector".to_string()],
        soul_songs: vec!["Digital Love - Daft Punk".to_string(), "Code Monkey - Jonathan Coulton".to_string()],
        interests: vec!["Programming".to_string(), "Mathematics".to_string(), "Science Fiction".to_string()],
        partners: vec!["Jordan".to_string(), "Sam".to_string()],
        parents: vec!["Dr. Chen".to_string()],
        children: vec![],
        affiliations: vec!["Tech Group".to_string(), "Study Group".to_string()],
        is_system_host: true,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    // Test with default config
    let result_default = generate_alter_pdf(&alter_data, None);
    assert!(result_default.is_ok());

    let pdf_data_default = result_default.unwrap();
    assert!(!pdf_data_default.is_empty());
    assert!(pdf_data_default.starts_with(b"%PDF-"));

    // Test with custom config
    let custom_config = PdfConfig {
        title_font_size: 22,
        body_font_size: 12,
        include_metadata: true,
        author: Some("DIDHub".to_string()),
        creator: Some("DIDHub PDF Generator".to_string()),
    };

    let result_custom = generate_alter_pdf(&alter_data, Some(custom_config));
    assert!(result_custom.is_ok());

    let pdf_data_custom = result_custom.unwrap();
    assert!(!pdf_data_custom.is_empty());
    assert!(pdf_data_custom.starts_with(b"%PDF-"));

    // Both should produce valid PDFs
    assert!(pdf_data_default.starts_with(b"%PDF-"));
    assert!(pdf_data_custom.starts_with(b"%PDF-"));
}

#[test]
fn test_full_group_pdf_workflow() {
    let group_data = GroupPdfData {
        id: 10,
        name: "Creative Collective".to_string(),
        description: Some("A group of alters focused on artistic and creative pursuits. They collaborate on various projects including writing, music, and visual arts.".to_string()),
        leaders: Some(r#"["Aria", "Melody", "Sketch"]"#.to_string()),
    };

    let result = generate_group_pdf(&group_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_full_subsystem_pdf_workflow() {
    let subsystem_data = SubsystemPdfData {
        id: 5,
        name: "Emotional Processing Unit".to_string(),
        description: Some("Handles emotional regulation and processing for the system. Contains alters specialized in different aspects of emotional work.".to_string()),
        leaders: Some(r#"["Harmony", "Balance"]"#.to_string()),
    };

    let result = generate_subsystem_pdf(&subsystem_data, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}

#[test]
fn test_pdf_generation_with_realistic_data() {
    // Test with data that resembles real-world usage
    let complex_alter = AlterPdfData {
        id: 123,
        name: "Jordan Rivera".to_string(),
        age: Some("32".to_string()),
        gender: Some("Male".to_string()),
        pronouns: Some("he/him".to_string()),
        birthday: Some("1991-07-22".to_string()),
        sexuality: Some("Gay".to_string()),
        species: Some("Human".to_string()),
        alter_type: Some("Original".to_string()),
        job: Some("Teacher".to_string()),
        weapon: Some("Words".to_string()),
        subsystem: None,
        triggers: Some("Being misunderstood, loud arguments, feeling trapped".to_string()),
        description: Some("The original personality of the system. A compassionate teacher who loves working with children. Has a strong sense of justice and fairness.".to_string()),
        notes: Some("Has been the primary host for 8 years. Recently working on improving communication with other alters.".to_string()),
        system_roles: vec!["Host".to_string(), "Gatekeeper".to_string(), "Mediator".to_string()],
        soul_songs: vec![
            "Hallelujah - Leonard Cohen".to_string(),
            "Imagine - John Lennon".to_string(),
            "What's Going On - Marvin Gaye".to_string(),
        ],
        interests: vec![
            "Education".to_string(),
            "Social Justice".to_string(),
            "Music".to_string(),
            "Reading".to_string(),
            "Cooking".to_string(),
        ],
        partners: vec!["Alex".to_string()],
        parents: vec!["Maria Rivera".to_string(), "Carlos Rivera".to_string()],
        children: vec![],
        affiliations: vec![
            "Education Group".to_string(),
            "LGBTQ+ Support Group".to_string(),
            "Mediation Team".to_string(),
        ],
        is_system_host: true,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    let result = generate_alter_pdf(&complex_alter, None);
    assert!(result.is_ok());

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));

    // PDF should be reasonably sized for this much content
    assert!(pdf_data.len() > 1000);
}

#[test]
fn test_multiple_pdf_generations() {
    // Test generating multiple PDFs in sequence
    let alters = vec![
        AlterPdfData {
            id: 1,
            name: "Alter 1".to_string(),
            age: Some("20".to_string()),
            gender: Some("Female".to_string()),
            pronouns: Some("she/her".to_string()),
            birthday: Some("2003-01-01".to_string()),
            sexuality: Some("Straight".to_string()),
            species: Some("Human".to_string()),
            alter_type: Some("Fictive".to_string()),
            job: Some("Student".to_string()),
            weapon: Some("Books".to_string()),
            subsystem: None,
            triggers: Some("Tests".to_string()),
            description: Some("A studious alter".to_string()),
            notes: Some("Loves learning".to_string()),
            system_roles: vec!["Student".to_string()],
            soul_songs: vec!["Study Music".to_string()],
            interests: vec!["Reading".to_string(), "Writing".to_string()],
            partners: vec![],
            parents: vec![],
            children: vec![],
            affiliations: vec!["Study Group".to_string()],
            is_system_host: false,
            is_dormant: false,
            is_merged: false,
            image_paths: vec![],
        },
        AlterPdfData {
            id: 2,
            name: "Alter 2".to_string(),
            age: Some("25".to_string()),
            gender: Some("Male".to_string()),
            pronouns: Some("he/him".to_string()),
            birthday: Some("1998-06-15".to_string()),
            sexuality: Some("Gay".to_string()),
            species: Some("Human".to_string()),
            alter_type: Some("Original".to_string()),
            job: Some("Programmer".to_string()),
            weapon: Some("Code".to_string()),
            subsystem: None,
            triggers: Some("Bugs".to_string()),
            description: Some("A coding alter".to_string()),
            notes: Some("Debugs everything".to_string()),
            system_roles: vec!["Programmer".to_string()],
            soul_songs: vec!["Algorithm".to_string()],
            interests: vec!["Programming".to_string(), "Algorithms".to_string()],
            partners: vec![],
            parents: vec![],
            children: vec![],
            affiliations: vec!["Tech Group".to_string()],
            is_system_host: true,
            is_dormant: false,
            is_merged: false,
            image_paths: vec![],
        },
    ];

    for alter in &alters {
        let result = generate_alter_pdf(alter, None);
        assert!(
            result.is_ok(),
            "Failed to generate PDF for alter {}",
            alter.name
        );

        let pdf_data = result.unwrap();
        assert!(!pdf_data.is_empty());
        assert!(pdf_data.starts_with(b"%PDF-"));
    }
}

#[test]
fn test_pdf_generation_performance() {
    // Test that PDF generation is reasonably fast
    use std::time::Instant;

    let alter_data = AlterPdfData {
        id: 1,
        name: "Performance Test Alter".to_string(),
        age: Some("30".to_string()),
        gender: Some("Non-binary".to_string()),
        pronouns: Some("they/them".to_string()),
        birthday: Some("1993-01-01".to_string()),
        sexuality: Some("Queer".to_string()),
        species: Some("Human".to_string()),
        alter_type: Some("Fictive".to_string()),
        job: Some("Tester".to_string()),
        weapon: Some("Patience".to_string()),
        subsystem: None,
        triggers: Some("Slow code".to_string()),
        description: Some("An alter dedicated to testing performance".to_string()),
        notes: Some("Ensures everything runs smoothly".to_string()),
        system_roles: vec!["Tester".to_string()],
        soul_songs: vec!["Speed of Sound - Coldplay".to_string()],
        interests: vec!["Performance".to_string(), "Optimization".to_string()],
        partners: vec![],
        parents: vec![],
        children: vec![],
        affiliations: vec!["Performance Team".to_string()],
        is_system_host: false,
        is_dormant: false,
        is_merged: false,
        image_paths: vec![],
    };

    let start = Instant::now();
    let result = generate_alter_pdf(&alter_data, None);
    let duration = start.elapsed();

    assert!(result.is_ok());
    // Should complete in less than 10 seconds
    assert!(
        duration.as_secs() < 10,
        "PDF generation took too long: {:?}",
        duration
    );
}

#[test]
fn test_error_handling_integration() {
    // Test that the system handles errors gracefully

    // Test with empty name (should still work)
    let alter_data = AlterPdfData {
        id: 1,
        name: "".to_string(),
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
    assert!(result.is_ok(), "Should handle empty name gracefully");

    let pdf_data = result.unwrap();
    assert!(!pdf_data.is_empty());
    assert!(pdf_data.starts_with(b"%PDF-"));
}
