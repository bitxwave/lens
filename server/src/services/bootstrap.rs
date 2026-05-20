use crate::auth::password;
use crate::error::Result;
use crate::repo::ConfigRepo;
use rand::distributions::{Alphanumeric, DistString};
use std::path::Path;
use std::sync::Arc;

const PASSWORD_LEN: usize = 24;

pub enum BootstrapOutcome {
    AlreadySet,
    SetFromEnv,
    Generated(String),
}

pub async fn ensure_admin_password(
    config: Arc<dyn ConfigRepo>,
    data_dir: &Path,
    env_password: Option<String>,
) -> Result<BootstrapOutcome> {
    if config.get("admin_password_hash").await?.is_some() {
        return Ok(BootstrapOutcome::AlreadySet);
    }

    let now = chrono::Utc::now().timestamp_millis().to_string();

    if let Some(pw) = env_password.filter(|s| !s.is_empty()) {
        let hash = password::hash(&pw)?;
        config
            .upsert_many(&[
                ("admin_password_hash", &hash),
                ("admin_password_updated_at", &now),
            ])
            .await?;
        tracing::warn!("Admin password set from env. Please change it via UI immediately.");
        return Ok(BootstrapOutcome::SetFromEnv);
    }

    let pw = Alphanumeric.sample_string(&mut rand::thread_rng(), PASSWORD_LEN);
    let hash = password::hash(&pw)?;
    config
        .upsert_many(&[
            ("admin_password_hash", &hash),
            ("admin_password_updated_at", &now),
        ])
        .await?;

    let path = data_dir.join("INITIAL_PASSWORD.txt");
    let body = format!(
        "Initial admin password (single use):\n{pw}\n\n\
        After logging in and changing the password via UI, this file is deleted automatically.\n"
    );
    std::fs::write(&path, body)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        std::fs::set_permissions(&path, perms)?;
    }
    tracing::warn!(?path, "Generated initial admin password — see file above");
    tracing::warn!("INITIAL ADMIN PASSWORD: {pw}");

    Ok(BootstrapOutcome::Generated(pw))
}
