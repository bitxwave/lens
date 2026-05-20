//! bcrypt-based password hashing.

use crate::error::{AppError, Result};

pub const BCRYPT_COST: u32 = 12;

pub fn hash(plain: &str) -> Result<String> {
    if plain.is_empty() {
        return Err(AppError::Validation("password must not be empty".into()));
    }
    Ok(bcrypt::hash(plain, BCRYPT_COST)?)
}

pub fn verify(plain: &str, hashed: &str) -> Result<bool> {
    Ok(bcrypt::verify(plain, hashed)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_then_verify_roundtrip() {
        let h = hash("hunter2").unwrap();
        assert!(verify("hunter2", &h).unwrap());
        assert!(!verify("wrong", &h).unwrap());
    }

    #[test]
    fn empty_password_rejected() {
        let err = hash("").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }
}
