use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

#[test]
fn argon2_hash_and_verify() {
    let password = b"supersecret";
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password, &salt)
        .expect("hash")
        .to_string();

    let parsed = PasswordHash::new(&hash).expect("parse");
    assert!(argon2.verify_password(password, &parsed).is_ok());
}
