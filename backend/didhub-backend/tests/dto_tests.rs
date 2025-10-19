use didhub_backend::handlers::users::dto::{CreateUserDto, UpdateUserDto};

#[test]
fn create_user_dto_validation() {
    let good = CreateUserDto {
        username: "alice".to_string(),
        password_hash: "hunter2abcd".to_string(),
        display_name: Some("Alice".to_string()),
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(good.validate().is_ok());

    let good_no_display = CreateUserDto {
        username: "alice2".to_string(),
        password_hash: "hunter2abcd".to_string(),
        display_name: None,
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(good_no_display.validate().is_ok());

    let bad_username = CreateUserDto {
        username: "   ".to_string(),
        password_hash: "longenough".to_string(),
        display_name: Some("Bob".to_string()),
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(bad_username.validate().is_err());

    let short_pass = CreateUserDto {
        username: "bob".to_string(),
        password_hash: "short".to_string(),
        display_name: Some("Bob".to_string()),
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(short_pass.validate().is_err());

    let empty_display = CreateUserDto {
        username: "charlie".to_string(),
        password_hash: "longenough".to_string(),
        display_name: Some("   ".to_string()),
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(empty_display.validate().is_err());
}

#[test]
fn update_user_dto_validation() {
    let dto = UpdateUserDto {
        display_name: None,
        about_me: None,
        is_admin: None,
        is_system: None,
        is_approved: None,
    };
    assert!(dto.validate().is_ok());
}
