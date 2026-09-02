use crate::dto::*;
use crate::error::Result;
use crate::repo::{config_keys as k, ConfigRepo, NavRepo};
use std::sync::Arc;

pub async fn assemble_bundle(
    nav: Arc<dyn NavRepo>,
    config: Arc<dyn ConfigRepo>,
) -> Result<NavBundle> {
    let (sites, cards) = nav.get_bundle().await?;

    let cfg = config
        .get_many(&[
            k::SITE_NAME,
            k::SITE_AVATAR_PATH,
            k::SITE_COPYRIGHT,
            k::SITE_ICP_TEXT,
            k::SITE_ICP_URL,
            k::SITE_POLICE_TEXT,
            k::SITE_POLICE_URL,
            k::DEFAULT_THEME,
        ])
        .await?;

    let icp = match (
        cfg.get(k::SITE_ICP_TEXT).cloned(),
        cfg.get(k::SITE_ICP_URL).cloned(),
    ) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };
    let police = match (
        cfg.get(k::SITE_POLICE_TEXT).cloned(),
        cfg.get(k::SITE_POLICE_URL).cloned(),
    ) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };

    let meta = Meta {
        site_name: cfg
            .get(k::SITE_NAME)
            .cloned()
            .unwrap_or_else(|| "Navigation".into()),
        site_avatar_path: cfg.get(k::SITE_AVATAR_PATH).cloned(),
        site_copyright: cfg.get(k::SITE_COPYRIGHT).cloned().unwrap_or_default(),
        site_icp: icp,
        site_police: police,
        default_theme: cfg
            .get(k::DEFAULT_THEME)
            .cloned()
            .unwrap_or_else(|| "system".into()),
    };

    Ok(NavBundle {
        schema_version: 1,
        meta,
        sites,
        cards,
    })
}
