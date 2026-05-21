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
async fn create_item_with_links_and_tags() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let _t = repo
        .create_tag(TagPayload {
            slug: "fav".into(),
            name: "Favorite".into(),
            name_i18n: None,
        })
        .await
        .unwrap();
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
            tag_slugs: vec!["fav".into()],
        })
        .await
        .unwrap();
    assert_eq!(item.name, "RouterOS");
    assert_eq!(
        item.links.get("shangHai").map(String::as_str),
        Some("http://10.0.0.1")
    );
    assert_eq!(item.tag_slugs, vec!["fav"]);
}

#[tokio::test]
async fn patch_item_replaces_links_and_tags() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    repo.create_tag(TagPayload {
        slug: "a".into(),
        name: "A".into(),
        name_i18n: None,
    })
    .await
    .unwrap();
    repo.create_tag(TagPayload {
        slug: "b".into(),
        name: "B".into(),
        name_i18n: None,
    })
    .await
    .unwrap();
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
            links: links.clone(),
            tag_slugs: vec!["a".into()],
        })
        .await
        .unwrap();
    let mut new_links = std::collections::BTreeMap::new();
    new_links.insert("shangHai".into(), "http://2".into());
    let p = ItemPatch {
        links: Some(new_links),
        tag_slugs: Some(vec!["b".into()]),
        ..Default::default()
    };
    let updated = repo.patch_item(item.id, p).await.unwrap();
    assert_eq!(
        updated.links.get("shangHai").map(String::as_str),
        Some("http://2")
    );
    assert_eq!(updated.tag_slugs, vec!["b"]);
}

#[tokio::test]
async fn delete_item_cascades_links_and_tags() {
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
            tag_slugs: vec![],
        })
        .await
        .unwrap();
    repo.delete_item(item.id).await.unwrap();
    let (_, _, items, _) = repo.get_bundle().await.unwrap();
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
            tag_slugs: vec![],
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
            tag_slugs: vec![],
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
    let (_, _, items, _) = repo.get_bundle().await.unwrap();
    assert_eq!(items[0].id, b.id);
    assert_eq!(items[1].id, a.id);
}

/// Regression: previously `create_item` / `patch_item` did
/// `INSERT INTO item_tags ... SELECT ... FROM tags WHERE slug = ?`,
/// which silently dropped tags whose slug was not pre-registered.
/// Now they upsert the tag first, so a fresh slug should round-trip.
#[tokio::test]
async fn create_item_auto_creates_unknown_tag_slugs() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://example".into());
    let item = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "X".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "x.png".into(),
            links,
            tag_slugs: vec!["fresh-slug".into(), "tools".into()],
        })
        .await
        .unwrap();
    assert_eq!(item.tag_slugs.len(), 2);
    assert!(item.tag_slugs.contains(&"fresh-slug".into()));
    assert!(item.tag_slugs.contains(&"tools".into()));
    let (_, _, _, tags) = repo.get_bundle().await.unwrap();
    assert!(tags.iter().any(|t| t.slug == "fresh-slug"));
}

#[tokio::test]
async fn patch_item_auto_creates_unknown_tag_slugs() {
    let (repo, gid, _sid) = make_repo_with_seed().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://example".into());
    let item = repo
        .create_item(ItemPayload {
            group_id: Some(gid),
            name: "X".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            icon_kind: IconKind::Asset,
            icon_value: "x.png".into(),
            links,
            tag_slugs: vec![],
        })
        .await
        .unwrap();
    let updated = repo
        .patch_item(
            item.id,
            ItemPatch {
                tag_slugs: Some(vec!["brand-new".into()]),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(updated.tag_slugs, vec!["brand-new"]);
}
