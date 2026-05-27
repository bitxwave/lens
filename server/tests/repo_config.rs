use lens::db::connect_in_memory;
use lens::repo::{ConfigRepo, SqlxConfigRepo};

#[tokio::test]
async fn upsert_get_delete_config() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxConfigRepo::new(pool);
    repo.upsert("site_name", "My Site").await.unwrap();
    assert_eq!(
        repo.get("site_name").await.unwrap().as_deref(),
        Some("My Site")
    );
    assert_eq!(repo.get("missing").await.unwrap(), None);

    repo.upsert("site_name", "Renamed").await.unwrap();
    assert_eq!(
        repo.get("site_name").await.unwrap().as_deref(),
        Some("Renamed")
    );

    repo.delete("site_name").await.unwrap();
    assert_eq!(repo.get("site_name").await.unwrap(), None);
}

#[tokio::test]
async fn many_pairs() {
    let pool = connect_in_memory().await.unwrap();
    let repo = SqlxConfigRepo::new(pool);
    repo.upsert_many(&[("a", "1"), ("b", "2")]).await.unwrap();
    let all = repo.get_many(&["a", "b", "c"]).await.unwrap();
    assert_eq!(all.get("a").map(String::as_str), Some("1"));
    assert_eq!(all.get("b").map(String::as_str), Some("2"));
    assert!(!all.contains_key("c"));
}
