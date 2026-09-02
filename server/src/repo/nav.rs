use crate::dto::*;
use crate::error::Result;
use async_trait::async_trait;

#[async_trait]
pub trait NavRepo: Send + Sync {
    // ----- Bundle -----
    async fn get_bundle(&self) -> Result<(Vec<Site>, Vec<Card>)>;

    // ----- Sites -----
    async fn list_sites(&self) -> Result<Vec<Site>>;
    async fn create_site(&self, p: SitePayload) -> Result<Site>;
    async fn patch_site(&self, id: i64, p: SitePatch) -> Result<Site>;
    async fn delete_site(&self, id: i64) -> Result<()>;
    async fn reorder_sites(&self, entries: Vec<SiteReorderEntry>) -> Result<()>;

    // ----- Cards -----
    async fn list_cards(&self) -> Result<Vec<Card>>;
    async fn create_card(&self, p: CardPayload) -> Result<Card>;
    async fn patch_card(&self, id: i64, p: CardPatch) -> Result<Card>;
    /// Delete a card. Folder children are released to the root bucket
    /// (parent_id=NULL, appended at end of root sort_order).
    async fn delete_card(&self, id: i64) -> Result<()>;
    /// Atomic per-bucket reorder. Validates each parent_id bucket
    /// listed forms a contiguous 0..N permutation; rejects partial or
    /// overlapping orderings.
    async fn reorder_cards(&self, entries: Vec<ReorderEntry>) -> Result<()>;
    /// Atomic auto-folder: create a folder at the target item's slot,
    /// move source + target into it as the only children.
    async fn auto_folder(&self, p: AutoFolderPayload) -> Result<Card>;
}
