use didhub_backend::handlers::alters_dto::UpdateAlterDto;
use didhub_backend::handlers::relationships::dto::UpdateRelationshipDto;

#[test]
fn update_alter_dto_valid_and_invalid() {
    // valid minimal name
    let dto = UpdateAlterDto {
        name: Some("Alice".to_string()),
        ..Default::default()
    };
    assert!(dto.validate().is_ok());

    // name with control char -> invalid
    let dto = UpdateAlterDto {
        name: Some("Bad\nName".to_string()),
        ..Default::default()
    };
    assert!(dto.validate().is_err());

    // name too long
    let long_name = "a".repeat(201);
    let dto = UpdateAlterDto {
        name: Some(long_name),
        ..Default::default()
    };
    assert!(dto.validate().is_err());

    // description too long
    let long_desc = "d".repeat(2001);
    let dto = UpdateAlterDto {
        description: Some(long_desc),
        ..Default::default()
    };
    assert!(dto.validate().is_err());

    // notes too long
    let long_notes = "n".repeat(5001);
    let dto = UpdateAlterDto {
        notes: Some(long_notes),
        ..Default::default()
    };
    assert!(dto.validate().is_err());

    // invalid owner_user_id
    let dto = UpdateAlterDto {
        owner_user_id: Some("not-a-uuid".to_string()),
        ..Default::default()
    };
    assert!(dto.validate().is_err());
}

#[test]
fn update_relationship_dto_valid_and_invalid() {
    // valid type
    let dto = UpdateRelationshipDto {
        r#type: Some("friend".to_string()),
        side_a_user_id: None,
        side_a_alter_id: None,
        side_b_user_id: None,
        side_b_alter_id: None,
    };
    assert!(dto.validate().is_ok());

    // type empty
    let dto = UpdateRelationshipDto {
        r#type: Some("   ".to_string()),
        side_a_user_id: None,
        side_a_alter_id: None,
        side_b_user_id: None,
        side_b_alter_id: None,
    };
    assert!(dto.validate().is_err());

    // type with internal control char
    let dto = UpdateRelationshipDto {
        r#type: Some("x\tx".to_string()),
        side_a_user_id: None,
        side_a_alter_id: None,
        side_b_user_id: None,
        side_b_alter_id: None,
    };
    assert!(dto.validate().is_err());

    // type too long
    let long_type = "t".repeat(101);
    let dto = UpdateRelationshipDto {
        r#type: Some(long_type),
        side_a_user_id: None,
        side_a_alter_id: None,
        side_b_user_id: None,
        side_b_alter_id: None,
    };
    assert!(dto.validate().is_err());

    // invalid UUID in side_a_user_id
    let dto = UpdateRelationshipDto {
        r#type: None,
        side_a_user_id: Some("bad".to_string()),
        side_a_alter_id: None,
        side_b_user_id: None,
        side_b_alter_id: None,
    };
    assert!(dto.validate().is_err());
}
