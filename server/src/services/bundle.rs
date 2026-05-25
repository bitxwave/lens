use crate::dto::*;
use crate::error::Result;
use crate::repo::{ConfigRepo, NavRepo};
use std::sync::Arc;

pub async fn assemble_bundle(
    nav: Arc<dyn NavRepo>,
    config: Arc<dyn ConfigRepo>,
) -> Result<NavBundle> {
    let (sites, cards) = nav.get_bundle().await?;

    let cfg = config
        .get_many(&[
            "site_name",
            "site_avatar_path",
            "site_copyright",
            "site_icp_text",
            "site_icp_url",
            "site_police_text",
            "site_police_url",
            "default_theme",
        ])
        .await?;

    let icp = match (
        cfg.get("site_icp_text").cloned(),
        cfg.get("site_icp_url").cloned(),
    ) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };
    let police = match (
        cfg.get("site_police_text").cloned(),
        cfg.get("site_police_url").cloned(),
    ) {
        (Some(text), Some(url)) => Some(Link { text, url }),
        _ => None,
    };

    let meta = Meta {
        site_name: cfg
            .get("site_name")
            .cloned()
            .unwrap_or_else(|| "Navigation".into()),
        site_avatar_path: cfg.get("site_avatar_path").cloned(),
        site_copyright: cfg.get("site_copyright").cloned().unwrap_or_default(),
        site_icp: icp,
        site_police: police,
        default_theme: cfg
            .get("default_theme")
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
