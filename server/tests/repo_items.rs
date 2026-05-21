use navsrv::db::connect_in_memory;
use navsrv::dto::*;
use navsrv::repo::{NavRepo, SqlxNavRepo};

async fn make_repo_with_seed() -> (SqlxNavRepo, i64, i64) {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    let g = repo
        .create_group(GroupPayload {
            slug: "tools".into(),
            name: "Tools".into(),
            name_i18n: None,
            collapsed_default: false,
        })
        .await
        .unwrap();
    let s = repo
        .create_site(SitePayload {
            value: "shangHai".into(),
            name: "上海".into(),
            name_i18n: None,
            is_default: true,
        })
        .await
        .unwrap();
    (repo, g.id, s.id)
}

#[tokio::test]
async fn create_item_with_links() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://10.0.0.1".into());
    let item = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "RouterOS".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "routerOS.png".into(),
            links,
        })
        .await
        .unwrap();
    assert_eq!(item.name, "RouterOS");
    assert_eq!(
        item.links.get("shangHai").map(String::as_str),
        Some("http://10.0.0.1")
    );
}

#[tokio::test]
async fn patch_item_replaces_links() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://1".into());
    let item = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "x".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "x.png".into(),
            links,
        })
        .await
        .unwrap();
    let mut new_links = std::collections::BTreeMap::new();
    new_links.insert("shangHai".into(), "http://2".into());
    let p = ItemPatch {
        links: Some(new_links),
        ..Default::default()
    };
    let updated = repo.patch_item(item.id, p).await.unwrap();
    assert_eq!(
        updated.links.get("shangHai").map(String::as_str),
        Some("http://2")
    );
}

#[tokio::test]
async fn delete_item_cascades_links() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://1".into());
    let item = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "x".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "x.png".into(),
            links,
        })
        .await
        .unwrap();
    repo.delete_item(item.id).await.unwrap();
    let (_, _, items) = repo.get_bundle().await.unwrap();
    assert!(items.is_empty());
}

#[tokio::test]
async fn reorder_items_writes_sort_order() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let a = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "a".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "a.png".into(),
            links: Default::default(),
        })
        .await
        .unwrap();
    let b = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "b".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "b.png".into(),
            links: Default::default(),
        })
        .await
        .unwrap();
    repo.reorder_items(vec![
        ReorderEntry {
            id: b.id,
            sort_order: 0,
            group_id: Some(Some(gid)),
        },
        ReorderEntry {
            id: a.id,
            sort_order: 1,
            group_id: Some(Some(gid)),
        },
    ])
    .await
    .unwrap();
    let (_, _, items) = repo.get_bundle().await.unwrap();
    assert_eq!(items[0].id, b.id);
    assert_eq!(items[1].id, a.id);
}
