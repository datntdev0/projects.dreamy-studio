use super::*;
use crate::infra::storage::database::Database;
use crate::infra::storage::migrator::Migrator;
use crate::infra::storage::migrator::workspace_scripts;
use rusqlite::Connection;
use rusqlite::params;
use std::sync::atomic::AtomicBool;
use tempfile::TempDir;

const NOW: &str = "2026-11-17T00:00:00Z";

struct Fixture {
    dir: TempDir,
    database: Database,
    novel_id: i64,
}

fn fixture() -> Fixture {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("workspace.dreamydb");
    let mut database = Database::create(&path).unwrap();
    let cancel = AtomicBool::new(false);
    Migrator::migrate(
        database.connection_mut(),
        &workspace_scripts().unwrap(),
        &cancel,
    )
    .unwrap();
    let novel_id = insert_novel(database.connection());
    Fixture {
        dir,
        database,
        novel_id,
    }
}

fn insert_novel(conn: &Connection) -> i64 {
    conn.execute(
        "INSERT INTO ws_novels (title, name, author, lang, description, origin, created_at, \
         updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params!["Novel", "", "Author", "ZH", "", "created", NOW],
    )
    .unwrap();
    conn.last_insert_rowid()
}

fn input(src: &str, dst: &str) -> DictInput {
    DictInput {
        src: src.to_string(),
        dst: dst.to_string(),
        kind: "term".to_string(),
        note: "note".to_string(),
    }
}

#[test]
fn creates_reads_updates_and_deletes_entries() {
    let fixture = fixture();
    let repo = DictionaryRepository::new(fixture.database.connection());
    let id = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::Vi,
            &input("source", "target"),
            NOW,
        )
        .unwrap();

    assert_eq!(
        repo.list(fixture.novel_id, TranslationTarget::Vi).unwrap(),
        vec![DictEntry {
            id,
            src: "source".to_string(),
            dst: "target".to_string(),
            kind: "term".to_string(),
            note: "note".to_string(),
        }]
    );
    let mut entry = repo.find(fixture.novel_id, id).unwrap().unwrap();
    entry.src = "changed source".to_string();
    entry.dst = "changed target".to_string();
    entry.kind = "name".to_string();
    entry.note = "changed note".to_string();

    assert!(
        repo.update(fixture.novel_id, &entry, "2026-11-18T00:00:00Z")
            .unwrap()
    );
    assert_eq!(repo.find(fixture.novel_id, id).unwrap(), Some(entry));
    assert!(
        !repo
            .update(999, &repo.find(fixture.novel_id, id).unwrap().unwrap(), NOW)
            .unwrap()
    );
    assert!(repo.delete(fixture.novel_id, id).unwrap());
    assert!(!repo.delete(fixture.novel_id, id).unwrap());
    assert_eq!(repo.find(fixture.novel_id, id).unwrap(), None);
}

#[test]
fn lists_entries_in_id_order() {
    let fixture = fixture();
    let repo = DictionaryRepository::new(fixture.database.connection());
    let first = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::En,
            &input("z", "one"),
            NOW,
        )
        .unwrap();
    let second = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::En,
            &input("a", "two"),
            NOW,
        )
        .unwrap();

    let ids: Vec<i64> = repo
        .list(fixture.novel_id, TranslationTarget::En)
        .unwrap()
        .into_iter()
        .map(|entry| entry.id)
        .collect();

    assert_eq!(ids, vec![first, second]);
}

#[test]
fn detects_duplicates_per_target_for_inserts_and_updates() {
    let fixture = fixture();
    let repo = DictionaryRepository::new(fixture.database.connection());
    let first = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::Vi,
            &input("same", "one"),
            NOW,
        )
        .unwrap();
    let duplicate = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::Vi,
            &input("same", "two"),
            NOW,
        )
        .unwrap_err();
    let other_target = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::En,
            &input("same", "three"),
            NOW,
        )
        .unwrap();
    let second = repo
        .insert(
            fixture.novel_id,
            TranslationTarget::Vi,
            &input("other", "four"),
            NOW,
        )
        .unwrap();
    let mut entry = repo.find(fixture.novel_id, second).unwrap().unwrap();
    entry.src = "same".to_string();
    let update = repo.update(fixture.novel_id, &entry, NOW).unwrap_err();

    assert!(is_duplicate(&duplicate));
    assert!(is_duplicate(&update));
    assert_ne!(first, other_target);
    assert_eq!(
        repo.find(fixture.novel_id, second).unwrap().unwrap().src,
        "other"
    );
}

#[test]
fn deleting_a_novel_cascades_its_dictionary_entries() {
    let fixture = fixture();
    let repo = DictionaryRepository::new(fixture.database.connection());
    repo.insert(
        fixture.novel_id,
        TranslationTarget::Vi,
        &input("source", "target"),
        NOW,
    )
    .unwrap();
    let other_novel = insert_novel(fixture.database.connection());
    repo.insert(
        other_novel,
        TranslationTarget::Vi,
        &input("other", "target"),
        NOW,
    )
    .unwrap();

    fixture
        .database
        .connection()
        .execute("DELETE FROM ws_novels WHERE id = ?1", [fixture.novel_id])
        .unwrap();

    assert!(
        repo.list(fixture.novel_id, TranslationTarget::Vi)
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        repo.list(other_novel, TranslationTarget::Vi).unwrap().len(),
        1
    );
    assert!(fixture.dir.path().exists());
}
