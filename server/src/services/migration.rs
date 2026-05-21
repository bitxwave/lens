use crate::dto::*;
use crate::error::{AppError, Result};
use crate::repo::{ConfigRepo, NavRepo};
use serde::Deserialize;
use std::sync::Arc;

const BOOTSTRAP_JSON: &str = include_str!("../../bootstrap.json");

#[derive(Deserialize)]
struct BootstrapDoc {
    #[serde(rename = "schemaVersion")]
    _schema_version: i64,
    meta: BootstrapMeta,
    sites: Vec<BootstrapSite>,
    groups: Vec<BootstrapGroup>,
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
    name_i18n: Option<serde_json::Value>,
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
    name_i18n: Option<serde_json::Value>,
    #[serde(default)]
    #[allow(dead_code)]
    sort_order: i64,
    #[serde(default)]
    collapsed_default: bool,
}

#[derive(Deserialize)]
struct BootstrapItem {
    name: String,
    #[serde(default)]
    name_i18n: Option<serde_json::Value>,
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
    let (sites, _, items) = nav.get_bundle().await?;
    if !sites.is_empty() || !items.is_empty() {
        return Ok(());
    }
    let doc: BootstrapDoc =
        serde_json::from_str(BOOTSTRAP_JSON).map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;

    // Meta → config kv
    let mut pairs: Vec<(String, String)> = Vec::new();
    pairs.push(("site_name".into(), doc.meta.site_name));
    if let Some(p) = doc.meta.site_avatar_path {
        pairs.push(("site_avatar_path".into(), p));
    }
    pairs.push(("site_copyright".into(), doc.meta.site_copyright));
    pairs.push(("default_theme".into(), doc.meta.default_theme));
    if let Some(l) = doc.meta.site_icp {
        pairs.push(("site_icp_text".into(), l.text));
        pairs.push(("site_icp_url".into(), l.url));
    }
    if let Some(l) = doc.meta.site_police {
        pairs.push(("site_police_text".into(), l.text));
        pairs.push(("site_police_url".into(), l.url));
    }
    let pair_refs: Vec<(&str, &str)> = pairs
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    config.upsert_many(&pair_refs).await?;

    // Sites
    for s in doc.sites {
        nav.create_site(SitePayload {
            value: s.value,
            name: s.name,
            name_i18n: s.name_i18n,
            is_default: s.is_default,
        })
        .await?;
    }
    // Groups (track id by slug)
    let mut group_id_by_slug = std::collections::HashMap::new();
    for g in doc.groups {
        let created = nav
            .create_group(GroupPayload {
                slug: g.slug.clone(),
                name: g.name,
                name_i18n: g.name_i18n,
                collapsed_default: g.collapsed_default,
            })
            .await?;
        group_id_by_slug.insert(g.slug, created.id);
    }
    // Items
    for it in doc.items {
        let group_id = it
            .group_slug
            .and_then(|s| group_id_by_slug.get(&s).copied());
        nav.create_item(ItemPayload {
            group_id,
            name: it.name,
            name_i18n: it.name_i18n,
            description: None,
            description_i18n: None,
            icon_kind: it.icon_kind,
            icon_value: it.icon_value,
            links: it.links,
        })
        .await?;
    }
    Ok(())
}
