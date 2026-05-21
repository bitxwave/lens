use navsrv::db::connect_in_memory;
use navsrv::dto::{GroupPayload, IconKind, ItemPayload, SitePatch, SitePayload};
use navsrv::error::AppError;
use navsrv::repo::{NavRepo, SqlxNavRepo};

#[tokio::test]
async fn create_list_patch_delete_site() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);

    let s = repo
        .create_site(SitePayload {
            value: "shangHai".into(),
            name: "上海".into(),
            name_i18n: Some(serde_json::json!({"en": "Shanghai"})),
            is_default: true,
        })
        .await
        .unwrap();
    assert_eq!(s.value, "shangHai");
    assert!(s.is_default);

    let s2 = repo
        .create_site(SitePayload {
            value: "beiJing".into(),
            name: "北京".into(),
            name_i18n: None,
            is_default: false,
        })
        .await
        .unwrap();

    let all = repo.list_sites().await.unwrap();
    assert_eq!(all.len(), 2);

    let patched = repo
        .patch_site(
            s2.id,
            SitePatch {
                name: Some("Beijing".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(patched.name, "Beijing");

    repo.delete_site(s.id).await.unwrap();
    assert_eq!(repo.list_sites().await.unwrap().len(), 1);
}

#[tokio::test]
async fn unique_value_constraint_returns_conflict() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    repo.create_site(SitePayload {
        value: "x".into(),
        name: "X".into(),
        name_i18n: None,
        is_default: false,
    })
    .await
    .unwrap();
    let err = repo
        .create_site(SitePayload {
            value: "x".into(),
            name: "Y".into(),
            name_i18n: None,
            is_default: false,
        })
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)), "got {err:?}");
}

#[tokio::test]
async fn delete_site_referenced_by_item_returns_conflict() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    let g = repo
        .create_group(GroupPayload {
            slug: "g".into(),
            name: "G".into(),
            name_i18n: None,
            collapsed_default: false,
        })
        .await
        .unwrap();
    let s = repo
        .create_site(SitePayload {
            value: "siteA".into(),
            name: "A".into(),
            name_i18n: None,
            is_default: true,
        })
        .await
        .unwrap();
    let mut links = std::collections::BTreeMap::new();
    links.insert("siteA".into(), "http://x".into());
    repo.create_item(ItemPayload {
        group_id: Some(g.id),
        name: "I".into(),
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
    let err = repo.delete_site(s.id).await.unwrap_err();
    assert!(matches!(err, AppError::Conflict(_)), "got {err:?}");
}
