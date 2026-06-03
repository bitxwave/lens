//! Password hashing.
//!
//! New hashes use argon2id (OWASP-recommended since 2023). Existing
//! bcrypt hashes — the format used before this migration — are still
//! verified, so a deployed instance keeps logging operators in. The
//! next `/api/config/password` POST or `lens reset-password` rewrites
//! the stored hash with argon2id, so the field migrates lazily.

use crate::error::{AppError, Result};
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Cost factor for the legacy bcrypt path. Kept here so the constant
/// stays grep-able, even though `hash` no longer produces bcrypt.
pub const LEGACY_BCRYPT_COST: u32 = 12;

/// Produce an argon2id PHC string for `plain`. Argon2id is the OWASP
/// recommended choice for new applications; we use it with default
/// (m=19 MiB, t=2, p=1) parameters from the `argon2` crate — those
/// are within the OWASP "Argon2id" minimum profile.
pub fn hash(plain: &str) -> Result<String> {
    if plain.is_empty() {
        return Err(AppError::Validation("password must not be empty".into()));
    }
    let salt = SaltString::generate(&mut OsRng);
    let argon = Argon2::default();
    argon
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))
}

/// Verify `plain` against `hashed`. Dispatches by PHC prefix:
/// - `$argon2` → argon2 (current format)
/// - `$2a$` / `$2b$` / `$2y$` → bcrypt (legacy; still accepted)
///
/// Anything else returns Ok(false): unknown stored format must not
/// authenticate, but it's also not a 500 — rotating the admin
/// password through `/api/config/password` writes a fresh argon2 hash.
pub fn verify(plain: &str, hashed: &str) -> Result<bool> {
    if hashed.starts_with("$argon2") {
        let parsed = PasswordHash::new(hashed).map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        Ok(Argon2::default()
            .verify_password(plain.as_bytes(), &parsed)
            .is_ok())
    } else if hashed.starts_with("$2a$") || hashed.starts_with("$2b$") || hashed.starts_with("$2y$")
    {
        Ok(bcrypt::verify(plain, hashed)?)
    } else {
        tracing::warn!("unknown password hash format; refusing to verify");
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_roundtrip() {
        let h = hash("hunter2").unwrap();
        assert!(h.starts_with("$argon2"), "expected argon2 hash, got {h}");
        assert!(verify("hunter2", &h).unwrap());
        assert!(!verify("wrong", &h).unwrap());
    }

    #[test]
    fn empty_password_rejected() {
        let err = hash("").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn legacy_bcrypt_hash_still_verifies() {
        // Hash via bcrypt directly — simulates an upgraded instance
        // whose admin_password_hash was written before the argon2 cut.
        let h = bcrypt::hash("hunter2", LEGACY_BCRYPT_COST).unwrap();
        assert!(h.starts_with("$2"));
        assert!(verify("hunter2", &h).unwrap());
        assert!(!verify("wrong", &h).unwrap());
    }

    #[test]
    fn unknown_format_returns_false() {
        // Not a bcrypt or argon2 PHC string — must not auth.
        assert!(!verify("anything", "plaintext-not-a-hash").unwrap());
        assert!(!verify("anything", "$5$rounds=...").unwrap()); // crypt(3) sha256
    }
}
