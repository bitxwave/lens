use crate::error::{AppError, Result};
use bytes::Bytes;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const TTL: Duration = Duration::from_secs(7 * 24 * 3600); // 7 days
const MAX_BYTES: u64 = 256 * 1024; // 256 KiB

pub struct FaviconService {
    cache_dir: PathBuf,
    http: reqwest::Client,
}

impl FaviconService {
    pub fn new(cache_dir: PathBuf) -> Self {
        // One-shot at startup; staying sync keeps `new` non-async.
        std::fs::create_dir_all(&cache_dir).ok();
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .user_agent("lens-favicon/0.1")
            .build()
            .expect("http client");
        Self { cache_dir, http }
    }

    pub async fn fetch(&self, host: &str) -> Result<(String, Bytes)> {
        if !is_safe_host(host) {
            return Err(AppError::Validation("bad host".into()));
        }
        let cached = self.cache_dir.join(host);
        if let Ok(meta) = tokio::fs::metadata(&cached).await {
            if let Ok(age) = SystemTime::now().duration_since(meta.modified()?) {
                if age < TTL {
                    let bytes = Bytes::from(tokio::fs::read(&cached).await?);
                    return Ok(("image/png".into(), bytes));
                }
            }
        }
        let url = format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if !resp.status().is_success() {
            return Err(AppError::NotFound);
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(AppError::Validation("favicon too large".into()));
        }
        tokio::fs::write(&cached, &bytes).await?;
        Ok(("image/png".into(), bytes))
    }
}

fn is_safe_host(host: &str) -> bool {
    !host.is_empty()
        && host.len() <= 253
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
}

pub fn cache_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("icons").join("_cache")
}
