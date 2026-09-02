use lens::db::connect_in_memory;
use lens::dto::{
    AutoFolderPayload, CardKind, CardPatch, CardPayload, IconKind, ReorderEntry, SitePayload,
};
use lens::error::AppError;
use lens::repo::{NavRepo, SqlxNavRepo};

async fn make_repo() -> (SqlxNavRepo, i64) {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxNavRepo::new(pool);
    let s = repo
        .create_site(SitePayload {
            value: "shangHai".into(),
            name: "上海".into(),
            is_default: true,
        })
        .await
        .unwrap();
    (repo, s.id)
}

fn item_payload(name: &str, parent: Option<i64>) -> CardPayload {
    CardPayload {
        kind: CardKind::Item,
        parent_id: parent,
        name: name.into(),
        slug: None,
        icon_kind: Some(IconKind::Asset),
        icon_value: Some(format!("{name}.png")),
        description: None,
        links: Default::default(),
    }
}

fn folder_payload(name: &str, slug: &str) -> CardPayload {
    CardPayload {
        kind: CardKind::Folder,
        parent_id: None,
        name: name.into(),
        slug: Some(slug.into()),
        icon_kind: None,
        icon_value: None,
        description: None,
        links: Default::default(),
    }
}

#[tokio::test]
async fn create_root_item_appends_at_end() {
    let (repo, _) = make_repo().await;
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    let b = repo.create_card(item_payload("B", None)).await.unwrap();
    assert_eq!(a.sort_order, 0);
    assert_eq!(b.sort_order, 1);
    assert!(a.parent_id.is_none());
    assert!(b.parent_id.is_none());
}

#[tokio::test]
async fn create_item_with_links_round_trips() {
    let (repo, _) = make_repo().await;
    let mut links = std::collections::BTreeMap::new();
    links.insert("shangHai".into(), "http://x".into());
    let mut p = item_payload("X", None);
    p.links = links.clone();
    let a = repo.create_card(p).await.unwrap();
    assert_eq!(
        a.links.get("shangHai").map(|s| s.as_str()),
        Some("http://x")
    );
}

#[tokio::test]
async fn create_folder_with_item_inside() {
    let (repo, _) = make_repo().await;
    let folder = repo
        .create_card(folder_payload("Tools", "tools"))
        .await
        .unwrap();
    assert_eq!(folder.kind, CardKind::Folder);
    assert!(folder.slug.is_some());
    let inside = repo
        .create_card(item_payload("X", Some(folder.id)))
        .await
        .unwrap();
    assert_eq!(inside.parent_id, Some(folder.id));
    assert_eq!(inside.sort_order, 0);
}

#[tokio::test]
async fn folder_must_have_slug() {
    let (repo, _) = make_repo().await;
    let mut p = folder_payload("Tools", "tools");
    p.slug = None;
    let err = repo.create_card(p).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)), "got {err:?}");
}

#[tokio::test]
async fn item_must_have_icon() {
    let (repo, _) = make_repo().await;
    let mut p = item_payload("X", None);
    p.icon_kind = None;
    p.icon_value = None;
    let err = repo.create_card(p).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)), "got {err:?}");
}

#[tokio::test]
async fn folder_cannot_be_created_inside_folder() {
    let (repo, _) = make_repo().await;
    let outer = repo
        .create_card(folder_payload("Outer", "outer"))
        .await
        .unwrap();
    let mut p = folder_payload("Inner", "inner");
    p.parent_id = Some(outer.id);
    let err = repo.create_card(p).await.unwrap_err();
    assert!(matches!(err, AppError::Validation(_)), "got {err:?}");
}

#[tokio::test]
async fn delete_folder_releases_children_to_root() {
    let (repo, _) = make_repo().await;
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let a = repo
        .create_card(item_payload("A", Some(folder.id)))
        .await
        .unwrap();
    let b = repo
        .create_card(item_payload("B", Some(folder.id)))
        .await
        .unwrap();

    repo.delete_card(folder.id).await.unwrap();

    let cards = repo.list_cards().await.unwrap();
    let a2 = cards.iter().find(|c| c.id == a.id).unwrap();
    let b2 = cards.iter().find(|c| c.id == b.id).unwrap();
    assert!(a2.parent_id.is_none());
    assert!(b2.parent_id.is_none());
    // Folder slot 0 was vacated, children land at the next free root slots.
    let folders_left: Vec<_> = cards
        .iter()
        .filter(|c| matches!(c.kind, CardKind::Folder))
        .collect();
    assert!(folders_left.is_empty());
}

#[tokio::test]
async fn reorder_validates_contiguous_permutation() {
    let (repo, _) = make_repo().await;
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    let b = repo.create_card(item_payload("B", None)).await.unwrap();

    // Bad: missing slot 0
    let err = repo
        .reorder_cards(vec![ReorderEntry {
            id: a.id,
            sort_order: 1,
            parent_id: None,
        }])
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::Validation(_)), "got {err:?}");

    // Good: 0..1 permutation that swaps them
    repo.reorder_cards(vec![
        ReorderEntry {
            id: b.id,
            sort_order: 0,
            parent_id: None,
        },
        ReorderEntry {
            id: a.id,
            sort_order: 1,
            parent_id: None,
        },
    ])
    .await
    .unwrap();

    let cards = repo.list_cards().await.unwrap();
    let a_after = cards.iter().find(|c| c.id == a.id).unwrap();
    let b_after = cards.iter().find(|c| c.id == b.id).unwrap();
    assert_eq!(a_after.sort_order, 1);
    assert_eq!(b_after.sort_order, 0);
}

#[tokio::test]
async fn auto_folder_creates_folder_with_two_items() {
    let (repo, _) = make_repo().await;
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    let b = repo.create_card(item_payload("B", None)).await.unwrap();
    let folder = repo
        .auto_folder(AutoFolderPayload {
            source_item_id: a.id,
            target_item_id: b.id,
            name: "Untitled".into(),
            slug: Some("untitled".into()),
        })
        .await
        .unwrap();
    assert_eq!(folder.kind, CardKind::Folder);
    let cards = repo.list_cards().await.unwrap();
    let a2 = cards.iter().find(|c| c.id == a.id).unwrap();
    let b2 = cards.iter().find(|c| c.id == b.id).unwrap();
    assert_eq!(a2.parent_id, Some(folder.id));
    assert_eq!(b2.parent_id, Some(folder.id));
    assert_eq!(a2.sort_order, 0);
    assert_eq!(b2.sort_order, 1);
}

#[tokio::test]
async fn folder_dissolves_when_only_one_child_remains() {
    let (repo, _) = make_repo().await;
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let _a = repo
        .create_card(item_payload("A", Some(folder.id)))
        .await
        .unwrap();
    let b = repo
        .create_card(item_payload("B", Some(folder.id)))
        .await
        .unwrap();

    // Move B back to root → folder F has only A left → dissolves.
    repo.patch_card(
        b.id,
        CardPatch {
            parent_id: Some(None),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let cards = repo.list_cards().await.unwrap();
    let folder_left = cards.iter().any(|c| c.id == folder.id);
    assert!(!folder_left, "single-child folder should auto-dissolve");
    // A and B should both be at root now.
    let a_card = cards.iter().find(|c| c.name == "A").unwrap();
    let b_card = cards.iter().find(|c| c.name == "B").unwrap();
    assert!(a_card.parent_id.is_none());
    assert!(b_card.parent_id.is_none());
}

#[tokio::test]
async fn dissolved_folder_leaves_lone_child_in_its_slot() {
    // Repro for the "拖走一个,另一个跑到最后" bug. Root layout: A, F, C
    // where F is a folder containing X and Y. When we move Y out to
    // root, F dissolves and X — the lone child — must inherit F's root
    // slot (index 1), NOT be appended after C.
    let (repo, _) = make_repo().await;
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let c_card = repo.create_card(item_payload("C", None)).await.unwrap();
    let x = repo
        .create_card(item_payload("X", Some(folder.id)))
        .await
        .unwrap();
    let y = repo
        .create_card(item_payload("Y", Some(folder.id)))
        .await
        .unwrap();

    assert_eq!(a.sort_order, 0);
    assert_eq!(folder.sort_order, 1);
    assert_eq!(c_card.sort_order, 2);

    // Move Y back to root. Folder collapses; X takes over slot 1.
    repo.patch_card(
        y.id,
        CardPatch {
            parent_id: Some(None),
            ..Default::default()
        },
    )
    .await
    .unwrap();

    let cards = repo.list_cards().await.unwrap();
    let x_after = cards.iter().find(|cd| cd.id == x.id).unwrap();
    let a_after = cards.iter().find(|cd| cd.id == a.id).unwrap();
    let c_after = cards.iter().find(|cd| cd.id == c_card.id).unwrap();
    assert!(x_after.parent_id.is_none());
    assert_eq!(a_after.sort_order, 0, "A stays at slot 0");
    assert_eq!(
        x_after.sort_order, 1,
        "X should INHERIT the dissolved folder's slot, not tail-append"
    );
    assert_eq!(c_after.sort_order, 2, "C stays at slot 2");
    // Y is the one that was dragged out — patch_card appends it at the
    // tail of the root bucket. Slot 3 = one past C.
    let y_after = cards.iter().find(|cd| cd.id == y.id).unwrap();
    assert_eq!(y_after.sort_order, 3);
}

#[tokio::test]
async fn reorder_drops_folder_child_to_root_slot_1_lone_child_takes_slot_1() {
    // Mirrors the actual drag-out-of-folder UX flow used by +page.svelte:
    // handleDrop calls reorderCards (not patchCard) with the target
    // bucket's full new order. Root starts as [A, F, C] with F containing
    // X, Y. User drags Y from folder to root slot 1 (between A and old F).
    // reorder places Y at slot 1, shifts F to slot 2, C to slot 3.
    // Then dissolve: F sits at slot 2, X inherits it.
    let (repo, _) = make_repo().await;
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let c_card = repo.create_card(item_payload("C", None)).await.unwrap();
    let x = repo
        .create_card(item_payload("X", Some(folder.id)))
        .await
        .unwrap();
    let y = repo
        .create_card(item_payload("Y", Some(folder.id)))
        .await
        .unwrap();

    // Drop Y at root slot 1. Frontend renumbers root as [A=0, Y=1, F=2, C=3].
    repo.reorder_cards(vec![
        ReorderEntry {
            id: a.id,
            sort_order: 0,
            parent_id: None,
        },
        ReorderEntry {
            id: y.id,
            sort_order: 1,
            parent_id: None,
        },
        ReorderEntry {
            id: folder.id,
            sort_order: 2,
            parent_id: None,
        },
        ReorderEntry {
            id: c_card.id,
            sort_order: 3,
            parent_id: None,
        },
    ])
    .await
    .unwrap();

    let cards = repo.list_cards().await.unwrap();
    assert!(
        !cards.iter().any(|cd| cd.id == folder.id),
        "F should have dissolved (only X left after Y moved out)"
    );
    let a_after = cards.iter().find(|cd| cd.id == a.id).unwrap();
    let y_after = cards.iter().find(|cd| cd.id == y.id).unwrap();
    let x_after = cards.iter().find(|cd| cd.id == x.id).unwrap();
    let c_after = cards.iter().find(|cd| cd.id == c_card.id).unwrap();
    assert_eq!(a_after.sort_order, 0, "A at slot 0");
    assert_eq!(y_after.sort_order, 1, "Y where user dropped it");
    assert_eq!(
        x_after.sort_order, 2,
        "X inherits F's post-reorder slot 2, not tail-appended"
    );
    assert_eq!(c_after.sort_order, 3, "C at slot 3");
    assert!(x_after.parent_id.is_none());
}

#[tokio::test]
async fn folder_dissolves_when_last_child_deleted() {
    let (repo, _) = make_repo().await;
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let a = repo
        .create_card(item_payload("A", Some(folder.id)))
        .await
        .unwrap();
    let b = repo
        .create_card(item_payload("B", Some(folder.id)))
        .await
        .unwrap();

    // Delete B → folder has 1 child (A) → dissolve, A moves to root.
    repo.delete_card(b.id).await.unwrap();
    let cards = repo.list_cards().await.unwrap();
    assert!(!cards.iter().any(|c| c.id == folder.id));
    let a_after = cards.iter().find(|c| c.id == a.id).unwrap();
    assert!(a_after.parent_id.is_none());
}

#[tokio::test]
async fn patch_moves_item_into_folder() {
    let (repo, _) = make_repo().await;
    let folder = repo.create_card(folder_payload("F", "f")).await.unwrap();
    let a = repo.create_card(item_payload("A", None)).await.unwrap();
    repo.patch_card(
        a.id,
        CardPatch {
            parent_id: Some(Some(folder.id)),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    let cards = repo.list_cards().await.unwrap();
    let a2 = cards.iter().find(|c| c.id == a.id).unwrap();
    assert_eq!(a2.parent_id, Some(folder.id));
}
