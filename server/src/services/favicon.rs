use crate::error::{AppError, Result};
use bytes::Bytes;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const TTL: Duration = Duration::from_secs(7 * 24 * 3600); // 7 days
const MAX_BYTES: u64 = 256 * 1024; // 256 KiB
const HOST_PLACEHOLDER: &str = "{host}";

/// Default favicon provider. The `{host}` placeholder is substituted at
/// fetch time. Operators on intranet deployments where Google is
/// unreachable can override via `FAVICON_PROVIDER_URL`.
pub const DEFAULT_PROVIDER_URL: &str = "https://www.google.com/s2/favicons?domain={host}&sz=64";

pub struct FaviconService {
    cache_dir: PathBuf,
    http: reqwest::Client,
    provider_url: String,
}

impl FaviconService {
    pub fn new(cache_dir: PathBuf, provider_url: String) -> Self {
        // One-shot at startup; staying sync keeps `new` non-async.
        std::fs::create_dir_all(&cache_dir).ok();
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .user_agent("lens-favicon/0.1")
            .build()
            .expect("http client");
        Self {
            cache_dir,
            http,
            provider_url,
        }
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
        let url = self.provider_url.replace(HOST_PLACEHOLDER, host);
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

/// True when `host` is a plausible registered DNS hostname suitable to
/// hand to a third-party favicon provider.
///
/// Rejects:
/// - empty / overlong (>253 chars; RFC 1035) input
/// - characters outside `[A-Za-z0-9.-]`
/// - bare IPv4 / IPv6 addresses (we don't want to redirect a literal
///   intranet IP into a public lookup, even though the request goes to
///   the provider — the provider then surfaces "no icon for 192.168.1.1"
///   which is misleading)
/// - hostnames with no dot (single labels like "localhost"), and
/// - leading or trailing dots / hyphens
fn is_safe_host(host: &str) -> bool {
    if host.is_empty() || host.len() > 253 {
        return false;
    }
    if !host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return false;
    }
    if host.starts_with('.') || host.ends_with('.') {
        return false;
    }
    if host.starts_with('-') || host.ends_with('-') {
        return false;
    }
    if !host.contains('.') {
        return false;
    }
    if host.parse::<IpAddr>().is_ok() {
        return false;
    }
    true
}

pub fn cache_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("icons").join("_cache")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_hosts() {
        assert!(is_safe_host("example.com"));
        assert!(is_safe_host("api.github.com"));
        assert!(is_safe_host("a.b.c.d.example.co.uk"));
        assert!(is_safe_host("xn--mnchen-3ya.de")); // punycode (München)
    }

    #[test]
    fn rejects_empty_and_overlong() {
        assert!(!is_safe_host(""));
        let long = "a.".repeat(150) + "com";
        assert!(!is_safe_host(&long));
    }

    #[test]
    fn rejects_unsupported_chars() {
        assert!(!is_safe_host("exa mple.com"));
        assert!(!is_safe_host("a/b.com"));
        assert!(!is_safe_host("foo;bar.com"));
        assert!(!is_safe_host("foo_bar.com")); // underscore not allowed in hostnames
    }

    #[test]
    fn rejects_single_label() {
        assert!(!is_safe_host("localhost"));
        assert!(!is_safe_host("router"));
    }

    #[test]
    fn rejects_leading_or_trailing_punct() {
        assert!(!is_safe_host(".example.com"));
        assert!(!is_safe_host("example.com."));
        assert!(!is_safe_host("-example.com"));
        assert!(!is_safe_host("example.com-"));
    }

    #[test]
    fn rejects_bare_ips() {
        assert!(!is_safe_host("192.168.1.1"));
        assert!(!is_safe_host("8.8.8.8"));
        assert!(!is_safe_host("0.0.0.0"));
        // IPv6 needs colons → already rejected by char allow-list, no
        // dedicated assert. Keep this test focused on IPv4 since that's
        // what the dot-only allow-list lets through.
    }

    #[test]
    fn provider_url_substitution() {
        let url = DEFAULT_PROVIDER_URL.replace(HOST_PLACEHOLDER, "example.com");
        assert!(url.contains("domain=example.com"));
        assert!(!url.contains(HOST_PLACEHOLDER));
    }
}
