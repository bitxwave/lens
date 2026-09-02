use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use tower_sessions::Session;

use crate::auth::session::SESSION_KEY_AUTHED;
use crate::error::AppError;

pub struct RequireAuth;

impl<S> FromRequestParts<S> for RequireAuth
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let session = Session::from_request_parts(parts, state)
            .await
            .map_err(|_| AppError::Unauthenticated)?;
        let authed = session
            .get::<bool>(SESSION_KEY_AUTHED)
            .await
            .map_err(|_| AppError::Unauthenticated)?
            .unwrap_or(false);
        if authed {
            Ok(Self)
        } else {
            Err(AppError::Unauthenticated)
        }
    }
}
