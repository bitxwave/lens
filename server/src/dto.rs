use serde::{Deserialize, Serialize};

fn zero() -> i64 {
    0
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: i64,
    pub value: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub sort_order: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub sort_order: i64,
    pub collapsed_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub slug: String,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IconKind {
    Asset,
    Url,
    AutoFavicon,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: i64,
    pub group_id: Option<i64>,
    pub name: String,
    pub name_i18n: Option<serde_json::Value>,
    pub description: Option<String>,
    pub description_i18n: Option<serde_json::Value>,
    pub icon_kind: IconKind,
    pub icon_value: String,
    pub sort_order: i64,
    pub links: std::collections::BTreeMap<String, String>, // site.value -> URL
    pub tag_slugs: Vec<String>,
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
    pub groups: Vec<Group>,
    pub items: Vec<Item>,
    pub tags: Vec<Tag>,
}

// ----- Write payloads -----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPayload {
    pub group_id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub name_i18n: Option<serde_json::Value>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub description_i18n: Option<serde_json::Value>,
    pub icon_kind: IconKind,
    pub icon_value: String,
    #[serde(default)]
    pub links: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub tag_slugs: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ItemPatch {
    #[serde(default)]
    pub group_id: Option<Option<i64>>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub description: Option<Option<String>>,
    #[serde(default)]
    pub description_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub icon_kind: Option<IconKind>,
    #[serde(default)]
    pub icon_value: Option<String>,
    #[serde(default)]
    pub links: Option<std::collections::BTreeMap<String, String>>,
    #[serde(default)]
    pub tag_slugs: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderEntry {
    pub id: i64,
    pub sort_order: i64,
    #[serde(default)]
    pub group_id: Option<Option<i64>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupPayload {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub name_i18n: Option<serde_json::Value>,
    #[serde(default)]
    pub collapsed_default: bool,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GroupPatch {
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub collapsed_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePayload {
    pub value: String,
    pub name: String,
    #[serde(default)]
    pub name_i18n: Option<serde_json::Value>,
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
    pub name_i18n: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagPayload {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub name_i18n: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TagPatch {
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub name_i18n: Option<Option<serde_json::Value>>,
}
