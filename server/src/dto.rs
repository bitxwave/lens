use serde::{Deserialize, Deserializer, Serialize};

fn zero() -> i64 {
    0
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPayload {
    pub kind: CardKind,
    #[serde(default)]
    pub parent_id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub icon_kind: Option<IconKind>,
    #[serde(default)]
    pub icon_value: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub links: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CardPatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub parent_id: Option<Option<i64>>,
    #[serde(default)]
    pub icon_kind: Option<IconKind>,
    #[serde(default)]
    pub icon_value: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub description: Option<Option<String>>,
    #[serde(default)]
    pub links: Option<std::collections::BTreeMap<String, String>>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoFolderPayload {
    pub source_item_id: i64,
    pub target_item_id: i64,
    pub name: String,
    /// Optional folder slug; auto-generated when omitted.
    #[serde(default)]
    pub slug: Option<String>,
}

// ----- Site write payloads -----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePayload {
    pub value: String,
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SitePatch {
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub is_default: Option<bool>,
}

/// Reorder entry for sites — sites have no parent, only sort_order.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteReorderEntry {
    pub id: i64,
    pub sort_order: i64,
}
