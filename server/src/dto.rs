use serde::{Deserialize, Deserializer, Serialize};
use validator::{Validate, ValidationError};

fn zero() -> i64 {
    0
}

// Field-length budgets — sized to be permissive enough for realistic
// names while still rejecting payloads designed to balloon the DB.
const NAME_MAX: u64 = 200;
const SLUG_MAX: u64 = 100;
const SITE_VALUE_MAX: u64 = 64;
const URL_MAX: u64 = 2048;
const ICON_VALUE_MAX: u64 = 2048;
const DESCRIPTION_MAX: u64 = 2000;
const LINK_COUNT_MAX: usize = 64;

/// Slug shape: lowercase letter or digit start, then [a-z0-9-]*.
/// Matches every slug seeded in `bootstrap.json`.
fn validate_slug(s: &str) -> Result<(), ValidationError> {
    let mut chars = s.chars();
    let first = chars.next().ok_or_else(|| ValidationError::new("empty"))?;
    if !(first.is_ascii_lowercase() || first.is_ascii_digit()) {
        return Err(ValidationError::new("slug_start"));
    }
    if !chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err(ValidationError::new("slug_chars"));
    }
    Ok(())
}

/// Site `value` is consumed both as the public selector (URL fragment,
/// route key) and as the join key in `card_links`. Allow camelCase +
/// digits + hyphens to match existing seeds like `shangHai`.
fn validate_site_value(s: &str) -> Result<(), ValidationError> {
    let mut chars = s.chars();
    let first = chars.next().ok_or_else(|| ValidationError::new("empty"))?;
    if !first.is_ascii_alphabetic() {
        return Err(ValidationError::new("site_value_start"));
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(ValidationError::new("site_value_chars"));
    }
    Ok(())
}

/// `links` is a `BTreeMap<String, String>`: each key is a site `value`
/// and each value is a URL. Cap entry count + URL length, and require
/// keys / URLs to be non-empty.
fn validate_links_map(
    map: &std::collections::BTreeMap<String, String>,
) -> Result<(), ValidationError> {
    if map.len() > LINK_COUNT_MAX {
        return Err(ValidationError::new("too_many_links"));
    }
    for (k, v) in map {
        validate_site_value(k).map_err(|_| ValidationError::new("links_key"))?;
        if v.is_empty() || v.len() > URL_MAX as usize {
            return Err(ValidationError::new("links_url_length"));
        }
    }
    Ok(())
}

/// Deserialize an `Option<Option<T>>` field such that the JSON value `null`
/// produces `Some(None)` and an absent field produces `None`. The default
/// serde behaviour collapses both to `None`, which silently swallows
/// PATCH semantics like `{"parentId": null}` (clear the field).
fn double_option<'de, T, D>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    // If the key is present, this runs and reads either a value or null
    // into Option<T>; we wrap the result in an outer Some so callers can
    // tell "field present" from "field absent".
    Deserialize::deserialize(de).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: i64,
    pub value: String,
    pub name: String,
    pub sort_order: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IconKind {
    Asset,
    Url,
    AutoFavicon,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CardKind {
    Folder,
    Item,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: i64,
    pub kind: CardKind,
    pub parent_id: Option<i64>,
    pub sort_order: i64,
    pub name: String,
    /// Folder-only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    /// Item-only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_kind: Option<IconKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Item-only; site.value -> URL.
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub links: std::collections::BTreeMap<String, String>,
    #[serde(default = "zero")]
    pub created_at: i64,
    #[serde(default = "zero")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub site_name: String,
    pub site_avatar_path: Option<String>,
    pub site_copyright: String,
    pub site_icp: Option<Link>,
    pub site_police: Option<Link>,
    pub default_theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub text: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NavBundle {
    pub schema_version: i64,
    pub meta: Meta,
    pub sites: Vec<Site>,
    pub cards: Vec<Card>,
}

// ----- Write payloads -----

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CardPayload {
    pub kind: CardKind,
    #[serde(default)]
    pub parent_id: Option<i64>,
    #[validate(length(min = 1, max = "NAME_MAX"))]
    pub name: String,
    #[serde(default)]
    #[validate(length(min = 1, max = "SLUG_MAX"), custom = "validate_slug_opt")]
    pub slug: Option<String>,
    #[serde(default)]
    pub icon_kind: Option<IconKind>,
    #[serde(default)]
    #[validate(length(min = 1, max = "ICON_VALUE_MAX"))]
    pub icon_value: Option<String>,
    #[serde(default)]
    #[validate(length(max = "DESCRIPTION_MAX"))]
    pub description: Option<String>,
    #[serde(default)]
    #[validate(custom = "validate_links_map")]
    pub links: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Deserialize, Default, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CardPatch {
    #[serde(default)]
    #[validate(length(min = 1, max = "NAME_MAX"))]
    pub name: Option<String>,
    #[serde(default)]
    #[validate(length(min = 1, max = "SLUG_MAX"), custom = "validate_slug_opt")]
    pub slug: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub parent_id: Option<Option<i64>>,
    #[serde(default)]
    pub icon_kind: Option<IconKind>,
    #[serde(default)]
    #[validate(length(min = 1, max = "ICON_VALUE_MAX"))]
    pub icon_value: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub description: Option<Option<String>>,
    #[serde(default)]
    #[validate(custom = "validate_links_map_opt")]
    pub links: Option<std::collections::BTreeMap<String, String>>,
}

// `validator` 0.16's `custom = "fn"` insists on `fn(&T) -> Result<...>`
// where T is the field type itself (not the inner type). For
// `Option<String>` / `Option<Map>` we shim through these adaptors.
fn validate_slug_opt(s: &str) -> Result<(), ValidationError> {
    validate_slug(s)
}

fn validate_links_map_opt(
    map: &std::collections::BTreeMap<String, String>,
) -> Result<(), ValidationError> {
    validate_links_map(map)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderEntry {
    pub id: i64,
    pub sort_order: i64,
    /// `None` = root bucket (parent_id IS NULL).
    #[serde(default)]
    pub parent_id: Option<i64>,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct AutoFolderPayload {
    pub source_item_id: i64,
    pub target_item_id: i64,
    #[validate(length(min = 1, max = "NAME_MAX"))]
    pub name: String,
    /// Optional folder slug; auto-generated when omitted.
    #[serde(default)]
    #[validate(length(min = 1, max = "SLUG_MAX"), custom = "validate_slug_opt")]
    pub slug: Option<String>,
}

// ----- Site write payloads -----

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SitePayload {
    #[validate(
        length(min = 1, max = "SITE_VALUE_MAX"),
        custom = "validate_site_value"
    )]
    pub value: String,
    #[validate(length(min = 1, max = "NAME_MAX"))]
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize, Default, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SitePatch {
    #[serde(default)]
    #[validate(
        length(min = 1, max = "SITE_VALUE_MAX"),
        custom = "validate_site_value_opt"
    )]
    pub value: Option<String>,
    #[serde(default)]
    #[validate(length(min = 1, max = "NAME_MAX"))]
    pub name: Option<String>,
    #[serde(default)]
    pub is_default: Option<bool>,
}

fn validate_site_value_opt(s: &str) -> Result<(), ValidationError> {
    validate_site_value(s)
}

/// Reorder entry for sites — sites have no parent, only sort_order.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteReorderEntry {
    pub id: i64,
    pub sort_order: i64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn folder_payload(slug: &str) -> CardPayload {
        CardPayload {
            kind: CardKind::Folder,
            parent_id: None,
            name: "Tools".into(),
            slug: Some(slug.into()),
            icon_kind: None,
            icon_value: None,
            description: None,
            links: BTreeMap::new(),
        }
    }

    #[test]
    fn slug_accepts_kebab_and_digits() {
        assert!(validate_slug("tools").is_ok());
        assert!(validate_slug("dev-tools").is_ok());
        assert!(validate_slug("v2").is_ok());
        assert!(validate_slug("a").is_ok());
    }

    #[test]
    fn slug_rejects_leading_hyphen_and_uppercase() {
        assert!(validate_slug("-bad").is_err());
        assert!(validate_slug("Bad").is_err());
        assert!(validate_slug("").is_err());
        assert!(validate_slug("with space").is_err());
    }

    #[test]
    fn site_value_accepts_camel_case() {
        assert!(validate_site_value("shangHai").is_ok());
        assert!(validate_site_value("beiJing").is_ok());
        assert!(validate_site_value("us-east").is_ok());
    }

    #[test]
    fn site_value_rejects_digit_lead_and_punct() {
        assert!(validate_site_value("1stPlace").is_err());
        assert!(validate_site_value("city.east").is_err());
        assert!(validate_site_value("city east").is_err());
    }

    #[test]
    fn card_payload_rejects_empty_name() {
        let mut p = folder_payload("tools");
        p.name = String::new();
        assert!(p.validate().is_err());
    }

    #[test]
    fn card_payload_rejects_overlong_name() {
        let mut p = folder_payload("tools");
        p.name = "x".repeat(NAME_MAX as usize + 1);
        assert!(p.validate().is_err());
    }

    #[test]
    fn card_payload_rejects_bad_slug() {
        let p = folder_payload("Bad-Slug");
        assert!(p.validate().is_err());
    }

    #[test]
    fn card_payload_links_too_many() {
        let mut links = BTreeMap::new();
        for i in 0..(LINK_COUNT_MAX + 1) {
            links.insert(format!("site{i}"), "https://example.com".into());
        }
        let p = CardPayload {
            kind: CardKind::Item,
            parent_id: None,
            name: "X".into(),
            slug: None,
            icon_kind: Some(IconKind::Asset),
            icon_value: Some("x.png".into()),
            description: None,
            links,
        };
        assert!(p.validate().is_err());
    }

    #[test]
    fn site_payload_rejects_dotty_value() {
        let s = SitePayload {
            value: "ny.us".into(),
            name: "NY".into(),
            is_default: false,
        };
        assert!(s.validate().is_err());
    }

    #[test]
    fn site_payload_accepts_seed_values() {
        for v in ["shangHai", "beiJing", "guangZhou", "shenZhen"] {
            let s = SitePayload {
                value: v.into(),
                name: v.into(),
                is_default: false,
            };
            assert!(s.validate().is_ok(), "{v} rejected");
        }
    }
}
