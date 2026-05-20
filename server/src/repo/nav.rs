use crate::dto::*;
use crate::error::Result;
use async_trait::async_trait;

#[async_trait]
pub trait NavRepo: Send + Sync {
    // ----- Bundle -----
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Group>, Vec<Item>, Vec<Tag>)>;

    // ----- Sites -----
    async fn list_sites(&self) -> Result<Vec<Site>>;
    async fn create_site(&self, p: SitePayload) -> Result<Site>;
    async fn patch_site(&self, id: i64, p: SitePatch) -> Result<Site>;
    async fn delete_site(&self, id: i64) -> Result<()>;
    async fn reorder_sites(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Groups -----
    async fn list_groups(&self) -> Result<Vec<Group>>;
    async fn create_group(&self, p: GroupPayload) -> Result<Group>;
    async fn patch_group(&self, id: i64, p: GroupPatch) -> Result<Group>;
    async fn delete_group(&self, id: i64) -> Result<()>;
    async fn reorder_groups(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Items -----
    async fn create_item(&self, p: ItemPayload) -> Result<Item>;
    async fn patch_item(&self, id: i64, p: ItemPatch) -> Result<Item>;
    async fn delete_item(&self, id: i64) -> Result<()>;
    async fn reorder_items(&self, entries: Vec<ReorderEntry>) -> Result<()>;

    // ----- Tags -----
    async fn list_tags(&self) -> Result<Vec<Tag>>;
    async fn create_tag(&self, p: TagPayload) -> Result<Tag>;
    async fn patch_tag(&self, id: i64, p: TagPatch) -> Result<Tag>;
    async fn delete_tag(&self, id: i64) -> Result<()>;
}
