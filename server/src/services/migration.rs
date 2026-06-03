use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::{config_keys as ck, ConfigRepo, NavRepo};
use serde::Deserialize;
use std::sync::Arc;

const BOOTSTRAP_JSON: &str = include_str!("../../bootstrap.json");

#[derive(Deserialize)]
struct BootstrapDoc {
    #[serde(rename = "schemaVersion")]
    _schema_version: i64,
    meta: BootstrapMeta,
    sites: Vec<BootstrapSite>,
    #[serde(default)]
    groups: Vec<BootstrapGroup>,
    #[serde(default)]
    items: Vec<BootstrapItem>,
}

#[derive(Deserialize)]
struct BootstrapMeta {
    #[serde(rename = "siteName")]
    site_name: String,
    #[serde(rename = "siteAvatarPath")]
    site_avatar_path: Option<String>,
    #[serde(rename = "siteCopyright")]
    site_copyright: String,
    #[serde(rename = "siteIcp")]
    site_icp: Option<Link>,
    #[serde(rename = "sitePolice")]
    site_police: Option<Link>,
    #[serde(rename = "defaultTheme")]
    default_theme: String,
}

#[derive(Deserialize)]
struct BootstrapSite {
    value: String,
    name: String,
    #[serde(default)]
    is_default: bool,
    #[serde(default)]
    #[allow(dead_code)]
    sort_order: i64,
}

#[derive(Deserialize)]
struct BootstrapGroup {
    slug: String,
    name: String,
    #[serde(default)]
    #[allow(dead_code)]
    sort_order: i64,
}

#[derive(Deserialize)]
struct BootstrapItem {
    name: String,
    #[serde(rename = "groupSlug")]
    group_slug: Option<String>,
    #[serde(rename = "iconKind")]
    icon_kind: IconKind,
    #[serde(rename = "iconValue")]
    icon_value: String,
    #[serde(default)]
    links: std::collections::BTreeMap<String, String>,
}

pub async fn seed_if_empty(nav: Arc<dyn NavRepo>, config: Arc<dyn ConfigRepo>) -> Result<()> {
    let (sites, cards) = nav.get_bundle().await?;
    if !sites.is_empty() || !cards.is_empty() {
        return Ok(());
    }
    let doc: BootstrapDoc =
        serde_json::from_str(BOOTSTRAP_JSON).map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;

    // Meta → config kv
    let mut pairs: Vec<(&str, String)> = Vec::new();
    pairs.push((ck::SITE_NAME, doc.meta.site_name));
    if let Some(p) = doc.meta.site_avatar_path {
        pairs.push((ck::SITE_AVATAR_PATH, p));
    }
    pairs.push((ck::SITE_COPYRIGHT, doc.meta.site_copyright));
    pairs.push((ck::DEFAULT_THEME, doc.meta.default_theme));
    if let Some(l) = doc.meta.site_icp {
        pairs.push((ck::SITE_ICP_TEXT, l.text));
        pairs.push((ck::SITE_ICP_URL, l.url));
    }
    if let Some(l) = doc.meta.site_police {
        pairs.push((ck::SITE_POLICE_TEXT, l.text));
        pairs.push((ck::SITE_POLICE_URL, l.url));
    }
    let pair_refs: Vec<(&str, &str)> = pairs.iter().map(|(k, v)| (*k, v.as_str())).collect();
    config.upsert_many(&pair_refs).await?;

    // Sites
    for s in doc.sites {
        nav.create_site(SitePayload {
            value: s.value,
            name: s.name,
            is_default: s.is_default,
        })
        .await?;
    }

    // Folders (track new card id by slug).
    let mut folder_id_by_slug = std::collections::HashMap::new();
    for g in doc.groups {
        let folder = nav
            .create_card(CardPayload {
                kind: CardKind::Folder,
                parent_id: None,
                name: g.name,
                slug: Some(g.slug.clone()),
                icon_kind: None,
                icon_value: None,
                description: None,
                links: Default::default(),
            })
            .await?;
        folder_id_by_slug.insert(g.slug, folder.id);
    }

    // Items
    for it in doc.items {
        let parent_id = it
            .group_slug
            .and_then(|s| folder_id_by_slug.get(&s).copied());
        nav.create_card(CardPayload {
            kind: CardKind::Item,
            parent_id,
            name: it.name,
            slug: None,
            icon_kind: Some(it.icon_kind),
            icon_value: Some(it.icon_value),
            description: None,
            links: it.links,
        })
        .await?;
    }
    Ok(())
}
